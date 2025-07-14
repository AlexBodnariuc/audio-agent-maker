import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schemas
const validateVoiceAgentUpdate = (data: any) => {
  const errors: string[] = [];
  
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      errors.push('Name must be a non-empty string');
    }
    if (data.name && data.name.length > 100) {
      errors.push('Name must be 100 characters or less');
    }
  }
  
  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string' || data.description.length > 500) {
      errors.push('Description must be a string with 500 characters or less');
    }
  }
  
  if (data.medical_specialty !== undefined && data.medical_specialty !== null) {
    if (typeof data.medical_specialty !== 'string') {
      errors.push('Medical specialty must be a string');
    }
  }
  
  if (data.persona_json !== undefined && data.persona_json !== null) {
    if (typeof data.persona_json !== 'object') {
      errors.push('Persona JSON must be an object');
    }
  }
  
  if (data.tts_voice_id !== undefined && data.tts_voice_id !== null) {
    if (typeof data.tts_voice_id !== 'string') {
      errors.push('TTS voice ID must be a string');
    }
  }
  
  if (data.limits_json !== undefined && data.limits_json !== null) {
    if (typeof data.limits_json !== 'object') {
      errors.push('Limits JSON must be an object');
    }
  }
  
  return errors;
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    const url = new URL(req.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);
    const agentId = pathSegments[pathSegments.length - 1];

    // GET - List voice agents with pagination
    if (req.method === 'GET') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 50);
      const search = url.searchParams.get('search') || '';
      const specialty = url.searchParams.get('specialty') || '';
      const offset = (page - 1) * limit;

      let query = supabase
        .from('voice_personalities')
        .select('*, count(*)', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      if (specialty) {
        query = query.eq('medical_specialty', specialty);
      }

      const { data: agents, error, count } = await query;

      if (error) {
        console.error('Error fetching voice agents:', error);
        return new Response(JSON.stringify({ 
          error: 'Failed to fetch voice agents',
          details: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const totalPages = Math.ceil((count || 0) / limit);

      return new Response(JSON.stringify({
        success: true,
        data: agents || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For PATCH and DELETE, we need an agent ID
    if (!agentId || agentId === 'manage-voice-agents') {
      return new Response(JSON.stringify({ error: 'Agent ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PATCH - Update voice agent
    if (req.method === 'PATCH') {
      const requestBody = await req.json();
      
      // Validate input
      const validationErrors = validateVoiceAgentUpdate(requestBody);
      if (validationErrors.length > 0) {
        return new Response(JSON.stringify({ 
          error: 'Validation failed', 
          details: validationErrors 
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // First verify the agent exists and belongs to the user
      const { data: existingAgent, error: fetchError } = await supabase
        .from('voice_personalities')
        .select('id, user_id')
        .eq('id', agentId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (fetchError || !existingAgent) {
        return new Response(JSON.stringify({ error: 'Agent not found or access denied' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Prepare update data
      const updateData = {
        ...requestBody,
        updated_at: new Date().toISOString(),
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      const { data: updatedAgent, error: updateError } = await supabase
        .from('voice_personalities')
        .update(updateData)
        .eq('id', agentId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating voice agent:', updateError);
        return new Response(JSON.stringify({ 
          error: 'Failed to update voice agent',
          details: updateError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Successfully updated voice agent:', updatedAgent.id);

      return new Response(JSON.stringify({
        success: true,
        data: updatedAgent
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DELETE - Soft delete voice agent
    if (req.method === 'DELETE') {
      // First verify the agent exists and belongs to the user
      const { data: existingAgent, error: fetchError } = await supabase
        .from('voice_personalities')
        .select('id, user_id, name')
        .eq('id', agentId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (fetchError || !existingAgent) {
        return new Response(JSON.stringify({ error: 'Agent not found or access denied' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Soft delete by setting is_active to false
      const { error: deleteError } = await supabase
        .from('voice_personalities')
        .update({ 
          is_active: false, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', agentId)
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('Error deleting voice agent:', deleteError);
        return new Response(JSON.stringify({ 
          error: 'Failed to delete voice agent',
          details: deleteError.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Successfully deleted voice agent:', agentId);

      return new Response(JSON.stringify({
        success: true,
        message: `Voice agent "${existingAgent.name}" has been deleted`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Method not allowed
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in manage-voice-agents function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});