import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybdvhqmjlztlvrfurkaf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliZHZocW1qbHp0bHZyZnVya2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNjE2MTcsImV4cCI6MjA2NDYzNzYxN30.UrS172jVmUo5XEEl0BrevGjwg2pwu0T8Jss3p3gxMrg';

describe('Chat Stream Integration Tests', () => {
  let supabase: ReturnType<typeof createClient>;
  let testConversationId: string;
  let testUserId: string;

  beforeAll(async () => {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Create test user session for integration tests
    const testEmail = `test+${Date.now()}@medmentor.test`;
    const testPassword = 'test123456';
    
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    });
    
    if (signUpError || !signUpData.user) {
      throw new Error(`Failed to create test user: ${signUpError?.message}`);
    }
    
    testUserId = signUpData.user.id as string;
    
    // Create test conversation
    const { data: conversationData, error: conversationError } = await supabase
      .from('conversations')
      .insert({
        title: 'Test Chat Stream Conversation',
        user_id: testUserId,
        voice_personality_id: '00000000-0000-0000-0000-000000000000', // Default test personality
        status: 'active'
      })
      .select('id')
      .single();
    
    if (conversationError || !conversationData) {
      throw new Error(`Failed to create test conversation: ${conversationError?.message}`);
    }
    
    testConversationId = conversationData.id as string;
  });

  afterAll(async () => {
    // Cleanup test data
    if (testConversationId) {
      await supabase.from('conversations').delete().eq('id', testConversationId);
    }
    
    if (testUserId) {
      // Note: In production, you'd want to properly clean up auth users
      // This is just for testing purposes
    }
  });

  describe('openai-chat-stream Edge Function', () => {
    it('should validate request body', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session for test');
      }

      // Test with invalid request body
      const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          // Missing required fields
        }),
      });

      expect(response.status).toBe(400);
      
      const errorData = await response.json();
      expect(errorData.success).toBe(false);
      expect(errorData.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header
        },
        body: JSON.stringify({
          conversation_id: testConversationId,
          text: 'Test message'
        }),
      });

      expect(response.status).toBe(401);
      
      const errorData = await response.json();
      expect(errorData.success).toBe(false);
      expect(errorData.error.code).toBe('UNAUTHORIZED');
    });

    it('should validate conversation ownership', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session for test');
      }

      // Test with non-existent conversation ID
      const fakeConversationId = '00000000-0000-0000-0000-000000000001';
      
      const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversation_id: fakeConversationId,
          text: 'Test message'
        }),
      });

      expect(response.status).toBe(404);
      
      const errorData = await response.json();
      expect(errorData.success).toBe(false);
      expect(errorData.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('should return streaming response with valid input', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session for test');
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversation_id: testConversationId,
          text: 'Explică-mi ce sunt celulele în biologie.'
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      // Test streaming response (mock for unit test)
      if (process.env.NODE_ENV === 'test') {
        // In actual integration test, you would read the stream
        // For now, just verify the response format
        expect(response.body).toBeDefined();
      }
    }, 30000); // 30 second timeout for AI response

    it('should handle rate limiting', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session for test');
      }

      // Send multiple rapid requests to trigger rate limit
      const requests = Array.from({ length: 35 }, (_, i) =>
        fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            conversation_id: testConversationId,
            text: `Test message ${i}`
          }),
        })
      );

      const responses = await Promise.all(requests);
      
      // At least some requests should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should handle CORS preflight requests', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
        method: 'OPTIONS',
        headers: {
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization, content-type',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    });
  });

  describe('Message Storage', () => {
    it('should store user and assistant messages in database', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session for test');
      }

      const testMessage = 'Test message for database storage';
      
      // Send chat stream request
      const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversation_id: testConversationId,
          text: testMessage
        }),
      });

      expect(response.status).toBe(200);

      // Wait a bit for the stream to complete and messages to be stored
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if messages were stored
      const { data: messages, error } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', testConversationId)
        .order('created_at', { ascending: true });

      expect(error).toBeNull();
      expect(messages).toBeDefined();
      expect(messages!.length).toBeGreaterThanOrEqual(2); // At least user + assistant message

      // Find user message
      const userMessage = messages!.find(m => m.message_type === 'user' && m.content === testMessage);
      expect(userMessage).toBeDefined();

      // Find assistant message
      const assistantMessage = messages!.find(m => m.message_type === 'assistant');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage!.content).toBeTruthy();
    }, 30000);
  });
});