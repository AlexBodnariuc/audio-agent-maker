import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSpeech2Speech } from '@/hooks/useSpeech2Speech';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn()
    }
  }
}));

// Mock MediaRecorder
const mockMediaRecorder = {
  start: vi.fn(),
  stop: vi.fn(),
  ondataavailable: null as ((event: any) => void) | null,
  onstop: null as (() => void) | null,
  state: 'inactive'
};

// Mock getUserMedia
const mockGetUserMedia = vi.fn();

// Mock FileReader
const mockFileReader = {
  readAsDataURL: vi.fn(),
  onloadend: null as (() => void) | null,
  result: 'data:audio/webm;base64,mockBase64Data'
};

// Mock Audio
const mockAudio = {
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  onended: null as (() => void) | null,
  onerror: null as (() => void) | null
};

describe('useSpeech2Speech', () => {
  const mockOptions = {
    conversationId: 'test-conversation-id',
    voice: 'alloy' as const,
    language: 'ro' as const,
    onTranscription: vi.fn(),
    onAIResponse: vi.fn(),
    onError: vi.fn()
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup global mocks
    global.MediaRecorder = vi.fn(() => mockMediaRecorder) as any;
    global.navigator = {
      ...global.navigator,
      mediaDevices: {
        getUserMedia: mockGetUserMedia
      }
    } as any;
    
    global.FileReader = vi.fn(() => mockFileReader) as any;
    global.Audio = vi.fn(() => mockAudio) as any;
    global.URL = {
      createObjectURL: vi.fn(() => 'mock-url'),
      revokeObjectURL: vi.fn()
    } as any;
    global.Blob = vi.fn() as any;
    global.atob = vi.fn(() => 'mock-binary-data');

    // Setup default successful responses
    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useSpeech2Speech(mockOptions));

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.transcription).toBe(null);
    expect(result.current.aiResponse).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should start recording successfully', async () => {
    const { result } = renderHook(() => useSpeech2Speech(mockOptions));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({
      audio: {
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    expect(result.current.isRecording).toBe(true);
    expect(mockMediaRecorder.start).toHaveBeenCalled();
  });

  it('should handle recording error', async () => {
    mockGetUserMedia.mockRejectedValue(new Error('Permission denied'));
    
    const { result } = renderHook(() => useSpeech2Speech(mockOptions));

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.error).toBe('Nu se poate accesa microfonul. Verificați permisiunile.');
    expect(mockOptions.onError).toHaveBeenCalledWith('Nu se poate accesa microfonul. Verificați permisiunile.');
  });

  it('should stop recording and process audio', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    
    // Mock successful API response
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        transcription: 'Salut, cum te cheamă?',
        aiResponse: 'Salut! Sunt asistentul tău medical.',
        audioContent: 'mockBase64AudioResponse'
      },
      error: null
    });

    const { result } = renderHook(() => useSpeech2Speech(mockOptions));

    // Start recording
    await act(async () => {
      await result.current.startRecording();
    });

    // Simulate recording stop
    await act(async () => {
      result.current.stopRecording();
      
      // Simulate MediaRecorder onstop callback
      if (mockMediaRecorder.onstop) {
        // Simulate FileReader onloadend
        setTimeout(() => {
          if (mockFileReader.onloadend) {
            mockFileReader.onloadend();
          }
        }, 0);
        
        mockMediaRecorder.onstop();
      }
    });

    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(result.current.isRecording).toBe(false);
  });

  it('should clear error', () => {
    const { result } = renderHook(() => useSpeech2Speech(mockOptions));

    // Set error state
    act(() => {
      result.current.startRecording();
    });

    // Clear error
    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBe(null);
  });

  it('should reset all state', async () => {
    const { result } = renderHook(() => useSpeech2Speech(mockOptions));

    // Start recording to change state
    await act(async () => {
      await result.current.startRecording();
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.isRecording).toBe(false);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.transcription).toBe(null);
    expect(result.current.aiResponse).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('should stop audio playback', () => {
    const { result } = renderHook(() => useSpeech2Speech(mockOptions));

    act(() => {
      result.current.stopAudio();
    });

    expect(result.current.isPlaying).toBe(false);
  });
});