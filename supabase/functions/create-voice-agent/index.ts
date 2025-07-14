import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema for voice agent creation
const validateVoiceAgent = (data: any) => {
  const errors: string[] = [];
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  }
  
  if (data.name && data.name.length > 100) {
    errors.push('Name must be 100 characters or less');
  }
  
  if (data.description && (typeof data.description !== 'string' || data.description.length > 500)) {
    errors.push('Description must be a string with 500 characters or less');
  }
  
  if (data.medical_specialty && typeof data.medical_specialty !== 'string') {
    errors.push('Medical specialty must be a string');
  }
  
  if (data.persona_json && typeof data.persona_json !== 'object') {
    errors.push('Persona JSON must be an object');
  }
  
  if (data.tts_voice_id && typeof data.tts_voice_id !== 'string') {
    errors.push('TTS voice ID must be a string');
  }
  
  if (data.limits_json && typeof data.limits_json !== 'object') {
    errors.push('Limits JSON must be an object');
  }
  
  return errors;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Create authenticated Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: req.headers.get('Authorization') ?? '' },
      },
    });

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const requestBody = await req.json();
    
    // Validate input
    const validationErrors = validateVoiceAgent(requestBody);
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ 
        error: 'Validation failed', 
        details: validationErrors 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate agent_id if not provided
    const agentId = requestBody.agent_id || crypto.randomUUID();

    // Prepare voice personality data
    const voicePersonalityData = {
      agent_id: agentId,
      name: requestBody.name.trim(),
      description: requestBody.description?.trim() || null,
      medical_specialty: requestBody.medical_specialty || null,
      persona_json: requestBody.persona_json || {},
      tts_voice_id: requestBody.tts_voice_id || null,
      limits_json: requestBody.limits_json || {},
      user_id: user.id,
      is_active: true,
    };

    // Insert voice personality
    const { data: voicePersonality, error: insertError } = await supabase
      .from('voice_personalities')
      .insert(voicePersonalityData)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating voice personality:', insertError);
      return new Response(JSON.stringify({ 
        error: 'Failed to create voice agent',
        details: insertError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Successfully created voice agent:', voicePersonality.id);

    return new Response(JSON.stringify({
      success: true,
      data: voicePersonality
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in create-voice-agent function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});