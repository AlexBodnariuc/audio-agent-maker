import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyticsRequest {
  conversationId: string;
  sessionDuration?: number;
  voiceMetrics?: {
    pace: number;
    clarity: number;
    confidence: number;
  };
  learningTopics?: string[];
  comprehensionIndicators?: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });

    const { 
      conversationId, 
      sessionDuration, 
      voiceMetrics, 
      learningTopics, 
      comprehensionIndicators 
    }: AnalyticsRequest = await req.json();

    if (!conversationId) {
      throw new Error('conversationId is required');
    }

    console.log(`Processing voice analytics for conversation ${conversationId}`);

    // Get conversation details
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('user_id, email_session_id, specialty_focus')
      .eq('id', conversationId)
      .single();

    if (convError) {
      throw new Error(`Failed to get conversation: ${convError.message}`);
    }

    // Update voice analytics
    const { data, error } = await supabase
      .from('voice_analytics')
      .upsert({
        conversation_id: conversationId,
        user_id: conversation.user_id,
        email_session_id: conversation.email_session_id,
        session_duration: sessionDuration,
        voice_metrics: voiceMetrics,
        learning_topics: learningTopics || [],
        comprehension_indicators: comprehensionIndicators || {},
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'conversation_id'
      });

    if (error) {
      console.error('Error updating voice analytics:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    // Generate learning insights
    const insights = await generateLearningInsights(supabase, conversationId, conversation);

    console.log(`Successfully updated voice analytics for conversation ${conversationId}`);

    return new Response(JSON.stringify({ 
      success: true,
      insights
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in voice-analytics function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateLearningInsights(supabase: any, conversationId: string, conversation: any) {
  try {
    // Get analytics data
    const { data: analytics } = await supabase
      .from('voice_analytics')
      .select('*')
      .eq('conversation_id', conversationId)
      .single();

    if (!analytics) return {};

    // Calculate learning metrics
    const insights = {
      engagementLevel: calculateEngagementLevel(analytics),
      learningEffectiveness: calculateLearningEffectiveness(analytics),
      recommendedTopics: await getRecommendedTopics(supabase, conversation, analytics),
      progressIndicators: calculateProgressIndicators(analytics)
    };

    return insights;
  } catch (error) {
    console.error('Error generating insights:', error);
    return {};
  }
}

function calculateEngagementLevel(analytics: any): string {
  const wordCount = analytics.word_count || 0;
  const sessionDuration = analytics.session_duration || 1;
  const wordsPerMinute = (wordCount / sessionDuration) * 60;

  if (wordsPerMinute > 120) return 'high';
  if (wordsPerMinute > 60) return 'medium';
  return 'low';
}

function calculateLearningEffectiveness(analytics: any): number {
  const medicalTermsCount = analytics.medical_terms_used?.length || 0;
  const wordCount = analytics.word_count || 1;
  const medicalTermsRatio = medicalTermsCount / wordCount;

  // Simple effectiveness score based on medical terminology usage
  return Math.min(medicalTermsRatio * 100, 100);
}

async function getRecommendedTopics(supabase: any, conversation: any, analytics: any): Promise<string[]> {
  const specialtyFocus = conversation.specialty_focus || 'general';
  const usedTerms = analytics.medical_terms_used || [];

  // Based on specialty and current usage, recommend topics
  const topicRecommendations: Record<string, string[]> = {
    'cardiology': ['heart anatomy', 'cardiac procedures', 'ECG interpretation', 'cardiac medications'],
    'neurology': ['brain anatomy', 'neurological examination', 'stroke management', 'seizure disorders'],
    'general': ['basic anatomy', 'vital signs', 'common medications', 'patient communication']
  };

  return topicRecommendations[specialtyFocus] || topicRecommendations['general'];
}

function calculateProgressIndicators(analytics: any): any {
  return {
    vocabularyGrowth: analytics.medical_terms_used?.length || 0,
    sessionCount: 1, // This would be calculated from historical data
    averageSessionDuration: analytics.session_duration || 0,
    confidenceImprovement: analytics.voice_metrics?.confidence || 0
  };
}