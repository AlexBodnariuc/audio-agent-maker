import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybdvhqmjlztlvrfurkaf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliZHZocW1qbHp0bHZyZnVya2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNjE2MTcsImV4cCI6MjA2NDYzNzYxN30.UrS172jVmUo5XEEl0BrevGjwg2pwu0T8Jss3p3gxMrg';

describe('Live Chat Auth Guard', () => {
  let supabase: ReturnType<typeof createClient>;

  beforeEach(() => {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  });

  afterEach(async () => {
    await supabase.auth.signOut();
  });

  it('should return 401 for openai-chat-stream without auth header for non-demo', async () => {
    // First create a regular conversation (not demo)
    const { data: conversation, error: convError } = await supabase.functions.invoke('create-conversation', {
      body: {
        specialtyFocus: 'biology',
        sessionType: 'general'
      }
    });

    if (convError) {
      console.log('Expected error for non-demo without auth:', convError);
      expect(convError.message).toContain('Authentication required');
      return;
    }

    // Try to use chat stream without auth
    const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        conversation_id: conversation?.conversationId,
        text: 'Hello test'
      })
    });

    expect(response.status).toBe(401);
  });

  it('should return 200 for demo_chat without auth header', async () => {
    // Create a demo conversation
    const { data: conversation, error: convError } = await supabase.functions.invoke('create-conversation', {
      body: {
        specialtyFocus: 'biology',
        sessionType: 'demo_chat'
      }
    });

    expect(convError).toBeNull();
    expect(conversation?.conversationId).toBeDefined();
    expect(conversation?.demoMode).toBe(true);

    // Try to use chat stream without auth (should work for demo)
    const response = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        conversation_id: conversation.conversationId,
        text: 'Hello demo test'
      })
    });

    expect(response.status).toBe(200);
  });
});