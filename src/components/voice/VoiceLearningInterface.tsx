import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, Brain, TrendingUp, Target, BookOpen } from 'lucide-react';

interface VoiceMetrics {
  pace: number;
  clarity: number;
  confidence: number;
}

interface LearningInsights {
  engagementLevel: string;
  learningEffectiveness: number;
  recommendedTopics: string[];
  progressIndicators: {
    vocabularyGrowth: number;
    sessionCount: number;
    averageSessionDuration: number;
    confidenceImprovement: number;
  };
}

interface Props {
  specialtyFocus?: string;
  quizSessionId?: string;
  onVoiceSessionStart?: (conversationId: string) => void;
  onVoiceSessionEnd?: () => void;
}

const VoiceLearningInterface: React.FC<Props> = ({
  specialtyFocus = 'general',
  quizSessionId,
  onVoiceSessionStart,
  onVoiceSessionEnd
}) => {
  const { toast } = useToast();
  const [isListening, setIsListening] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetrics>({
    pace: 0,
    clarity: 0,
    confidence: 0
  });
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [medicalTermsUsed, setMedicalTermsUsed] = useState<string[]>([]);
  
  const sessionStartTime = useRef<number>(0);
  const sessionInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (sessionInterval.current) {
        clearInterval(sessionInterval.current);
      }
    };
  }, []);

  const calculateEngagement = useCallback((): number => {
    const baseEngagement = sessionDuration > 0 ? Math.min((sessionDuration / 300) * 100, 100) : 0;
    const termBonus = medicalTermsUsed.length * 5;
    return Math.min(baseEngagement + termBonus, 100);
  }, [sessionDuration, medicalTermsUsed]);

  const processVoiceAnalytics = useCallback(async () => {
    if (!conversationId) return;

    try {
      const { data, error } = await supabase.functions.invoke('voice-analytics', {
        body: {
          conversationId,
          sessionDuration,
          voiceMetrics,
          learningTopics: [specialtyFocus],
          comprehensionIndicators: {
            medicalTermsCount: medicalTermsUsed.length,
            sessionEngagement: calculateEngagement()
          }
        }
      });

      if (error) throw error;

      if (data.insights) {
        setInsights(data.insights);
      }

    } catch (error) {
      console.error('Error processing voice analytics:', error);
    }
  }, [conversationId, sessionDuration, voiceMetrics, specialtyFocus, medicalTermsUsed, calculateEngagement]);

  const linkToQuizSession = useCallback(async () => {
    if (!conversationId || !quizSessionId) return;

    try {
      await supabase
        .from('quiz_voice_sessions')
        .insert({
          quiz_session_id: quizSessionId,
          conversation_id: conversationId,
          voice_assistance_type: 'guidance',
          topics_covered: [specialtyFocus],
          effectiveness_score: Math.floor(insights?.learningEffectiveness || 50)
        });

    } catch (error) {
      console.error('Error linking to quiz session:', error);
    }
  }, [conversationId, quizSessionId, specialtyFocus, insights?.learningEffectiveness]);

  const startVoiceSession = useCallback(async () => {
    try {
      setIsListening(true);
      sessionStartTime.current = Date.now();

      // Get a default voice personality or use default ID
      const { data: personality } = await supabase
        .from('voice_personalities')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();

      // Create a new conversation for this voice session
      const { data: conversation, error } = await supabase
        .from('conversations')
        .insert({
          voice_personality_id: personality?.id || '11111111-1111-1111-1111-111111111111',
          voice_session_type: quizSessionId ? 'quiz_assistance' : 'learning',
          specialty_focus: specialtyFocus,
          quiz_session_id: quizSessionId,
          user_id: null, // Allow null user_id for voice sessions
          learning_context: {
            sessionType: 'voice_learning',
            startTime: new Date().toISOString(),
            specialtyFocus
          }
        })
        .select()
        .single();

      if (error) throw error;

      setConversationId(conversation.id);
      onVoiceSessionStart?.(conversation.id);

      // Start session timer
      sessionInterval.current = setInterval(() => {
        const duration = Math.floor((Date.now() - sessionStartTime.current) / 1000);
        setSessionDuration(duration);
      }, 1000);

      toast({
        title: "Voice Session Started",
        description: `Learning session for ${specialtyFocus} specialty`,
      });

    } catch (error) {
      console.error('Error starting voice session:', error);
      toast({
        title: "Error",
        description: "Failed to start voice session",
        variant: "destructive",
      });
      setIsListening(false);
    }
  }, [specialtyFocus, quizSessionId, onVoiceSessionStart, toast]);

  const endVoiceSession = useCallback(async () => {
    try {
      setIsListening(false);
      
      if (sessionInterval.current) {
        clearInterval(sessionInterval.current);
        sessionInterval.current = null;
      }

      if (conversationId) {
        // Update conversation end time
        await supabase
          .from('conversations')
          .update({
            ended_at: new Date().toISOString(),
            learning_context: {
              sessionType: 'voice_learning',
              startTime: new Date(sessionStartTime.current).toISOString(),
              endTime: new Date().toISOString(),
              duration: sessionDuration,
              specialtyFocus
            }
          })
          .eq('id', conversationId);

        // Process voice analytics
        await processVoiceAnalytics();

        // Link to quiz session if applicable
        if (quizSessionId) {
          await linkToQuizSession();
        }
      }

      onVoiceSessionEnd?.();

      toast({
        title: "Voice Session Ended",
        description: `Session lasted ${Math.floor(sessionDuration / 60)} minutes`,
      });

    } catch (error) {
      console.error('Error ending voice session:', error);
      toast({
        title: "Error",
        description: "Failed to end voice session properly",
        variant: "destructive",
      });
    }

    // Reset state
    setConversationId(null);
    setSessionDuration(0);
    setInsights(null);
    setMedicalTermsUsed([]);
  }, [conversationId, sessionDuration, specialtyFocus, quizSessionId, onVoiceSessionEnd, processVoiceAnalytics, linkToQuizSession, toast]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Main Voice Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Voice Learning Assistant
            {specialtyFocus !== 'general' && (
              <Badge variant="secondary">{specialtyFocus}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-center">
            <Button
              type="button"
              onClick={isListening ? endVoiceSession : startVoiceSession}
              size="lg"
              variant={isListening ? "destructive" : "default"}
              className="w-32 h-32 rounded-full"
            >
              {isListening ? (
                <MicOff className="h-8 w-8" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </Button>
          </div>

          {isListening && (
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Session Active</p>
              <p className="text-muted-foreground">
                Duration: {formatDuration(sessionDuration)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Metrics */}
      {isListening && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Session Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Voice Clarity</label>
                <Progress value={voiceMetrics.clarity} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Speaking Pace</label>
                <Progress value={voiceMetrics.pace} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Confidence</label>
                <Progress value={voiceMetrics.confidence} className="mt-1" />
              </div>
            </div>

            {medicalTermsUsed.length > 0 && (
              <div>
                <label className="text-sm font-medium">Medical Terms Used</label>
                <div className="flex flex-wrap gap-1 mt-2">
                  {medicalTermsUsed.map((term, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {term}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Learning Insights */}
      {insights && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Learning Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Engagement Level</label>
                <Badge 
                  variant={insights.engagementLevel === 'high' ? 'default' : 'secondary'}
                  className="ml-2"
                >
                  {insights.engagementLevel}
                </Badge>
              </div>
              <div>
                <label className="text-sm font-medium">Learning Effectiveness</label>
                <Progress value={insights.learningEffectiveness} className="mt-1" />
              </div>
            </div>

            {insights.recommendedTopics.length > 0 && (
              <div>
                <label className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Recommended Topics
                </label>
                <div className="flex flex-wrap gap-1 mt-2">
                  {insights.recommendedTopics.map((topic, index) => (
                    <Badge key={index} variant="outline">
                      {topic}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Vocabulary Growth:</span>
                <span className="ml-2 font-medium">
                  {insights.progressIndicators.vocabularyGrowth} terms
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Session Count:</span>
                <span className="ml-2 font-medium">
                  {insights.progressIndicators.sessionCount}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default VoiceLearningInterface;