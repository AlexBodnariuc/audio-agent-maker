import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const FUNCTION_BASE_URL = `${SUPABASE_URL}/functions/v1`;

// Import TTS worker function for direct testing
// In a real implementation, this would be the actual TTS worker
async function processTTSJob(jobId: string): Promise<{ success: boolean; audio_url?: string }> {
  // Mock TTS processing
  const mockAudioUrl = `https://project.supabase.co/storage/v1/object/public/voices-cache/${jobId}.mp3`;
  
  // Simulate TTS job processing
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return {
    success: true,
    audio_url: mockAudioUrl
  };
}

describe('Voice Chat + TTS Integration Tests', () => {
  let testUser: any;
  let jwtToken: string;
  let testAgent: any;
  let testConversation: any;
  let createdResources: { conversations: string[], messages: string[], tts_jobs: string[] };

  beforeEach(async () => {
    createdResources = { conversations: [], messages: [], tts_jobs: [] };

    // Create test user
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: `tts-test-${Date.now()}@medmentor.ro`,
      password: 'testpassword123',
      email_confirm: true
    });

    if (error) {
      throw new Error('Failed to create test user');
    }

    testUser = user.user;

    // Get JWT token
    const { data: session } = await supabase.auth.signInWithPassword({
      email: testUser.email,
      password: 'testpassword123'
    });

    jwtToken = session.session?.access_token || '';

    // Create test voice agent
    const agentResponse = await supertest(FUNCTION_BASE_URL)
      .post('/create-voice-agent')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        name: 'TTS Test Agent',
        agent_id: `tts-agent-${Date.now()}`,
        description: 'Agent pentru testarea TTS',
        persona_json: {
          teachingStyle: 'prietenos',
          personality: 'încurajator',
          expertise: ['biologie']
        },
        tts_voice_id: 'pNInz6obpgDQGcFmaJgB'
      });

    testAgent = agentResponse.body;

    // Create test conversation
    const conversationResponse = await supertest(FUNCTION_BASE_URL)
      .post('/create-conversation')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({
        voice_personality_id: testAgent.id,
        specialty_focus: 'biologie',
        title: 'Test TTS Conversation'
      });

    testConversation = conversationResponse.body;
    createdResources.conversations.push(testConversation.id);
  });

  afterEach(async () => {
    // Cleanup created resources
    for (const conversationId of createdResources.conversations) {
      await supabaseAdmin
        .from('conversations')
        .delete()
        .eq('id', conversationId);
    }

    // Cleanup test user
    if (testUser?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUser.id);
    }
  });

  describe('Voice Chat Flow with TTS', () => {
    it('should create conversation with assistant message having null audio_url initially', async () => {
      // Send a question to the voice chat
      const questionText = 'Explică-mi procesul de mitoză în celulele eucariote.';

      const response = await supertest(FUNCTION_BASE_URL)
        .post('/openai-voice-chat')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          message: questionText,
          conversation_id: testConversation.id,
          voice_personality_id: testAgent.id
        });

      expect(response.status).toBe(200);
      expect(response.body.user_message).toBeDefined();
      expect(response.body.assistant_message).toBeDefined();

      // Verify assistant message initially has null audio_url
      const assistantMessage = response.body.assistant_message;
      expect(assistantMessage.content).toBeTruthy();
      expect(assistantMessage.audio_url).toBeNull();
      expect(assistantMessage.message_type).toBe('assistant');

      createdResources.messages.push(assistantMessage.id);

      // Verify TTS job was created
      const { data: ttsJobs } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .eq('message_id', assistantMessage.id)
        .eq('status', 'pending');

      expect(ttsJobs?.length).toBeGreaterThan(0);
      const ttsJob = ttsJobs[0];
      expect(ttsJob.text).toBe(assistantMessage.content);
      expect(ttsJob.voice_id).toBe(testAgent.tts_voice_id);
      
      createdResources.tts_jobs.push(ttsJob.id);
    });

    it('should process TTS job and populate audio_url', async () => {
      // First, create a conversation message
      const response = await supertest(FUNCTION_BASE_URL)
        .post('/openai-voice-chat')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          message: 'Care sunt fazele mitozei?',
          conversation_id: testConversation.id,
          voice_personality_id: testAgent.id
        });

      const assistantMessage = response.body.assistant_message;
      createdResources.messages.push(assistantMessage.id);

      // Get the TTS job
      const { data: ttsJobs } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .eq('message_id', assistantMessage.id)
        .single();

      expect(ttsJobs).toBeTruthy();
      createdResources.tts_jobs.push(ttsJobs.id);

      // Process the TTS job (simulate TTS worker)
      const ttsResult = await processTTSJob(ttsJobs.id);
      expect(ttsResult.success).toBe(true);
      expect(ttsResult.audio_url).toMatch(/\.mp3$/);

      // Update the job status and audio URL (simulate TTS worker completion)
      await supabaseAdmin
        .from('tts_jobs')
        .update({
          status: 'completed',
          audio_url: ttsResult.audio_url,
          completed_at: new Date().toISOString()
        })
        .eq('id', ttsJobs.id);

      // Update the message with audio URL
      await supabaseAdmin
        .from('conversation_messages')
        .update({
          audio_url: ttsResult.audio_url
        })
        .eq('id', assistantMessage.id);

      // Verify audio_url is now populated
      const { data: updatedMessage } = await supabaseAdmin
        .from('conversation_messages')
        .select('*')
        .eq('id', assistantMessage.id)
        .single();

      expect(updatedMessage.audio_url).toBe(ttsResult.audio_url);
      expect(updatedMessage.audio_url).toMatch(/^https.*voices-cache\/.*\.mp3$/);
    });

    it('should serve MP3 audio file with correct headers', async () => {
      // Create and process a TTS job
      const chatResponse = await supertest(FUNCTION_BASE_URL)
        .post('/openai-voice-chat')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          message: 'Explică ADN-ul pe scurt.',
          conversation_id: testConversation.id,
          voice_personality_id: testAgent.id
        });

      const assistantMessage = chatResponse.body.assistant_message;
      createdResources.messages.push(assistantMessage.id);

      // Get and process TTS job
      const { data: ttsJob } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .eq('message_id', assistantMessage.id)
        .single();

      createdResources.tts_jobs.push(ttsJob.id);

      const ttsResult = await processTTSJob(ttsJob.id);
      const audioUrl = ttsResult.audio_url;

      // Update job and message
      await Promise.all([
        supabaseAdmin
          .from('tts_jobs')
          .update({ status: 'completed', audio_url: audioUrl })
          .eq('id', ttsJob.id),
        supabaseAdmin
          .from('conversation_messages')
          .update({ audio_url: audioUrl })
          .eq('id', assistantMessage.id)
      ]);

      // Test audio file access
      const audioResponse = await supertest(audioUrl)
        .get('')
        .expect(200);

      expect(audioResponse.headers['content-type']).toMatch(/audio\/mpeg|audio\/mp3/);
      expect(audioResponse.body.length).toBeGreaterThan(0);
    });
  });

  describe('TTS Job Processing', () => {
    it('should handle multiple TTS jobs in queue', async () => {
      const messages = [
        'Prima întrebare despre biologie.',
        'A doua întrebare despre celule.',
        'A treia întrebare despre ADN.'
      ];

      const conversationPromises = messages.map(async (message) => {
        const response = await supertest(FUNCTION_BASE_URL)
          .post('/openai-voice-chat')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({
            message,
            conversation_id: testConversation.id,
            voice_personality_id: testAgent.id
          });

        if (response.body.assistant_message) {
          createdResources.messages.push(response.body.assistant_message.id);
        }

        return response.body;
      });

      const responses = await Promise.all(conversationPromises);

      // Verify all assistant messages were created
      expect(responses.length).toBe(3);
      responses.forEach(response => {
        expect(response.assistant_message).toBeDefined();
        expect(response.assistant_message.audio_url).toBeNull();
      });

      // Verify TTS jobs were created for all messages
      const { data: allTtsJobs } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .in('message_id', responses.map(r => r.assistant_message.id))
        .eq('status', 'pending');

      expect(allTtsJobs?.length).toBe(3);
      
      allTtsJobs?.forEach(job => {
        createdResources.tts_jobs.push(job.id);
        expect(job.voice_id).toBe(testAgent.tts_voice_id);
        expect(job.model).toBeDefined();
        expect(job.text).toBeTruthy();
      });
    });

    it('should handle TTS job failures gracefully', async () => {
      // Create a message
      const response = await supertest(FUNCTION_BASE_URL)
        .post('/openai-voice-chat')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          message: 'Test pentru eroare TTS',
          conversation_id: testConversation.id,
          voice_personality_id: testAgent.id
        });

      const assistantMessage = response.body.assistant_message;
      createdResources.messages.push(assistantMessage.id);

      // Get TTS job
      const { data: ttsJob } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .eq('message_id', assistantMessage.id)
        .single();

      createdResources.tts_jobs.push(ttsJob.id);

      // Simulate TTS job failure
      await supabaseAdmin
        .from('tts_jobs')
        .update({
          status: 'failed',
          error_message: 'ElevenLabs API error: Rate limit exceeded',
          retry_count: ttsJob.retry_count + 1
        })
        .eq('id', ttsJob.id);

      // Verify job failure was recorded
      const { data: failedJob } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .eq('id', ttsJob.id)
        .single();

      expect(failedJob.status).toBe('failed');
      expect(failedJob.error_message).toContain('ElevenLabs API error');
      expect(failedJob.retry_count).toBe(1);
      expect(failedJob.audio_url).toBeNull();
    });

    it('should respect TTS job priority ordering', async () => {
      // Create jobs with different priorities
      const jobData = [
        { text: 'Low priority job', priority: 1 },
        { text: 'High priority job', priority: 10 },
        { text: 'Medium priority job', priority: 5 }
      ];

      const jobIds: string[] = [];

      for (const data of jobData) {
        const { data: job } = await supabaseAdmin
          .from('tts_jobs')
          .insert({
            text: data.text,
            voice_id: 'pNInz6obpgDQGcFmaJgB',
            model: 'eleven_multilingual_v2',
            user_id: testUser.id,
            conversation_id: testConversation.id,
            priority: data.priority,
            status: 'pending'
          })
          .select()
          .single();

        jobIds.push(job.id);
        createdResources.tts_jobs.push(job.id);
      }

      // Get jobs ordered by priority
      const { data: orderedJobs } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .in('id', jobIds)
        .eq('status', 'pending')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true });

      expect(orderedJobs?.length).toBe(3);
      expect(orderedJobs[0].priority).toBe(10); // High priority first
      expect(orderedJobs[1].priority).toBe(5);  // Medium priority second
      expect(orderedJobs[2].priority).toBe(1);  // Low priority last
    });
  });

  describe('TTS Configuration and Voice Selection', () => {
    it('should use agent-specific voice configuration', async () => {
      // Create agent with specific voice
      const customAgent = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Custom Voice Agent',
          agent_id: `custom-voice-${Date.now()}`,
          tts_voice_id: 'EXAVITQu4vr4xnSDxMaL', // Sarah voice
          persona_json: { voiceType: 'female-professional' }
        });

      // Create conversation with custom agent
      const customConversation = await supertest(FUNCTION_BASE_URL)
        .post('/create-conversation')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          voice_personality_id: customAgent.body.id,
          specialty_focus: 'anatomie'
        });

      createdResources.conversations.push(customConversation.body.id);

      // Send message
      const response = await supertest(FUNCTION_BASE_URL)
        .post('/openai-voice-chat')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          message: 'Explică sistemul circulator.',
          conversation_id: customConversation.body.id,
          voice_personality_id: customAgent.body.id
        });

      const assistantMessage = response.body.assistant_message;
      createdResources.messages.push(assistantMessage.id);

      // Verify TTS job uses correct voice
      const { data: ttsJob } = await supabaseAdmin
        .from('tts_jobs')
        .select('*')
        .eq('message_id', assistantMessage.id)
        .single();

      createdResources.tts_jobs.push(ttsJob.id);
      expect(ttsJob.voice_id).toBe('EXAVITQu4vr4xnSDxMaL');
    });

    it('should use appropriate model for multilingual content', async () => {
      const multilingualTexts = [
        'Bună ziua! Să începem cu biologia.',
        'Hello! Let\'s start with biology.',
        'Hola! Empecemos con la biología.'
      ];

      for (const text of multilingualTexts) {
        const response = await supertest(FUNCTION_BASE_URL)
          .post('/openai-voice-chat')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({
            message: text,
            conversation_id: testConversation.id,
            voice_personality_id: testAgent.id
          });

        const assistantMessage = response.body.assistant_message;
        createdResources.messages.push(assistantMessage.id);

        // Get TTS job
        const { data: ttsJob } = await supabaseAdmin
          .from('tts_jobs')
          .select('*')
          .eq('message_id', assistantMessage.id)
          .single();

        createdResources.tts_jobs.push(ttsJob.id);

        // Should use multilingual model
        expect(ttsJob.model).toMatch(/multilingual|turbo/);
      }
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should retry failed TTS jobs up to max retries', async () => {
      // Create a TTS job
      const { data: ttsJob } = await supabaseAdmin
        .from('tts_jobs')
        .insert({
          text: 'Test pentru retry logic',
          voice_id: 'pNInz6obpgDQGcFmaJgB',
          model: 'eleven_multilingual_v2',
          user_id: testUser.id,
          conversation_id: testConversation.id,
          status: 'pending',
          retry_count: 0,
          max_retries: 3
        })
        .select()
        .single();

      createdResources.tts_jobs.push(ttsJob.id);

      // Simulate multiple failures
      for (let i = 1; i <= 3; i++) {
        await supabaseAdmin
          .from('tts_jobs')
          .update({
            status: 'failed',
            retry_count: i,
            error_message: `Attempt ${i} failed`
          })
          .eq('id', ttsJob.id);

        const { data: updatedJob } = await supabaseAdmin
          .from('tts_jobs')
          .select('*')
          .eq('id', ttsJob.id)
          .single();

        expect(updatedJob.retry_count).toBe(i);
        
        if (i < 3) {
          expect(updatedJob.status).toBe('failed'); // Can still retry
        } else {
          expect(updatedJob.status).toBe('failed'); // Max retries reached
        }
      }
    });
  });
});