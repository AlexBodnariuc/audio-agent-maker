import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  buildContextSummary, 
  fetchUserContext,
  type UserContext,
  type AgentPersona 
} from '../../../supabase/functions/_shared/context-builder';

describe('Context Builder Unit Tests', () => {
  describe('buildContextSummary', () => {
    it('should return "nespecificat" when user has no progress data', () => {
      const emptyContext: UserContext = {
        user_id: 'test-user',
        email: null,
        learning_style: null,
        difficulty_preference: null,
        language_preference: null,
        daily_goal: null,
        total_xp: null,
        current_level: null,
        current_streak: null,
        longest_streak: null,
        last_activity_date: null,
        knowledge_areas: [],
        recent_quiz_performance: [],
        learning_level: null,
        specialty_focus: null,
        completed_topics: null,
        recommended_topics: null,
        learning_path_style: null,
        recent_conversations: [],
        total_achievements: null,
        context_generated_at: new Date().toISOString()
      };

      const summary = buildContextSummary(emptyContext);
      expect(summary).toMatch(/nedefinit|nespecificat/);
    });

    it('should contain real values when user has progress data', () => {
      const contextWithProgress: UserContext = {
        user_id: 'test-user',
        email: 'test@medmentor.ro',
        learning_style: 'visual',
        difficulty_preference: 'intermediar',
        language_preference: 'ro',
        daily_goal: 30,
        total_xp: 1250,
        current_level: 5,
        current_streak: 7,
        longest_streak: 12,
        last_activity_date: '2025-01-10',
        knowledge_areas: [
          { subject: 'Biologie', proficiency_level: 4, interest_level: 5 },
          { subject: 'Chimie', proficiency_level: 3, interest_level: 4 }
        ],
        recent_quiz_performance: [
          {
            id: 'quiz-1',
            title: 'Test Biologie',
            score: 85,
            xp_earned: 25,
            completed_at: '2025-01-09T10:00:00Z',
            total_questions: 20
          }
        ],
        learning_level: 'intermediar',
        specialty_focus: 'UMF admitere',
        completed_topics: ['celula', 'metabolism'],
        recommended_topics: ['genetica', 'ecologie'],
        learning_path_style: 'progresiv',
        recent_conversations: [
          {
            id: 'conv-1',
            title: 'Discuție despre ADN',
            specialty_focus: 'biologie',
            started_at: '2025-01-08T15:30:00Z',
            total_messages: 12
          }
        ],
        total_achievements: 3,
        context_generated_at: new Date().toISOString()
      };

      const summary = buildContextSummary(contextWithProgress);
      
      expect(summary).toContain('1250 XP');
      expect(summary).toContain('nivel 5');
      expect(summary).toContain('streak curent 7');
      expect(summary).toContain('visual');
      expect(summary).toContain('intermediar');
      expect(summary).toContain('Biologie');
      expect(summary).toContain('scor mediu 85');
    });
  });

  // Note: buildPersonalizedPrompt will be tested when implemented

  describe('fetchUserContext', () => {
    let mockSupabase: any;

    beforeEach(() => {
      mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn()
      };
    });

    it('should fetch user context by user_id', async () => {
      const mockContext = {
        user_id: 'test-user',
        email: 'test@example.com',
        total_xp: 100
      };

      mockSupabase.single.mockResolvedValue({
        data: mockContext,
        error: null
      });

      const result = await fetchUserContext(mockSupabase, 'test-user', 'user_id');

      expect(mockSupabase.from).toHaveBeenCalledWith('v_agent_context');
      expect(mockSupabase.select).toHaveBeenCalledWith('*');
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'test-user');
      expect(result).toEqual(mockContext);
    });

    it('should fetch user context by email', async () => {
      const mockContext = {
        user_id: 'test-user',
        email: 'test@example.com',
        total_xp: 100
      };

      mockSupabase.single.mockResolvedValue({
        data: mockContext,
        error: null
      });

      const result = await fetchUserContext(mockSupabase, 'test@example.com', 'email');

      expect(mockSupabase.eq).toHaveBeenCalledWith('email', 'test@example.com');
      expect(result).toEqual(mockContext);
    });

    it('should return null on database error', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      });

      const result = await fetchUserContext(mockSupabase, 'test-user');

      expect(result).toBeNull();
    });

    it('should handle exceptions gracefully', async () => {
      mockSupabase.single.mockRejectedValue(new Error('Network error'));

      const result = await fetchUserContext(mockSupabase, 'test-user');

      expect(result).toBeNull();
    });
  });
});