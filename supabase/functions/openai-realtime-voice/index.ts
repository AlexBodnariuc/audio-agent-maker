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

// Rate limiting for security - temporarily relaxed for debugging
const RATE_LIMIT_MAX_SESSIONS = 15; // Increased to 15 sessions per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds
const SESSION_TIMEOUT = 60000; // 60 seconds before considering session stale
const HEARTBEAT_INTERVAL = 20000; // 20 seconds between heartbeats
const MAX_RECONNECT_ATTEMPTS = 5;

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
    
    // Session state management
    let openAISocket: WebSocket | null = null;
    let sessionState = 'disconnected'; // disconnected, connecting, configuring, ready, error
    let messageQueue: string[] = []; // Queue messages until session is ready
    let lastHeartbeat = Date.now();
    
    // Enhanced heartbeat monitoring with graceful recovery
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastHeartbeat > 60000) { // 60 seconds timeout
        console.warn(`Heartbeat timeout detected: ${now - lastHeartbeat}ms since last heartbeat`);
        
        // Send heartbeat before declaring session dead
        if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
          try {
            openAISocket.send(JSON.stringify({ type: 'ping' }));
            console.log('Sent heartbeat ping to OpenAI');
          } catch (error) {
            console.error('Failed to send heartbeat:', error);
            sessionState = 'error';
            socket.send(JSON.stringify({
              type: 'session_error',
              message: 'Conexiunea s-a întrerupt. Se reîncearcă...',
              canRetry: true,
              reconnectSuggested: true
            }));
          }
        } else {
          console.warn('OpenAI WebSocket not available for heartbeat');
          sessionState = 'error';
          socket.send(JSON.stringify({
            type: 'session_error',
            message: 'Conexiunea OpenAI s-a întrerupt. Se reîncearcă...',
            canRetry: true,
            reconnectSuggested: true
          }));
        }
      }
    }, 20000); // Check every 20 seconds

    const processMessageQueue = () => {
      if (sessionState === 'ready' && openAISocket && openAISocket.readyState === WebSocket.OPEN) {
        while (messageQueue.length > 0) {
          const queuedMessage = messageQueue.shift();
          if (queuedMessage) {
            openAISocket.send(queuedMessage);
            console.log('Processed queued message');
          }
        }
      }
    };

    socket.onopen = async () => {
      try {
        console.log(`Client WebSocket connected for conversation ${validConversationId}`);
        sessionState = 'connecting';
        lastHeartbeat = Date.now();
        
        // Enhanced connection to OpenAI with retry logic
        const openAIUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        console.log(`Connecting to OpenAI Realtime API: ${openAIUrl}`);
        
        openAISocket = new WebSocket(openAIUrl, [], {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });
        
        // Add connection timeout
        const connectionTimeout = setTimeout(() => {
          if (sessionState === 'connecting') {
            console.error('OpenAI connection timeout');
            sessionState = 'error';
            socket.send(JSON.stringify({
              type: 'connection_timeout',
              message: 'Timeout la conectarea cu OpenAI',
              canRetry: true
            }));
            if (openAISocket) {
              openAISocket.close();
            }
          }
        }, 15000); // 15 second timeout

        openAISocket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('Successfully connected to OpenAI Realtime API');
          sessionState = 'configuring';
          lastHeartbeat = Date.now();
          
          socket.send(JSON.stringify({
            type: 'connection_established',
            message: 'Conectat la OpenAI Realtime API',
            timestamp: Date.now(),
            sessionState: 'configuring'
          }));
        };

        openAISocket.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            lastHeartbeat = Date.now();
            console.log('OpenAI message type:', data.type, 'Session state:', sessionState);

            // Handle session initialization sequence
            if (data.type === 'session.created') {
              console.log('Session created, sending configuration...');
              
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

            // Handle session.updated - session is now ready
            if (data.type === 'session.updated') {
              console.log('Session configured successfully, now ready for audio');
              sessionState = 'ready';
              
              socket.send(JSON.stringify({
                type: 'session_ready',
                message: 'Sesiunea este gata - poți începe să vorbești!'
              }));
              
              // Process any queued messages
              processMessageQueue();
            }

            // Enhanced error recovery with detailed logging
            if (data.type === 'error') {
              console.error('OpenAI error received:', {
                error: data.error,
                message: data.message,
                sessionState: sessionState,
                timestamp: new Date().toISOString()
              });
              
              const errorMessage = data.error?.message || data.message || 'Eroare necunoscută de la OpenAI';
              sessionState = 'error';
              
              socket.send(JSON.stringify({
                type: 'openai_error',
                message: errorMessage,
                canRetry: true,
                errorDetails: data.error,
                timestamp: Date.now()
              }));
              
              // Intelligent recovery based on error type
              const shouldRecover = !errorMessage.includes('rate_limit') && 
                                   !errorMessage.includes('quota') &&
                                   !errorMessage.includes('authentication');
              
              if (shouldRecover) {
                console.log('Attempting intelligent recovery from error...');
                setTimeout(() => {
                  if (sessionState === 'error' && openAISocket && openAISocket.readyState !== WebSocket.CLOSED) {
                    console.log('Trying session recovery...');
                    sessionState = 'configuring';
                    socket.send(JSON.stringify({
                      type: 'session_recovery',
                      message: 'Se reîncearcă conectarea...',
                      attempt: 1
                    }));
                  }
                }, 3000);
              } else {
                console.log('Error not recoverable, manual intervention required');
                socket.send(JSON.stringify({
                  type: 'manual_intervention_required',
                  message: 'Eroare care necesită intervenție manuală',
                  errorType: 'non_recoverable'
                }));
              }
            }

            // Handle function calls or tool usage if needed
            if (data.type === 'response.function_call_arguments.done') {
              console.log('Function call completed:', data.arguments);
            }

            // Store conversation messages for key interactions
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
                    specialty_focus: validSpecialty,
                    session_state: sessionState
                  }
                }
              );
            }

            // Forward all messages to client
            socket.send(JSON.stringify(data));

          } catch (error) {
            console.error('Error processing OpenAI message:', error);
            sessionState = 'error';
            socket.send(JSON.stringify({
              type: 'processing_error',
              message: 'Eroare în procesarea mesajului',
              canRetry: true
            }));
          }
        };

        openAISocket.onerror = (error) => {
          clearTimeout(connectionTimeout);
          console.error('OpenAI WebSocket error:', {
            error: error,
            readyState: openAISocket?.readyState,
            sessionState: sessionState,
            timestamp: new Date().toISOString()
          });
          
          sessionState = 'error';
          socket.send(JSON.stringify({
            type: 'connection_error',
            message: 'Eroare de conexiune cu OpenAI',
            canRetry: true,
            errorDetails: {
              readyState: openAISocket?.readyState,
              sessionState: sessionState
            },
            timestamp: Date.now()
          }));
        };

        openAISocket.onclose = (event) => {
          clearTimeout(connectionTimeout);
          console.log('OpenAI WebSocket closed:', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
            sessionState: sessionState,
            timestamp: new Date().toISOString()
          });
          
          const wasReady = sessionState === 'ready';
          const wasConnecting = sessionState === 'connecting' || sessionState === 'configuring';
          sessionState = 'disconnected';
          
          // Determine if this was an unexpected closure
          const isUnexpectedClosure = !event.wasClean && (wasReady || wasConnecting);
          
          socket.send(JSON.stringify({
            type: 'session_ended',
            message: wasReady ? 'Sesiunea s-a închis' : 'Conexiunea s-a întrerupt',
            wasEstablished: wasReady,
            wasUnexpected: isUnexpectedClosure,
            closeCode: event.code,
            closeReason: event.reason,
            canRetry: isUnexpectedClosure,
            timestamp: Date.now()
          }));
        };

      } catch (error) {
        console.error('Error establishing OpenAI connection:', error);
        sessionState = 'error';
        socket.send(JSON.stringify({
          type: 'initialization_error',
          message: 'Nu s-a putut inițializa conexiunea cu OpenAI',
          canRetry: true
        }));
      }
    };

    // Handle messages from client with proper queuing
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const messageStr = JSON.stringify(data);
        
        // Handle client control messages
        if (data.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }
        
        if (data.type === 'session_status_request') {
          socket.send(JSON.stringify({ 
            type: 'session_status', 
            state: sessionState,
            queueLength: messageQueue.length,
            timestamp: Date.now()
          }));
          return;
        }
        
        // Queue or forward audio messages based on session state
        if (sessionState === 'ready' && openAISocket && openAISocket.readyState === WebSocket.OPEN) {
          openAISocket.send(messageStr);
          console.log('Forwarded message to OpenAI:', data.type);
        } else if (sessionState === 'configuring' || sessionState === 'connecting') {
          // Queue non-critical messages
          if (data.type === 'input_audio_buffer.append' && messageQueue.length < 100) {
            messageQueue.push(messageStr);
            console.log('Queued audio message, queue length:', messageQueue.length);
          } else {
            console.log('Session not ready, message dropped:', data.type);
            socket.send(JSON.stringify({
              type: 'session_not_ready',
              message: 'Sesiunea se încă configurează...',
              sessionState: sessionState
            }));
          }
        } else {
          console.warn('Session not available, current state:', sessionState);
          socket.send(JSON.stringify({
            type: 'session_unavailable',
            message: 'Sesiunea nu este disponibilă. Încearcă să reîncepi.',
            sessionState: sessionState,
            canRetry: true
          }));
        }
      } catch (error) {
        console.error('Error processing client message:', error);
        socket.send(JSON.stringify({
          type: 'message_error',
          message: 'Eroare în procesarea mesajului',
          canRetry: true
        }));
      }
    };

    socket.onclose = () => {
      console.log('Client WebSocket closed');
      clearInterval(heartbeatInterval);
      sessionState = 'disconnected';
      messageQueue = [];
      
      if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
        openAISocket.close();
      }
    };

    socket.onerror = (error) => {
      console.error('Client WebSocket error:', error);
      clearInterval(heartbeatInterval);
      sessionState = 'error';
      messageQueue = [];
      
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
    
    console.log(`Checking rate limit for conversation ${conversationId}, window: ${windowStart.toISOString()}`);
    
    const { data: rateLimits, error } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', conversationId)
      .eq('action', 'realtime_voice')
      .gte('window_start', windowStart.toISOString());

    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true }; // Allow on error for better user experience
    }

    const currentCount = rateLimits?.length || 0;
    console.log(`Current rate limit count: ${currentCount}/${RATE_LIMIT_MAX_SESSIONS}`);
    
    if (currentCount >= RATE_LIMIT_MAX_SESSIONS) {
      console.warn(`Rate limit exceeded for conversation ${conversationId}: ${currentCount}/${RATE_LIMIT_MAX_SESSIONS}`);
      return { allowed: false };
    }

    // Clean up old rate limit entries to prevent table bloat
    try {
      await supabase
        .from('rate_limits')
        .delete()
        .eq('identifier', conversationId)
        .eq('action', 'realtime_voice')
        .lt('window_start', new Date(now.getTime() - (RATE_LIMIT_WINDOW * 2)).toISOString());
    } catch (cleanupError) {
      console.warn('Rate limit cleanup failed:', cleanupError);
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

    console.log(`Rate limit check passed for conversation ${conversationId}`);
    return { allowed: true };
  } catch (error) {
    console.error('Rate limiting error:', error);
    return { allowed: true }; // Allow on error for better user experience
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