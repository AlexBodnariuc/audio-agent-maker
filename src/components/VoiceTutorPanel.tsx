import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Mic, MicOff, Volume2, VolumeX, Brain, Sparkles, Trophy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface VoiceTutorPanelProps {
  conversationId: string;
  specialtyFocus?: string;
  voice?: string;
  onSessionEnd?: () => void;
}

interface RealtimeMessage {
  type: string;
  content?: string;
  audioContent?: string;
  confidence?: number;
  transcript?: string;
  error?: string;
  message?: string;
  canRetry?: boolean;
  wasEstablished?: boolean;
  wasUnexpected?: boolean;
  sessionState?: string;
  queueLength?: number;
  timestamp?: number;
  errorDetails?: any;
  reconnectSuggested?: boolean;
  closeCode?: number;
  closeReason?: string;
}

// Audio utilities for PCM16 processing
class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private onAudioData: (audioData: Float32Array) => void) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      this.audioContext = new AudioContext({
        sampleRate: 24000,
      });
      
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };
      
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw new Error('Nu s-a putut accesa microfonul');
    }
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Encode audio for OpenAI Realtime API
const encodeAudioForAPI = (float32Array: Float32Array): string => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
};

// Audio playback utilities
const createWavFromPCM = (pcmData: Uint8Array): Uint8Array => {
  const int16Data = new Int16Array(pcmData.length / 2);
  for (let i = 0; i < pcmData.length; i += 2) {
    int16Data[i / 2] = (pcmData[i + 1] << 8) | pcmData[i];
  }
  
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + int16Data.byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, int16Data.byteLength, true);

  const wavArray = new Uint8Array(wavHeader.byteLength + int16Data.byteLength);
  wavArray.set(new Uint8Array(wavHeader), 0);
  wavArray.set(new Uint8Array(int16Data.buffer), wavHeader.byteLength);
  
  return wavArray;
};

