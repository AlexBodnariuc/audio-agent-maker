import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Mic, 
  MicOff, 
  Send, 
  Volume2, 
  VolumeX,
  Bot,
  User,
  Sparkles,
  RotateCcw,
  Play,
  Pause,
  Settings
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SecurityValidator, SECURITY_MESSAGES } from "@/lib/security";
import type { VoiceAgent } from "@/lib/validation";
import { useConversation } from "@/hooks/useConversation";
import { AudioBubble } from "@/components/voice/AudioBubble";

interface AgentTestingPanelProps {
  agent: VoiceAgent;
  personalities: VoiceAgent[];
  onAgentChange: (agent: VoiceAgent) => void;
}

export default function AgentTestingPanel({ 
  agent, 
  personalities, 
  onAgentChange 
}: AgentTestingPanelProps) {
  const [textInput, setTextInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceProvider, setVoiceProvider] = useState<'openai' | 'elevenlabs'>('elevenlabs');
  const [selectedVoice, setSelectedVoice] = useState('pNInz6obpgDQGcFmaJgB');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();
  
  // Use the new conversation hook
  const { messages, isLoading, error, sendMessage, clearConversation } = useConversation();

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut accesa microfonul",
        variant: "destructive",
      });
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      // Convert audio to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onload = async () => {
        try {
          const base64Audio = (reader.result as string).split(',')[1];
          
          // Call speech-to-text
          const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke(
            'openai-speech-to-text',
            {
              body: { 
                audio: base64Audio,
                language: 'ro'
              }
            }
          );

          if (transcriptionError) {
            console.error('Transcription error:', transcriptionError);
            throw new Error(transcriptionError.message || 'Speech-to-text failed');
          }

          if (!transcriptionData?.success || !transcriptionData?.text) {
            throw new Error('Nu s-a primit text de la serviciul de recunoaștere vocală');
          }

          console.log('Transcription successful:', transcriptionData.text);
          
          // Send the transcribed message using the conversation hook
          await sendMessage(transcriptionData.text, true);
        } catch (readerError) {
          console.error('Error in audio processing reader:', readerError);
          throw readerError;
        }
      };
      
      reader.onerror = () => {
        throw new Error('Failed to read audio file');
      };
    } catch (error) {
      console.error('Error processing audio:', error);
      toast({
        title: "Eroare",
        description: `Nu am putut procesa audio-ul: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const sendTextMessage = async () => {
    if (!textInput.trim()) return;

    // Security validation
    if (!SecurityValidator.checkRateLimit('voice_chat', 10)) {
      toast({
        title: "Eroare",
        description: SECURITY_MESSAGES.RATE_LIMIT_EXCEEDED,
        variant: "destructive",
      });
      return;
    }

    const sanitizedInput = SecurityValidator.sanitizeText(textInput);
    if (!sanitizedInput) {
      toast({
        title: "Eroare", 
        description: SECURITY_MESSAGES.INVALID_INPUT,
        variant: "destructive",
      });
      return;
    }

    setTextInput("");
    await sendMessage(sanitizedInput, true);
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const handleClearConversation = useCallback(() => {
    clearConversation();
    stopAudio();
  }, [clearConversation]);

  const openaiVoices = [
    { id: 'alloy', name: 'Alloy' },
    { id: 'echo', name: 'Echo' },
    { id: 'fable', name: 'Fable' },
    { id: 'onyx', name: 'Onyx' },
    { id: 'nova', name: 'Nova' },
    { id: 'shimmer', name: 'Shimmer' }
  ];

  const elevenlabsVoices = [
    { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice (EN)' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (EN)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (EN)' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (EN)' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh (EN)' },
    { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (EN)' },
    { id: 'D38z5RcWu1voky8WS1ja', name: 'Fin (EN)' },
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George (EN)' }
  ];

  return (
    <div className="space-y-6">
      {/* Agent Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Test Asistent Vocal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>Asistent Activ</Label>
              <Select value={agent.id} onValueChange={(value) => {
                const selectedAgent = personalities.find(p => p.id === value);
                if (selectedAgent) onAgentChange(selectedAgent);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {personalities.map((personality) => (
                    <SelectItem key={personality.id} value={personality.id}>
                      <div className="flex items-center gap-2">
                        <span>{personality.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {personality.medical_specialty}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={handleClearConversation}
              size="sm"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Resetează
            </Button>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>{agent.name}</strong> - {agent.description}
            </p>
          </div>

          <Separator />

          {/* Voice Settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span className="text-sm font-medium">Setări vocale</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Provider voce</Label>
                <Select value={voiceProvider} onValueChange={(value: 'openai' | 'elevenlabs') => {
                  setVoiceProvider(value);
                  setSelectedVoice(value === 'openai' ? 'alloy' : 'pNInz6obpgDQGcFmaJgB');
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Voce</Label>
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(voiceProvider === 'openai' ? openaiVoices : elevenlabsVoices).map((voice) => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conversation */}
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>Conversație</CardTitle>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
              Eroare: {error}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Messages */}
          <div className="h-64 overflow-y-auto space-y-3 border rounded-lg p-4 bg-muted/20">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Începe o conversație cu asistentul vocal</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id}>
                  {message.audio_url ? (
                    <AudioBubble
                      audioUrl={message.audio_url}
                      content={message.content}
                      isUser={message.message_type === 'user'}
                    />
                  ) : (
                    <div
                      className={`flex gap-3 ${
                        message.message_type === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          message.message_type === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-card border'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {message.message_type === 'user' ? (
                            <User className="h-4 w-4" />
                          ) : (
                            <Bot className="h-4 w-4" />
                          )}
                          <span className="text-xs opacity-75">
                            {new Date(message.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm">{message.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-card border p-3 rounded-lg max-w-[80%]">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Asistentul se gândește...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Controls */}
          <div className="space-y-3">
            {/* Voice Controls */}
            <div className="flex gap-2">
              <Button
                onMouseDown={startListening}
                onMouseUp={stopListening}
                onMouseLeave={stopListening}
                disabled={isLoading}
                variant={isListening ? "destructive" : "outline"}
                className="flex-1"
              >
                {isListening ? (
                  <>
                    <MicOff className="h-4 w-4 mr-2" />
                    Recording... (eliberează pentru stop)
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Ține apăsat pentru înregistrare
                  </>
                )}
              </Button>
              
              <Button
                onClick={isPlaying ? stopAudio : () => {}}
                disabled={!isPlaying}
                variant="outline"
                size="icon"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Text Input */}
            <div className="flex gap-2">
              <Input
                placeholder="Scrie un mesaj..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendTextMessage()}
                disabled={isLoading}
              />
              <Button
                onClick={sendTextMessage}
                disabled={!textInput.trim() || isLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}