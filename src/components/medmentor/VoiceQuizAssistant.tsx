import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Volume2, VolumeX, Brain, MessageCircle, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VoiceQuizAssistantProps {
  question?: string;
  subject: "biology" | "chemistry";
  onTranscriptionReceived?: (text: string) => void;
  onAskForHelp?: (question: string) => void;
}

export default function VoiceQuizAssistant({ 
  question, 
  subject, 
  onTranscriptionReceived,
  onAskForHelp 
}: VoiceQuizAssistantProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [conversationHistory, setConversationHistory] = useState<Array<{
    type: "user" | "assistant";
    text: string;
    timestamp: Date;
  }>>([]);
  
  const { toast } = useToast();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const getSubjectColor = (subj: string) => {
    return subj === "biology" ? "medical-green" : "medical-blue";
  };

  const startListening = async () => {
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

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
      
      toast({
        title: "Ascult...",
        description: "Spune ce vrei să întrebi despre această întrebare.",
      });
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Eroare",
        description: "Nu pot accesa microfonul. Verifică permisiunile.",
        variant: "destructive"
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
      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        // Call speech-to-text edge function
        const response = await fetch('/functions/v1/openai-speech-to-text', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ audio: base64Audio }),
        });

        if (response.ok) {
          const { text } = await response.json();
          setTranscript(text);
          
          // Add to conversation history
          const userMessage = {
            type: "user" as const,
            text: text,
            timestamp: new Date()
          };
          
          setConversationHistory(prev => [...prev, userMessage]);
          onTranscriptionReceived?.(text);
          
          // Process the question with AI
          await getAIResponse(text);
        } else {
          throw new Error('Speech-to-text failed');
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error processing audio:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut procesa înregistrarea audio.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const getAIResponse = async (userText: string) => {
    try {
      // Call AI assistant for Romanian medical education
      const response = await fetch('/functions/v1/openai-voice-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userText,
          context: {
            subject: subject,
            question: question,
            language: "ro",
            level: "high_school",
            exam_type: "UMF_admission"
          }
        }),
      });

      if (response.ok) {
        const { response: aiResponse } = await response.json();
        
        // Add AI response to conversation
        const assistantMessage = {
          type: "assistant" as const,
          text: aiResponse,
          timestamp: new Date()
        };
        
        setConversationHistory(prev => [...prev, assistantMessage]);
        
        // Convert AI response to speech if audio is enabled
        if (audioEnabled) {
          await playAIResponse(aiResponse);
        }
        
        toast({
          title: "Răspuns primit",
          description: "Asistentul AI a răspuns la întrebarea ta.",
        });
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut obține răspunsul de la asistent.",
        variant: "destructive"
      });
    }
  };

  const playAIResponse = async (text: string) => {
    try {
      const response = await fetch('/functions/v1/openai-text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice: 'alloy'
        }),
      });

      if (response.ok) {
        const { audioContent } = await response.json();
        const audioBlob = new Blob(
          [Uint8Array.from(atob(audioContent), c => c.charCodeAt(0))],
          { type: 'audio/mp3' }
        );
        
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        await audio.play();
        
        // Cleanup
        audio.onended = () => URL.revokeObjectURL(audioUrl);
      }
    } catch (error) {
      console.error('Error playing AI response:', error);
    }
  };

  const handleQuickHelp = () => {
    if (question) {
      onAskForHelp?.(question);
    }
  };

  return (
    <Card className={`border-2 border-${getSubjectColor(subject)}/20 bg-${getSubjectColor(subject)}/5`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className={`h-5 w-5 text-${getSubjectColor(subject)}`} />
            Asistent Vocal pentru {subject === "biology" ? "Biologie" : "Chimie"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="text-muted-foreground"
            >
              {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Voice Controls */}
        <div className="flex items-center justify-center gap-4">
          <Button
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
            size="lg"
            className={`relative ${isListening ? 'bg-medical-red hover:bg-medical-red/90' : `bg-${getSubjectColor(subject)} hover:bg-${getSubjectColor(subject)}/90`}`}
          >
            {isListening ? (
              <>
                <MicOff className="h-5 w-5 mr-2" />
                Oprește
              </>
            ) : (
              <>
                <Mic className="h-5 w-5 mr-2" />
                {isProcessing ? "Procesez..." : "Întreabă"}
              </>
            )}
            {isListening && (
              <div className="absolute -inset-1 bg-medical-red/20 rounded-lg animate-pulse"></div>
            )}
          </Button>
          
          {question && (
            <Button
              onClick={handleQuickHelp}
              variant="outline"
              className={`border-${getSubjectColor(subject)}/30 text-${getSubjectColor(subject)}`}
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              Ajutor rapid
            </Button>
          )}
        </div>

        {/* Status */}
        <div className="text-center">
          {isListening && (
            <Badge className="bg-medical-red/10 text-medical-red border-medical-red/20">
              <Mic className="h-3 w-3 mr-1" />
              Ascult...
            </Badge>
          )}
          {isProcessing && (
            <Badge className={`bg-${getSubjectColor(subject)}/10 text-${getSubjectColor(subject)} border-${getSubjectColor(subject)}/20`}>
              <Brain className="h-3 w-3 mr-1" />
              Procesez...
            </Badge>
          )}
          {!isListening && !isProcessing && (
            <p className="text-sm text-muted-foreground">
              Apasă pe buton și întreabă orice despre această problemă
            </p>
          )}
        </div>

        {/* Conversation History */}
        {conversationHistory.length > 0 && (
          <div className="space-y-3 max-h-64 overflow-y-auto border rounded-lg p-3 bg-background/50">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">Conversația ta</span>
            </div>
            {conversationHistory.map((message, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  message.type === "user"
                    ? "bg-primary/10 ml-8"
                    : "bg-muted/50 mr-8"
                }`}
              >
                <div className="flex items-start gap-2">
                  <Badge
                    variant="outline"
                    className={message.type === "user" ? "border-primary/30 text-primary" : "border-muted-foreground/30"}
                  >
                    {message.type === "user" ? "Tu" : "Asistent"}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{message.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {message.timestamp.toLocaleTimeString("ro-RO", {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>💡 <strong>Sfaturi:</strong></p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Întreabă "De ce este răspunsul corect B?" pentru explicații</li>
            <li>Cere exemple: "Poți să-mi dai un exemplu similar?"</li>
            <li>Solicită clarificări: "Nu înțeleg conceptul de..."</li>
            <li>Cere strategii: "Cum abordez acest tip de problemă?"</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}