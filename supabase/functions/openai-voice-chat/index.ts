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

    // Parse and validate request body
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('Received request body:', JSON.stringify(requestBody, null, 2));
    } catch (error) {
      console.error('Failed to parse request body:', error);
      throw new Error('Invalid JSON in request body');
    }

    const { 
      conversationId, 
      message, 
      specialtyFocus, 
      useVoice = false,
      voice = 'alloy'
    }: ChatRequest = requestBody;

    // Validate required parameters
    if (!conversationId) {
      console.error('Missing conversationId in request:', requestBody);
      throw new Error('conversationId is required');
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      console.error('Invalid message in request:', { message, type: typeof message, requestBody });
      throw new Error('message is required and must be a non-empty string');
    }

    // Validate optional parameters
    if (voice && !['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(voice)) {
      console.warn(`Invalid voice "${voice}", using default "alloy"`);
      // Don't throw, just use default
    }

    console.log(`Processing OpenAI voice chat for conversation: ${conversationId}, message length: ${message.length}`);

    // Get conversation context with timeout
    const conversationPromise = supabase
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

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Conversation query timeout')), 10000);
    });

    const { data: conversation, error: convError } = await Promise.race([
      conversationPromise,
      timeoutPromise
    ]) as any;

    if (convError) {
      throw new Error(`Failed to get conversation: ${convError.message}`);
    }

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // Get recent conversation history with error handling
    let messages = [];
    try {
      const { data: messageHistory, error: messagesError } = await supabase
        .from('conversation_messages')
        .select('content, message_type, timestamp')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true })
        .limit(10);

      if (messagesError) {
        console.error('Error getting message history:', messagesError);
        // Continue without history rather than failing
      } else {
        messages = messageHistory || [];
      }
    } catch (error) {
      console.error('Error fetching message history:', error);
      // Continue without history
    }

    // Build conversation context for OpenAI
    const systemPrompt = buildSystemPrompt(conversation, specialtyFocus);
    const conversationHistory = buildConversationHistory(messages);

    // Generate AI response with retry logic
    let aiResponse;
    try {
      aiResponse = await generateAIResponse(
        openaiApiKey,
        systemPrompt,
        conversationHistory,
        message
      );
    } catch (error) {
      console.error('Error generating AI response:', error);
      throw new Error(`Failed to generate AI response: ${error.message}`);
    }

    if (!aiResponse || typeof aiResponse !== 'string' || aiResponse.trim().length === 0) {
      throw new Error('Generated AI response is empty or invalid');
    }

    // Store messages in database (with error handling to not block response)
    try {
      const messageInserts = [
        {
          conversation_id: conversationId,
          content: message.trim(),
          message_type: 'user',
          timestamp: new Date().toISOString()
        },
        {
          conversation_id: conversationId,
          content: aiResponse.trim(),
          message_type: 'assistant',
          timestamp: new Date().toISOString()
        }
      ];

      const { error: insertError } = await supabase
        .from('conversation_messages')
        .insert(messageInserts);

      if (insertError) {
        console.error('Error storing messages:', insertError);
        // Continue without storing - don't fail the request
      }
    } catch (error) {
      console.error('Error storing conversation messages:', error);
      // Continue without storing
    }

    // Generate speech with proper error handling
    let audioContent = null;
    if (useVoice && aiResponse) {
      try {
        audioContent = await generateSpeech(openaiApiKey, aiResponse, voice);
      } catch (speechError) {
        console.error('Error generating speech:', speechError);
        // Continue without audio rather than failing completely
        audioContent = null;
      }
    }

    // Update conversation metadata (non-blocking)
    try {
      await supabase
        .from('conversations')
        .update({
          updated_at: new Date().toISOString(),
          total_messages: (conversation.total_messages || 0) + 2
        })
        .eq('id', conversationId);
    } catch (error) {
      console.error('Error updating conversation metadata:', error);
      // Continue - this is not critical
    }

    console.log(`Successfully processed OpenAI voice chat for conversation ${conversationId}`);

    return new Response(JSON.stringify({
      success: true,
      response: aiResponse,
      audioContent,
      conversationId,
      metadata: {
        hasAudio: !!audioContent,
        messageLength: aiResponse.length,
        voice: useVoice ? voice : null
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in openai-voice-chat function:', error);
    
    // Return structured error response
    const errorResponse = {
      error: error.message,
      success: false,
      timestamp: new Date().toISOString()
    };

    // Determine appropriate status code
    let statusCode = 500;
    if (error.message.includes('required') || error.message.includes('Invalid')) {
      statusCode = 400;
    } else if (error.message.includes('not found')) {
      statusCode = 404;
    } else if (error.message.includes('timeout')) {
      statusCode = 408;
    }

    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
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
- Keep responses conversational but educational (200-300 words maximum)
- Use appropriate medical terminology with explanations
- Encourage questions and deeper exploration
- Provide practical clinical context when relevant
- Maintain professional standards throughout
- Be concise and focused in your responses`;
}

function buildConversationHistory(messages: any[]): any[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter(msg => msg && msg.content && msg.message_type)
    .map(msg => ({
      role: msg.message_type === 'user' ? 'user' : 'assistant',
      content: String(msg.content).trim()
    }))
    .filter(msg => msg.content.length > 0);
}

async function generateAIResponse(
  apiKey: string,
  systemPrompt: string,
  conversationHistory: any[],
  userMessage: string
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  // Retry logic for API calls
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.7,
          max_tokens: 500,
          presence_penalty: 0.1,
          frequency_penalty: 0.1
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        throw new Error(`OpenAI API error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from OpenAI API');
      }

      const content = data.choices[0].message.content;
      if (!content || typeof content !== 'string') {
        throw new Error('Empty or invalid content from OpenAI API');
      }

      return content.trim();

    } catch (error) {
      lastError = error;
      console.error(`OpenAI API attempt ${attempt} failed:`, error);
      
      if (attempt < 3) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError;
}

async function generateSpeech(
  apiKey: string,
  text: string,
  voice: string = 'alloy'
): Promise<string> {
  // Validate inputs
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text is required for speech generation');
  }

  // Truncate text if too long (OpenAI TTS has limits)
  const maxLength = 4000;
  const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  // Validate voice parameter
  const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  const selectedVoice = validVoices.includes(voice) ? voice : 'alloy';

  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: truncatedText,
          voice: selectedVoice,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: { message: errorText } };
        }
        throw new Error(`OpenAI TTS error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
      }

      // Convert audio buffer to base64
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('Empty audio response from OpenAI TTS');
      }

      const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      if (!base64Audio) {
        throw new Error('Failed to convert audio to base64');
      }

      return base64Audio;

    } catch (error) {
      lastError = error;
      console.error(`TTS attempt ${attempt} failed:`, error);
      
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError;
}