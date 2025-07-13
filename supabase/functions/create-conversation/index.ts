import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const requestSchema = z.object({
  specialtyFocus: z.string().default('general'),
  quizSessionId: z.string().uuid().optional(),
  sessionType: z.enum(['general', 'enhanced_voice_learning', 'learning', 'quiz_assistance', 'testing']).default('enhanced_voice_learning'),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    );

    const rawBody = await req.json();
    const validationResult = requestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      throw new Error('Invalid request parameters');
    }
    const { specialtyFocus, quizSessionId, sessionType } = validationResult.data;

    console.log('Creating conversation with:', { specialtyFocus, quizSessionId, sessionType });

    // Get default voice personality
    const { data: personality } = await supabaseClient
      .from('voice_personalities')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!personality) {
      throw new Error('No active voice personality found');
    }

    // Create conversation with proper data structure
    const conversationData = {
      voice_personality_id: personality.id,
      voice_session_type: sessionType || 'enhanced_voice_learning',
      specialty_focus: specialtyFocus || 'general',
      quiz_session_id: quizSessionId || null, // Explicitly allow null
      user_id: null, // Allow null user_id for voice sessions
      email_session_id: null, // Allow null for voice sessions
      status: 'active',
      title: `Voice Session - ${specialtyFocus || 'General'}`,
      learning_context: {
        sessionType: sessionType || 'enhanced_voice_learning',
        startTime: new Date().toISOString(),
        specialtyFocus: specialtyFocus || 'general'
      }
    };

    console.log('Inserting conversation:', conversationData);

    const { data: conversation, error } = await supabaseClient
      .from('conversations')
      .insert(conversationData)
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }

    console.log('Created conversation:', conversation);

    return new Response(
      JSON.stringify({ 
        conversationId: conversation.id,
        conversation 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in create-conversation function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.details || 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});