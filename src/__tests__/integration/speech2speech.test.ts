import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

describe('Speech2Speech Integration', () => {
  let testConversationId: string;

  beforeAll(async () => {
    // Create a test conversation for integration testing
    const { data: conversation, error } = await supabase
      .from('conversations')
      .insert({
        title: 'Speech2Speech Test',
        voice_personality_id: '35f12028-73e4-4c7a-8333-1d156cc25956', // Default personality
        status: 'active',
        email_session_id: null
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test conversation: ${error.message}`);
    }

    testConversationId = conversation.id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testConversationId) {
      await supabase
        .from('conversation_messages')
        .delete()
        .eq('conversation_id', testConversationId);
      
      await supabase
        .from('conversations')
        .delete()
        .eq('id', testConversationId);
    }
  });

  it('should process speech2speech request end-to-end', async () => {
    // Mock audio data (base64)
    const mockAudioData = 'UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+...'; // Truncated for brevity

    const { data, error } = await supabase.functions.invoke('speech2speech-chat', {
      body: {
        audio: mockAudioData,
        conversationId: testConversationId,
        voice: 'alloy',
        language: 'ro'
      }
    });

    // Should not have errors
    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.success).toBe(true);

    // Should have required response fields
    expect(data.transcription).toBeDefined();
    expect(data.aiResponse).toBeDefined();
    expect(data.audioContent).toBeDefined();
    expect(data.metadata).toBeDefined();
    expect(data.metadata.conversationId).toBe(testConversationId);
  }, 30000); // 30 second timeout for API calls

  it('should store messages with display_in_ui=false', async () => {
    // The previous test should have created messages
    const { data: messages, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', testConversationId)
      .order('timestamp', { ascending: true });

    expect(error).toBeNull();
    expect(messages).toBeDefined();
    expect(messages!.length).toBeGreaterThanOrEqual(2); // User + Assistant message

    // All speech2speech messages should have display_in_ui=false
    for (const message of messages!) {
      const voiceMetadata = message.voice_metadata as any;
      if (voiceMetadata?.source === 'speech2speech') {
        expect(message.display_in_ui).toBe(false);
      }
    }
  });

  it('should handle invalid conversation ID', async () => {
    const mockAudioData = 'UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+';

    const { data, error } = await supabase.functions.invoke('speech2speech-chat', {
      body: {
        audio: mockAudioData,
        conversationId: '00000000-0000-0000-0000-000000000000', // Invalid ID
        voice: 'alloy',
        language: 'ro'
      }
    });

    expect(data).toBeDefined();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Conversation not found');
  });

  it('should handle malformed audio data', async () => {
    const { data, error } = await supabase.functions.invoke('speech2speech-chat', {
      body: {
        audio: 'invalid-base64-data',
        conversationId: testConversationId,
        voice: 'alloy',
        language: 'ro'
      }
    });

    expect(data).toBeDefined();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });

  it('should validate required fields', async () => {
    const { data, error } = await supabase.functions.invoke('speech2speech-chat', {
      body: {
        // Missing audio field
        conversationId: testConversationId,
        voice: 'alloy',
        language: 'ro'
      }
    });

    expect(data).toBeDefined();
    expect(data.success).toBe(false);
    expect(data.error).toContain('Audio este obligatoriu');
  });

  it('should validate voice parameter', async () => {
    const mockAudioData = 'UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+';

    const { data, error } = await supabase.functions.invoke('speech2speech-chat', {
      body: {
        audio: mockAudioData,
        conversationId: testConversationId,
        voice: 'invalid-voice', // Invalid voice
        language: 'ro'
      }
    });

    expect(data).toBeDefined();
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});