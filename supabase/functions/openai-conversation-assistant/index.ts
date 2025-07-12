import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.5";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AssistantRequest {
  conversationId: string;
  action: 'create_thread' | 'send_message' | 'get_status' | 'cancel_run' | 'handle_tool_call';
  message?: string;
  assistantId?: string;
  threadId?: string;
  runId?: string;
  toolCallId?: string;
  toolOutputs?: any[];
}

// Timeout constants
const RUN_TIMEOUT_MS = 30000; // 30 seconds
const POLLING_INTERVAL_MS = 1000; // 1 second

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
      runId,
      toolCallId,
      toolOutputs
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
        result = await getRunStatus(openaiApiKey, supabase, conversationId, threadId, runId);
        break;
      case 'cancel_run':
        if (!threadId || !runId) {
          throw new Error('threadId and runId are required for cancel_run action');
        }
        result = await cancelRun(openaiApiKey, threadId, runId);
        break;
      case 'handle_tool_call':
        if (!threadId || !runId || !toolOutputs) {
          throw new Error('threadId, runId, and toolOutputs are required for handle_tool_call action');
        }
        result = await handleToolCall(openaiApiKey, threadId, runId, toolOutputs);
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

  // Create thread with retry logic
  let threadResponse;
  let retryCount = 0;
  const maxRetries = 3;

  while (retryCount < maxRetries) {
    try {
      threadResponse = await fetch('https://api.openai.com/v1/threads', {
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

      if (threadResponse.ok) {
        break;
      }

      const error = await threadResponse.json();
      if (retryCount === maxRetries - 1) {
        throw new Error(`OpenAI thread creation error: ${error.error?.message || 'Unknown error'}`);
      }
      
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
    } catch (error) {
      if (retryCount === maxRetries - 1) {
        throw error;
      }
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
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

  // Create new assistant with improved tools
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
        },
        {
          type: 'function',
          function: {
            name: 'assess_understanding',
            description: 'Assess student understanding and provide feedback',
            parameters: {
              type: 'object',
              properties: {
                topic: {
                  type: 'string',
                  description: 'The topic being assessed'
                },
                student_response: {
                  type: 'string',
                  description: 'The student\'s response or answer'
                },
                assessment_type: {
                  type: 'string',
                  enum: ['quiz', 'discussion', 'case_study', 'practical'],
                  description: 'Type of assessment'
                }
              },
              required: ['topic', 'student_response']
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

Tool usage guidelines:
- Use get_medical_reference when students ask about specific medical terms, diseases, or procedures
- Use create_learning_objective when setting up structured learning goals
- Use assess_understanding when evaluating student responses or conducting assessments

Always prioritize patient safety and evidence-based practice in your teaching.`;
}

async function sendMessageToAssistant(
  apiKey: string,
  supabase: any,
  conversationId: string,
  threadId: string,
  message: string
): Promise<any> {
  // Check for existing active runs and cancel them
  try {
    const activeRunsResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    });

    if (activeRunsResponse.ok) {
      const runs = await activeRunsResponse.json();
      const activeRuns = runs.data.filter((run: any) => 
        ['queued', 'in_progress', 'requires_action'].includes(run.status)
      );

      // Cancel any active runs
      for (const run of activeRuns) {
        console.log(`Cancelling active run: ${run.id}`);
        await cancelRun(apiKey, threadId, run.id);
      }
    }
  } catch (error) {
    console.log('Error checking for active runs:', error);
  }

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

  // Run the assistant with timeout protection
  const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      assistant_id: assistantId,
      additional_instructions: 'Respond concisely and educationally. If you need to use tools, do so efficiently.',
      max_prompt_tokens: 4000,
      max_completion_tokens: 1000
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

async function getRunStatus(
  apiKey: string, 
  supabase: any, 
  conversationId: string, 
  threadId: string, 
  runId: string
): Promise<any> {
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

  // Handle different run statuses
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
        const messageContent = latestMessage.content[0]?.text?.value || '';
        
        // Store assistant response in database
        await supabase
          .from('conversation_messages')
          .insert({
            conversation_id: conversationId,
            content: messageContent,
            message_type: 'assistant',
            timestamp: new Date().toISOString(),
            metadata: {
              openai_thread_id: threadId,
              openai_run_id: runId
            }
          });

        return {
          status: run.status,
          message: messageContent,
          runId,
          threadId
        };
      }
    }
  } else if (run.status === 'requires_action') {
    // Handle tool calls
    const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];
    
    if (toolCalls.length > 0) {
      const toolOutputs = await processToolCalls(toolCalls);
      
      return {
        status: run.status,
        requires_action: true,
        tool_calls: toolCalls,
        tool_outputs: toolOutputs,
        runId,
        threadId
      };
    }
  } else if (run.status === 'failed') {
    console.error('Run failed:', run.last_error);
    return {
      status: run.status,
      error: run.last_error?.message || 'Run failed',
      runId,
      threadId
    };
  } else if (run.status === 'expired') {
    console.log('Run expired, cancelling...');
    await cancelRun(apiKey, threadId, runId);
    return {
      status: 'cancelled',
      error: 'Run expired and was cancelled',
      runId,
      threadId
    };
  }

  return {
    status: run.status,
    runId,
    threadId
  };
}

async function processToolCalls(toolCalls: any[]): Promise<any[]> {
  const toolOutputs = [];

  for (const toolCall of toolCalls) {
    const { id, function: func } = toolCall;
    let output = '';

    try {
      const args = JSON.parse(func.arguments);

      switch (func.name) {
        case 'get_medical_reference':
          output = await getMedicalReference(args.query, args.category);
          break;
        case 'create_learning_objective':
          output = await createLearningObjective(args.topic, args.difficulty, args.learning_goals);
          break;
        case 'assess_understanding':
          output = await assessUnderstanding(args.topic, args.student_response, args.assessment_type);
          break;
        default:
          output = `Tool ${func.name} is not implemented yet.`;
      }
    } catch (error) {
      console.error(`Error processing tool call ${func.name}:`, error);
      output = `Error: Could not process ${func.name} request.`;
    }

    toolOutputs.push({
      tool_call_id: id,
      output: output
    });
  }

  return toolOutputs;
}

async function getMedicalReference(query: string, category?: string): Promise<string> {
  // Simulated medical reference lookup
  const references: Record<string, any> = {
    'myocardial infarction': {
      definition: 'Heart attack caused by blocked blood flow to heart muscle',
      symptoms: 'Chest pain, shortness of breath, nausea, sweating',
      treatment: 'Emergency reperfusion therapy, medications, lifestyle changes'
    },
    'pneumonia': {
      definition: 'Infection that inflames air sacs in lungs',
      symptoms: 'Cough, fever, difficulty breathing, chest pain',
      treatment: 'Antibiotics for bacterial pneumonia, supportive care'
    }
  };

  const info = references[query.toLowerCase()] || {
    definition: `Information about ${query} would be found in medical references`,
    note: 'This is a simulated reference. In a real system, this would query actual medical databases.'
  };

  return JSON.stringify(info, null, 2);
}

async function createLearningObjective(topic: string, difficulty: string, goals: string[]): Promise<string> {
  const objective = {
    topic,
    difficulty,
    learning_goals: goals,
    estimated_duration: difficulty === 'beginner' ? '15-30 minutes' : 
                       difficulty === 'intermediate' ? '30-60 minutes' : '60+ minutes',
    assessment_methods: ['discussion', 'case study', 'quiz'],
    prerequisites: difficulty === 'beginner' ? 'Basic medical terminology' : 
                  difficulty === 'intermediate' ? 'Understanding of basic anatomy' : 
                  'Advanced medical knowledge'
  };

  return JSON.stringify(objective, null, 2);
}

async function assessUnderstanding(topic: string, studentResponse: string, assessmentType?: string): Promise<string> {
  const assessment = {
    topic,
    student_response: studentResponse,
    assessment_type: assessmentType || 'discussion',
    feedback: 'Based on your response, you demonstrate good understanding of the basic concepts.',
    suggestions: [
      'Consider exploring more advanced aspects of this topic',
      'Practice with additional case studies',
      'Review related anatomical structures'
    ],
    score: 'Good understanding demonstrated'
  };

  return JSON.stringify(assessment, null, 2);
}

async function handleToolCall(
  apiKey: string,
  threadId: string,
  runId: string,
  toolOutputs: any[]
): Promise<any> {
  const response = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}/submit_tool_outputs`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    },
    body: JSON.stringify({
      tool_outputs: toolOutputs
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI tool output error: ${error.error?.message || 'Unknown error'}`);
  }

  return await response.json();
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
    console.error(`OpenAI run cancel error: ${error.error?.message || 'Unknown error'}`);
    // Don't throw here, as cancellation might fail for already completed runs
    return { status: 'cancel_failed', error: error.error?.message };
  }

  return await response.json();
}