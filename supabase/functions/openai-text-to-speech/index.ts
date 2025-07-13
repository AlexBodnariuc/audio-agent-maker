import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schemas with Zod
const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
const MAX_TEXT_LENGTH = 4000;
const MAX_REQUEST_SIZE = 50000; // 50KB max request

const sanitizedTextSchema = z
  .string()
  .min(1, 'Textul nu poate fi gol')
  .max(MAX_TEXT_LENGTH, `Textul este prea lung (max ${MAX_TEXT_LENGTH} caractere)`)
  .transform((val) => {
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/[<>]/g, '')
      .trim();
  })
  .refine((val) => val.length > 0, 'Textul nu poate fi gol după sanitizare');

const textToSpeechRequestSchema = z.object({
  text: sanitizedTextSchema,
  voice: z.enum(ALLOWED_VOICES).default('alloy'),
  format: z.enum(['mp3', 'opus', 'aac', 'flac']).default('mp3'),
});

function validateMedicalEducationContent(text: string): boolean {
  // Ensure content is appropriate for high school medical education
  const prohibitedPatterns = [
    /diagnostic\s+medical/i,
    /tratament\s+pentru/i,
    /medicament\s+pentru/i,
    /prescriu/i,
    /recomand\s+să\s+luați/i
  ];

  return !prohibitedPatterns.some(pattern => pattern.test(text));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      console.error('Missing OPENAI_API_KEY');
      return new Response(JSON.stringify({
        error: 'OpenAI API key not configured. Please check your environment variables.',
        success: false,
        code: 'MISSING_API_KEY'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate request body with Zod
    const rawBody = await req.text();
    if (rawBody.length > MAX_REQUEST_SIZE) {
      throw new Error('Cererea este prea mare');
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (error) {
      throw new Error('JSON invalid în corpul cererii');
    }

    // Validate with Zod schema
    const validationResult = textToSpeechRequestSchema.safeParse(parsedBody);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      throw new Error(firstError?.message || 'Validation error');
    }

    const { 
      text: sanitizedText, 
      voice: selectedVoice,
      format
    } = validationResult.data;

    // Validate educational content appropriateness
    if (!validateMedicalEducationContent(sanitizedText)) {
      throw new Error('Conținutul nu este potrivit pentru educația medicală');
    }

    console.log(`Processing secure TTS: ${sanitizedText.length} characters, voice: ${selectedVoice}`);

    // Generate speech with security controls
    const audioContent = await generateSpeech(openaiApiKey, sanitizedText, selectedVoice);

    console.log(`Successfully generated speech: ${audioContent.length} characters (base64)`);

    return new Response(JSON.stringify({
      success: true,
      audioContent,
      metadata: {
        voice: selectedVoice,
        format: 'mp3',
        textLength: sanitizedText.length,
        originalLength: parsedBody.text?.length || 0,
        sanitized: parsedBody.text !== sanitizedText
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in text-to-speech function:', error);
    
    // Return structured error response
    const errorResponse = {
      error: error.message || 'Unknown error occurred',
      success: false,
      timestamp: new Date().toISOString(),
      code: error.code || 'UNKNOWN_ERROR'
    };

    // Determine appropriate status code
    let statusCode = 500;
    if (error.message.includes('required') || error.message.includes('Invalid') || error.message.includes('gol')) {
      statusCode = 400;
    } else if (error.message.includes('API key')) {
      statusCode = 500;
    }

    return new Response(JSON.stringify(errorResponse), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function generateSpeech(
  apiKey: string,
  text: string,
  voice: string = 'alloy'
): Promise<string> {
  // Validate inputs
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text is required for speech generation');
  }

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
          input: text,
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