export default function VoiceTutorPanel({ 
  conversationId, 
  specialtyFocus = 'biologie', 
  voice = 'alloy',
  onSessionEnd 
}: VoiceTutorPanelProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [transcript, setTranscript] = useState('');
  const [responses, setResponses] = useState<string[]>([]);
  const [sessionStats, setSessionStats] = useState({ questions: 0, correct: 0, xp: 0 });
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [sessionState, setSessionState] = useState<'disconnected' | 'connecting' | 'configuring' | 'ready' | 'error'>('disconnected');
  const [canRetry, setCanRetry] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [autoRecordingEnabled, setAutoRecordingEnabled] = useState(false);
  
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const maxRetries = 5; // Increased retry attempts

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Play audio response
  const playAudioData = async (audioData: Uint8Array) => {
    if (!isAudioEnabled || !audioContextRef.current) return;

    try {
      const wavData = createWavFromPCM(audioData);
      const audioBuffer = await audioContextRef.current.decodeAudioData(wavData.buffer);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      
      source.onended = () => setIsSpeaking(false);
      source.start(0);
      setIsSpeaking(true);
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsSpeaking(false);
    }
  };

  // Start realtime session with improved error handling
  const startSession = async () => {
    try {
      setConnectionStatus('connecting');
      setSessionState('connecting');
      setLastError(null);
      setRetryCount(0);
      
      const wsUrl = `wss://ybdvhqmjlztlvrfurkaf.functions.supabase.co/functions/v1/openai-realtime-voice?conversationId=${conversationId}&specialtyFocus=${specialtyFocus}&voice=${voice}`;
      wsRef.current = new WebSocket(wsUrl);

      // Setup heartbeat to monitor connection health
      const setupHeartbeat = () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
        }
        
        heartbeatRef.current = setInterval(() => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
            console.log('Sent heartbeat ping to server');
          }
        }, 25000); // Send ping every 25 seconds
      };

      wsRef.current.onopen = () => {
        console.log('Connected to realtime voice session');
        setIsConnected(true);
        setConnectionStatus('connected');
        setSessionState('configuring');
        setupHeartbeat();
        
        toast({
          title: "Conectat! 🔗",
          description: "Se configurează sesiunea vocală...",
        });
      };

      wsRef.current.onmessage = async (event) => {
        try {
          const data: RealtimeMessage = JSON.parse(event.data);
          console.log('Received message:', data.type, 'Session state:', sessionState);

          switch (data.type) {
            case 'connection_established':
              console.log('Connection established with OpenAI');
              break;

            case 'session_ready':
              console.log('Session is ready for audio');
              setSessionState('ready');
              
              // Only now start audio recording
              if (!autoRecordingEnabled) {
                await startAudioRecording();
                setAutoRecordingEnabled(true);
              }
              
              toast({
                title: "Sesiune Gata! 🎙️",
                description: "Acum poți vorbi - te ascult și îți răspund imediat!",
              });
              break;

            case 'session_not_ready':
            case 'session_unavailable':
              console.log('Session not ready:', data.message);
              setSessionState('configuring');
              
              if (data.canRetry && retryCount < maxRetries) {
                setTimeout(() => {
                  setRetryCount(prev => prev + 1);
                  console.log(`Retrying session... attempt ${retryCount + 1}`);
                }, 2000);
              }
              break;

            case 'session_error':
            case 'connection_error':
            case 'initialization_error':
            case 'connection_timeout':
            case 'openai_error':
              console.error('Session error:', data.message, data.errorDetails);
              setSessionState('error');
              setLastError(data.message || 'Eroare de sesiune');
              setCanRetry(data.canRetry !== false); // Default to true unless explicitly false
              
              // Auto-retry for recoverable errors
              if (data.canRetry && retryCount < maxRetries && data.reconnectSuggested) {
                console.log(`Auto-retrying connection in 3 seconds... (attempt ${retryCount + 1}/${maxRetries})`);
                setTimeout(() => {
                  retryConnection();
                }, 3000);
              }
              
              toast({
                title: "Eroare Sesiune",
                description: data.message || "A apărut o problemă cu sesiunea vocală",
                variant: "destructive",
              });
              break;

            case 'session_recovery':
              console.log('Session recovery attempted');
              setSessionState('configuring');
              break;

            case 'pong':
              // Heartbeat response - connection is alive
              break;

            case 'response.audio.delta':
              if (data.audioContent) {
                const binaryString = atob(data.audioContent);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                await playAudioData(bytes);
              }
              break;

            case 'response.audio_transcript.delta':
              if (data.transcript) {
                setTranscript(prev => prev + data.transcript);
              }
              break;

            case 'response.audio_transcript.done':
              if (transcript.trim()) {
                setResponses(prev => [...prev, transcript.trim()]);
                setTranscript('');
                
                // Update session stats with motivation
                setSessionStats(prev => {
                  const newStats = { ...prev, questions: prev.questions + 1, xp: prev.xp + 10 };
                  
                  // Show motivational feedback
                  if (data.content && data.content.toLowerCase().includes('corect')) {
                    newStats.correct = prev.correct + 1;
                    newStats.xp = prev.xp + 20;
                    
                    toast({
                      title: "Bravo! 🎉",
                      description: `Ai răspuns corect! +20 XP. Total: ${newStats.xp} XP`,
                    });
                  } else {
                    toast({
                      title: "Bună întrebare! 🤔",
                      description: `+10 XP pentru participare. Total: ${newStats.xp} XP`,
                    });
                  }
                  
                  return newStats;
                });
              }
              break;

            case 'input_audio_buffer.speech_started':
              setIsRecording(true);
              break;

            case 'input_audio_buffer.speech_stopped':
              setIsRecording(false);
              break;

            case 'session_ended':
              console.log('Session ended:', data.message, 'Details:', data);
              const wasEstablished = data.wasEstablished || false;
              const wasUnexpected = data.wasUnexpected || false;
              
              if (wasEstablished && !wasUnexpected) {
                toast({
                  title: "Sesiune Închisă",
                  description: "Sesiunea vocală s-a încheiat cu succes",
                });
              } else if (wasUnexpected && data.canRetry && retryCount < maxRetries) {
                console.log('Unexpected session closure, attempting auto-recovery...');
                toast({
                  title: "Reconectare Automată",
                  description: "Sesiunea s-a închis neașteptat. Se reîncearcă...",
                });
                setTimeout(() => {
                  retryConnection();
                }, 2000);
              } else {
                toast({
                  title: "Conexiune Întreruptă",
                  description: `Sesiunea s-a închis neașteptat (cod: ${data.closeCode})`,
                  variant: "destructive",
                });
              }
              break;

            case 'manual_intervention_required':
              console.warn('Manual intervention required:', data.message);
              setCanRetry(false);
              toast({
                title: "Intervenție Manuală Necesară",
                description: data.message || "Eroare care necesită reconectare manuală",
                variant: "destructive",
              });
              break;

            default:
              console.log('Unhandled message type:', data.type, data);
          }

          // Update confidence if available
          if (data.confidence !== undefined) {
            setConfidence(data.confidence);
          }

        } catch (error) {
          console.error('Error processing message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
        setSessionState('error');
        setLastError('Eroare de conexiune WebSocket');
        
        toast({
          title: "Eroare de Conexiune",
          description: "Nu s-a putut conecta la serverul vocal",
          variant: "destructive",
        });
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket connection closed', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setSessionState('disconnected');
        setIsRecording(false);
        setIsSpeaking(false);
        setAutoRecordingEnabled(false);
        
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        
        // Stop audio recording
        if (recorderRef.current) {
          recorderRef.current.stop();
          recorderRef.current = null;
        }
      };

    } catch (error) {
      console.error('Error starting session:', error);
      setConnectionStatus('error');
      setSessionState('error');
      setLastError('Nu s-a putut începe sesiunea');
      
      toast({
        title: "Eroare",
        description: "Nu s-a putut începe sesiunea vocală",
        variant: "destructive",
      });
    }
  };

  // Start audio recording (only called when session is ready)
  const startAudioRecording = async () => {
    try {
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
      
      recorderRef.current = new AudioRecorder((audioData) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && sessionState === 'ready') {
          const audioMessage = {
            type: 'input_audio_buffer.append',
            audio: encodeAudioForAPI(audioData)
          };
          wsRef.current.send(JSON.stringify(audioMessage));
        }
      });

      await recorderRef.current.start();
      console.log('Audio recording started');
    } catch (error) {
      console.error('Error starting audio recording:', error);
      toast({
        title: "Eroare Microfon",
        description: "Nu s-a putut accesa microfonul",
        variant: "destructive",
      });
    }
  };

  // Retry connection
  const retryConnection = async () => {
    if (retryCount >= maxRetries) {
      toast({
        title: "Încercări Epuizate",
        description: "Nu s-a putut restabili conexiunea după multiple încercări",
        variant: "destructive",
      });
      return;
    }
    
    setRetryCount(prev => prev + 1);
    console.log(`Retrying connection... attempt ${retryCount + 1}`);
    
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    // Wait a bit before retrying
    setTimeout(() => {
      if (retryCount < maxRetries) {
        startSession();
      }
    }, 2000 * retryCount); // Exponential backoff
  };

  // End session
  const endSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }

    setIsConnected(false);
    setConnectionStatus('disconnected');
    setIsRecording(false);
    setIsSpeaking(false);
    
    toast({
      title: "Sesiune Închisă 👋",
      description: `Ai câștigat ${sessionStats.xp} XP în această sesiune!`,
    });

    if (onSessionEnd) {
      onSessionEnd();
    }
  };

  // Send text message (for testing)
  const sendTextMessage = (text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const textMessage = {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }]
        }
      };
      wsRef.current.send(JSON.stringify(textMessage));
      wsRef.current.send(JSON.stringify({ type: 'response.create' }));
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto animate-fade-in">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl">
          <Brain className="h-6 w-6 text-primary" />
          MedMentor Voce Real-Time
        </CardTitle>
        <div className="flex items-center justify-center gap-4 mt-2">
          <Badge variant={connectionStatus === 'connected' ? 'default' : 'secondary'}>
            {connectionStatus === 'connecting' && 'Se conectează...'}
            {connectionStatus === 'connected' && 'Conectat'}
            {connectionStatus === 'disconnected' && 'Deconectat'}
            {connectionStatus === 'error' && 'Eroare'}
          </Badge>
          <Badge variant="outline">
            📚 {specialtyFocus.charAt(0).toUpperCase() + specialtyFocus.slice(1)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Session Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-primary/10">
            <div className="text-2xl font-bold text-primary">{sessionStats.questions}</div>
            <div className="text-sm text-muted-foreground">Întrebări</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-500/10">
            <div className="text-2xl font-bold text-green-600">{sessionStats.correct}</div>
            <div className="text-sm text-muted-foreground">Corecte</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-yellow-500/10">
            <div className="text-2xl font-bold text-yellow-600">{sessionStats.xp}</div>
            <div className="text-sm text-muted-foreground">XP</div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="flex justify-center gap-4">
          {!isConnected ? (
            <Button 
              onClick={startSession}
              size="lg"
              className="bg-primary hover:bg-primary/90"
              disabled={connectionStatus === 'connecting'}
            >
              <Mic className="h-5 w-5 mr-2" />
              {connectionStatus === 'connecting' ? 'Se conectează...' : 'Începe Sesiunea'}
            </Button>
          ) : (
            <>
              <Button 
                onClick={endSession}
                size="lg"
                variant="destructive"
              >
                <MicOff className="h-5 w-5 mr-2" />
                Închide Sesiunea
              </Button>
              
              <Button 
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                size="lg"
                variant="outline"
              >
                {isAudioEnabled ? (
                  <Volume2 className="h-5 w-5 mr-2" />
                ) : (
                  <VolumeX className="h-5 w-5 mr-2" />
                )}
                {isAudioEnabled ? 'Audio On' : 'Audio Off'}
              </Button>
            </>
          )}
        </div>

        {/* Recording Status */}
        {isConnected && (
          <div className="text-center space-y-2">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
              isRecording ? 'bg-red-500/20 text-red-600' : 
              isSpeaking ? 'bg-blue-500/20 text-blue-600' : 
              'bg-green-500/20 text-green-600'
            }`}>
              {isRecording && (
                <>
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  🎙️ Te ascult...
                </>
              )}
              {isSpeaking && (
                <>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                  🔊 Îți răspund...
                </>
              )}
              {!isRecording && !isSpeaking && (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  ✅ Gata să ascult - vorbește liber!
                </>
              )}
            </div>
            
            {confidence && (
              <div className="max-w-xs mx-auto">
                <div className="text-sm text-muted-foreground mb-1">
                  Încredere: {Math.round(confidence * 100)}%
                </div>
                <Progress value={confidence * 100} className="h-2" />
              </div>
            )}
          </div>
        )}

        {/* Current Transcript */}
        {transcript && (
          <div className="p-4 rounded-lg bg-muted animate-fade-in">
            <div className="text-sm font-medium text-muted-foreground mb-1">
              Răspuns curent:
            </div>
            <div className="text-foreground">{transcript}</div>
          </div>
        )}

        {/* Response History */}
        {responses.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <h3 className="font-medium">Istoricul Conversației</h3>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {responses.map((response, index) => (
                <div key={index} className="p-3 rounded-lg bg-primary/5 border-l-4 border-primary animate-fade-in">
                  <div className="flex items-start gap-2">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                    <div className="text-sm">{response}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Test Button (for development) */}
        {isConnected && (
          <div className="text-center pt-4 border-t border-border">
            <Button 
              onClick={() => sendTextMessage('Ce este enzima?')}
              variant="outline"
              size="sm"
            >
              Test cu "Ce este enzima?"
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}