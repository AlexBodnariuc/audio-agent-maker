import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingRequest {
  text: string;
  conversationId: string;
  specialtyContext?: string;
}

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

    const { text, conversationId, specialtyContext }: EmbeddingRequest = await req.json();

    if (!text || !conversationId) {
      throw new Error('Text and conversationId are required');
    }

    console.log(`Generating embedding for conversation ${conversationId}`);

    // Extract medical keywords using simple pattern matching
    const medicalKeywords = extractMedicalKeywords(text);

    // Generate embedding using OpenAI
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text,
        dimensions: 1536
      }),
    });

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;

    // Update the conversation_embeddings table
    const { data, error } = await supabase
      .from('conversation_embeddings')
      .update({
        embedding,
        medical_keywords: medicalKeywords,
        specialty_context: specialtyContext || 'general',
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId)
      .eq('message_content', text);

    if (error) {
      console.error('Supabase error:', error);
      throw new Error(`Database error: ${error.message}`);
    }

    console.log(`Successfully generated embedding for conversation ${conversationId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      medicalKeywords,
      embeddingGenerated: true 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-embeddings function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractMedicalKeywords(text: string): string[] {
  const medicalTerms = [
    'anatomy', 'physiology', 'pathology', 'diagnosis', 'treatment', 'symptom',
    'patient', 'clinical', 'medical', 'therapy', 'medication', 'surgery',
    'examination', 'disease', 'condition', 'syndrome', 'disorder', 'infection',
    'inflammation', 'cardiovascular', 'respiratory', 'neurological', 'endocrine',
    'gastrointestinal', 'musculoskeletal', 'dermatological', 'psychiatric',
    'oncology', 'pediatric', 'geriatric', 'radiology', 'laboratory', 'biopsy',
    'anesthesia', 'emergency', 'intensive', 'rehabilitation', 'prevention'
  ];

  const lowerText = text.toLowerCase();
  const foundTerms: string[] = [];

  medicalTerms.forEach(term => {
    if (lowerText.includes(term) && !foundTerms.includes(term)) {
      foundTerms.push(term);
    }
  });

  return foundTerms;
}