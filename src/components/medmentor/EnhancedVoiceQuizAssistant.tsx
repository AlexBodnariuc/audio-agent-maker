import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Brain, 
  MessageCircle, 
  HelpCircle, 
  Bot, 
  Settings,
  User,
  Sparkles
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface VoicePersonality {
  id: string;
  name: string;
  description: string;
  medical_specialty: string;
  agent_id: string;
  is_active: boolean;
}

interface EnhancedVoiceQuizAssistantProps {
  question?: string;
  subject: "biology" | "chemistry";
  quizSessionId?: string;
  onTranscriptionReceived?: (text: string) => void;
  onAskForHelp?: (question: string) => void;
}

interface ConversationMessage {
  type: "user" | "assistant";
  text: string;
  timestamp: Date;
  processing?: boolean;
}

export default function EnhancedVoiceQuizAssistant({ 
  question, 
  subject, 
  quizSessionId,
  onTranscriptionReceived,
  onAskForHelp 
}: EnhancedVoiceQuizAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [availableAgents, setAvailableAgents] = useState<VoicePersonality[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<VoicePersonality | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const { toast } = useToast();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchAvailableAgents();
  }, []);

  useEffect(() => {
    if (selectedAgent && !conversationId) {
      createConversation();
    }
  }, [selectedAgent]);

  const fetchAvailableAgents = async () => {
    try {
      const { data, error } = await supabase
        .from('voice_personalities')
        .select('*')
        .eq('is_active', true)
        .or(`medical_specialty.eq.${subject.charAt(0).toUpperCase() + subject.slice(1)},medical_specialty.eq.General Medicine`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const agents = data || [];
      setAvailableAgents(agents);
      
      // Auto-select the first relevant agent
      if (agents.length > 0 && !selectedAgent) {
        const relevantAgent = agents.find(agent => 
          agent.medical_specialty.toLowerCase() === subject
        ) || agents[0];
        setSelectedAgent(relevantAgent);
      }
    } catch (error) {
      console.error('Error fetching agents:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut încărca asistenții vocali",
        variant: "destructive",
      });
    }
  };

  const createConversation = async () => {
    if (!selectedAgent) return;

    try {
      // Use the create-conversation edge function for better error handling
      const { data, error } = await supabase.functions.invoke('create-conversation', {
        body: {
          specialtyFocus: selectedAgent.medical_specialty,
          quizSessionId: quizSessionId && quizSessionId !== "demo-session" ? quizSessionId : null,
          sessionType: 'quiz_assistance'
        }
      });

      if (error) throw error;
      
      if (data?.conversationId) {
        setConversationId(data.conversationId);
      } else {
        throw new Error("No conversation ID returned");
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut începe conversația cu asistentul",
        variant: "destructive",
      });
    }
  };

  const getSubjectColor = (subj: string) => {
    return subj === "biology" ? "medical-green" : "medical-blue";
  };

  const startListening = async () => {
    if (!selectedAgent) {
      toast({
        title: "Selectează un asistent",
        description: "Te rog selectează un asistent vocal înainte de a începe înregistrarea",
        variant: "destructive",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Eroare Microfon",
        description: "Nu am putut accesa microfonul. Verifică permisiunile browserului.",
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
    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke(
          'openai-speech-to-text',
          {
            body: { audio: base64Audio }
          }
        );

        if (transcriptionError) throw transcriptionError;

        const transcribedText = transcriptionData.text;
        setTranscript(transcribedText);

        // Add user message to conversation history
        const userMessage: ConversationMessage = {
          type: "user",
          text: transcribedText,
          timestamp: new Date()
        };

        setConversationHistory(prev => [...prev, userMessage]);
        
        if (onTranscriptionReceived) {
          onTranscriptionReceived(transcribedText);
        }

        // Get AI response
        await getAIResponse(transcribedText);
      };
    } catch (error) {
      console.error('Error processing audio:', error);
      toast({
        title: "Eroare Procesare Audio",
        description: "Nu am putut procesa înregistrarea audio",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getAIResponse = async (userText: string) => {
    if (!conversationId || !selectedAgent) return;

    // Add processing message
    const processingMessage: ConversationMessage = {
      type: "assistant",
      text: "Se gândește...",
      timestamp: new Date(),
      processing: true
    };
    setConversationHistory(prev => [...prev, processingMessage]);

    try {
      const { data: responseData, error: responseError } = await supabase.functions.invoke(
        'openai-voice-chat',
        {
          body: {
            message: userText,
            conversationId: conversationId,
            context: {
              current_question: question,
              subject: subject,
              quiz_session_id: quizSessionId,
              agent_name: selectedAgent.name,
              agent_description: selectedAgent.description,
              specialty: selectedAgent.medical_specialty
            }
          }
        }
      );

      if (responseError) throw responseError;

      // Remove processing message and add real response
      setConversationHistory(prev => {
        const filtered = prev.filter(msg => !msg.processing);
        return [...filtered, {
          type: "assistant",
          text: responseData.message,
          timestamp: new Date()
        }];
      });

      // Play audio response if enabled
      if (audioEnabled) {
        await playAIResponse(responseData.message);
      }

    } catch (error) {
      console.error('Error getting AI response:', error);
      
      // Remove processing message
      setConversationHistory(prev => prev.filter(msg => !msg.processing));
      
      toast({
        title: "Eroare AI",
        description: "Nu am putut obține răspuns de la asistent",
        variant: "destructive",
      });
    }
  };

  const playAIResponse = async (text: string) => {
    try {
      // Always use OpenAI TTS with better error handling
      const { data: audioData, error: audioError } = await supabase.functions.invoke(
        'openai-text-to-speech',
        {
          body: {
            text: text,
            voice: 'nova', // Better for Romanian than alloy
            format: 'mp3'
          }
        }
      );

      if (audioError) {
        console.error('TTS Error:', audioError);
        throw new Error(audioError.message || 'Failed to generate speech');
      }

      if (!audioData?.audioContent) {
        throw new Error('No audio content received');
      }
      
      const audioBlob = new Blob([
        Uint8Array.from(atob(audioData.audioContent), c => c.charCodeAt(0))
      ], { type: 'audio/mp3' });
      
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        URL.revokeObjectURL(audioUrl);
      };

      await audio.play();
    } catch (error) {
      console.error('Error playing audio:', error);
      toast({
        title: "Eroare Audio", 
        description: `Nu am putut reda răspunsul audio: ${error.message}`,
        variant: "destructive",
      });
    }
  };

  const handleQuickHelp = () => {
    if (question && onAskForHelp) {
      onAskForHelp(question);
    }
  };

  const toggleAudio = () => {
    setAudioEnabled(!audioEnabled);
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }
  };

  const handleAgentChange = (agentId: string) => {
    const agent = availableAgents.find(a => a.id === agentId);
    if (agent) {
      setSelectedAgent(agent);
      setConversationHistory([]);
      setConversationId(null);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bot className="h-5 w-5 text-medical-blue" />
            Asistent Vocal
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex gap-2">
          <Badge 
            variant="outline" 
            className={`border-${getSubjectColor(subject)}/30 text-${getSubjectColor(subject)}`}
          >
            {subject === "biology" ? "Biologie" : "Chimie"}
          </Badge>
          {selectedAgent && (
            <Badge variant="secondary" className="text-xs">
              {selectedAgent.name}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-4">
        {/* Agent Selection */}
        {(showSettings || !selectedAgent) && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
            <Label className="text-sm font-medium">Selectează Asistent</Label>
            <Select value={selectedAgent?.id || ""} onValueChange={handleAgentChange}>
              <SelectTrigger>
                <SelectValue placeholder="Alege un asistent vocal..." />
              </SelectTrigger>
              <SelectContent>
                {availableAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    <div className="flex items-center gap-2">
                      <span>{agent.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {agent.medical_specialty}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAgent && (
              <p className="text-xs text-muted-foreground">
                {selectedAgent.description}
              </p>
            )}
          </div>
        )}

        {/* Conversation History */}
        <div className="flex-1 overflow-y-auto max-h-64 space-y-2 p-3 bg-muted/20 rounded-lg">
          {conversationHistory.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Înregistrează o întrebare pentru a începe conversația</p>
            </div>
          ) : (
            conversationHistory.map((message, index) => (
              <div
                key={index}
                className={`flex gap-2 ${
                  message.type === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] p-2 rounded-lg text-sm ${
                    message.type === "user"
                      ? "bg-medical-blue text-white"
                      : message.processing
                      ? "bg-muted border animate-pulse"
                      : "bg-card border"
                  }`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    {message.type === "user" ? (
                      <User className="h-3 w-3" />
                    ) : (
                      <Bot className="h-3 w-3" />
                    )}
                    <span className="text-xs opacity-75">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                    {message.processing && (
                      <Sparkles className="h-3 w-3 animate-spin" />
                    )}
                  </div>
                  <p>{message.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Status Display */}
        {(isListening || isProcessing || transcript) && (
          <div className="space-y-2">
            {isListening && (
              <div className="flex items-center gap-2 text-sm text-medical-blue">
                <div className="w-2 h-2 bg-medical-blue rounded-full animate-pulse"></div>
                Înregistrez...
              </div>
            )}
            
            {isProcessing && (
              <div className="flex items-center gap-2 text-sm text-medical-yellow">
                <Sparkles className="h-4 w-4 animate-spin" />
                Procesez audio...
              </div>
            )}
            
            {transcript && !isProcessing && (
              <div className="p-2 bg-card border rounded text-sm">
                <strong>Ai spus:</strong> {transcript}
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              disabled={isProcessing || !selectedAgent}
              variant={isListening ? "destructive" : "default"}
              className="flex-1"
            >
              {isListening ? (
                <>
                  <MicOff className="h-4 w-4 mr-2" />
                  Înregistrez... (eliberează)
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Ține apăsat pentru întrebare
                </>
              )}
            </Button>
            
            <Button
              variant="outline"
              size="icon"
              onClick={toggleAudio}
            >
              {audioEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </Button>
          </div>

          {question && (
            <Button
              variant="outline"
              onClick={handleQuickHelp}
              className="w-full text-sm"
              disabled={!selectedAgent}
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Ajutor la întrebarea curentă
            </Button>
          )}
        </div>

        {!selectedAgent && (
          <div className="text-center text-muted-foreground text-sm p-4 border border-dashed rounded-lg">
            <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Selectează un asistent vocal pentru a începe</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}