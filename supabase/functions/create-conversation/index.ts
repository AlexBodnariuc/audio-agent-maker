
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { makeError, makeSuccess, handleCors, ERROR_CODES } from '../_shared/error-utils.ts';

// Common validation schema
const voiceChatRequestSchema = {
  specialtyFocus: { type: 'string', default: 'general' },
  quizSessionId: { type: 'string', format: 'uuid', optional: true },
  sessionType: { 
    type: 'string', 
    enum: ['general', 'enhanced_voice_learning', 'learning', 'quiz_assistance', 'testing', 'realtime_voice_test', 'demo_chat'],
    default: 'enhanced_voice_learning' 
  },
};

function validateRequest(data: any) {
  const result = {
    specialtyFocus: data.specialtyFocus || 'general',
    quizSessionId: data.quizSessionId || undefined,
    sessionType: data.sessionType || 'enhanced_voice_learning'
  };
  
  if (result.quizSessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.quizSessionId)) {
    throw new Error('Invalid quiz session ID format');
  }
  
  const allowedTypes = ['general', 'enhanced_voice_learning', 'learning', 'quiz_assistance', 'testing', 'realtime_voice_test', 'demo_chat'];
  if (!allowedTypes.includes(result.sessionType)) {
    throw new Error('Invalid session type');
  }
  
  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Get authorization header and validate JWT
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No authorization header found, creating anonymous session');
      // For demo purposes, we'll create an anonymous session
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: authHeader ? {
            Authorization: authHeader
          } : {}
        }
      }
    );

    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return makeError('VALIDATION_ERROR', 400, undefined, 'JSON invalid în corpul cererii');
    }

    let validatedData;
    try {
      validatedData = validateRequest(rawBody);
    } catch (error) {
      return makeError('VALIDATION_ERROR', 400, { originalError: error.message }, error.message);
    }

    const { specialtyFocus, quizSessionId, sessionType } = validatedData;

    console.log('Creating conversation with:', { specialtyFocus, quizSessionId, sessionType });

    // Get default voice personality
    const { data: personality, error: personalityError } = await supabaseClient
      .from('voice_personalities')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (personalityError) {
      console.error('Error fetching voice personality:', personalityError);
      return makeError('INTERNAL_ERROR', 500, { originalError: personalityError.message }, 'Error fetching voice personality');
    }

    if (!personality) {
      return makeError('NOT_FOUND', 404, undefined, 'No active voice personality found');
    }

    // Handle different session types
    let emailSessionId = null;
    let userId = null;

    if (sessionType === 'demo_chat') {
      // Create a temporary demo session for RLS compliance
      const demoEmail = `demo_${Date.now()}@medmentor.demo`;
      const { data: demoSession, error: demoError } = await supabaseClient
        .from('email_sessions')
        .insert({
          email: demoEmail,
          session_token: `demo_${Date.now()}`,
          is_active: true,
          email_verified: true
        })
        .select('id')
        .single();

      if (demoError) {
        console.error('Error creating demo session:', demoError);
        return makeError('INTERNAL_ERROR', 500, { originalError: demoError.message }, 'Error creating demo session');
      }

      emailSessionId = demoSession.id;
      console.log('Created demo email session:', emailSessionId);
    } else {
      // For authenticated users, get user from auth
      if (authHeader) {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) {
          console.error('Authentication failed for non-demo session:', userError);
          return makeError('UNAUTHORIZED', 401, { originalError: userError?.message }, 'Authentication required for this session type');
        }
        userId = user.id;
        console.log('Using authenticated user:', userId);
      } else {
        return makeError('UNAUTHORIZED', 401, undefined, 'Authentication required for this session type');
      }
    }

    // Create conversation with proper data structure
    const conversationData = {
      voice_personality_id: personality.id,
      voice_session_type: sessionType || 'enhanced_voice_learning',
      specialty_focus: specialtyFocus || 'general',
      quiz_session_id: quizSessionId || null,
      user_id: userId,
      email_session_id: emailSessionId,
      status: 'active',
      title: `${sessionType === 'demo_chat' ? 'Demo ' : ''}Session - ${specialtyFocus || 'General'}`,
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
      return makeError('INTERNAL_ERROR', 500, { originalError: error.message }, 'Error creating conversation');
    }

    console.log('Created conversation:', conversation);

    return makeSuccess({ 
      conversationId: conversation.id,
      conversation,
      demoMode: sessionType === 'demo_chat'
    });

  } catch (error) {
    console.error('Error in create-conversation function:', error);
    return makeError('INTERNAL_ERROR', 500, { originalError: error.message }, error.message || 'Unknown error');
  }
});
