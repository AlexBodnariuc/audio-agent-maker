import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schemas
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_REQUEST_SIZE = 50000; // 50KB
const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

const speechToSpeechRequestSchema = z.object({
  audio: z
    .string()
    .min(1, 'Audio este obligatoriu')
    .refine((val) => val.length <= MAX_AUDIO_SIZE * 1.37, 'Audio prea mare (max 25MB)'),
  conversationId: z.string().uuid('ID conversație invalid'),
  voice: z.enum(ALLOWED_VOICES).default('alloy'),
  language: z.enum(['ro', 'en']).default('ro'),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Speech2Speech: Starting request processing...');
    
    // Step 1: Verify environment variables
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    console.log('Environment check:', {
      hasOpenAI: !!openaiApiKey,
      hasSupabaseUrl: !!supabaseUrl,
      hasSupabaseKey: !!supabaseAnonKey
    });

    if (!openaiApiKey) {
      console.error('Missing OPENAI_API_KEY');
      return new Response(JSON.stringify({
        error: 'OpenAI API key not configured',
        success: false,
        code: 'MISSING_OPENAI_KEY'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase configuration');
      return new Response(JSON.stringify({
        error: 'Supabase configuration missing',
        success: false,
        code: 'MISSING_SUPABASE_CONFIG'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 2: Validate authentication
    const authHeader = req.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Invalid or missing authorization header');
      return new Response(JSON.stringify({
        error: 'Authentication required',
        success: false,
        code: 'MISSING_AUTH'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 3: Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    // Step 4: Parse and validate request
    let rawBody;
    try {
      rawBody = await req.json();
      console.log('Request body parsed successfully');
    } catch (err) {
      console.error('Failed to parse request body:', err);
      return new Response(JSON.stringify({
        error: 'Invalid JSON in request body',
        success: false,
        code: 'INVALID_JSON'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const validationResult = speechToSpeechRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error);
      return new Response(JSON.stringify({
        error: validationResult.error.errors[0]?.message || 'Validation error',
        success: false,
        code: 'VALIDATION_ERROR',
        details: validationResult.error.errors
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { audio, conversationId, voice, language } = validationResult.data;
    console.log(`Speech2Speech: Processing conversation ${conversationId} with voice ${voice} and language ${language}`);

    // Step 5: Speech to Text
    let transcription;
    try {
      transcription = await speechToText(audio, language, openaiApiKey);
      console.log(`Speech2Speech: Transcribed successfully: "${transcription.substring(0, 100)}..."`);
    } catch (err) {
      console.error('Speech-to-text failed:', err);
      return new Response(JSON.stringify({
        error: 'Failed to transcribe audio',
        success: false,
        code: 'TRANSCRIPTION_ERROR',
        details: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 6: Store user message (not displayed in UI for speech2speech)
    try {
      const { error: insertError } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          content: transcription,
          message_type: 'user',
          timestamp: new Date().toISOString(),
          display_in_ui: false, // Speech2speech messages don't display in UI
          voice_metadata: {
            source: 'speech2speech',
            language: language,
            voice_input: true
          }
        });

      if (insertError) {
        console.error('Failed to insert user message:', insertError);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      console.log('User message stored successfully');
    } catch (err) {
      console.error('Database insert error:', err);
      return new Response(JSON.stringify({
        error: 'Failed to save user message',
        success: false,
        code: 'DB_INSERT_ERROR',
        details: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 7: Get AI response
    let aiResponse;
    try {
      aiResponse = await getAIResponse(conversationId, transcription, supabase, openaiApiKey);
      console.log(`Speech2Speech: AI response generated: "${aiResponse.substring(0, 100)}..."`);
    } catch (err) {
      console.error('AI response generation failed:', err);
      return new Response(JSON.stringify({
        error: 'Failed to generate AI response',
        success: false,
        code: 'AI_RESPONSE_ERROR',
        details: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 8: Store AI message (not displayed in UI for speech2speech)
    try {
      const { error: insertError } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          content: aiResponse,
          message_type: 'assistant',
          timestamp: new Date().toISOString(),
          display_in_ui: false, // Speech2speech messages don't display in UI
          voice_metadata: {
            source: 'speech2speech',
            voice_output: true,
            voice: voice
          }
        });

      if (insertError) {
        console.error('Failed to insert AI message:', insertError);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      console.log('AI message stored successfully');
    } catch (err) {
      console.error('Database insert error for AI message:', err);
      return new Response(JSON.stringify({
        error: 'Failed to save AI message',
        success: false,
        code: 'DB_INSERT_ERROR',
        details: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Step 9: Text to Speech
    let audioContent;
    try {
      audioContent = await textToSpeech(aiResponse, voice, openaiApiKey);
      console.log('Speech2Speech: Audio response generated successfully');
    } catch (err) {
      console.error('Text-to-speech failed:', err);
      return new Response(JSON.stringify({
        error: 'Failed to generate audio response',
        success: false,
        code: 'TTS_ERROR',
        details: err.message
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('Speech2Speech: Processing completed successfully');
    return new Response(JSON.stringify({
      success: true,
      audioContent,
      transcription,
      aiResponse,
      metadata: {
        conversationId,
        voice,
        language,
        timestamp: new Date().toISOString()
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Speech2Speech unexpected error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Speech2Speech processing failed',
      success: false,
      code: 'UNEXPECTED_ERROR',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Speech to Text using OpenAI Whisper
async function speechToText(audio: string, language: string, apiKey: string): Promise<string> {
  const binaryAudio = processBase64Chunks(audio);
  
  const formData = new FormData();
  const blob = new Blob([binaryAudio], { type: 'audio/webm' });
  formData.append('file', blob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', language);

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Whisper API error: ${await response.text()}`);
  }

  const result = await response.json();
  return result.text;
}

// Get AI response using existing chat logic
async function getAIResponse(conversationId: string, userMessage: string, supabase: any, apiKey: string): Promise<string> {
  console.log(`Getting AI response for conversation ${conversationId}`);
  
  // Get conversation context
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('voice_personality_id, learning_context')
    .eq('id', conversationId)
    .maybeSingle();

  if (conversationError) {
    console.error('Failed to fetch conversation:', conversationError);
    throw new Error(`Failed to fetch conversation: ${conversationError.message}`);
  }

  if (!conversation) {
    console.error(`Conversation ${conversationId} not found`);
    throw new Error('Conversation not found');
  }

  console.log(`Found conversation with personality ID: ${conversation.voice_personality_id}`);

  // Get voice personality
  const { data: personality, error: personalityError } = await supabase
    .from('voice_personalities')
    .select('persona_json')
    .eq('id', conversation.voice_personality_id)
    .maybeSingle();

  if (personalityError) {
    console.error('Failed to fetch personality:', personalityError);
    // Continue without personality - use default behavior
  }

  console.log('Personality loaded:', !!personality);

  // Get recent conversation history (last 10 messages for context)
  const { data: recentMessages, error: messagesError } = await supabase
    .from('conversation_messages')
    .select('content, message_type, timestamp')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(10);

  if (messagesError) {
    console.error('Failed to fetch recent messages:', messagesError);
    // Continue without history - will just use current message
  }

  console.log(`Loaded ${recentMessages?.length || 0} recent messages for context`);

  // Build conversation context
  const messages = [
    {
      role: 'system',
      content: `You are a helpful medical education assistant for Romanian high school students preparing for medical school admission exams. Focus on biology and chemistry from high school curriculum.

${personality?.persona_json?.instructions || 'Be encouraging, educational, and appropriate for teenagers.'}

Keep responses concise and conversational since this is voice chat. Use simple Romanian when possible.`
    }
  ];

  // Add recent conversation history (reversed to chronological order)
  if (recentMessages) {
    const chronologicalMessages = recentMessages.reverse();
    for (const msg of chronologicalMessages) {
      messages.push({
        role: msg.message_type === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
  }

  // Add current user message
  messages.push({
    role: 'user',
    content: userMessage
  });

  // Call OpenAI Chat API
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
      max_tokens: 500, // Keep responses concise for voice
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI Chat API error: ${await response.text()}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

// Text to Speech using OpenAI TTS
async function textToSpeech(text: string, voice: string, apiKey: string): Promise<string> {
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
    throw new Error(`TTS API error: ${await response.text()}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
}

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768): Uint8Array {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}