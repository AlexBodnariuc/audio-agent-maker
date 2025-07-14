import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const FUNCTION_BASE_URL = `${SUPABASE_URL}/functions/v1`;

describe('Voice Agents CRUD Integration Tests', () => {
  let testUser: any;
  let jwtToken: string;
  let createdAgentIds: string[] = [];

  beforeEach(async () => {
    // Create test user
    const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
      email: `test-${Date.now()}@medmentor.ro`,
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
    createdAgentIds = [];
  });

  afterEach(async () => {
    // Cleanup created agents
    for (const agentId of createdAgentIds) {
      await supertest(FUNCTION_BASE_URL)
        .delete('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ id: agentId });
    }

    // Cleanup test user
    if (testUser?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUser.id);
    }
  });

  describe('CREATE Operations', () => {
    it('should create a new voice agent successfully', async () => {
      const agentData = {
        name: 'Profesor Biologie',
        agent_id: `bio-prof-${Date.now()}`,
        description: 'Profesor virtual pentru biologie UMF',
        persona_json: {
          teachingStyle: 'prietenos',
          personality: 'încurajator',
          expertise: ['biologie', 'admitere UMF'],
          communicationPreferences: {
            formality: 'informal',
            encouragementLevel: 'ridicat'
          }
        },
        medical_specialty: 'biologie',
        tts_voice_id: 'pNInz6obpgDQGcFmaJgB'
      };

      const response = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(agentData);

      expect(response.status).toBe(200);
      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe(agentData.name);
      expect(response.body.agent_id).toBe(agentData.agent_id);
      expect(response.body.is_active).toBe(true);

      createdAgentIds.push(response.body.id);
    });

    it('should validate required fields on creation', async () => {
      const invalidData = [
        { name: '' }, // Missing name
        { agent_id: '' }, // Missing agent_id
        { name: 'Valid', agent_id: 'valid', persona_json: 'invalid-json' } // Invalid JSON
      ];

      for (const data of invalidData) {
        const response = await supertest(FUNCTION_BASE_URL)
          .post('/create-voice-agent')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send(data);

        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should prevent duplicate agent_id for same user', async () => {
      const agentData = {
        name: 'Test Agent',
        agent_id: `duplicate-test-${Date.now()}`,
        persona_json: { test: true }
      };

      // Create first agent
      const response1 = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(agentData);

      expect(response1.status).toBe(200);
      createdAgentIds.push(response1.body.id);

      // Try to create duplicate
      const response2 = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(agentData);

      expect(response2.status).toBe(409); // Conflict
    });
  });

  describe('READ Operations', () => {
    let sampleAgents: any[] = [];

    beforeEach(async () => {
      // Create sample agents for testing
      const agentPromises = ['Biologie', 'Chimie', 'Fizică'].map(async (subject, index) => {
        const response = await supertest(FUNCTION_BASE_URL)
          .post('/create-voice-agent')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({
            name: `Profesor ${subject}`,
            agent_id: `prof-${subject.toLowerCase()}-${Date.now()}-${index}`,
            description: `Tutor pentru ${subject}`,
            persona_json: { subject },
            medical_specialty: subject.toLowerCase()
          });

        if (response.status === 200) {
          createdAgentIds.push(response.body.id);
          return response.body;
        }
        return null;
      });

      sampleAgents = (await Promise.all(agentPromises)).filter(Boolean);
    });

    it('should list all user agents', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data || response.body)).toBe(true);
      
      const agents = response.body.data || response.body;
      expect(agents.length).toBeGreaterThanOrEqual(sampleAgents.length);

      // Check that all sample agents are present
      for (const sampleAgent of sampleAgents) {
        const found = agents.find((a: any) => a.id === sampleAgent.id);
        expect(found).toBeDefined();
        expect(found.name).toBe(sampleAgent.name);
      }
    });

    it('should get specific agent by ID', async () => {
      const targetAgent = sampleAgents[0];

      const response = await supertest(FUNCTION_BASE_URL)
        .get(`/manage-voice-agents?id=${targetAgent.id}`)
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(targetAgent.id);
      expect(response.body.name).toBe(targetAgent.name);
      expect(response.body.agent_id).toBe(targetAgent.agent_id);
    });

    it('should return 404 for non-existent agent', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await supertest(FUNCTION_BASE_URL)
        .get(`/manage-voice-agents?id=${fakeId}`)
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(404);
    });

    it('should implement pagination', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents?limit=2&offset=0')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      
      const agents = response.body.data || response.body;
      expect(agents.length).toBeLessThanOrEqual(2);
      
      if (response.body.pagination) {
        expect(response.body.pagination.limit).toBe(2);
        expect(response.body.pagination.offset).toBe(0);
      }
    });

    it('should filter agents by medical specialty', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents?specialty=biologie')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      
      const agents = response.body.data || response.body;
      const biologieAgents = agents.filter((a: any) => 
        a.medical_specialty === 'biologie' || 
        a.name?.toLowerCase().includes('biologie')
      );
      
      expect(biologieAgents.length).toBeGreaterThan(0);
    });
  });

  describe('UPDATE Operations', () => {
    let targetAgent: any;

    beforeEach(async () => {
      // Create an agent to update
      const response = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Original Agent',
          agent_id: `original-${Date.now()}`,
          description: 'Original description',
          persona_json: { original: true },
          is_active: true
        });

      targetAgent = response.body;
      createdAgentIds.push(targetAgent.id);
    });

    it('should update agent name and description', async () => {
      const updateData = {
        id: targetAgent.id,
        name: 'Updated Agent Name',
        description: 'Updated description with new content'
      };

      const response = await supertest(FUNCTION_BASE_URL)
        .patch('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe(updateData.name);
      expect(response.body.description).toBe(updateData.description);
      expect(response.body.id).toBe(targetAgent.id);
    });

    it('should update persona JSON', async () => {
      const newPersona = {
        teachingStyle: 'formal',
        personality: 'professional',
        expertise: ['medicina generala', 'pediatrie'],
        communicationPreferences: {
          formality: 'formal',
          encouragementLevel: 'mediu'
        }
      };

      const response = await supertest(FUNCTION_BASE_URL)
        .patch('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          id: targetAgent.id,
          persona_json: newPersona
        });

      expect(response.status).toBe(200);
      expect(response.body.persona_json).toEqual(newPersona);
    });

    it('should toggle agent active status', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .patch('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          id: targetAgent.id,
          is_active: false
        });

      expect(response.status).toBe(200);
      expect(response.body.is_active).toBe(false);
    });

    it('should return 404 for cross-tenant update attempt', async () => {
      // Create another user
      const { data: otherUser } = await supabaseAdmin.auth.admin.createUser({
        email: `other-${Date.now()}@test.com`,
        password: 'testpassword123',
        email_confirm: true
      });

      const { data: otherSession } = await supabase.auth.signInWithPassword({
        email: otherUser.user.email,
        password: 'testpassword123'
      });

      const otherToken = otherSession.session?.access_token || '';

      // Try to update the first user's agent
      const response = await supertest(FUNCTION_BASE_URL)
        .patch('/manage-voice-agents')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          id: targetAgent.id,
          name: 'Hacked Name'
        });

      expect(response.status).toBe(404); // Should not find the agent

      // Cleanup other user
      await supabaseAdmin.auth.admin.deleteUser(otherUser.user.id);
    });

    it('should validate update data', async () => {
      const invalidUpdates = [
        { id: targetAgent.id, name: '' }, // Empty name
        { id: targetAgent.id, persona_json: 'invalid-json' }, // Invalid JSON string
        { id: 'invalid-uuid', name: 'Test' } // Invalid UUID
      ];

      for (const updateData of invalidUpdates) {
        const response = await supertest(FUNCTION_BASE_URL)
          .patch('/manage-voice-agents')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send(updateData);

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
      }
    });
  });

  describe('DELETE Operations (Soft Delete)', () => {
    let targetAgent: any;

    beforeEach(async () => {
      // Create an agent to delete
      const response = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          name: 'Agent To Delete',
          agent_id: `delete-me-${Date.now()}`,
          description: 'This agent will be deleted',
          persona_json: { temporary: true }
        });

      targetAgent = response.body;
      createdAgentIds.push(targetAgent.id);
    });

    it('should soft delete agent (set is_active = false)', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .delete('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ id: targetAgent.id });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify agent is marked as inactive
      const getResponse = await supertest(FUNCTION_BASE_URL)
        .get(`/manage-voice-agents?id=${targetAgent.id}&include_inactive=true`)
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.is_active).toBe(false);
    });

    it('should not list soft-deleted agents by default', async () => {
      // Delete the agent
      await supertest(FUNCTION_BASE_URL)
        .delete('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ id: targetAgent.id });

      // List all agents (should not include deleted)
      const listResponse = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(listResponse.status).toBe(200);
      
      const agents = listResponse.body.data || listResponse.body;
      const deletedAgent = agents.find((a: any) => a.id === targetAgent.id);
      expect(deletedAgent).toBeUndefined();
    });

    it('should return 404 for cross-tenant delete attempt', async () => {
      // Create another user
      const { data: otherUser } = await supabaseAdmin.auth.admin.createUser({
        email: `delete-other-${Date.now()}@test.com`,
        password: 'testpassword123',
        email_confirm: true
      });

      const { data: otherSession } = await supabase.auth.signInWithPassword({
        email: otherUser.user.email,
        password: 'testpassword123'
      });

      const otherToken = otherSession.session?.access_token || '';

      // Try to delete the first user's agent
      const response = await supertest(FUNCTION_BASE_URL)
        .delete('/manage-voice-agents')
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ id: targetAgent.id });

      expect(response.status).toBe(404);

      // Cleanup other user
      await supabaseAdmin.auth.admin.deleteUser(otherUser.user.id);
    });

    it('should return 404 for non-existent agent deletion', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await supertest(FUNCTION_BASE_URL)
        .delete('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({ id: fakeId });

      expect(response.status).toBe(404);
    });
  });

  describe('Pagination and Filtering', () => {
    beforeEach(async () => {
      // Create multiple agents for pagination testing
      const specialties = ['biologie', 'chimie', 'fizica', 'matematica', 'anatomie'];
      const agentPromises = specialties.map(async (specialty, index) => {
        for (let i = 0; i < 3; i++) {
          const response = await supertest(FUNCTION_BASE_URL)
            .post('/create-voice-agent')
            .set('Authorization', `Bearer ${jwtToken}`)
            .send({
              name: `${specialty} Tutor ${i + 1}`,
              agent_id: `${specialty}-tutor-${i}-${Date.now()}-${index}`,
              medical_specialty: specialty,
              persona_json: { specialty, index: i }
            });

          if (response.status === 200) {
            createdAgentIds.push(response.body.id);
          }
        }
      });

      await Promise.all(agentPromises);
    });

    it('should handle pagination correctly', async () => {
      const pageSize = 5;
      let totalItems = 0;
      let currentPage = 0;
      let allAgents: any[] = [];

      // Fetch all pages
      while (true) {
        const response = await supertest(FUNCTION_BASE_URL)
          .get(`/manage-voice-agents?limit=${pageSize}&offset=${currentPage * pageSize}`)
          .set('Authorization', `Bearer ${jwtToken}`);

        expect(response.status).toBe(200);
        
        const agents = response.body.data || response.body;
        allAgents.push(...agents);

        if (agents.length < pageSize) {
          break;
        }
        currentPage++;
      }

      expect(allAgents.length).toBeGreaterThan(10); // We created 15 agents
      
      // Verify no duplicates
      const uniqueIds = new Set(allAgents.map(a => a.id));
      expect(uniqueIds.size).toBe(allAgents.length);
    });

    it('should filter by multiple criteria', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents?specialty=biologie&is_active=true&limit=10')
        .set('Authorization', `Bearer ${jwtToken}`);

      expect(response.status).toBe(200);
      
      const agents = response.body.data || response.body;
      
      for (const agent of agents) {
        expect(agent.medical_specialty).toBe('biologie');
        expect(agent.is_active).toBe(true);
      }
    });
  });
});