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
  wordCount?: number;
  medicalTermsUsed?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    // Get authorization header and validate JWT
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const { 
      conversationId, 
      sessionDuration, 
      voiceMetrics, 
      learningTopics, 
      comprehensionIndicators,
      wordCount,
      medicalTermsUsed
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
      console.error('Failed to get conversation:', convError);
      throw new Error(`Failed to get conversation: ${convError.message}`);
    }

    // Prepare analytics data with better structure
    const analyticsData = {
      conversation_id: conversationId,
      user_id: conversation.user_id,
      email_session_id: conversation.email_session_id,
      session_duration: sessionDuration || 0,
      voice_metrics: voiceMetrics || {},
      learning_topics: learningTopics || [],
      comprehension_indicators: comprehensionIndicators || {},
      word_count: wordCount || 0,
      medical_terms_used: medicalTermsUsed || [],
      updated_at: new Date().toISOString()
    };

    // Use INSERT with ON CONFLICT to handle unique constraint properly
    const { data, error } = await supabase
      .from('voice_analytics')
      .upsert(analyticsData, {
        onConflict: 'conversation_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error updating voice analytics:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    // Generate learning insights with error handling
    let insights = {};
    try {
      insights = await generateLearningInsights(supabase, conversationId, conversation);
    } catch (insightError) {
      console.error('Error generating insights:', insightError);
      // Continue without insights rather than failing completely
      insights = { error: 'Failed to generate insights' };
    }

    console.log(`Successfully updated voice analytics for conversation ${conversationId}`);

    return new Response(JSON.stringify({ 
      success: true,
      data: analyticsData,
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
    // Get analytics data with error handling
    const { data: analytics, error: analyticsError } = await supabase
      .from('voice_analytics')
      .select('*')
      .eq('conversation_id', conversationId)
      .single();

    if (analyticsError || !analytics) {
      console.log('No analytics data found for insights generation');
      return { message: 'No analytics data available for insights' };
    }

    // Calculate learning metrics with safe defaults
    const insights = {
      engagementLevel: calculateEngagementLevel(analytics),
      learningEffectiveness: calculateLearningEffectiveness(analytics),
      recommendedTopics: await getRecommendedTopics(supabase, conversation, analytics),
      progressIndicators: calculateProgressIndicators(analytics),
      timestamp: new Date().toISOString()
    };

    return insights;
  } catch (error) {
    console.error('Error generating insights:', error);
    return { error: 'Failed to generate learning insights' };
  }
}

function calculateEngagementLevel(analytics: any): string {
  try {
    const wordCount = analytics.word_count || 0;
    const sessionDuration = analytics.session_duration || 1;
    const wordsPerMinute = sessionDuration > 0 ? (wordCount / sessionDuration) * 60 : 0;

    if (wordsPerMinute > 120) return 'high';
    if (wordsPerMinute > 60) return 'medium';
    return 'low';
  } catch (error) {
    console.error('Error calculating engagement level:', error);
    return 'unknown';
  }
}

function calculateLearningEffectiveness(analytics: any): number {
  try {
    const medicalTermsCount = analytics.medical_terms_used?.length || 0;
    const wordCount = analytics.word_count || 1;
    const medicalTermsRatio = wordCount > 0 ? medicalTermsCount / wordCount : 0;

    // Simple effectiveness score based on medical terminology usage
    return Math.min(Math.round(medicalTermsRatio * 100), 100);
  } catch (error) {
    console.error('Error calculating learning effectiveness:', error);
    return 0;
  }
}

async function getRecommendedTopics(supabase: any, conversation: any, analytics: any): Promise<string[]> {
  try {
    const specialtyFocus = conversation.specialty_focus || 'general';
    const usedTerms = analytics.medical_terms_used || [];

    // Based on specialty and current usage, recommend topics
    const topicRecommendations: Record<string, string[]> = {
      'cardiology': ['heart anatomy', 'cardiac procedures', 'ECG interpretation', 'cardiac medications'],
      'neurology': ['brain anatomy', 'neurological examination', 'stroke management', 'seizure disorders'],
      'pulmonology': ['respiratory anatomy', 'lung function tests', 'asthma management', 'ventilator settings'],
      'emergency': ['ACLS protocols', 'trauma assessment', 'shock management', 'emergency procedures'],
      'general': ['basic anatomy', 'vital signs', 'common medications', 'patient communication']
    };

    return topicRecommendations[specialtyFocus] || topicRecommendations['general'];
  } catch (error) {
    console.error('Error getting recommended topics:', error);
    return ['basic anatomy', 'vital signs', 'patient communication'];
  }
}

function calculateProgressIndicators(analytics: any): any {
  try {
    return {
      vocabularyGrowth: analytics.medical_terms_used?.length || 0,
      sessionCount: 1, // This would be calculated from historical data
      averageSessionDuration: analytics.session_duration || 0,
      confidenceImprovement: analytics.voice_metrics?.confidence || 0,
      engagementMetrics: {
        wordCount: analytics.word_count || 0,
        medicalTermsUsed: analytics.medical_terms_used?.length || 0,
        topicsExplored: analytics.learning_topics?.length || 0
      }
    };
  } catch (error) {
    console.error('Error calculating progress indicators:', error);
    return {
      vocabularyGrowth: 0,
      sessionCount: 0,
      averageSessionDuration: 0,
      confidenceImprovement: 0
    };
  }
}