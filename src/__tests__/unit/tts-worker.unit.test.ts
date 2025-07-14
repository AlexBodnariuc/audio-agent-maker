import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock TTS Worker functionality
interface TTSJob {
  id: string;
  text: string;
  voice_id: string;
  model: string;
  user_id: string | null;
  email_session_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  retry_count: number;
}

interface TTSWorkerResult {
  success: boolean;
  job_id: string;
  audio_url?: string;
  error?: string;
}

// Simulated TTS worker functions for testing
async function fetchSpeech(text: string, voice_id: string, model: string): Promise<ArrayBuffer> {
  // Mock ElevenLabs API call
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }
  
  // Simulate MP3 audio data
  const mockMp3Buffer = new Uint8Array([0xFF, 0xFB, 0x92, 0x00]); // Mock MP3 header
  return mockMp3Buffer.buffer;
}

async function uploadToStorage(
  supabase: any,
  audioBuffer: ArrayBuffer,
  fileName: string
): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from('voices-cache')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('voices-cache')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    throw new Error(`Storage upload failed: ${error}`);
  }
}

async function processTTSJob(supabase: any, job: TTSJob): Promise<TTSWorkerResult> {
  try {
    // Step 1: Generate speech using mock fetch
    const audioBuffer = await fetchSpeech(job.text, job.voice_id, job.model);
    
    // Step 2: Upload to storage
    const fileName = `${job.id}.mp3`;
    const audioUrl = await uploadToStorage(supabase, audioBuffer, fileName);
    
    // Step 3: Update job record
    const { error: updateError } = await supabase
      .from('tts_jobs')
      .update({
        status: 'completed',
        audio_url: audioUrl,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);

    if (updateError) throw updateError;

    return {
      success: true,
      job_id: job.id,
      audio_url: audioUrl
    };
  } catch (error: any) {
    // Mark job as failed
    await supabase
      .from('tts_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        retry_count: job.retry_count + 1
      })
      .eq('id', job.id);

    return {
      success: false,
      job_id: job.id,
      error: error.message
    };
  }
}

