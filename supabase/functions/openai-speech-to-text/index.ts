import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TranscriptionRequest {
  audio: string; // base64 encoded audio
  conversationId: string;
  language?: string;
  prompt?: string;
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
      audio, 
      conversationId, 
      language = 'en',
      prompt
    }: TranscriptionRequest = await req.json();

    if (!audio || !conversationId) {
      throw new Error('audio and conversationId are required');
    }

    console.log(`Processing speech-to-text for conversation: ${conversationId}`);

    // Process audio in chunks to prevent memory issues
    const binaryAudio = processBase64Chunks(audio);
    
    // Prepare form data for OpenAI Whisper API
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { type: 'audio/webm' });
    formData.append('file', blob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    
    if (prompt) {
      formData.append('prompt', prompt);
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
        message_type: 'user_voice',
        timestamp: new Date().toISOString(),
        confidence_score: analysis.confidence,
        language_detected: language,
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
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
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

function extractMedicalKeywords(text: string): string[] {
  const medicalTerms = [
    'heart', 'cardiac', 'cardiology', 'myocardial', 'ventricle', 'atrium',
    'lung', 'pulmonary', 'respiratory', 'bronchi', 'alveoli',
    'brain', 'neural', 'neurology', 'cerebral', 'cortex',
    'kidney', 'renal', 'nephrology', 'glomerular',
    'liver', 'hepatic', 'hepatology',
    'blood', 'hematology', 'hemoglobin', 'platelet',
    'bone', 'skeletal', 'orthopedic', 'fracture',
    'muscle', 'muscular', 'myalgia',
    'diabetes', 'hypertension', 'infection', 'inflammation',
    'surgery', 'procedure', 'diagnosis', 'treatment',
    'medication', 'prescription', 'dosage', 'therapy'
  ];

  const lowerText = text.toLowerCase();
  return medicalTerms.filter(term => lowerText.includes(term));
}