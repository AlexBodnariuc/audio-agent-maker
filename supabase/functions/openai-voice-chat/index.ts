import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { makeError, makeSuccess, handleCors, ERROR_CODES } from '../_shared/error-utils.ts';
import { incrementAndCheck } from '../_shared/rate-limit-utils.ts';

// CORS headers now handled by error-utils

// Validation schemas with Zod
const MAX_MESSAGE_LENGTH = 2000;
const MAX_REQUEST_SIZE = 50000;
const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const ROMANIAN_MEDICAL_SPECIALTIES = [
  'biologie', 'chimie', 'anatomie', 'fiziologie', 'patologie', 'farmacologie',
  'medicina generala', 'cardiologie', 'neurologie', 'pneumologie'
] as const;

const sanitizedTextSchema = z
  .string()
  .min(1, 'Textul nu poate fi gol')
  .max(MAX_MESSAGE_LENGTH, `Textul este prea lung (max ${MAX_MESSAGE_LENGTH} caractere)`)
  .transform((val) => {
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/[<>]/g, '')
      .trim();
  })
  .refine((val) => val.length > 0, 'Textul nu poate fi gol după sanitizare');

const voiceChatRequestSchema = z.object({
  conversationId: z.string().uuid('ID-ul conversației este invalid'),
  message: sanitizedTextSchema,
  specialtyFocus: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 'medicina generala';
      const normalized = val.toLowerCase().trim();
      return ROMANIAN_MEDICAL_SPECIALTIES.includes(normalized as any) 
        ? normalized 
        : 'medicina generala';
    }),
  useVoice: z.boolean().default(false),
  voice: z.enum(ALLOWED_VOICES).default('alloy'),
  ttsOnly: z.boolean().default(false),
  text: z.string().optional(),
});

const MAX_CONVERSATION_HISTORY = 10;

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!openaiApiKey) {
      return makeError('INTERNAL_ERROR', 500, undefined, 'Configurația serverului este incompletă. Vă rugăm să contactați administratorul.');
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return makeError('INTERNAL_ERROR', 500, undefined, 'Configurația bazei de date este incompletă.');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });

    // Parse and validate request body with Zod
    const rawBody = await req.text();
    if (rawBody.length > MAX_REQUEST_SIZE) {
      return makeError('VALIDATION_ERROR', 400, undefined, 'Cererea este prea mare');
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      console.error('Failed to parse request body:', error);
      return makeError('VALIDATION_ERROR', 400, undefined, 'JSON invalid în corpul cererii');
    }

    // Validate with Zod schema
    const validationResult = voiceChatRequestSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      return makeError('VALIDATION_ERROR', 400, { validationErrors: validationResult.error.errors }, firstError?.message || 'Validation error');
    }

    const { 
      conversationId, 
      message: sanitizedMessage, 
      specialtyFocus: validatedSpecialty, 
      useVoice,
        voice: validatedVoice,
        ttsOnly,
        text
    } = validationResult.data;

    // Get conversation context with security validation and timeout
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
      setTimeout(() => reject(new Error('Timeout în obținerea conversației')), 5000);
    });

    const { data: conversation, error: convError } = await Promise.race([
      conversationPromise,
      timeoutPromise
    ]) as any;

    if (convError) {
      return makeError('CONVERSATION_NOT_FOUND', 404, { originalError: convError.message }, `Eroare la obținerea conversației: ${convError.message}`);
    }

    if (!conversation) {
      return makeError('CONVERSATION_NOT_FOUND', 404, undefined, 'Conversația nu a fost găsită');
    }

    // Enhanced rate limiting with user support
    const userId = conversation.user_id;
    const rateLimitCheck = await incrementAndCheck(supabase, userId, conversationId);
    if (!rateLimitCheck.allowed) {
      return makeError('RATE_LIMIT', 429, { 
        remaining: rateLimitCheck.remaining,
        resetTime: rateLimitCheck.resetTime 
      }, 'Prea multe cereri. Vă rugăm să așteptați.');
    }

    // Get recent conversation history with security filtering
    let messages = [];
    try {
      const { data: messageHistory, error: messagesError } = await supabase
        .from('conversation_messages')
        .select('content, message_type, timestamp')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true })
        .limit(MAX_CONVERSATION_HISTORY);

      if (messagesError) {
        console.error('Error getting message history:', messagesError);
      } else {
        // Sanitize message history using the schema
        messages = (messageHistory || []).map(msg => {
          const sanitized = sanitizedTextSchema.safeParse(msg.content || '');
          return {
            ...msg,
            content: sanitized.success ? sanitized.data : ''
          };
        }).filter(msg => msg.content.length > 0);
      }
    } catch (error) {
      console.error('Error fetching message history:', error);
    }

    // Build secure conversation context for OpenAI
    const systemPrompt = buildMedMentorSystemPrompt(conversation, validatedSpecialty);
    const conversationHistory = buildConversationHistory(messages);

    // Generate AI response with security controls
    let aiResponse;
    try {
      aiResponse = await generateAIResponse(
        openaiApiKey,
        systemPrompt,
        conversationHistory,
        sanitizedMessage
      );
    } catch (error) {
      console.error('Error generating AI response:', error);
      return makeError('OPENAI_ERROR', 502, { originalError: error.message }, `Eroare la generarea răspunsului AI: ${error.message}`);
    }

    if (!aiResponse || typeof aiResponse !== 'string' || aiResponse.trim().length === 0) {
      return makeError('OPENAI_ERROR', 502, undefined, 'Răspunsul AI generat este invalid');
    }

    // Sanitize AI response for safety
    const sanitizedResponse = sanitizedTextSchema.safeParse(aiResponse);
    const sanitizedAIResponse = sanitizedResponse.success ? sanitizedResponse.data : aiResponse;

    // Store messages in database with sanitized content
    try {
      const messageInserts = [
        {
          conversation_id: conversationId,
          content: sanitizedMessage,
          message_type: 'user',
          timestamp: new Date().toISOString()
        },
        {
          conversation_id: conversationId,
          content: sanitizedAIResponse,
          message_type: 'assistant',
          timestamp: new Date().toISOString()
        }
      ];

      const { error: insertError } = await supabase
        .from('conversation_messages')
        .insert(messageInserts);

      if (insertError) {
        console.error('Error storing messages:', insertError);
      }
    } catch (error) {
      console.error('Error storing conversation messages:', error);
    }

    // Generate speech with security validation
    let audioContent = null;
    if (useVoice && sanitizedAIResponse) {
      try {
        audioContent = await generateSpeech(openaiApiKey, sanitizedAIResponse, validatedVoice);
      } catch (speechError) {
        console.error('Error generating speech:', speechError);
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

    return makeSuccess({
      response: aiResponse,
      audioContent,
      conversationId,
      metadata: {
        hasAudio: !!audioContent,
        messageLength: aiResponse.length,
        voice: useVoice ? validatedVoice : null,
        rateLimitRemaining: rateLimitCheck.remaining
      }
    });

  } catch (error) {
    console.error('Error in openai-voice-chat function:', error);
    
    // Handle different error types
    if (error.message.includes('timeout')) {
      return makeError('INTERNAL_ERROR', 408, { originalError: error.message }, 'Timeout în procesarea cererii');
    }
    
    // Generic internal error
    return makeError('INTERNAL_ERROR', 500, { originalError: error.message }, error.message);
  }
});

