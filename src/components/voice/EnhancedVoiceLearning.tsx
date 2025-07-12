import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { useOpenAIVoice } from '@/hooks/useOpenAIVoice';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Send, MessageCircle, Brain, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  specialtyFocus?: string;
  quizSessionId?: string;
  onVoiceSessionStart?: (conversationId: string) => void;
  onVoiceSessionEnd?: () => void;
}

const EnhancedVoiceLearning: React.FC<Props> = ({
  specialtyFocus = 'general',
  quizSessionId,
  onVoiceSessionStart,
  onVoiceSessionEnd
}) => {
  const { toast } = useToast();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [learningMetrics, setLearningMetrics] = useState({
    vocabulary: 0,
    engagement: 0,
    comprehension: 0
  });

  const {
    session,
    messages,
    startSession,
    endSession,
    startListening,
    stopListening,
    sendTextMessage,
    isListening,
    isProcessing,
    isSpeaking,
    isConnected
  } = useOpenAIVoice({
    useVoice: voiceEnabled,
    voice: 'alloy',
    onTranscription: (text) => {
      toast({
        title: "Speech Transcribed",
        description: text.length > 50 ? text.substring(0, 50) + '...' : text,
      });
    },
    onResponse: (text, audio) => {
      updateLearningMetrics(text);
    },
    onError: (error) => {
      toast({
        title: "Voice Error",
        description: error,
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    if (session && conversationId) {
      onVoiceSessionStart?.(conversationId);
    }
  }, [session, conversationId, onVoiceSessionStart]);

  const handleStartSession = async () => {
    if (isStarting) return;
    
    try {
      setIsStarting(true);
      
      // Create a new conversation using Supabase edge function
      const { data, error } = await supabase.functions.invoke('create-conversation', {
        body: {
          specialtyFocus,
          quizSessionId,
          sessionType: 'enhanced_voice_learning'
        }
      });

      if (error) {
        throw error;
      }

      const newConversationId = data.conversationId;
      setConversationId(newConversationId);
      await startSession(newConversationId);

      toast({
        title: "Session Started",
        description: "AI Voice Learning session is now active",
      });

    } catch (error) {
      console.error('Error starting enhanced voice session:', error);
      toast({
        title: "Error",
        description: `Failed to start voice learning session: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndSession = () => {
    endSession();
    setConversationId(null);
    onVoiceSessionEnd?.();
  };

  const handleSendMessage = async () => {
    if (!textInput.trim()) return;
    
    await sendTextMessage(textInput);
    setTextInput('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const updateLearningMetrics = (responseText: string) => {
    // Simple metrics based on response content
    const medicalTerms = extractMedicalTerms(responseText);
    const questionCount = (responseText.match(/\?/g) || []).length;
    
    setLearningMetrics(prev => ({
      vocabulary: Math.min(prev.vocabulary + medicalTerms.length * 2, 100),
      engagement: Math.min(prev.engagement + questionCount * 5, 100),
      comprehension: Math.min(prev.comprehension + (responseText.length > 100 ? 3 : 1), 100)
    }));
  };

  const extractMedicalTerms = (text: string): string[] => {
    const medicalTerms = [
      'diagnosis', 'treatment', 'symptom', 'syndrome', 'pathology',
      'anatomy', 'physiology', 'medication', 'procedure', 'therapy',
      'cardiac', 'neural', 'pulmonary', 'renal', 'hepatic'
    ];
    
    return medicalTerms.filter(term => 
      text.toLowerCase().includes(term)
    );
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-primary" />
                Enhanced AI Voice Learning
              </CardTitle>
              <CardDescription>
                Advanced voice-powered learning with OpenAI Assistant
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? "default" : "secondary"}>
                {isConnected ? "Connected" : "Disconnected"}
              </Badge>
              {specialtyFocus && (
                <Badge variant="outline">{specialtyFocus}</Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Control Panel */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-4">
            {!isConnected ? (
              <Button 
                onClick={handleStartSession}
                disabled={isStarting}
                size="lg"
                className="bg-primary hover:bg-primary/90"
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                {isStarting ? "Starting..." : "Start AI Voice Session"}
              </Button>
            ) : (
              <>
                <Button
                  variant={isListening ? "destructive" : "default"}
                  onClick={isListening ? stopListening : startListening}
                  disabled={isProcessing}
                  size="lg"
                >
                  {isListening ? (
                    <>
                      <MicOff className="mr-2 h-4 w-4" />
                      Stop Listening
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-4 w-4" />
                      Start Speaking
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setVoiceEnabled(!voiceEnabled)}
                >
                  {voiceEnabled ? (
                    <>
                      <Volume2 className="mr-2 h-4 w-4" />
                      Voice On
                    </>
                  ) : (
                    <>
                      <VolumeX className="mr-2 h-4 w-4" />
                      Voice Off
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleEndSession}
                >
                  End Session
                </Button>
              </>
            )}
          </div>

          {/* Status Indicators */}
          {isConnected && (
            <div className="mt-4 flex justify-center gap-6">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full text-sm",
                isListening ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isListening ? "bg-red-500 animate-pulse" : "bg-gray-400"
                )} />
                {isListening ? "Listening..." : "Not listening"}
              </div>

              <div className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full text-sm",
                isProcessing ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isProcessing ? "bg-blue-500 animate-pulse" : "bg-gray-400"
                )} />
                {isProcessing ? "Processing..." : "Ready"}
              </div>

              <div className={cn(
                "flex items-center gap-2 px-3 py-1 rounded-full text-sm",
                isSpeaking ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              )}>
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isSpeaking ? "bg-green-500 animate-pulse" : "bg-gray-400"
                )} />
                {isSpeaking ? "Speaking..." : "Silent"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Learning Metrics */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Learning Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Medical Vocabulary</span>
                  <span>{learningMetrics.vocabulary}%</span>
                </div>
                <Progress value={learningMetrics.vocabulary} className="h-2" />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Engagement Level</span>
                  <span>{learningMetrics.engagement}%</span>
                </div>
                <Progress value={learningMetrics.engagement} className="h-2" />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Comprehension</span>
                  <span>{learningMetrics.comprehension}%</span>
                </div>
                <Progress value={learningMetrics.comprehension} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Interface */}
      {isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-96 mb-4">
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex",
                      message.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-lg px-4 py-2",
                        message.role === 'user'
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="text-sm">{message.content}</p>
                      <span className="text-xs opacity-70 mt-1 block">
                        {formatTimestamp(message.timestamp)}
                      </span>
                    </div>
                  </div>
                ))}
                {isProcessing && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                          <div className="w-2 h-2 bg-current rounded-full animate-pulse delay-100" />
                          <div className="w-2 h-2 bg-current rounded-full animate-pulse delay-200" />
                        </div>
                        <span className="text-sm text-muted-foreground">AI is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <Separator className="mb-4" />

            {/* Text Input */}
            <div className="flex gap-2">
              <Input
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message or use voice..."
                disabled={isProcessing}
                className="flex-1"
              />
              <Button
                onClick={handleSendMessage}
                disabled={!textInput.trim() || isProcessing}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EnhancedVoiceLearning;