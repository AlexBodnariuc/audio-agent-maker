import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybdvhqmjlztlvrfurkaf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliZHZocW1qbHp0bHZyZnVya2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNjE2MTcsImV4cCI6MjA2NDYzNzYxN30.UrS172jVmUo5XEEl0BrevGjwg2pwu0T8Jss3p3gxMrg';

describe('Demo vs Auth Flow Integration', () => {
  let supabase: ReturnType<typeof createClient>;

  beforeEach(() => {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  });

  afterEach(async () => {
    await supabase.auth.signOut();
  });

  it('should create demo conversation and handle chat stream without JWT', async () => {
    // 1. Create demo conversation
    const { data: conversation, error: convError } = await supabase.functions.invoke('create-conversation', {
      body: {
        specialtyFocus: 'Biologie și Chimie pentru Admiterea UMF',
        sessionType: 'demo_chat',
        userContext: {
          level: 'high_school',
          subjects: ['biology', 'chemistry'],
          goal: 'medical_admission'
        }
      }
    });

    expect(convError).toBeNull();
    expect(conversation?.conversationId).toBeDefined();
    expect(conversation?.demoMode).toBe(true);

    // 2. Send message to chat stream without JWT
    const streamResponse = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey
      },
      body: JSON.stringify({
        conversation_id: conversation.conversationId,
        text: 'Explain the process of photosynthesis'
      })
    });

    expect(streamResponse.status).toBe(200);
    expect(streamResponse.headers.get('content-type')).toContain('text/event-stream');

    // 3. Verify message was saved to database
    const { data: messages, error: msgError } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversation.conversationId)
      .order('created_at', { ascending: true });

    expect(msgError).toBeNull();
    expect(messages).toHaveLength(1); // At least the user message
    expect(messages?.[0]?.content).toContain('photosynthesis');
    expect(messages?.[0]?.message_type).toBe('user');
  });

  it('should create auth conversation and handle chat stream with JWT', async () => {
    // 1. Create authenticated user
    const testEmail = `test_${Date.now()}@example.com`;
    const testPassword = 'testpassword123';

    const { error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });

    expect(signUpError).toBeNull();

    // Sign in
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    expect(signInError).toBeNull();
    expect(authData.user).toBeDefined();

    // 2. Create authenticated conversation
    const { data: conversation, error: convError } = await supabase.functions.invoke('create-conversation', {
      body: {
        specialtyFocus: 'Advanced Biology',
        sessionType: 'general'
      }
    });

    expect(convError).toBeNull();
    expect(conversation?.conversationId).toBeDefined();
    expect(conversation?.demoMode).toBe(false);

    // 3. Chat stream with JWT
    const streamResponse = await fetch(`${supabaseUrl}/functions/v1/openai-chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${authData.session.access_token}`
      },
      body: JSON.stringify({
        conversation_id: conversation.conversationId,
        text: 'What is cellular respiration?'
      })
    });

    expect(streamResponse.status).toBe(200);

    // 4. Verify TTS job was created (if applicable)
    const { data: ttsJobs, error: ttsError } = await supabase
      .from('tts_jobs')
      .select('*')
      .eq('conversation_id', conversation.conversationId);

    expect(ttsError).toBeNull();
    // TTS job might not exist immediately, but no RLS errors should occur
  });
});