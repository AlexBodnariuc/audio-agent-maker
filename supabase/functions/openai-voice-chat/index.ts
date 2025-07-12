import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatRequest {
  conversationId: string;
  message: string;
  specialtyFocus?: string;
  useVoice?: boolean;
  voice?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!openaiApiKey || !supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });

    const { 
      conversationId, 
      message, 
      specialtyFocus, 
      useVoice = false,
      voice = 'alloy'
    }: ChatRequest = await req.json();

    if (!conversationId || !message) {
      throw new Error('conversationId and message are required');
    }

    console.log(`Processing OpenAI voice chat for conversation: ${conversationId}`);

    // Get conversation context
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        voice_personalities (
          name,
          medical_specialty,
          description
        )
      `)
      .eq('id', conversationId)
      .single();

    if (convError) {
      throw new Error(`Failed to get conversation: ${convError.message}`);
    }

    // Get recent conversation history
    const { data: messages, error: messagesError } = await supabase
      .from('conversation_messages')
      .select('content, message_type, timestamp')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true })
      .limit(10);

    if (messagesError) {
      console.error('Error getting message history:', messagesError);
    }

    // Build conversation context for OpenAI
    const systemPrompt = buildSystemPrompt(conversation, specialtyFocus);
    const conversationHistory = buildConversationHistory(messages || []);

    // Generate AI response
    const aiResponse = await generateAIResponse(
      openaiApiKey,
      systemPrompt,
      conversationHistory,
      message
    );

    // Store user message
    await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        content: message,
        message_type: 'user',
        timestamp: new Date().toISOString()
      });

    // Store AI response
    await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        content: aiResponse,
        message_type: 'assistant',
        timestamp: new Date().toISOString()
      });

    let audioContent = null;
    if (useVoice) {
      // Generate speech from AI response
      audioContent = await generateSpeech(openaiApiKey, aiResponse, voice);
    }

    // Update conversation metadata
    await supabase
      .from('conversations')
      .update({
        updated_at: new Date().toISOString(),
        total_messages: (conversation.total_messages || 0) + 2
      })
      .eq('id', conversationId);

    console.log(`Successfully processed OpenAI voice chat for conversation ${conversationId}`);

    return new Response(JSON.stringify({
      success: true,
      response: aiResponse,
      audioContent,
      conversationId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in openai-voice-chat function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function buildSystemPrompt(conversation: any, specialtyFocus?: string): string {
  const personality = conversation.voice_personalities;
  const specialty = specialtyFocus || personality?.medical_specialty || 'general medicine';
  
  return `You are ${personality?.name || 'MedMentor'}, an expert AI medical education assistant specializing in ${specialty}.

Your role is to:
- Provide accurate, evidence-based medical education content
- Adapt your teaching style to the student's level
- Use clear, professional medical terminology
- Encourage critical thinking and clinical reasoning
- Provide interactive learning experiences
- Ensure patient safety principles are always emphasized

Current learning context:
- Specialty focus: ${specialty}
- Session type: ${conversation.voice_session_type || 'general learning'}
- Learning objectives: Progressive skill building in ${specialty}

Guidelines:
- Keep responses conversational but educational
- Use appropriate medical terminology with explanations
- Encourage questions and deeper exploration
- Provide practical clinical context when relevant
- Maintain professional standards throughout`;
}

function buildConversationHistory(messages: any[]): any[] {
  return messages.map(msg => ({
    role: msg.message_type === 'user' ? 'user' : 'assistant',
    content: msg.content
  }));
}

async function generateAIResponse(
  apiKey: string,
  systemPrompt: string,
  conversationHistory: any[],
  userMessage: string
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function generateSpeech(
  apiKey: string,
  text: string,
  voice: string = 'alloy'
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: voice,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI TTS error: ${error.error?.message || 'Unknown error'}`);
  }

  // Convert audio buffer to base64
  const arrayBuffer = await response.arrayBuffer();
  const base64Audio = btoa(
    String.fromCharCode(...new Uint8Array(arrayBuffer))
  );

  return base64Audio;
}