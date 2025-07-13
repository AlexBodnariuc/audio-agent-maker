import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation and sanitization
interface ChatRequest {
  conversationId: string;
  message: string;
  specialtyFocus?: string;
  useVoice?: boolean;
  voice?: string;
}

// Romanian medical education constants for MedMentor alignment
const ROMANIAN_MEDICAL_SPECIALTIES = [
  'biologie', 'chimie', 'anatomie', 'fiziologie', 'patologie', 'farmacologie',
  'medicina generala', 'cardiologie', 'neurologie', 'pneumologie'
];

const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONVERSATION_HISTORY = 10;

// Input sanitization functions
function sanitizeInput(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove potential XSS and injection patterns
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, MAX_MESSAGE_LENGTH);
}

function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function validateSpecialty(specialty: string): string {
  const normalizedSpecialty = specialty.toLowerCase().trim();
  return ROMANIAN_MEDICAL_SPECIALTIES.includes(normalizedSpecialty) 
    ? normalizedSpecialty 
    : 'medicina generala';
}

function rateLimitKey(conversationId: string): string {
  return `voice_chat_${conversationId}`;
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

    // Parse and validate request body with security checks
    let requestBody;
    try {
      const rawBody = await req.text();
      if (rawBody.length > 10000) { // Prevent large payload attacks
        throw new Error('Request body too large');
      }
      requestBody = JSON.parse(rawBody);
    } catch (error) {
      console.error('Failed to parse request body:', error);
      throw new Error('Invalid JSON in request body');
    }

    // Extract and validate parameters with input sanitization
    const { 
      conversationId, 
      message, 
      specialtyFocus, 
      useVoice = false,
      voice = 'alloy'
    }: ChatRequest = requestBody;

    // Security validation: conversationId
    if (!conversationId || typeof conversationId !== 'string') {
      throw new Error('conversationId is required and must be a string');
    }
    
    if (!validateUUID(conversationId)) {
      throw new Error('conversationId must be a valid UUID');
    }

    // Security validation: message
    if (!message || typeof message !== 'string') {
      throw new Error('message is required and must be a string');
    }

    const sanitizedMessage = sanitizeInput(message);
    if (sanitizedMessage.length === 0) {
      throw new Error('message cannot be empty after sanitization');
    }

    if (sanitizedMessage.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`message too long (max ${MAX_MESSAGE_LENGTH} characters)`);
    }

    // Security validation: specialtyFocus
    const validatedSpecialty = specialtyFocus 
      ? validateSpecialty(specialtyFocus) 
      : 'medicina generala';

    // Security validation: voice
    const validatedVoice = ALLOWED_VOICES.includes(voice) ? voice : 'alloy';

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
      throw new Error(`Eroare la obținerea conversației: ${convError.message}`);
    }

    if (!conversation) {
      throw new Error('Conversația nu a fost găsită');
    }

    // Rate limiting check (basic implementation)
    const rateLimitCheck = await checkRateLimit(supabase, conversationId);
    if (!rateLimitCheck.allowed) {
      throw new Error('Prea multe cereri. Vă rugăm să așteptați.');
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
        // Sanitize message history
        messages = (messageHistory || []).map(msg => ({
          ...msg,
          content: sanitizeInput(msg.content || '')
        })).filter(msg => msg.content.length > 0);
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
      throw new Error(`Eroare la generarea răspunsului AI: ${error.message}`);
    }

    if (!aiResponse || typeof aiResponse !== 'string' || aiResponse.trim().length === 0) {
      throw new Error('Răspunsul AI generat este invalid');
    }

    // Sanitize AI response for safety
    const sanitizedAIResponse = sanitizeInput(aiResponse);

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

// Rate limiting function for security
async function checkRateLimit(supabase: any, conversationId: string): Promise<{ allowed: boolean; remaining?: number }> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60000); // 1 minute window
    
    // Check existing rate limit entries
    const { data: rateLimits, error } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', conversationId)
      .eq('action', 'voice_chat')
      .gte('window_start', windowStart.toISOString());

    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true }; // Allow on error to prevent blocking
    }

    const currentCount = rateLimits?.length || 0;
    const maxRequests = 20; // 20 requests per minute

    if (currentCount >= maxRequests) {
      return { allowed: false };
    }

    // Insert new rate limit entry
    await supabase
      .from('rate_limits')
      .insert({
        identifier: conversationId,
        identifier_type: 'conversation',
        action: 'voice_chat',
        count: 1,
        max_attempts: maxRequests,
        window_start: windowStart.toISOString(),
        window_duration: '00:01:00'
      });

    return { allowed: true, remaining: maxRequests - currentCount - 1 };
  } catch (error) {
    console.error('Rate limiting error:', error);
    return { allowed: true }; // Allow on error
  }
}

// MedMentor-focused system prompt with Romanian medical education context
function buildMedMentorSystemPrompt(conversation: any, specialtyFocus: string): string {
  const personality = conversation.voice_personalities;
  const name = personality?.name || 'MedMentor';
  
  return `Ești ${name}, un asistent AI expert în educația medicală românească, specializat în ${specialtyFocus}.

CONTEXTUL MEDMENTOR:
- Ești dedicat pregătirii elevilor români pentru admiterea la UMF (Universitatea de Medicină și Farmacie)
- Te focusezi pe biologia și chimia de liceu (clasele XI-XII)
- Bazezi răspunsurile pe manualele românești (ex: Corint Bio XI-XII, manualele de chimie)
- Ajuți la pregătirea pentru examenele de admitere la medicina din România

ROLUL TĂU:
- Oferă conținut educațional precis, bazat pe curriculum-ul românesc
- Adaptează stilul de predare la nivelul elevului de liceu
- Folosește terminologie medicală clară și profesională, cu explicații
- Încurajează gândirea critică și raționamentul logic
- Oferă experiențe de învățare interactive
- Menții principiile siguranței pacientului

CONTEXTUL ACTUAL:
- Specialitate focus: ${specialtyFocus}
- Tip sesiune: ${conversation.voice_session_type || 'învățare generală'}
- Obiective: Dezvoltarea progresivă a cunoștințelor în ${specialtyFocus}

GHIDUL RĂSPUNSURILOR:
- Ține răspunsurile conversaționale dar educaționale (200-300 cuvinte maxim)
- Folosește terminologie medicală cu explicații în română
- Încurajează întrebări și explorare mai profundă
- Oferă context practic relevant pentru admiterea la medicină
- Menții standarde profesionale
- Fii concis și focalizat
- Răspunde ÎNTOTDEAUNA în limba română
- Focusează-te pe biologia și chimia de liceu, NU pe specialități medicale avansate

IMPORTANT: Ești un mentor pentru elevii de liceu care se pregătesc pentru admiterea la medicină în România. Nu oferi consiliere medicală, ci doar educație pentru examene.`;
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