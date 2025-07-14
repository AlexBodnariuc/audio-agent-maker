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
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!openaiApiKey || !supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing required environment variables');
    }

    // Validate auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } }
    });

    // Parse and validate request
    const rawBody = await req.json();
    const validationResult = speechToSpeechRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      throw new Error(validationResult.error.errors[0]?.message || 'Validation error');
    }

    const { audio, conversationId, voice, language } = validationResult.data;

    console.log(`Speech2Speech: Processing conversation ${conversationId}`);

    // Step 1: Speech to Text
    const transcription = await speechToText(audio, language, openaiApiKey);
    console.log(`Speech2Speech: Transcribed: "${transcription}"`);

    // Step 2: Store user message (not displayed in UI for speech2speech)
    await supabase
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

    // Step 3: Get AI response
    const aiResponse = await getAIResponse(conversationId, transcription, supabase, openaiApiKey);
    console.log(`Speech2Speech: AI response: "${aiResponse}"`);

    // Step 4: Store AI message (not displayed in UI for speech2speech)
    await supabase
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

    // Step 5: Text to Speech
    const audioContent = await textToSpeech(aiResponse, voice, openaiApiKey);
    console.log(`Speech2Speech: Generated audio response`);

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
    console.error('Speech2Speech error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Speech2Speech processing failed',
      success: false
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
  // Get conversation context
  const { data: conversation } = await supabase
    .from('conversations')
    .select('voice_personality_id, learning_context')
    .eq('id', conversationId)
    .single();

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Get voice personality
  const { data: personality } = await supabase
    .from('voice_personalities')
    .select('persona_json')
    .eq('id', conversation.voice_personality_id)
    .single();

  // Get recent conversation history (last 10 messages for context)
  const { data: recentMessages } = await supabase
    .from('conversation_messages')
    .select('content, message_type, timestamp')
    .eq('conversation_id', conversationId)
    .order('timestamp', { ascending: false })
    .limit(10);

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