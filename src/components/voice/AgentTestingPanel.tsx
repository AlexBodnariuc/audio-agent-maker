import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
  Pause
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const { toast } = useToast();

  const createConversation = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          voice_personality_id: agent.id,
          voice_session_type: 'testing',
          specialty_focus: agent.medical_specialty,
          status: 'active',
          title: `Test cu ${agent.name}`
        })
        .select()
        .single();

      if (error) throw error;
      setConversationId(data.id);
      return data.id;
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut începe conversația",
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
      const newConversationId = await createConversation();
      if (!newConversationId) return;
      currentConversationId = newConversationId;
    }

    setIsProcessing(true);
    try {
      // Convert audio to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        // Call speech-to-text
        const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke(
          'openai-speech-to-text',
          {
            body: { 
              audio: base64Audio,
              conversationId: currentConversationId
            }
          }
        );

        if (transcriptionError) throw transcriptionError;

        const userMessage: Message = {
          id: Date.now().toString(),
          type: 'user',
          content: transcriptionData.text,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        await getAIResponse(transcriptionData.text);
      };
    } catch (error) {
      console.error('Error processing audio:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut procesa audio-ul",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const sendTextMessage = async () => {
    if (!textInput.trim()) return;

    if (!conversationId) {
      const newConversationId = await createConversation();
      if (!newConversationId) return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: textInput.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setTextInput("");
    await getAIResponse(userMessage.content);
  };

  const getAIResponse = async (userText: string) => {
    setIsProcessing(true);
    try {
      const { data: responseData, error: responseError } = await supabase.functions.invoke(
        'openai-voice-chat',
        {
          body: {
            message: userText,
            conversationId: conversationId,
            context: {
              specialty: agent.medical_specialty,
              agent_name: agent.name,
              agent_description: agent.description,
              session_type: 'testing'
            }
          }
        }
      );

      if (responseError) throw responseError;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: responseData.message,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Convert response to speech
      await playAIResponse(responseData.message);

    } catch (error) {
      console.error('Error getting AI response:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut obține răspunsul AI",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const playAIResponse = async (text: string) => {
    try {
      const { data: audioData, error: audioError } = await supabase.functions.invoke(
        'openai-voice-chat',
        {
          body: {
            text: text,
            voice: 'alloy',
            format: 'mp3'
          }
        }
      );

      if (audioError) throw audioError;

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
      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut reda audio-ul",
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