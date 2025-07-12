import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssistantRequest {
  conversationId: string;
  action: 'create_thread' | 'send_message' | 'get_status' | 'cancel_run';
  message?: string;
  assistantId?: string;
  threadId?: string;
  runId?: string;
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
      conversationId, 
      action, 
      message, 
      assistantId, 
      threadId, 
      runId 
    }: AssistantRequest = await req.json();

    if (!conversationId || !action) {
      throw new Error('conversationId and action are required');
    }

    console.log(`Processing assistant action: ${action} for conversation: ${conversationId}`);

    let result;

    switch (action) {
      case 'create_thread':
        result = await createAssistantThread(openaiApiKey, supabase, conversationId);
        break;
      case 'send_message':
        if (!message || !threadId) {
          throw new Error('message and threadId are required for send_message action');
        }
        result = await sendMessageToAssistant(openaiApiKey, supabase, conversationId, threadId, message);
        break;
      case 'get_status':
        if (!threadId || !runId) {
          throw new Error('threadId and runId are required for get_status action');
        }
        result = await getRunStatus(openaiApiKey, threadId, runId);
        break;
      case 'cancel_run':
        if (!threadId || !runId) {
          throw new Error('threadId and runId are required for cancel_run action');
        }
        result = await cancelRun(openaiApiKey, threadId, runId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      data: result,
      conversationId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in conversation-assistant function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function createAssistantThread(
  apiKey: string, 
  supabase: any, 
  conversationId: string
): Promise<any> {
  // Get conversation details for context
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
    .eq('id', conversationId)
    .single();

  if (convError) {
    throw new Error(`Failed to get conversation: ${convError.message}`);
  }

  // Create or get existing assistant
  const assistant = await createOrGetAssistant(apiKey, conversation);

  // Create thread
  const threadResponse = await fetch('https://api.openai.com/v1/threads', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      metadata: {
        conversation_id: conversationId,
        specialty: conversation.specialty_focus || 'general'
      }
    })
  });

  if (!threadResponse.ok) {
    const error = await threadResponse.json();
    throw new Error(`OpenAI thread creation error: ${error.error?.message || 'Unknown error'}`);
  }

  const thread = await threadResponse.json();

  // Store thread ID in conversation metadata
  await supabase
    .from('conversations')
    .update({
      learning_context: {
        ...conversation.learning_context,
        openai_thread_id: thread.id,
        assistant_id: assistant.id
      }
    })
    .eq('id', conversationId);

  return {
    threadId: thread.id,
    assistantId: assistant.id,
    status: 'created'
  };
}