describe('TTS Worker Unit Tests', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      storage: {
        from: vi.fn().mockReturnThis(),
        upload: vi.fn(),
        getPublicUrl: vi.fn()
      },
      from: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn()
    };
  });

  describe('fetchSpeech', () => {
    it('should return MP3 buffer for valid text', async () => {
      const result = await fetchSpeech('Hello world', 'pNInz6obpgDQGcFmaJgB', 'eleven_multilingual_v2');
      
      expect(result).toBeInstanceOf(ArrayBuffer);
      expect(result.byteLength).toBeGreaterThan(0);
      
      // Check if it looks like MP3 data (starts with MP3 header)
      const view = new Uint8Array(result);
      expect(view[0]).toBe(0xFF);
      expect(view[1]).toBe(0xFB);
    });

    it('should throw error for empty text', async () => {
      await expect(fetchSpeech('', 'voice-id', 'model')).rejects.toThrow('Text cannot be empty');
      await expect(fetchSpeech('   ', 'voice-id', 'model')).rejects.toThrow('Text cannot be empty');
    });

    it('should handle different voice IDs and models', async () => {
      const voices = ['pNInz6obpgDQGcFmaJgB', 'EXAVITQu4vr4xnSDxMaL', 'N2lVS1w4EtoT3dr4eOWO'];
      const models = ['eleven_multilingual_v2', 'eleven_turbo_v2_5'];

      for (const voice of voices) {
        for (const model of models) {
          const result = await fetchSpeech('Test text', voice, model);
          expect(result).toBeInstanceOf(ArrayBuffer);
          expect(result.byteLength).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('uploadToStorage', () => {
    it('should upload MP3 buffer to voices-cache bucket with correct path', async () => {
      const mockBuffer = new Uint8Array([0xFF, 0xFB, 0x92, 0x00]).buffer;
      const jobId = 'test-job-123';
      const expectedPath = `${jobId}.mp3`;
      const expectedUrl = `https://project.supabase.co/storage/v1/object/public/voices-cache/${expectedPath}`;

      mockSupabase.storage.upload.mockResolvedValue({
        data: { path: expectedPath },
        error: null
      });

      mockSupabase.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: expectedUrl }
      });

      const result = await uploadToStorage(mockSupabase, mockBuffer, expectedPath);

      expect(mockSupabase.storage.from).toHaveBeenCalledWith('voices-cache');
      expect(mockSupabase.storage.upload).toHaveBeenCalledWith(
        expectedPath,
        mockBuffer,
        {
          contentType: 'audio/mpeg',
          upsert: true
        }
      );
      expect(mockSupabase.storage.getPublicUrl).toHaveBeenCalledWith(expectedPath);
      expect(result).toBe(expectedUrl);
    });

    it('should handle storage upload errors', async () => {
      const mockBuffer = new Uint8Array([1, 2, 3]).buffer;

      mockSupabase.storage.upload.mockResolvedValue({
        data: null,
        error: { message: 'Storage quota exceeded' }
      });

      await expect(uploadToStorage(mockSupabase, mockBuffer, 'test.mp3'))
        .rejects.toThrow('Storage upload failed');
    });

    it('should use upsert to overwrite existing files', async () => {
      const mockBuffer = new Uint8Array([1, 2, 3]).buffer;
      const fileName = 'existing-file.mp3';

      mockSupabase.storage.upload.mockResolvedValue({
        data: { path: fileName },
        error: null
      });

      mockSupabase.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: `https://example.com/${fileName}` }
      });

      await uploadToStorage(mockSupabase, mockBuffer, fileName);

      expect(mockSupabase.storage.upload).toHaveBeenCalledWith(
        fileName,
        mockBuffer,
        expect.objectContaining({ upsert: true })
      );
    });
  });

  describe('processTTSJob', () => {
    it('should successfully process TTS job and update audio_url', async () => {
      const job: TTSJob = {
        id: 'job-123',
        text: 'Salut! Cum te cheamă?',
        voice_id: 'pNInz6obpgDQGcFmaJgB',
        model: 'eleven_multilingual_v2',
        user_id: 'user-456',
        email_session_id: null,
        conversation_id: 'conv-789',
        message_id: 'msg-101',
        retry_count: 0
      };

      const expectedUrl = `https://project.supabase.co/storage/v1/object/public/voices-cache/${job.id}.mp3`;

      // Mock storage operations
      mockSupabase.storage.upload.mockResolvedValue({
        data: { path: `${job.id}.mp3` },
        error: null
      });

      mockSupabase.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: expectedUrl }
      });

      // Mock database update
      mockSupabase.eq.mockResolvedValue({ error: null });

      const result = await processTTSJob(mockSupabase, job);

      expect(result.success).toBe(true);
      expect(result.job_id).toBe(job.id);
      expect(result.audio_url).toBe(expectedUrl);

      // Verify storage operations
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('voices-cache');
      expect(mockSupabase.storage.upload).toHaveBeenCalledWith(
        `${job.id}.mp3`,
        expect.any(ArrayBuffer),
        { contentType: 'audio/mpeg', upsert: true }
      );

      // Verify database update
      expect(mockSupabase.from).toHaveBeenCalledWith('tts_jobs');
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'completed',
        audio_url: expectedUrl,
        completed_at: expect.any(String)
      });
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', job.id);
    });

    it('should handle TTS generation failures', async () => {
      const job: TTSJob = {
        id: 'job-456',
        text: '', // Empty text will cause failure
        voice_id: 'voice-id',
        model: 'model',
        user_id: 'user-123',
        email_session_id: null,
        conversation_id: null,
        message_id: null,
        retry_count: 1
      };

      // Mock database update for failed job
      mockSupabase.eq.mockResolvedValue({ error: null });

      const result = await processTTSJob(mockSupabase, job);

      expect(result.success).toBe(false);
      expect(result.job_id).toBe(job.id);
      expect(result.error).toContain('Text cannot be empty');

      // Verify failed job update
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'failed',
        error_message: expect.stringContaining('Text cannot be empty'),
        retry_count: 2
      });
    });

    it('should handle storage upload failures', async () => {
      const job: TTSJob = {
        id: 'job-789',
        text: 'Valid text',
        voice_id: 'voice-id',
        model: 'model',
        user_id: 'user-123',
        email_session_id: null,
        conversation_id: null,
        message_id: null,
        retry_count: 0
      };

      // Mock storage failure
      mockSupabase.storage.upload.mockResolvedValue({
        data: null,
        error: { message: 'Storage error' }
      });

      // Mock database update
      mockSupabase.eq.mockResolvedValue({ error: null });

      const result = await processTTSJob(mockSupabase, job);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage upload failed');

      // Verify retry count increment
      expect(mockSupabase.update).toHaveBeenCalledWith({
        status: 'failed',
        error_message: expect.stringContaining('Storage upload failed'),
        retry_count: 1
      });
    });

    it('should process jobs with different languages', async () => {
      const jobs = [
        { text: 'Hello world', expected: 'english' },
        { text: 'Salut, cum te cheamă?', expected: 'romanian' },
        { text: 'Hola, ¿cómo estás?', expected: 'spanish' },
        { text: 'Bonjour, comment allez-vous?', expected: 'french' }
      ];

      for (const { text } of jobs) {
        const job: TTSJob = {
          id: `job-${Date.now()}`,
          text,
          voice_id: 'pNInz6obpgDQGcFmaJgB',
          model: 'eleven_multilingual_v2',
          user_id: 'user-123',
          email_session_id: null,
          conversation_id: null,
          message_id: null,
          retry_count: 0
        };

        // Mock successful storage operations
        mockSupabase.storage.upload.mockResolvedValue({
          data: { path: `${job.id}.mp3` },
          error: null
        });

        mockSupabase.storage.getPublicUrl.mockReturnValue({
          data: { publicUrl: `https://example.com/${job.id}.mp3` }
        });

        mockSupabase.eq.mockResolvedValue({ error: null });

        const result = await processTTSJob(mockSupabase, job);

        expect(result.success).toBe(true);
        expect(result.audio_url).toMatch(/\.mp3$/);
      }
    });
  });
});