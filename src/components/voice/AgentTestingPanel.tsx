import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface VoicePersonality {
  id: string;
  name: string;
  description: string;
  medical_specialty: string;
  agent_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AgentTestingPanelProps {
  agent: VoicePersonality;
  personalities: VoicePersonality[];
  onAgentChange: (agent: VoicePersonality) => void;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioUrl?: string;
}

export default function AgentTestingPanel({ 
  agent, 
  personalities, 
  onAgentChange 
}: AgentTestingPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [textInput, setTextInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [voiceProvider, setVoiceProvider] = useState<'openai' | 'elevenlabs'>('openai');
  const [selectedVoice, setSelectedVoice] = useState('alloy');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const createConversation = useCallback(async () => {
    try {
      console.log('Creating conversation for agent:', agent.id);
      
      // Use the create-conversation edge function for better reliability
      const { data: conversationData, error: createError } = await supabase.functions.invoke(
        'create-conversation',
        {
          body: {
            specialtyFocus: agent.medical_specialty || 'general',
            sessionType: 'testing'
          }
        }
      );

      if (createError) {
        console.error('Create conversation error:', createError);
        throw new Error(createError.message || 'Failed to create conversation');
      }

      const conversationId = conversationData.conversationId;
      console.log('Successfully created conversation:', conversationId);
      
      setConversationId(conversationId);
      return conversationId;
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Eroare",
        description: `Nu am putut începe conversația: ${error.message}`,
        variant: "destructive",
      });
      return null;
    }
  }, [agent.id, agent.medical_specialty, agent.name, toast]);

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
    let currentConversationId = conversationId;
    
    if (!currentConversationId) {
      console.log('No conversation ID, creating new conversation...');
      const newConversationId = await createConversation();
      if (!newConversationId) {
        console.error('Failed to create conversation for audio processing');
        return;
      }
      currentConversationId = newConversationId;
    }

    console.log('Processing audio for conversation:', currentConversationId);
    setIsProcessing(true);
    
    try {
      // Convert audio to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onload = async () => {
        try {
          const base64Audio = (reader.result as string).split(',')[1];
          console.log('Calling speech-to-text with conversation ID:', currentConversationId);
          
          // Call speech-to-text with proper structure
          const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke(
            'openai-speech-to-text',
            {
              body: { 
                audio: base64Audio,
                conversationId: currentConversationId || '',
                language: 'ro'
              }
            }
          );

          if (transcriptionError) {
            console.error('Transcription error:', transcriptionError);
            const errorMsg = transcriptionError.message || 'Speech-to-text failed';
            if (errorMsg.includes('API key')) {
              throw new Error('Cheile API nu sunt configurate corect. Verifică configurația.');
            }
            throw new Error(errorMsg);
          }

          if (!transcriptionData?.success) {
            console.error('Transcription failed:', transcriptionData);
            throw new Error(transcriptionData?.error || 'Speech-to-text service failed');
          }

          if (!transcriptionData?.text) {
            console.error('No transcription text:', transcriptionData);
            throw new Error('Nu s-a primit text de la serviciul de recunoaștere vocală');
          }

          console.log('Transcription successful:', transcriptionData.text);

          const userMessage: Message = {
            id: Date.now().toString(),
            type: 'user',
            content: transcriptionData.text,
            timestamp: new Date()
          };

          setMessages(prev => [...prev, userMessage]);
          await getAIResponse(transcriptionData.text);
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
    } finally {
      setIsProcessing(false);
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

    if (!conversationId) {
      const newConversationId = await createConversation();
      if (!newConversationId) return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: sanitizedInput,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setTextInput("");
    await getAIResponse(userMessage.content);
  };

  const getAIResponse = async (userText: string) => {
    console.log('Getting AI response for conversation:', conversationId);
    setIsProcessing(true);
    
    try {
      if (!conversationId) {
        throw new Error('No conversation ID available');
      }

      console.log('Calling voice-chat with:', {
        conversationId,
        message: userText,
        specialtyFocus: agent.medical_specialty
      });

      const { data: responseData, error: responseError } = await supabase.functions.invoke(
        'openai-voice-chat',
        {
          body: {
            conversationId: conversationId,
            message: userText,
            specialtyFocus: agent.medical_specialty || 'general',
            useVoice: true,
            voice: selectedVoice || 'alloy'
          }
        }
      );

      if (responseError) {
        console.error('Voice chat error:', responseError);
        throw new Error(responseError.message || 'Voice chat function failed');
      }

      if (!responseData?.response) {
        throw new Error('No response received from AI');
      }

      console.log('AI response received:', responseData.response);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseData.response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Convert response to speech if audio content is available
      if (responseData.audioContent) {
        console.log('Playing audio response from voice-chat function');
        try {
          const audioBlob = new Blob([
            Uint8Array.from(atob(responseData.audioContent), c => c.charCodeAt(0))
          ], { type: 'audio/mp3' });
          
          const audioUrl = URL.createObjectURL(audioBlob);
          const audio = new Audio(audioUrl);
          currentAudioRef.current = audio;

          audio.onplay = () => setIsPlaying(true);
          audio.onended = () => {
            setIsPlaying(false);
            URL.revokeObjectURL(audioUrl);
          };
          audio.onerror = () => {
            setIsPlaying(false);
            URL.revokeObjectURL(audioUrl);
          };

          await audio.play();
        } catch (audioError) {
          console.error('Error playing audio from response:', audioError);
          // Fallback to text-to-speech
          await playAIResponse(responseData.response);
        }
      } else {
        // Convert response to speech using separate TTS
        await playAIResponse(responseData.response);
      }

    } catch (error) {
      console.error('Error getting AI response:', error);
      toast({
        title: "Eroare",
        description: `Nu am putut obține răspunsul AI: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const playAIResponse = async (text: string) => {
    try {
      let functionName, requestBody;
      
      if (voiceProvider === 'elevenlabs') {
        functionName = 'elevenlabs-text-to-speech';
        requestBody = { text, voice_id: selectedVoice };
      } else {
        functionName = 'openai-text-to-speech';
        requestBody = { text, voice: selectedVoice, format: 'mp3' };
      }

      console.log(`Calling ${functionName} with:`, requestBody);

      const { data: audioData, error: audioError } = await supabase.functions.invoke(
        functionName,
        { body: requestBody }
      );

      if (audioError) {
        console.error('Audio generation error:', audioError);
        const errorMsg = audioError.message || 'Audio generation failed';
        if (errorMsg.includes('API key')) {
          throw new Error('Cheile API nu sunt configurate corect. Verifică configurația.');
        }
        throw audioError;
      }

      if (!audioData?.success) {
        console.error('Audio generation failed:', audioData);
        throw new Error(audioData?.error || 'Text-to-speech service failed');
      }

      if (!audioData?.audioContent) {
        console.error('No audio content received:', audioData);
        throw new Error('Nu s-a primit conținut audio de la serviciu');
      }

      console.log('Audio generated successfully, playing...');

      // Create audio element and play
      const audioBlob = new Blob([
        Uint8Array.from(atob(audioData.audioContent), c => c.charCodeAt(0))
      ], { type: 'audio/mp3' });
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onplay = () => setIsPlaying(true);
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        throw new Error('Eroare la redarea audio-ului');
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Eroare Audio",
        description: error.message || "Nu am putut reda audio-ul",
        variant: "destructive",
      });
    }
  };

  const stopAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setConversationId(null);
    stopAudio();
  };

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
            <Bot className="h-5 w-5 text-medical-blue" />
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
              onClick={clearConversation}
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
                  setSelectedVoice(value === 'openai' ? 'alloy' : 'Xb7hH8MSUJpSbSDYk0k2');
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
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.type === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-medical-blue text-white'
                        : 'bg-card border'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {message.type === 'user' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                      <span className="text-xs opacity-75">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{message.content}</p>
                  </div>
                </div>
              ))
            )}
            {isProcessing && (
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
                disabled={isProcessing}
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
                disabled={isProcessing}
              />
              <Button
                onClick={sendTextMessage}
                disabled={!textInput.trim() || isProcessing}
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