async function createOrGetAssistant(apiKey: string, conversation: any): Promise<any> {
  const personality = conversation.voice_personalities;
  const specialty = conversation.specialty_focus || personality?.medical_specialty || 'general medicine';

  // Check if assistant already exists in conversation context
  const existingAssistantId = conversation.learning_context?.assistant_id;
  if (existingAssistantId) {
    try {
      const response = await fetch(`https://api.openai.com/v1/assistants/${existingAssistantId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.log('Existing assistant not found, creating new one');
    }
  }

  // Create new assistant
  const assistantResponse = await fetch('https://api.openai.com/v1/assistants', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      name: `${personality?.name || 'MedMentor'} - ${specialty}`,
      instructions: buildAssistantInstructions(personality, specialty),
      model: 'gpt-4o-mini',
      tools: [
        { type: 'code_interpreter' },
        {
          type: 'function',
          function: {
            name: 'get_medical_reference',
            description: 'Get medical reference information for diseases, procedures, or medications',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Medical term or concept to look up'
                },
                category: {
                  type: 'string',
                  enum: ['disease', 'procedure', 'medication', 'anatomy', 'physiology'],
                  description: 'Category of medical information'
                }
              },
              required: ['query']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'create_learning_objective',
            description: 'Create a structured learning objective for the student',
            parameters: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  description: 'The medical topic or concept'
                },
                difficulty: {
                  type: 'string',
                  enum: ['beginner', 'intermediate', 'advanced'],
                  description: 'Difficulty level'
                },
                learning_goals: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Specific learning goals'
                }
              },
              required: ['topic', 'difficulty', 'learning_goals']
            }
          }
        }
      ],
      metadata: {
        conversation_id: conversation.id,
        specialty: specialty,
        session_type: conversation.voice_session_type || 'learning'
      }
    })
  });

  if (!assistantResponse.ok) {
    const error = await assistantResponse.json();
    throw new Error(`OpenAI assistant creation error: ${error.error?.message || 'Unknown error'}`);
  }

  return await assistantResponse.json();
}

function buildAssistantInstructions(personality: any, specialty: string): string {
  return `You are ${personality?.name || 'MedMentor'}, an expert AI medical education assistant specializing in ${specialty}.

Your core capabilities:
- Provide evidence-based medical education content
- Adapt teaching style to student level and needs
- Use appropriate medical terminology with clear explanations
- Encourage critical thinking and clinical reasoning
- Provide interactive learning experiences
- Ensure patient safety principles are always emphasized

Teaching approach:
- Start with foundational concepts before advancing
- Use clinical scenarios and case-based learning
- Encourage questions and active participation
- Provide immediate feedback and clarification
- Connect theoretical knowledge to practical applications
- Maintain professional medical standards

Specialty focus: ${specialty}
Session context: Progressive skill building and knowledge development

When responding:
- Be conversational yet educational
- Ask follow-up questions to assess understanding
- Provide relevant clinical context
- Suggest additional learning resources when appropriate
- Track learning progress and adapt accordingly

Use the available tools to:
- Look up medical references when needed
- Create structured learning objectives
- Provide accurate, up-to-date information

Always prioritize patient safety and evidence-based practice in your teaching.`;
}

async function sendMessageToAssistant(
  apiKey: string,
  supabase: any,
  conversationId: string,
  threadId: string,
  message: string
): Promise<any> {
  // Add message to thread
  const messageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      role: 'user',
      content: message
    })
  });

  if (!messageResponse.ok) {
    const error = await messageResponse.json();
    throw new Error(`OpenAI message error: ${error.error?.message || 'Unknown error'}`);
  }

  // Get assistant ID from conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('learning_context')
    .eq('id', conversationId)
    .single();

  const assistantId = conversation?.learning_context?.assistant_id;
  if (!assistantId) {
    throw new Error('Assistant ID not found in conversation context');
  }

  // Run the assistant
  const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      assistant_id: assistantId
    })
  });

  if (!runResponse.ok) {
    const error = await runResponse.json();
    throw new Error(`OpenAI run error: ${error.error?.message || 'Unknown error'}`);
  }

  const run = await runResponse.json();

  // Store user message in our database
  await supabase
    .from('conversation_messages')
    .insert({
      conversation_id: conversationId,
      content: message,
      message_type: 'user',
      timestamp: new Date().toISOString(),
      metadata: {
        openai_thread_id: threadId,
        openai_run_id: run.id
      }
    });

  return {
    runId: run.id,
    status: run.status,
    threadId
  };
}

async function getRunStatus(apiKey: string, threadId: string, runId: string): Promise<any> {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI run status error: ${error.error?.message || 'Unknown error'}`);
  }

  const run = await response.json();

  // If completed, get the messages
  if (run.status === 'completed') {
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });

    if (messagesResponse.ok) {
      const messages = await messagesResponse.json();
      const latestMessage = messages.data[0]; // Most recent message
      
      if (latestMessage && latestMessage.role === 'assistant') {
        return {
          status: run.status,
          message: latestMessage.content[0]?.text?.value || '',
          runId,
          threadId
        };
      }
    }
  }

  return {
    status: run.status,
    runId,
    threadId
  };
}

async function cancelRun(apiKey: string, threadId: string, runId: string): Promise<any> {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/cancel`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'OpenAI-Beta': 'assistants=v2'
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI run cancel error: ${error.error?.message || 'Unknown error'}`);
  }

  return await response.json();
}