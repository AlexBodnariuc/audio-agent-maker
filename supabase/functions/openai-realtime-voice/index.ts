import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schemas with Zod
const realtimeSessionRequestSchema = z.object({
  conversationId: z.string().uuid('ID-ul conversației este invalid'),
  specialtyFocus: z.string().default('biologie'),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('alloy'),
  instructions: z.string().optional(),
});

const ROMANIAN_MEDICAL_EDUCATION_PROMPT = `Ești MedMentor, asistentul AI specializat în pregătirea pentru admiterea la medicina în România.

🎯 MISIUNEA TA:
Să ajuți elevii români de liceu să se pregătească pentru examenele de admitere la UMF, focalizându-te pe biologia și chimia de bază.

📚 CONTEXTUL EDUCAȚIONAL:
- Curriculum românesc: manualele Corint Bio XI-XII, chimie organică/anorganică
- Nivel țintă: elevi clasele XI-XII care vor la medicină
- Focus: concepte fundamentale pentru admiterea la UMF
- Terminologie: medicală românească corectă cu explicații simple

✨ STILUL TĂU:
- Conversațional și prietenos în română
- Explicații pas cu pas, exemple concrete
- Întrebări care stimulează gândirea
- Conexiuni între concepte pentru înțelegere profundă

IMPORTANTE:
- Răspunde DOAR în română
- Maxim 150 cuvinte pentru claritate vocală
- Termeni medicali explicați simplu
- Focus pe biologie/chimie de liceu, NU specialități avansate
- NU oferi consiliere medicală - doar educație pentru examene

Începe fiecare răspuns cu un salut prietenos și încurajează întrebări!`;

