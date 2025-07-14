import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { makeError, makeSuccess, handleCors, ERROR_CODES } from '../_shared/error-utils.ts';
import { incrementAndCheck } from '../_shared/rate-limit-utils.ts';
import { fetchUserContext, buildPrompt, type UserContext, type AgentPersona } from '../_shared/context-builder.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

// Validation schema
const RequestSchema = z.object({
  conversation_id: z.string().uuid('ID conversație invalid'),
  text: z.string().min(1, 'Textul nu poate fi gol').max(2000, 'Textul este prea lung')
});

// Initialize Supabase client  
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Only accept POST requests
  if (req.method !== 'POST') {
    return makeError('INVALID_INPUT', 405, null, 'Doar cereri POST sunt acceptate');
  }

  try {
    console.log('Starting chat stream request...');

    // Check OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return makeError('INTERNAL_ERROR', 500, null, 'Serviciul AI nu este configurat');
    }

    // Parse and validate request body
    const requestBody = await req.json();
    const validationResult = RequestSchema.safeParse(requestBody);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.issues);
      return makeError('VALIDATION_ERROR', 400, validationResult.error.issues);
    }

    const { conversation_id, text } = validationResult.data;

    // Initialize Supabase client for this request
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {}
      }
    });

    // Check if user is authenticated or if this is a demo session
    let user_id = null;
    let user_email = null;
    
    if (authHeader) {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (!userError && user) {
        user_id = user.id;
        user_email = user.email;
        console.log(`Processing chat stream for authenticated user: ${user_id}`);
      }
    }

    // If no authenticated user, check if this is a demo conversation
    if (!user_id) {
      const { data: demoConversation, error: demoError } = await supabase
        .from('conversations')
        .select('id, email_sessions!inner(email)')
        .eq('id', conversation_id)
        .like('email_sessions.email', '%@medmentor.demo')
        .single();
      
      if (!demoError && demoConversation) {
        console.log('Processing chat stream for demo session');
        user_email = demoConversation.email_sessions.email;
      } else {
        return makeError('UNAUTHORIZED', 401, null, 'Autentificare necesară');
      }
    }

    // Rate limiting (use user_id or conversation_id for demo)
    const rateLimitIdentifier = user_id || conversation_id;
    const rateLimitResult = await incrementAndCheck(supabase, rateLimitIdentifier, conversation_id, 30, 'live_chat');
    if (!rateLimitResult.allowed) {
      console.log(`Rate limit exceeded for identifier: ${rateLimitIdentifier}`);
      return makeError('RATE_LIMIT', 429, { remaining: rateLimitResult.remaining });
    }

    // Verify conversation exists and belongs to user or is a demo
    let conversation = null;
    let convError = null;

    if (user_id) {
      // For authenticated users, first get their email sessions
      const { data: emailSessions } = await supabase
        .from('email_sessions')
        .select('id')
        .eq('email', user_email);

      const emailSessionIds = emailSessions?.map(session => session.id) || [];

      // Now check if conversation belongs to user or their email sessions
      let conversationQuery = supabase
        .from('conversations')
        .select('id, voice_personality_id')
        .eq('id', conversation_id);

      if (emailSessionIds.length > 0) {
        conversationQuery = conversationQuery.or(`user_id.eq.${user_id},email_session_id.in.(${emailSessionIds.map(id => `"${id}"`).join(',')})`);
      } else {
        conversationQuery = conversationQuery.eq('user_id', user_id);
      }

      const result = await conversationQuery.single();
      conversation = result.data;
      convError = result.error;
    } else {
      // For demo sessions, verify it has a demo email session
      const result = await supabase
        .from('conversations')
        .select('id, voice_personality_id, email_sessions!inner(email)')
        .eq('id', conversation_id)
        .like('email_sessions.email', '%@medmentor.demo')
        .single();
      
      conversation = result.data;
      convError = result.error;
    }

    if (convError || !conversation) {
      console.error('Conversation not found:', convError);
      return makeError('CONVERSATION_NOT_FOUND', 404, convError);
    }

    // Fetch user context (only for authenticated users)
    const userContext = user_id ? await fetchUserContext(supabase, user_id, 'user_id') : null;
    console.log('User context fetched:', !!userContext);

    // Fetch agent persona
    const agentPersona = await fetchAgentPersona(supabase, conversation.voice_personality_id);
    console.log('Agent persona fetched:', !!agentPersona);

    // Build personalized prompt
    const baseMedMentorInstructions = buildBaseMedMentorInstructions();
    const promptData = buildPrompt(baseMedMentorInstructions, agentPersona, userContext);
    
    console.log('Prompt built successfully');

    // Insert user message first
    const { data: userMessage, error: userMsgError } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id,
        content: text,
        message_type: 'user',
        metadata: { streaming: true }
      })
      .select('id')
      .single();

    if (userMsgError) {
      console.error('Error inserting user message:', userMsgError);
      return makeError('INTERNAL_ERROR', 500, userMsgError);
    }

    // Create streaming response
    const encoder = new TextEncoder();
    let fullResponseText = '';
    let assistantMessageId: string | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('Starting OpenAI streaming request...');
          
          // Call OpenAI streaming API
          const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: promptData.systemPrompt },
                { role: 'system', content: promptData.contextSummary },
                { role: 'user', content: text }
              ],
              stream: true,
              temperature: 0.7,
              max_tokens: 1000
            }),
          });

          if (!openAIResponse.ok) {
            throw new Error(`OpenAI API error: ${openAIResponse.status}`);
          }

          const reader = openAIResponse.body?.getReader();
          if (!reader) {
            throw new Error('Failed to get OpenAI response stream');
          }

          console.log('OpenAI stream established, processing chunks...');

          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              console.log('OpenAI stream completed');
              break;
            }

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                if (data === '[DONE]') {
                  console.log('Received [DONE] from OpenAI');
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    fullResponseText += content;
                    
                    // Send chunk to client
                    const chunkData = {
                      type: 'partial',
                      content,
                      role: 'assistant',
                      conversation_id
                    };
                    
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunkData)}\n\n`));
                    
                    // Broadcast to Realtime channel
                    await supabase.channel(`chat:${conversation_id}`)
                      .send({
                        type: 'broadcast',
                        event: 'message_chunk',
                        payload: chunkData
                      });
                  }
                } catch (parseError) {
                  console.error('Error parsing OpenAI chunk:', parseError);
                }
              }
            }
          }

          // Stream completed - save full response and send done event
          console.log('Saving complete response to database...');
          
          const { data: assistantMessage, error: assistantMsgError } = await supabase
            .from('conversation_messages')
            .insert({
              conversation_id,
              content: fullResponseText,
              message_type: 'assistant',
              metadata: { streaming: true, tokens: fullResponseText.length }
            })
            .select('id')
            .single();

          if (assistantMsgError) {
            console.error('Error saving assistant message:', assistantMsgError);
          } else {
            assistantMessageId = assistantMessage.id;
            console.log('Assistant message saved with ID:', assistantMessageId);
          }

          // Enqueue TTS job
          if (assistantMessageId && agentPersona?.tts_voice_id) {
            console.log('Enqueuing TTS job...');
            
            // For demo sessions, we need to get the email_session_id from the conversation
            let emailSessionId = null;
            if (!user_id) {
              const { data: conv } = await supabase
                .from('conversations')
                .select('email_session_id')
                .eq('id', conversation_id)
                .single();
              emailSessionId = conv?.email_session_id;
            }
            
            const { error: ttsError } = await supabase
              .from('tts_jobs')
              .insert({
                message_id: assistantMessageId,
                text: fullResponseText,
                voice_id: agentPersona.tts_voice_id,
                model: 'eleven_multilingual_v2',
                user_id,
                email_session_id: emailSessionId,
                conversation_id,
                priority: 5
              });

            if (ttsError) {
              console.error('Error enqueuing TTS job:', ttsError);
            } else {
              console.log('TTS job enqueued successfully');
            }
          }

          // Send completion event
          const doneData = {
            type: 'done',
            message_id: assistantMessageId,
            full_content: fullResponseText,
            conversation_id
          };
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`));
          
          // Broadcast completion
          await supabase.channel(`chat:${conversation_id}`)
            .send({
              type: 'broadcast', 
              event: 'message_complete',
              payload: doneData
            });

          controller.close();
          
        } catch (error) {
          console.error('Streaming error:', error);
          const errorData = {
            type: 'error',
            error: error.message,
            conversation_id
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`));
          controller.close();
        }
      }
    });

    // Return streaming response
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });

  } catch (error) {
    console.error('Unexpected error in chat stream:', error);
    return makeError('INTERNAL_ERROR', 500, { originalError: error.message }, error.message);
  }
});

// Helper function to fetch agent persona
async function fetchAgentPersona(supabase: any, personalityId: string): Promise<AgentPersona | null> {
  try {
    const { data, error } = await supabase
      .from('voice_personalities')
      .select('persona_json, tts_voice_id')
      .eq('id', personalityId)
      .single();

    if (error || !data) {
      console.error('Error fetching agent persona:', error);
      return null; 
    }

    return {
      ...data.persona_json,
      tts_voice_id: data.tts_voice_id
    };
  } catch (error) {
    console.error('Exception in fetchAgentPersona:', error);
    return null;
  }
}

// Base MedMentor instructions
function buildBaseMedMentorInstructions(): string {
  return `Ești MedMentor, asistentul AI specializat în pregătirea pentru admiterea la medicina în România.

🎯 MISIUNEA TA:
Să ajuți elevii români de liceu să se pregătească eficient pentru examenele de admitere la UMF, concentrându-te pe biologia și chimia necesare pentru a deveni medic.

📚 CONTEXTUL EDUCAȚIONAL:
- Nivel: elevi de liceu (16-19 ani) din România
- Obiectiv: admitere la Universitatea de Medicină și Farmacie (UMF)
- Focus: biologie și chimie la nivel de liceu
- Materiale de referință: manualele Corint Bio XI-XII, Chimie

🧑‍🏫 STILUL TĂU DE PREDARE:
- Explică conceptele pas cu pas, simplu și clar
- Folosește analogii și exemple concrete din viața reală
- Încurajează și motivează constant elevii
- Adaptează-te la nivelul fiecărui elev
- Răspunde întotdeauna în română
- Oferă explicații scurte și focalizate pentru chat live

⚠️ LIMITĂRI IMPORTANTE:
- Nu oferi sfaturi medicale - doar educație pentru admitere
- Concentrează-te pe cunoștințele de bază din liceu
- Nu intra în specialități medicale avansate
- Menține conversația educațională și motivațională`;
}