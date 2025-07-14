import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ybdvhqmjlztlvrfurkaf.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliZHZocW1qbHp0bHZyZnVya2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNjE2MTcsImV4cCI6MjA2NDYzNzYxN30.UrS172jVmUo5XEEl0BrevGjwg2pwu0T8Jss3p3gxMrg';

describe('RLS Policy Violation Tests', () => {
  let supabase: ReturnType<typeof createClient>;

  beforeEach(() => {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  });

  afterEach(async () => {
    await supabase.auth.signOut();
  });

  it('should prevent unauthorized access to conversations', async () => {
    // Create a user and conversation
    const testEmail = `test_${Date.now()}@example.com`;
    const testPassword = 'testpassword123';

    const { error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });
    expect(signUpError).toBeNull();

    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    expect(signInError).toBeNull();

    // Create conversation
    const { data: conversation, error: convError } = await supabase.functions.invoke('create-conversation', {
      body: {
        specialtyFocus: 'Biology',
        sessionType: 'general'
      }
    });
    expect(convError).toBeNull();

    // Sign out to become unauthorized
    await supabase.auth.signOut();

    // Try to access conversation without auth - should fail
    const { data: unauthorizedConv, error: unauthorizedError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversation.conversationId)
      .single();

    expect(unauthorizedConv).toBeNull();
    expect(unauthorizedError).toBeDefined();
  });

  it('should prevent cross-user conversation access', async () => {
    // Create first user and conversation
    const user1Email = `user1_${Date.now()}@example.com`;
    const user2Email = `user2_${Date.now()}@example.com`;
    const password = 'testpassword123';

    // User 1 creates conversation
    const { error: signUp1Error } = await supabase.auth.signUp({
      email: user1Email,
      password: password
    });
    expect(signUp1Error).toBeNull();

    const { data: auth1Data, error: signIn1Error } = await supabase.auth.signInWithPassword({
      email: user1Email,
      password: password
    });
    expect(signIn1Error).toBeNull();

    const { data: user1Conversation, error: conv1Error } = await supabase.functions.invoke('create-conversation', {
      body: {
        specialtyFocus: 'Biology',
        sessionType: 'general'
      }
    });
    expect(conv1Error).toBeNull();

    // Switch to user 2
    await supabase.auth.signOut();
    
    const { error: signUp2Error } = await supabase.auth.signUp({
      email: user2Email,
      password: password
    });
    expect(signUp2Error).toBeNull();

    const { data: auth2Data, error: signIn2Error } = await supabase.auth.signInWithPassword({
      email: user2Email,
      password: password
    });
    expect(signIn2Error).toBeNull();

    // User 2 tries to access User 1's conversation - should fail
    const { data: crossUserConv, error: crossUserError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', user1Conversation.conversationId)
      .single();

    expect(crossUserConv).toBeNull();
    expect(crossUserError).toBeDefined();
  });

  it('should enforce demo conversation isolation', async () => {
    // Create demo conversation
    const { data: demoConv, error: demoError } = await supabase.functions.invoke('create-conversation', {
      body: {
        specialtyFocus: 'Demo Biology',
        sessionType: 'demo_chat'
      }
    });
    expect(demoError).toBeNull();

    // Create authenticated user
    const testEmail = `test_${Date.now()}@example.com`;
    const { error: signUpError } = await supabase.auth.signUp({
      email: testEmail,
      password: 'testpassword123'
    });
    expect(signUpError).toBeNull();

    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: 'testpassword123'
    });
    expect(signInError).toBeNull();

    // Authenticated user should not be able to access demo conversation
    const { data: authAccessDemo, error: authAccessError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', demoConv.conversationId)
      .single();

    expect(authAccessDemo).toBeNull();
    expect(authAccessError).toBeDefined();
  });
});