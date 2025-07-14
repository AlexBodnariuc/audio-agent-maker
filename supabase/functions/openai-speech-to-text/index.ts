import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schemas with Zod
const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB max audio size
const MAX_REQUEST_SIZE = 50000; // 50KB max request
const ALLOWED_LANGUAGES = ['ro', 'en', 'fr', 'de', 'es', 'it'] as const;

const sanitizedTextSchema = z
  .string()
  .min(1, 'Textul nu poate fi gol')
  .max(2000, 'Textul este prea lung')
  .transform((val) => {
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/[<>]/g, '')
      .trim();
  })
  .refine((val) => val.length > 0, 'Textul nu poate fi gol după sanitizare');

const speechToTextRequestSchema = z.object({
  audio: z
    .string()
    .min(1, 'Audio este obligatoriu')
    .refine((val) => {
      // Validate base64 size (base64 size ~= actual size * 1.37)
      return val.length <= MAX_AUDIO_SIZE * 1.37;
    }, 'Fișierul audio este prea mare (max 25MB)'),
  conversationId: z.string().uuid('ID-ul conversației este invalid'),
  language: z.enum(ALLOWED_LANGUAGES).default('ro'),
  prompt: sanitizedTextSchema.optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!openaiApiKey) {
      console.error('Missing OPENAI_API_KEY');
      return new Response(JSON.stringify({
        error: 'OpenAI API key not configured',
        success: false
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase configuration');
      return new Response(JSON.stringify({
        error: 'Supabase configuration missing',
        success: false
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get authorization header and validate JWT
    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    // Parse and validate request with Zod
    const rawBody = await req.json();
    
    // Validate with Zod schema
    const validationResult = speechToTextRequestSchema.safeParse(rawBody);
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0];
      throw new Error(firstError?.message || 'Validation error');
    }

    const { 
      audio, 
      conversationId, 
      language: validatedLanguage,
      prompt: sanitizedPrompt
    } = validationResult.data;

    console.log(`Processing speech-to-text for conversation: ${conversationId}, language: ${validatedLanguage}`);

    // Process audio in chunks to prevent memory issues
    const binaryAudio = processBase64Chunks(audio);
    
    // Prepare form data for OpenAI Whisper API
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', validatedLanguage);
    
    if (sanitizedPrompt) {
      formData.append('prompt', sanitizedPrompt);
    }

    // Send to OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI Whisper API error: ${errorText}`);
    }

    const result = await response.json();
    const transcriptionText = result.text;

    // Extract medical entities and analyze confidence
    const analysis = await analyzeTranscription(transcriptionText, openaiApiKey);

    // Store the transcription and analysis
    await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        content: transcriptionText,
        message_type: 'user',
        timestamp: new Date().toISOString(),
        confidence_score: analysis.confidence,
        language_detected: validatedLanguage,
        medical_entities: analysis.medicalEntities,
        voice_metadata: {
          transcription_source: 'whisper-1',
          processing_time: Date.now(),
          analysis: analysis
        }
      });

    console.log(`Successfully transcribed audio for conversation ${conversationId}`);

    return new Response(JSON.stringify({
      success: true,
      text: transcriptionText,
      confidence: analysis.confidence,
      medicalEntities: analysis.medicalEntities,
      conversationId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in speech-to-text function:', error);
    
    // Determine appropriate status code and error message
    let statusCode = 500;
    let errorMessage = error.message || 'Unknown error occurred';
    
    if (errorMessage.includes('Validation error') || errorMessage.includes('invalid')) {
      statusCode = 400;
    } else if (errorMessage.includes('OpenAI')) {
      statusCode = 502;
    }
    
    return new Response(JSON.stringify({
      error: errorMessage,
      success: false,
      timestamp: new Date().toISOString()
    }), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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

async function analyzeTranscription(text: string, apiKey: string): Promise<{
  confidence: number;
  medicalEntities: any[];
  medicalTermsUsed: string[];
}> {
  try {
    // Use OpenAI to analyze the transcription for medical content
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a medical NLP expert. Analyze the following transcribed text and return a JSON object with:
            1. confidence: estimated transcription confidence (0-1)
            2. medicalEntities: array of medical entities found (diseases, procedures, medications, anatomy)
            3. medicalTermsUsed: array of medical terms identified
            
            Format: {"confidence": 0.95, "medicalEntities": [...], "medicalTermsUsed": [...]}`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.1,
        max_tokens: 300
      }),
    });

    if (!response.ok) {
      console.error('Failed to analyze transcription');
      return {
        confidence: 0.8,
        medicalEntities: [],
        medicalTermsUsed: extractMedicalKeywords(text)
      };
    }

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);
    
    return {
      confidence: analysis.confidence || 0.8,
      medicalEntities: analysis.medicalEntities || [],
      medicalTermsUsed: analysis.medicalTermsUsed || extractMedicalKeywords(text)
    };

  } catch (error) {
    console.error('Error analyzing transcription:', error);
    return {
      confidence: 0.8,
      medicalEntities: [],
      medicalTermsUsed: extractMedicalKeywords(text)
    };
  }
}

// Romanian medical keywords for MedMentor alignment
function extractMedicalKeywords(text: string): string[] {
  const romanianMedicalTerms = [
    // Biology terms (Romanian high school curriculum)
    'celulă', 'celule', 'mitocondrie', 'ADN', 'ARN', 'proteină', 'enzimă',
    'fotosinteza', 'respirație', 'metabolism', 'hormon', 'reflex',
    'sistem nervos', 'sistem circulator', 'sistem digestiv', 'sistem respirator',
    'inimă', 'cardiac', 'plămân', 'pulmonar', 'creier', 'neural',
    'rinichi', 'renal', 'ficat', 'hepatic', 'sânge', 'hematologie',
    'os', 'oase', 'mușchi', 'muschi', 'diabet', 'hipertensiune',
    
    // Chemistry terms (Romanian high school curriculum)
    'atom', 'moleculă', 'element', 'compus', 'ionul', 'cation', 'anion',
    'acid', 'bază', 'sare', 'oxidare', 'reducere', 'reacție', 'catalizator',
    'pH', 'soluție', 'concentrație', 'molaritate', 'electroliză',
    'chimie organică', 'hidrocarbon', 'alcool', 'acid', 'ester',
    'proteină', 'aminoacid', 'glucoză', 'lipide', 'vitamină',
    
    // Medical terms relevant for admission
    'anatomie', 'fiziologie', 'patologie', 'diagnostic', 'tratament',
    'medicament', 'terapie', 'chirurgie', 'procedură', 'infecție', 'inflamație'
  ];

  const lowerText = text.toLowerCase();
  return romanianMedicalTerms.filter(term => lowerText.includes(term));
}