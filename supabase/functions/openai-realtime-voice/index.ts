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

// Enhanced configuration constants - OPTIMIZED FOR 1006 ERROR FIX
const RATE_LIMIT_MAX_SESSIONS = 10;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const SESSION_TIMEOUT = 120000; // 2 minutes timeout (increased)
const HEARTBEAT_INTERVAL = 30000; // 30 seconds between heartbeats (increased)
const CONNECTION_TIMEOUT = 20000; // 20 seconds for initial connection (increased)
const MAX_RECONNECT_ATTEMPTS = 5; // Increased retry attempts
const MESSAGE_QUEUE_MAX_SIZE = 30; // Reduced queue size to prevent overflow
const HEARTBEAT_TIMEOUT = 45000; // 45 seconds heartbeat timeout
const GRACEFUL_CLOSE_TIMEOUT = 5000; // 5 seconds for graceful close

serve(async (req) => {
  console.log('=== REALTIME VOICE FUNCTION START ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request handled');
    return new Response(null, { headers: corsHeaders });
  }

  const { headers } = req;
  const upgradeHeader = headers.get("upgrade") || "";

  if (upgradeHeader.toLowerCase() !== "websocket") {
    console.error('Not a WebSocket request. Upgrade header:', upgradeHeader);
    return new Response(JSON.stringify({ 
      error: "Expected WebSocket connection",
      received: upgradeHeader 
    }), { 
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Enhanced environment variable validation with detailed logging
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    console.log('Environment variables check:');
    console.log('- OPENAI_API_KEY:', openaiApiKey ? 'Present' : 'MISSING');
    console.log('- SUPABASE_URL:', supabaseUrl ? 'Present' : 'MISSING');
    console.log('- SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? 'Present' : 'MISSING');

    const missingVars = [];
    if (!openaiApiKey) missingVars.push('OPENAI_API_KEY');
    if (!supabaseUrl) missingVars.push('SUPABASE_URL');
    if (!supabaseServiceRoleKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missingVars.length > 0) {
      const error = `Missing required environment variables: ${missingVars.join(', ')}`;
      console.error('Environment variable error:', error);
      throw new Error(error);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });

    // Parse query parameters for session config with proper validation
    const url = new URL(req.url);
    const conversationId = url.searchParams.get('conversationId');
    const specialtyFocus = url.searchParams.get('specialtyFocus') || 'biologie';
    const voice = url.searchParams.get('voice') || 'alloy';

    console.log('URL parameters received:', { conversationId, specialtyFocus, voice });

    // Enhanced validation with better error messages
    if (!conversationId) {
      console.error('Missing conversationId parameter');
      throw new Error('Parametrul conversationId este obligatoriu');
    }

    // UUID validation for conversationId
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(conversationId)) {
      console.error('Invalid UUID format for conversationId:', conversationId);
      throw new Error('ID-ul conversației este invalid (format UUID necesar)');
    }

    // Validate voice parameter against allowed values
    const allowedVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (!allowedVoices.includes(voice)) {
      console.error('Invalid voice parameter:', voice);
      throw new Error(`Vocea specificată nu este validă. Voci disponibile: ${allowedVoices.join(', ')}`);
    }

    const validationResult = realtimeSessionRequestSchema.safeParse({
      conversationId,
      specialtyFocus,
      voice
    });

    if (!validationResult.success) {
      console.error('Zod validation failed:', validationResult.error.errors);
      const errorMessage = validationResult.error.errors.map(e => e.message).join(', ');
      throw new Error(`Parametri invalizi: ${errorMessage}`);
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
    
    // Enhanced session state management with proper state machine
    let openAISocket: WebSocket | null = null;
    let sessionState: 'disconnected' | 'connecting' | 'configuring' | 'ready' | 'error' | 'reconnecting' = 'disconnected';
    let messageQueue: Array<{ message: string; timestamp: number; priority: number }> = [];
    let lastHeartbeat = Date.now();
    let connectionAttempts = 0;
    let lastSuccessfulConnection = 0;
    let sessionMetrics = {
      messagesProcessed: 0,
      errorsCount: 0,
      reconnectCount: 0,
      totalUptime: 0
    };

    // Advanced state machine with automatic recovery
    const attemptReconnection = async () => {
      if (connectionAttempts >= MAX_RECONNECT_ATTEMPTS) {
        sessionState = 'error';
        socket.send(JSON.stringify({
          type: 'max_retries_exceeded',
          message: 'Numărul maxim de reîncercări a fost atins',
          canRetry: false,
          metrics: sessionMetrics
        }));
        return;
      }

      connectionAttempts++;
      sessionState = 'reconnecting';
      sessionMetrics.reconnectCount++;
      
      console.log(`Attempting reconnection ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
      
      socket.send(JSON.stringify({
        type: 'reconnecting',
        message: `Reîncerc conectarea... (încercarea ${connectionAttempts}/${MAX_RECONNECT_ATTEMPTS})`,
        attempt: connectionAttempts,
        maxAttempts: MAX_RECONNECT_ATTEMPTS
      }));

      // Exponential backoff
      const delay = Math.min(1000 * Math.pow(2, connectionAttempts - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Close existing connection if any
      if (openAISocket) {
        openAISocket.close();
        openAISocket = null;
      }
      
      // Try to establish new connection
      await establishOpenAIConnection();
    };

    // Enhanced message queue with priority and expiration
    const processMessageQueue = () => {
      if (sessionState === 'ready' && openAISocket && openAISocket.readyState === WebSocket.OPEN) {
        // Sort by priority (higher first) and timestamp (older first)
        messageQueue.sort((a, b) => {
          if (a.priority !== b.priority) return b.priority - a.priority;
          return a.timestamp - b.timestamp;
        });
        
        let processedCount = 0;
        const now = Date.now();
        
        while (messageQueue.length > 0 && processedCount < 10) { // Batch processing limit
          const queuedItem = messageQueue.shift();
          if (queuedItem) {
            // Check if message is not too old (5 second expiry for audio)
            if (queuedItem.message.includes('input_audio_buffer') && (now - queuedItem.timestamp) > 5000) {
              console.log('Discarded expired audio message');
              continue;
            }
            
            try {
              openAISocket.send(queuedItem.message);
              sessionMetrics.messagesProcessed++;
              processedCount++;
              console.log(`Processed queued message (priority: ${queuedItem.priority})`);
            } catch (error) {
              console.error('Error sending queued message:', error);
              sessionMetrics.errorsCount++;
            }
          }
        }
        
        if (processedCount > 0) {
          console.log(`Processed ${processedCount} queued messages, ${messageQueue.length} remaining`);
        }
      }
    };

    // Add to queue with proper prioritization
    const addToQueue = (message: string, priority: number = 1) => {
      if (messageQueue.length >= MESSAGE_QUEUE_MAX_SIZE) { // Prevent memory issues
        // Remove oldest low-priority messages
        messageQueue = messageQueue.filter(item => item.priority >= 2).slice(-30);
      }
      
      messageQueue.push({
        message,
        timestamp: Date.now(),
        priority
      });
      
      console.log(`Added message to queue (priority: ${priority}), queue length: ${messageQueue.length}`);
    };

    const setupOpenAIEventHandlers = (connectionTimeout: NodeJS.Timeout) => {
      if (!openAISocket) return;

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
              message: 'Sesiunea este gata - poți începe să vorbești!',
              sessionState: 'ready',
              timestamp: Date.now()
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
            sessionMetrics.errorsCount++;
            
            socket.send(JSON.stringify({
              type: 'openai_error',
              message: errorMessage,
              canRetry: true,
              errorDetails: data.error,
              timestamp: Date.now(),
              sessionState: sessionState
            }));
            
            // Intelligent recovery based on error type
            const shouldRecover = !errorMessage.includes('rate_limit') && 
                                 !errorMessage.includes('quota') &&
                                 !errorMessage.includes('authentication');
            
            if (shouldRecover) {
              console.log('Attempting intelligent recovery from error...');
              await attemptReconnection();
            } else {
              console.log('Error not recoverable, manual intervention required');
              sessionState = 'error';
              socket.send(JSON.stringify({
                type: 'manual_intervention_required',
                message: 'Eroare care necesită intervenție manuală',
                errorType: 'non_recoverable'
              }));
            }
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

          // Forward all messages to client with enhanced metadata
          socket.send(JSON.stringify({
            ...data,
            timestamp: Date.now(),
            sessionState: sessionState,
            queueLength: messageQueue.length
          }));

        } catch (error) {
          console.error('Error processing OpenAI message:', error);
          sessionMetrics.errorsCount++;
          socket.send(JSON.stringify({
            type: 'processing_error',
            message: 'Eroare în procesarea mesajului',
            canRetry: true,
            error: error.message
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
        
        sessionMetrics.errorsCount++;
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

        attemptReconnection();
      };

      openAISocket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        console.log('OpenAI WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          sessionState: sessionState,
          connectionAttempts: connectionAttempts,
          timestamp: new Date().toISOString()
        });
        
        const wasReady = sessionState === 'ready';
        const wasConnecting = sessionState === 'connecting' || sessionState === 'configuring';
        const isUnexpectedClosure = !event.wasClean && (wasReady || wasConnecting);
        const is1006Error = event.code === 1006; // Abnormal closure
        
        // Enhanced 1006 error handling
        if (is1006Error) {
          console.warn('Detected 1006 abnormal closure from OpenAI - implementing recovery');
          sessionMetrics.errorsCount++;
          
          socket.send(JSON.stringify({
            type: 'openai_1006_error',
            message: 'Conexiune OpenAI întreruptă anormal (1006)',
            wasEstablished: wasReady,
            canRetry: connectionAttempts < MAX_RECONNECT_ATTEMPTS,
            closeCode: event.code,
            closeReason: event.reason || 'Abnormal closure',
            timestamp: Date.now(),
            sessionState: sessionState,
            reconnectSuggested: true
          }));
          
          if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(() => attemptReconnection(), 1000); // Quick retry for 1006
          } else {
            sessionState = 'error';
            socket.send(JSON.stringify({
              type: 'max_retries_exceeded',
              message: 'Numărul maxim de reîncercări pentru eroarea 1006 a fost atins',
              canRetry: false,
              metrics: sessionMetrics
            }));
          }
        } else {
          // Handle other closure types
          socket.send(JSON.stringify({
            type: 'session_ended',
            message: wasReady ? 'Sesiunea s-a închis' : 'Conexiunea s-a întrerupt',
            wasEstablished: wasReady,
            wasUnexpected: isUnexpectedClosure,
            closeCode: event.code,
            closeReason: event.reason,
            canRetry: isUnexpectedClosure && connectionAttempts < MAX_RECONNECT_ATTEMPTS,
            timestamp: Date.now(),
            sessionState: sessionState
          }));

          if (isUnexpectedClosure && sessionState !== 'error') {
            attemptReconnection();
          } else {
            sessionState = 'disconnected';
          }
        }
      };
    };

    const establishOpenAIConnection = async () => {
      try {
        const openAIUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        console.log(`Establishing OpenAI connection: ${openAIUrl}`);
        
        openAISocket = new WebSocket(openAIUrl, [], {
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        });
        
        // Connection timeout with cleanup - OPTIMIZED FOR 1006 ERROR FIX
        const connectionTimeout = setTimeout(() => {
          if (sessionState === 'connecting' || sessionState === 'reconnecting') {
            console.error(`OpenAI connection timeout after ${CONNECTION_TIMEOUT}ms`);
            if (openAISocket) {
              openAISocket.close(1000, 'Connection timeout'); // Graceful close
              openAISocket = null;
            }
            attemptReconnection();
          }
        }, CONNECTION_TIMEOUT);

        openAISocket.onopen = () => {
          clearTimeout(connectionTimeout);
          console.log('Successfully connected to OpenAI Realtime API');
          sessionState = 'configuring';
          lastHeartbeat = Date.now();
          lastSuccessfulConnection = Date.now();
          connectionAttempts = 0; // Reset on successful connection
          
          socket.send(JSON.stringify({
            type: 'connection_established',
            message: 'Conectat la OpenAI Realtime API',
            timestamp: Date.now(),
            sessionState: 'configuring',
            reconnectCount: sessionMetrics.reconnectCount
          }));
        };

        setupOpenAIEventHandlers(connectionTimeout);
        
      } catch (error) {
        console.error('Error establishing OpenAI connection:', error);
        sessionMetrics.errorsCount++;
        await attemptReconnection();
      }
    };

    // Enhanced heartbeat monitoring with intelligent recovery
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastHeartbeat = now - lastHeartbeat;
      
      if (timeSinceLastHeartbeat > SESSION_TIMEOUT) {
        console.warn(`Heartbeat timeout detected: ${timeSinceLastHeartbeat}ms since last heartbeat`);
        
        // Progressive recovery strategy
        if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
          if (timeSinceLastHeartbeat < SESSION_TIMEOUT * 1.5) {
            // First attempt: send ping
            try {
              openAISocket.send(JSON.stringify({ type: 'ping' }));
              console.log('Sent recovery ping to OpenAI');
            } catch (error) {
              console.error('Failed to send recovery ping:', error);
              attemptReconnection();
            }
          } else {
            // Connection seems dead, reconnect
            console.log('Connection appears dead, initiating reconnection');
            attemptReconnection();
          }
        } else {
          console.warn('OpenAI WebSocket not available, initiating reconnection');
          attemptReconnection();
        }
      }
      
      // Send regular status update to client
      if (sessionState === 'ready') {
        socket.send(JSON.stringify({
          type: 'session_heartbeat',
          timestamp: now,
          sessionState,
          queueLength: messageQueue.length,
          metrics: sessionMetrics,
          uptime: now - lastSuccessfulConnection
        }));
      }
    }, HEARTBEAT_INTERVAL);

    socket.onopen = async () => {
      try {
        console.log(`Client WebSocket connected for conversation ${validConversationId}`);
        sessionState = 'connecting';
        lastHeartbeat = Date.now();
        lastSuccessfulConnection = Date.now();
        sessionMetrics = { messagesProcessed: 0, errorsCount: 0, reconnectCount: 0, totalUptime: 0 };
        
        socket.send(JSON.stringify({
          type: 'client_connected',
          message: 'Client conectat, se inițializează sesiunea...',
          timestamp: Date.now()
        }));
        
        await establishOpenAIConnection();

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

    // Handle messages from client with intelligent queuing
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const messageStr = JSON.stringify(data);
        
        // Handle client control messages
        if (data.type === 'ping') {
          socket.send(JSON.stringify({ 
            type: 'pong', 
            timestamp: Date.now(),
            sessionState: sessionState,
            queueLength: messageQueue.length 
          }));
          return;
        }
        
        if (data.type === 'session_status_request') {
          socket.send(JSON.stringify({ 
            type: 'session_status', 
            state: sessionState,
            queueLength: messageQueue.length,
            timestamp: Date.now(),
            metrics: sessionMetrics,
            uptime: Date.now() - lastSuccessfulConnection
          }));
          return;
        }

        if (data.type === 'force_reconnect') {
          console.log('Client requested force reconnection');
          connectionAttempts = 0; // Reset attempts on manual request
          attemptReconnection();
          return;
        }
        
        // Intelligent message routing based on session state
        if (sessionState === 'ready' && openAISocket && openAISocket.readyState === WebSocket.OPEN) {
          try {
            openAISocket.send(messageStr);
            sessionMetrics.messagesProcessed++;
            console.log('Forwarded message to OpenAI:', data.type);
          } catch (error) {
            console.error('Error forwarding message:', error);
            sessionMetrics.errorsCount++;
            addToQueue(messageStr, data.type === 'input_audio_buffer.append' ? 2 : 3);
          }
        } else if (['configuring', 'connecting', 'reconnecting'].includes(sessionState)) {
          // Determine priority based on message type
          let priority = 1;
          if (data.type === 'input_audio_buffer.commit') priority = 3;
          else if (data.type === 'response.create') priority = 3;
          else if (data.type === 'conversation.item.create') priority = 2;
          
          addToQueue(messageStr, priority);
          
          socket.send(JSON.stringify({
            type: 'session_not_ready',
            message: `Sesiunea se configurează... (${sessionState})`,
            sessionState: sessionState,
            queueLength: messageQueue.length
          }));
        } else {
          console.log('Session not ready, message dropped:', data.type, 'State:', sessionState);
          socket.send(JSON.stringify({
            type: 'session_unavailable',
            message: 'Sesiunea nu este disponibilă',
            sessionState: sessionState,
            canRetry: sessionState !== 'error'
          }));
        }
        
      } catch (error) {
        console.error('Error handling client message:', error);
        sessionMetrics.errorsCount++;
        socket.send(JSON.stringify({
          type: 'message_error',
          message: 'Eroare în procesarea mesajului',
          error: error.message
        }));
      }
    };

    socket.onerror = (error) => {
      console.error('Client WebSocket error:', error);
    };

    socket.onclose = () => {
      console.log('Client WebSocket disconnected');
      
      // Cleanup
      clearInterval(heartbeatInterval);
      if (openAISocket) {
        openAISocket.close();
      }
      
      // Final session metrics
      sessionMetrics.totalUptime = Date.now() - lastSuccessfulConnection;
      console.log('Session ended with metrics:', sessionMetrics);
    };

  } catch (error) {
    console.error('=== EDGE FUNCTION ERROR ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Request details:', {
      method: req.method,
      url: req.url,
      headers: Object.fromEntries(req.headers.entries())
    });
    
    // Determine appropriate error response based on error type
    let statusCode = 500;
    let errorMessage = 'Internal server error';
    
    if (error.message.includes('environment variables')) {
      statusCode = 503; // Service Unavailable
      errorMessage = 'Service configuration error';
    } else if (error.message.includes('Parametri invalizi') || error.message.includes('Invalid')) {
      statusCode = 400; // Bad Request
      errorMessage = error.message;
    } else if (error.message.includes('Conversația nu a fost găsită')) {
      statusCode = 404; // Not Found
      errorMessage = error.message;
    } else if (error.message.includes('Prea multe sesiuni')) {
      statusCode = 429; // Too Many Requests
      errorMessage = error.message;
    } else {
      // Generic server error
      errorMessage = 'A apărut o problemă cu serviciul vocal';
    }
    
    console.error(`Returning ${statusCode} error: ${errorMessage}`);
    
    return new Response(JSON.stringify({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: Date.now(),
      request_id: crypto.randomUUID()
    }), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // This should never be reached due to WebSocket upgrade, but add as fallback
  console.warn('Reached end of function without returning response - this should not happen');
  return new Response(JSON.stringify({ 
    error: 'Unexpected execution path',
    timestamp: Date.now()
  }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// Rate limiting function with improved logic
async function checkRateLimit(supabase: any, conversationId: string): Promise<{ allowed: boolean }> {
  try {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW;
    
    // Check for existing rate limit record
    const { data: existing } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', conversationId)
      .eq('action', 'realtime_session')
      .gte('window_start', new Date(windowStart).toISOString())
      .single();

    if (existing) {
      if (existing.count >= RATE_LIMIT_MAX_SESSIONS) {
        console.log(`Rate limit exceeded for conversation ${conversationId}: ${existing.count}/${RATE_LIMIT_MAX_SESSIONS}`);
        return { allowed: false };
      }
      
      // Update existing record
      await supabase
        .from('rate_limits')
        .update({ 
          count: existing.count + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      // Create new rate limit record
      await supabase
        .from('rate_limits')
        .insert({
          identifier: conversationId,
          identifier_type: 'conversation',
          action: 'realtime_session',
          count: 1,
          max_attempts: RATE_LIMIT_MAX_SESSIONS,
          window_start: new Date(windowStart).toISOString(),
          window_duration: `${RATE_LIMIT_WINDOW} milliseconds`
        });
    }
    
    return { allowed: true };
  } catch (error) {
    console.error('Rate limiting error:', error);
    return { allowed: true }; // Allow on error to avoid blocking
  }
}

// Enhanced message storage with better error handling
async function storeConversationMessage(
  supabase: any, 
  conversationId: string, 
  content: any, 
  messageType: string, 
  metadata: any = {}
): Promise<void> {
  try {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    
    await supabase
      .from('conversation_messages')
      .insert({
        conversation_id: conversationId,
        content: contentStr,
        message_type: messageType,
        metadata: {
          ...metadata,
          stored_at: new Date().toISOString(),
          content_type: typeof content
        },
        timestamp: new Date().toISOString()
      });
      
    console.log(`Stored ${messageType} message for conversation ${conversationId}`);
  } catch (error) {
    console.error('Error storing conversation message:', error);
    // Don't throw - storage errors shouldn't break the session
  }
}