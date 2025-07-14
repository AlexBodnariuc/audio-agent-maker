import { describe, it, expect } from '@jest/globals';
import { createVoiceAgentRequestSchema, type CreateVoiceAgentRequest } from '../lib/validation';

describe('Voice Agent Validation', () => {
  describe('createVoiceAgentRequestSchema', () => {
    it('should validate a minimal valid voice agent request', () => {
      const validRequest = {
        name: 'Dr. Maria'
      };

      const result = createVoiceAgentRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.name).toBe('Dr. Maria');
        expect(result.data.persona_json.preferred_language).toBe('ro');
        expect(result.data.limits_json).toEqual({});
      }
    });

    it('should validate a complete voice agent request', () => {
      const validRequest: CreateVoiceAgentRequest = {
        name: 'Dr. Popescu',
        description: 'Specialist în biologie pentru elevi',
        medical_specialty: 'biologie',
        persona_json: {
          personality: 'prietenos și înțelegător',
          communication_style: 'informal dar profesional',
          expertise_level: 'intermediate',
          preferred_language: 'ro',
          teaching_approach: 'interactiv cu exemple practice'
        },
        tts_voice_id: 'alloy',
        limits_json: {
          max_daily_conversations: 50,
          max_conversation_length: 30,
          allowed_topics: ['biologie', 'anatomie'],
          restricted_topics: ['tratamente medicale']
        }
      };

      const result = createVoiceAgentRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.name).toBe('Dr. Popescu');
        expect(result.data.description).toBe('Specialist în biologie pentru elevi');
        expect(result.data.medical_specialty).toBe('biologie');
        expect(result.data.tts_voice_id).toBe('alloy');
      }
    });

    it('should reject empty name', () => {
      const invalidRequest = {
        name: ''
      };

      const result = createVoiceAgentRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Numele este obligatoriu');
      }
    });

    it('should reject name that is too long', () => {
      const invalidRequest = {
        name: 'A'.repeat(101) // 101 characters
      };

      const result = createVoiceAgentRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('100 de caractere');
      }
    });

    it('should reject description that is too long', () => {
      const invalidRequest = {
        name: 'Dr. Test',
        description: 'A'.repeat(501) // 501 characters
      };

      const result = createVoiceAgentRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('500 de caractere');
      }
    });

    it('should reject invalid TTS voice ID', () => {
      const invalidRequest = {
        name: 'Dr. Test',
        tts_voice_id: 'invalid_voice'
      };

      const result = createVoiceAgentRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Vocea selectată este invalidă');
      }
    });

    it('should normalize invalid medical specialty to null', () => {
      const requestWithInvalidSpecialty = {
        name: 'Dr. Test',
        medical_specialty: 'invalid_specialty'
      };

      const result = createVoiceAgentRequestSchema.safeParse(requestWithInvalidSpecialty);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.medical_specialty).toBe(null);
      }
    });

    it('should accept valid medical specialties', () => {
      const validSpecialties = ['biologie', 'chimie', 'anatomie', 'medicina generala'];
      
      for (const specialty of validSpecialties) {
        const request = {
          name: 'Dr. Test',
          medical_specialty: specialty
        };

        const result = createVoiceAgentRequestSchema.safeParse(request);
        expect(result.success).toBe(true);
        
        if (result.success) {
          expect(result.data.medical_specialty).toBe(specialty);
        }
      }
    });

    it('should trim whitespace from name and description', () => {
      const request = {
        name: '  Dr. Test  ',
        description: '  Test description  '
      };

      const result = createVoiceAgentRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.name).toBe('Dr. Test');
        expect(result.data.description).toBe('Test description');
      }
    });
  });
});