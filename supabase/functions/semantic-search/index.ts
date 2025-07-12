import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  query: string;
  specialtyFilter?: string;
  matchThreshold?: number;
  matchCount?: number;
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

    // Get user context from request headers
    const authHeader = req.headers.get('authorization');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
      global: {
        headers: authHeader ? { authorization: authHeader } : {}
      }
    });

    const { 
      query, 
      specialtyFilter, 
      matchThreshold = 0.8, 
      matchCount = 10 
    }: SearchRequest = await req.json();

    if (!query) {
      throw new Error('Query is required');
    }

    console.log(`Performing semantic search for: "${query}"`);

    // Generate embedding for the search query
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
        dimensions: 1536
      }),
    });

    if (!embeddingResponse.ok) {
      const error = await embeddingResponse.json();
      throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Perform semantic search using the database function
    const { data: searchResults, error } = await supabase
      .rpc('semantic_search_conversations', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount
      });

    if (error) {
      console.error('Search error:', error);
      throw new Error(`Search error: ${error.message}`);
    }

    // Filter by specialty if specified
    let filteredResults = searchResults || [];
    if (specialtyFilter) {
      filteredResults = filteredResults.filter((result: any) => 
        result.specialty_context === specialtyFilter
      );
    }

    // Enhance results with conversation context
    const enhancedResults = await enhanceSearchResults(supabase, filteredResults);

    console.log(`Found ${enhancedResults.length} relevant conversations`);

    return new Response(JSON.stringify({ 
      results: enhancedResults,
      query,
      totalResults: enhancedResults.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in semantic-search function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      results: []
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function enhanceSearchResults(supabase: any, results: any[]) {
  const enhancedResults = [];

  for (const result of results) {
    try {
      // Get conversation details
      const { data: conversation } = await supabase
        .from('conversations')
        .select('title, voice_personality_id, created_at, voice_session_type')
        .eq('id', result.conversation_id)
        .single();

      // Get voice personality info
      const { data: personality } = await supabase
        .from('voice_personalities')
        .select('name, medical_specialty')
        .eq('id', conversation?.voice_personality_id)
        .single();

      enhancedResults.push({
        ...result,
        conversation_title: conversation?.title,
        session_type: conversation?.voice_session_type,
        personality_name: personality?.name,
        personality_specialty: personality?.medical_specialty,
        created_at: conversation?.created_at
      });
    } catch (error) {
      console.error('Error enhancing result:', error);
      enhancedResults.push(result);
    }
  }

  return enhancedResults;
}