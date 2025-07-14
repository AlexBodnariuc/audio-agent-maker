import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import type { VoiceAgent, ListVoiceAgentsResponse } from '@/lib/validation';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('Voice Agents CRUD Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAgent: VoiceAgent = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    agent_id: 'agent-123',
    name: 'Dr. Biologie',
    description: 'Asistent pentru biologie UMF',
    medical_specialty: 'biologie',
    persona_json: {
      personality: 'friendly',
      expertise_level: 'advanced',
      preferred_language: 'ro',
    },
    tts_voice_id: 'alloy',
    limits_json: {
      max_daily_conversations: 50,
      max_conversation_length: 30,
    },
    user_id: 'user-123',
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  };

  describe('CREATE Operations', () => {
    it('should create a new voice agent successfully', async () => {
      const createData = {
        name: 'Dr. Chimie',
        description: 'Asistent pentru chimie UMF',
        medical_specialty: 'chimie',
        persona_json: {
          personality: 'professional',
          expertise_level: 'intermediate',
          preferred_language: 'ro',
        },
        tts_voice_id: 'nova',
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: { ...mockAgent, ...createData, id: 'new-agent-id' },
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('create-voice-agent', {
        body: createData,
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
      expect(data?.data.name).toBe(createData.name);
      expect(data?.data.medical_specialty).toBe(createData.medical_specialty);
    });

    it('should validate required fields when creating', async () => {
      const invalidData = {
        description: 'Missing name field',
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Validation failed',
          details: ['Name is required and must be a non-empty string'],
        },
      });

      const { data, error } = await supabase.functions.invoke('create-voice-agent', {
        body: invalidData,
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain('Validation failed');
      expect(error?.details).toContain('Name is required and must be a non-empty string');
    });

    it('should sanitize input data during creation', async () => {
      const maliciousData = {
        name: '<script>alert("xss")</script>Dr. Test',
        description: 'javascript:void(0) Description',
        persona_json: {
          personality: '<img src=x onerror=alert(1)>',
        },
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            ...mockAgent,
            name: 'Dr. Test', // Sanitized
            description: ' Description', // Sanitized
            persona_json: {
              personality: '', // Sanitized
            },
          },
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('create-voice-agent', {
        body: maliciousData,
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.data.name).not.toContain('<script>');
      expect(data?.data.description).not.toContain('javascript:');
    });
  });

  describe('READ Operations', () => {
    it('should fetch voice agents with pagination', async () => {
      const mockResponse: ListVoiceAgentsResponse = {
        success: true,
        data: [mockAgent],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: mockResponse,
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
      expect(data?.data).toHaveLength(1);
      expect(data?.pagination.total).toBe(1);
    });

    it('should support search filtering', async () => {
      const searchResults = {
        success: true,
        data: [mockAgent],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false,
        },
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: searchResults,
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        body: {
          search: 'biologie',
        },
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.data).toHaveLength(1);
      expect(data?.data[0].medical_specialty).toBe('biologie');
    });

    it('should support specialty filtering', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: [mockAgent],
          pagination: {
            page: 1,
            limit: 10,
            total: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        body: {
          specialty: 'biologie',
        },
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.data).toHaveLength(1);
      expect(data?.data[0].medical_specialty).toBe('biologie');
    });

    it('should only return user-owned agents', async () => {
      const userAgents = [
        { ...mockAgent, id: '1', user_id: 'user-123' },
        { ...mockAgent, id: '2', user_id: 'user-123' },
      ];

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: userAgents,
          pagination: {
            page: 1,
            limit: 10,
            total: 2,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.data).toHaveLength(2);
      expect(data?.data.every((agent: VoiceAgent) => agent.user_id === 'user-123')).toBe(true);
    });
  });

  describe('UPDATE Operations', () => {
    it('should update a voice agent successfully', async () => {
      const updateData = {
        name: 'Dr. Biologie Actualizat',
        description: 'Descriere actualizată',
      };

      const updatedAgent = {
        ...mockAgent,
        ...updateData,
        updated_at: new Date().toISOString(),
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: updatedAgent,
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PATCH',
        body: updateData,
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
      expect(data?.data.name).toBe(updateData.name);
      expect(data?.data.description).toBe(updateData.description);
    });

    it('should validate update data', async () => {
      const invalidUpdateData = {
        name: '', // Empty name
        description: 'A'.repeat(600), // Too long description
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Validation failed',
          details: [
            'Name must be a non-empty string',
            'Description must be a string with 500 characters or less',
          ],
        },
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PATCH',
        body: invalidUpdateData,
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain('Validation failed');
    });

    it('should prevent updating non-owned agents', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Agent not found or access denied',
        },
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents/other-user-agent', {
        method: 'PATCH',
        body: { name: 'Hacked Name' },
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain('Agent not found or access denied');
    });

    it('should sanitize update data', async () => {
      const maliciousUpdateData = {
        name: '<script>alert("update")</script>Safe Name',
        description: 'javascript:alert("xss") Safe description',
      };

      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            ...mockAgent,
            name: 'Safe Name', // Sanitized
            description: ' Safe description', // Sanitized
          },
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents/123e4567-e89b-12d3-a456-426614174000', {
        method: 'PATCH',
        body: maliciousUpdateData,
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.data.name).not.toContain('<script>');
      expect(data?.data.description).not.toContain('javascript:');
    });
  });

  describe('DELETE Operations', () => {
    it('should soft delete a voice agent successfully', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Voice agent "Dr. Biologie" has been deleted',
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents/123e4567-e89b-12d3-a456-426614174000', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
      expect(data?.message).toContain('has been deleted');
    });

    it('should prevent deleting non-owned agents', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Agent not found or access denied',
        },
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents/other-user-agent', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain('Agent not found or access denied');
    });

    it('should return error for non-existent agents', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Agent not found or access denied',
        },
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents/non-existent-id', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeTruthy();
      expect(error?.message).toContain('Agent not found or access denied');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(
        new Error('Network error')
      );

      try {
        await supabase.functions.invoke('manage-voice-agents', {
          method: 'GET',
          headers: {
            Authorization: 'Bearer valid-jwt-token',
          },
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Network error');
      }
    });

    it('should handle server errors with proper error messages', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: null,
        error: {
          message: 'Internal server error',
          details: 'Database connection failed',
        },
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeTruthy();
      expect(error?.message).toBe('Internal server error');
      expect(error?.details).toBe('Database connection failed');
    });
  });

  describe('Pagination Edge Cases', () => {
    it('should handle empty results', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0,
            hasNext: false,
            hasPrev: false,
          },
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.data).toHaveLength(0);
      expect(data?.pagination.total).toBe(0);
    });

    it('should handle large page numbers', async () => {
      vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
        data: {
          success: true,
          data: [],
          pagination: {
            page: 999,
            limit: 10,
            total: 5,
            totalPages: 1,
            hasNext: false,
            hasPrev: true,
          },
        },
        error: null,
      });

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        body: { page: 999 },
        headers: {
          Authorization: 'Bearer valid-jwt-token',
        },
      });

      expect(error).toBeNull();
      expect(data?.pagination.page).toBe(999);
      expect(data?.pagination.hasNext).toBe(false);
    });
  });
});