// Rate limiting function replaced by shared utilities
// This function is now deprecated - using incrementAndCheck from rate-limit-utils.ts

// MedMentor-focused system prompt with Romanian medical education context
function buildMedMentorSystemPrompt(conversation: any, specialtyFocus: string): string {
  const personality = conversation.voice_personalities;
  const name = personality?.name || 'MedMentor';
  
  return `Ești ${name}, asistentul AI specializat în pregătirea pentru admiterea la medicina în România.

🎯 MISIUNEA TA:
Să ajuți elevii români de liceu să se pregătească eficient pentru examenele de admitere la UMF, concentrându-te pe biologia și chimia necesare pentru a deveni medic.

📚 CONTEXTUL EDUCAȚIONAL:
- Curriculum românesc: manualele Corint Bio XI-XII, chimie organică/anorganică
- Nivel țintă: elevi clasele XI-XII care vor să intre la medicină
- Focus: concepte fundamentale pentru admiterea la UMF
- Terminologie: medicală românească corectă cu explicații clare

🧠 SPECIALITATEA TA: ${specialtyFocus}
Sesiune: ${conversation.voice_session_type || 'învățare generală'}

✨ STILUL TĂU DE PREDARE:
- Conversațional și prietenos, dar profesional
- Explicații pas cu pas, de la simplu la complex
- Exemple concrete din viața reală
- Întrebări care stimulează gândirea critică
- Conexiuni între concepte pentru înțelegere profundă

📝 RĂSPUNSURILE TALE:
- ÎNTOTDEAUNA în română perfectă
- Maxim 250 cuvinte pentru claritate
- Termeni medicali explicați simplu
- Încurajezi întrebări suplimentare
- Oferi contextul practic pentru medicină
- Folosești analogii și exemple memorabile

🚨 LIMITE IMPORTANTE:
- NU oferă consiliere medicală - doar educație pentru examene
- Focalizează-te pe biologia/chimia de liceu, NU specialități avansate
- Menții standardele academice înalte
- Răspunzi doar la întrebări educaționale relevante

Ești mentorul dedicat care îi ajută pe viitorii medici români să-și atingă visul! 🏥📖`;
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
          temperature: 0.8, // Slightly more creative for educational content
          max_tokens: 400, // Optimized for conversational responses
          presence_penalty: 0.2,
          frequency_penalty: 0.3, // Reduce repetition
          top_p: 0.9 // Focus on most likely tokens for coherence
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