// Rate limiting for security
const RATE_LIMIT_MAX_SESSIONS = 5; // Max 5 realtime sessions per minute per user
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket connection", { 
      status: 400,
      headers: corsHeaders 
    });
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

    // Parse query parameters for session config
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversationId');
    const specialtyFocus = url.searchParams.get('specialtyFocus') || 'biologie';
    const voice = url.searchParams.get('voice') || 'alloy';

    // Validate parameters
    const validationResult = realtimeSessionRequestSchema.safeParse({
      conversationId,
      specialtyFocus,
      voice
    });

    if (!validationResult.success) {
      throw new Error(`Parametri invalizi: ${validationResult.error.errors[0]?.message}`);
    }

    const { conversationId: validConversationId, specialtyFocus: validSpecialty, voice: validVoice } = validationResult.data;

    // Check rate limiting
    const rateLimitCheck = await checkRateLimit(supabase, validConversationId);
    if (!rateLimitCheck.allowed) {
      throw new Error('Prea multe sesiuni. Vă rugăm să așteptați.');
    }

    // Get conversation context
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        voice_personalities (
          name,
          medical_specialty,
          description
        )
      `)
      .eq('id', validConversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversația nu a fost găsită');
    }

    console.log(`Starting realtime session for conversation ${validConversationId}`);

    // Upgrade to WebSocket
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    // Connect to OpenAI Realtime API
    let openAISocket: WebSocket | null = null;
    let sessionActive = false;

    socket.onopen = async () => {
      try {
        console.log('Client WebSocket connected');
        
        // Connect to OpenAI Realtime API
        const openAIUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        openAISocket = new WebSocket(openAIUrl, [], {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });

        openAISocket.onopen = () => {
          console.log('Connected to OpenAI Realtime API');
          socket.send(JSON.stringify({
            type: 'connection_established',
            message: 'Conectat la OpenAI Realtime API'
          }));
        };

        openAISocket.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('OpenAI message type:', data.type);

            // Handle session.created event
            if (data.type === 'session.created') {
              sessionActive = true;
              
              // Send session configuration
              const sessionConfig = {
                type: 'session.update',
                session: {
                  modalities: ['text', 'audio'],
                  instructions: ROMANIAN_MEDICAL_EDUCATION_PROMPT,
                  voice: validVoice,
                  input_audio_format: 'pcm16',
                  output_audio_format: 'pcm16',
                  input_audio_transcription: {
                    model: 'whisper-1'
                  },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 1000
                  },
                  temperature: 0.8,
                  max_response_output_tokens: 300
                }
              };

              openAISocket!.send(JSON.stringify(sessionConfig));
              console.log('Session configuration sent');
            }

            // Handle function calls or tool usage if needed
            if (data.type === 'response.function_call_arguments.done') {
              console.log('Function call completed:', data.arguments);
            }

            // Store conversation messages
            if (data.type === 'conversation.item.created' && data.item?.content) {
              await storeConversationMessage(
                supabase, 
                validConversationId, 
                data.item.content, 
                data.item.role === 'user' ? 'user' : 'assistant',
                { 
                  openai_item_id: data.item.id,
                  realtime_session: true,
                  confidence_score: data.item.confidence_score,
                  voice_metadata: {
                    voice: validVoice,
                    specialty_focus: validSpecialty
                  }
                }
              );
            }

            // Forward all messages to client
            socket.send(JSON.stringify(data));

          } catch (error) {
            console.error('Error processing OpenAI message:', error);
            socket.send(JSON.stringify({
              type: 'error',
              message: 'Eroare în procesarea mesajului'
            }));
          }
        };

        openAISocket.onerror = (error) => {
          console.error('OpenAI WebSocket error:', error);
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Eroare de conexiune cu OpenAI'
          }));
        };

        openAISocket.onclose = () => {
          console.log('OpenAI WebSocket closed');
          sessionActive = false;
          socket.send(JSON.stringify({
            type: 'session_ended',
            message: 'Sesiunea s-a închis'
          }));
        };

      } catch (error) {
        console.error('Error establishing OpenAI connection:', error);
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Nu s-a putut conecta la OpenAI'
        }));
      }
    };

    // Handle messages from client
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Forward client messages to OpenAI if session is active
        if (sessionActive && openAISocket && openAISocket.readyState === WebSocket.OPEN) {
          openAISocket.send(JSON.stringify(data));
          console.log('Forwarded message to OpenAI:', data.type);
        } else {
          console.warn('Session not active or OpenAI socket not ready');
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Sesiunea nu este activă'
          }));
        }
      } catch (error) {
        console.error('Error processing client message:', error);
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Eroare în procesarea mesajului'
        }));
      }
    };

    socket.onclose = () => {
      console.log('Client WebSocket closed');
      sessionActive = false;
      if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
        openAISocket.close();
      }
    };

    socket.onerror = (error) => {
      console.error('Client WebSocket error:', error);
      sessionActive = false;
      if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
        openAISocket.close();
      }
    };

    return response;

  } catch (error) {
    console.error('Error in openai-realtime-voice function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Rate limiting function
async function checkRateLimit(supabase: any, conversationId: string): Promise<{ allowed: boolean }> {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW);
    
    const { data: rateLimits, error } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', conversationId)
      .eq('action', 'realtime_voice')
      .gte('window_start', windowStart.toISOString());

    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true }; // Allow on error
    }

    const currentCount = rateLimits?.length || 0;
    if (currentCount >= RATE_LIMIT_MAX_SESSIONS) {
      return { allowed: false };
    }

    // Insert new rate limit entry
    await supabase
      .from('rate_limits')
      .insert({
        identifier: conversationId,
        identifier_type: 'conversation',
        action: 'realtime_voice',
        count: 1,
        max_attempts: RATE_LIMIT_MAX_SESSIONS,
        window_start: windowStart.toISOString(),
        window_duration: '00:01:00'
      });

    return { allowed: true };
  } catch (error) {
    console.error('Rate limiting error:', error);
    return { allowed: true }; // Allow on error
  }
}

// Store conversation messages
async function storeConversationMessage(
  supabase: any,
  conversationId: string,
  content: any,
  messageType: string,
  metadata: any = {}
): Promise<void> {
  try {
    const contentText = Array.isArray(content) 
      ? content.map(c => c.text || c.transcript || '').join(' ')
      : typeof content === 'string' 
        ? content 
        : JSON.stringify(content);

    if (!contentText.trim()) return;

    await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        content: contentText.substring(0, 2000), // Limit content length
        message_type: messageType,
        timestamp: new Date().toISOString(),
        metadata: metadata,
        voice_metadata: metadata.voice_metadata || null,
        confidence_score: metadata.confidence_score || null
      });

    console.log(`Stored ${messageType} message for conversation ${conversationId}`);
  } catch (error) {
    console.error('Error storing conversation message:', error);
  }
}