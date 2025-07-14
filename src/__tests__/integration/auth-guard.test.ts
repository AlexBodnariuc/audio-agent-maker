import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import supertest from 'supertest';
import { createClient } from '@supabase/supabase-js';

// Mock server setup for testing edge functions
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon-key';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Mock function URLs (adjust based on your Supabase project)
const FUNCTION_BASE_URL = `${SUPABASE_URL}/functions/v1`;

describe('Auth Guard Integration Tests', () => {
  let testUserA: any;
  let testUserB: any;
  let jwtTokenA: string;
  let jwtTokenB: string;

  beforeEach(async () => {
    // Create test users
    const { data: userA, error: errorA } = await supabaseAdmin.auth.admin.createUser({
      email: 'user-a@test.com',
      password: 'testpassword123',
      email_confirm: true
    });

    const { data: userB, error: errorB } = await supabaseAdmin.auth.admin.createUser({
      email: 'user-b@test.com', 
      password: 'testpassword123',
      email_confirm: true
    });

    if (errorA || errorB) {
      throw new Error('Failed to create test users');
    }

    testUserA = userA.user;
    testUserB = userB.user;

    // Get JWT tokens
    const { data: sessionA } = await supabase.auth.signInWithPassword({
      email: 'user-a@test.com',
      password: 'testpassword123'
    });

    const { data: sessionB } = await supabase.auth.signInWithPassword({
      email: 'user-b@test.com',
      password: 'testpassword123'
    });

    jwtTokenA = sessionA.session?.access_token || '';
    jwtTokenB = sessionB.session?.access_token || '';
  });

  afterEach(async () => {
    // Cleanup test users
    if (testUserA?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUserA.id);
    }
    if (testUserB?.id) {
      await supabaseAdmin.auth.admin.deleteUser(testUserB.id);
    }
  });

  describe('JWT Authentication', () => {
    it('should return 401 for requests without JWT token', async () => {
      const protectedEndpoints = [
        '/create-voice-agent',
        '/manage-voice-agents',
        '/create-conversation',
        '/voice-analytics'
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await supertest(FUNCTION_BASE_URL)
          .post(endpoint)
          .send({ test: 'data' });

        expect(response.status).toBe(401);
        expect(response.body.error).toMatch(/unauthorized|authentication/i);
      }
    });

    it('should return 401 for requests with invalid JWT token', async () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid-token',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature'
      ];

      for (const token of invalidTokens) {
        const response = await supertest(FUNCTION_BASE_URL)
          .post('/create-voice-agent')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'Test Agent',
            agent_id: 'test-agent',
            persona_json: {}
          });

        expect(response.status).toBe(401);
      }
    });

    it('should allow access with valid JWT token', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtTokenA}`)
        .send({
          name: 'Test Agent',
          agent_id: 'test-agent-' + Date.now(),
          persona_json: {
            teachingStyle: 'friendly',
            personality: 'encouraging'
          }
        });

      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(403);
    });
  });

  describe('Row Level Security (RLS)', () => {
    it('should prevent access to other users resources (403)', async () => {
      // User A creates a voice agent
      const createResponse = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtTokenA}`)
        .send({
          name: 'Private Agent',
          agent_id: 'private-agent-' + Date.now(),
          persona_json: { private: true }
        });

      expect(createResponse.status).toBe(200);
      const agentId = createResponse.body.id;

      // User B tries to access User A's agent
      const accessResponse = await supertest(FUNCTION_BASE_URL)
        .get(`/manage-voice-agents?id=${agentId}`)
        .set('Authorization', `Bearer ${jwtTokenB}`);

      expect(accessResponse.status).toBe(403);
    });

    it('should allow access to own resources (200)', async () => {
      // User A creates a voice agent
      const createResponse = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${jwtTokenA}`)
        .send({
          name: 'My Agent',
          agent_id: 'my-agent-' + Date.now(),
          persona_json: { owner: 'userA' }
        });

      expect(createResponse.status).toBe(200);
      const agentId = createResponse.body.id;

      // User A accesses their own agent
      const accessResponse = await supertest(FUNCTION_BASE_URL)
        .get(`/manage-voice-agents?id=${agentId}`)
        .set('Authorization', `Bearer ${jwtTokenA}`);

      expect(accessResponse.status).toBe(200);
      expect(accessResponse.body.id).toBe(agentId);
    });
  });

  describe('Cross-Tenant Data Access', () => {
    it('should isolate user data across tenants', async () => {
      // Both users create agents with similar names
      const agentDataA = {
        name: 'Biology Tutor',
        agent_id: 'bio-tutor-a-' + Date.now(),
        persona_json: { subject: 'biology', user: 'A' }
      };

      const agentDataB = {
        name: 'Biology Tutor',
        agent_id: 'bio-tutor-b-' + Date.now(),
        persona_json: { subject: 'biology', user: 'B' }
      };

      const [responseA, responseB] = await Promise.all([
        supertest(FUNCTION_BASE_URL)
          .post('/create-voice-agent')
          .set('Authorization', `Bearer ${jwtTokenA}`)
          .send(agentDataA),
        supertest(FUNCTION_BASE_URL)
          .post('/create-voice-agent')
          .set('Authorization', `Bearer ${jwtTokenB}`)
          .send(agentDataB)
      ]);

      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      // User A should only see their own agents
      const listResponseA = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtTokenA}`);

      expect(listResponseA.status).toBe(200);
      const userAAgents = listResponseA.body.data || listResponseA.body;
      expect(userAAgents.some((agent: any) => agent.id === responseA.body.id)).toBe(true);
      expect(userAAgents.some((agent: any) => agent.id === responseB.body.id)).toBe(false);

      // User B should only see their own agents
      const listResponseB = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtTokenB}`);

      expect(listResponseB.status).toBe(200);
      const userBAgents = listResponseB.body.data || listResponseB.body;
      expect(userBAgents.some((agent: any) => agent.id === responseB.body.id)).toBe(true);
      expect(userBAgents.some((agent: any) => agent.id === responseA.body.id)).toBe(false);
    });
  });

  describe('Rate Limiting Security', () => {
    it('should enforce rate limits per user', async () => {
      const requests = [];
      
      // Make multiple rapid requests as User A
      for (let i = 0; i < 25; i++) {
        requests.push(
          supertest(FUNCTION_BASE_URL)
            .post('/create-conversation')
            .set('Authorization', `Bearer ${jwtTokenA}`)
            .send({
              voice_personality_id: 'test-personality',
              specialty_focus: 'biology'
            })
        );
      }

      const responses = await Promise.allSettled(requests);
      
      // Should have some successful responses and some rate limited
      const successCount = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length;
      
      const rateLimitedCount = responses.filter(r => 
        r.status === 'fulfilled' && r.value.status === 429
      ).length;

      expect(successCount).toBeGreaterThan(0);
      expect(rateLimitedCount).toBeGreaterThan(0);
      expect(successCount + rateLimitedCount).toBe(25);
    });

    it('should have independent rate limits for different users', async () => {
      // User A makes requests to exhaust their rate limit
      const userARequests = [];
      for (let i = 0; i < 20; i++) {
        userARequests.push(
          supertest(FUNCTION_BASE_URL)
            .get('/manage-voice-agents')
            .set('Authorization', `Bearer ${jwtTokenA}`)
        );
      }

      await Promise.all(userARequests);

      // User B should still be able to make requests
      const userBResponse = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents')
        .set('Authorization', `Bearer ${jwtTokenB}`);

      expect(userBResponse.status).not.toBe(429);
    });
  });

  describe('JWT Token Expiration', () => {
    it('should reject expired tokens', async () => {
      // Create a token that expires quickly (this would need to be mocked in real implementation)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjN9.invalid';

      const response = await supertest(FUNCTION_BASE_URL)
        .get('/manage-voice-agents')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toMatch(/expired|invalid/i);
    });
  });

  describe('Service Role Key Security', () => {
    it('should not accept service role key in client requests', async () => {
      const response = await supertest(FUNCTION_BASE_URL)
        .post('/create-voice-agent')
        .set('Authorization', `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`)
        .send({
          name: 'Service Role Agent',
          agent_id: 'service-agent',
          persona_json: {}
        });

      // This should either be rejected or treated as a normal user request
      // The exact behavior depends on your RLS policies
      expect(response.status).toBe(401);
    });
  });
});