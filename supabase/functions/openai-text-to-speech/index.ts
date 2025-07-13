import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TTSRequest {
  text: string;
  voice?: string;
  format?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

    if (!openaiApiKey) {
      throw new Error('Missing OPENAI_API_KEY environment variable');
    }

    // Parse and validate request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      throw new Error('Invalid JSON in request body');
    }

    const { 
      text, 
      voice = 'alloy',
      format = 'mp3'
    }: TTSRequest = requestBody;

    // Validate required parameters
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('text is required and must be a non-empty string');
    }

    // Validate voice parameter
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    const selectedVoice = validVoices.includes(voice) ? voice : 'alloy';

    console.log(`Processing text-to-speech: ${text.length} characters, voice: ${selectedVoice}`);

    // Truncate text if too long (OpenAI TTS has limits)
    const maxLength = 4000;
    const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

    // Generate speech with retry logic
    const audioContent = await generateSpeech(openaiApiKey, truncatedText, selectedVoice);

    console.log(`Successfully generated speech: ${audioContent.length} characters (base64)`);

    return new Response(JSON.stringify({
      success: true,
      audioContent,
      metadata: {
        voice: selectedVoice,
        format: 'mp3',
        textLength: text.length,
        truncated: text.length > maxLength
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in text-to-speech function:', error);
    
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