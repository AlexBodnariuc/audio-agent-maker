import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatStream } from '@/hooks/useChatStream';

// Mock the supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useChatStream Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful session
    vi.mocked(require('@/integrations/supabase/client').supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          access_token: 'mock-token',
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useChatStream());

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.sendMessage).toBe('function');
    expect(typeof result.current.clearMessages).toBe('function');
  });

  it('should add user message immediately when sending', async () => {
    // Mock successful streaming response
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"type":"partial","content":"Hello","role":"assistant"}\n\n')
        })
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"type":"done","message_id":"msg-123","full_content":"Hello there!"}\n\n')
        })
        .mockResolvedValueOnce({
          done: true,
          value: undefined
        })
    };

    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader
      }
    };

    mockFetch.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('conversation-123', 'Test message');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      content: 'Test message',
      role: 'user'
    });
    expect(result.current.messages[1]).toMatchObject({
      content: 'Hello there!',
      role: 'assistant',
      isStreaming: false
    });
  });

  it('should handle streaming partial content', async () => {
    let resolveRead: ((value: any) => void) | null = null;
    const readPromise = new Promise(resolve => {
      resolveRead = resolve;
    });

    const mockReader = {
      read: vi.fn().mockReturnValue(readPromise)
    };

    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader
      }
    };

    mockFetch.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useChatStream());

    // Start sending message
    const sendPromise = act(async () => {
      await result.current.sendMessage('conversation-123', 'Test message');
    });

    // Wait for initial setup
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].isStreaming).toBe(true);

    // Simulate partial content
    if (resolveRead) {
      resolveRead({
        done: false,
        value: new TextEncoder().encode('data: {"type":"partial","content":"Hello","role":"assistant"}\n\n')
      });
    }

    await sendPromise;
  });

  it('should handle streaming errors', async () => {
    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({
          done: false,
          value: new TextEncoder().encode('data: {"type":"error","error":"Test error"}\n\n')
        })
        .mockResolvedValueOnce({
          done: true,
          value: undefined
        })
    };

    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader
      }
    };

    mockFetch.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('conversation-123', 'Test message');
    });

    expect(result.current.error).toBe('Test error');
    expect(result.current.messages).toHaveLength(1); // Only user message remains
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle HTTP errors', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({
        error: { message: 'Bad request' }
      })
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('conversation-123', 'Test message');
    });

    expect(result.current.error).toBe('Bad request');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle authentication errors', async () => {
    // Mock failed session
    vi.mocked(require('@/integrations/supabase/client').supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: new Error('Authentication failed'),
    });

    const { result } = renderHook(() => useChatStream());

    await act(async () => {
      await result.current.sendMessage('conversation-123', 'Test message');
    });

    expect(result.current.error).toBe('Nu sunteți autentificat');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should prevent multiple concurrent streams', async () => {
    const mockReader = {
      read: vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
    };

    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader
      }
    };

    mockFetch.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useChatStream());

    // Start first stream
    act(() => {
      result.current.sendMessage('conversation-123', 'First message');
    });

    expect(result.current.isStreaming).toBe(true);

    // Try to start second stream while first is active
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    await act(async () => {
      await result.current.sendMessage('conversation-123', 'Second message (should be ignored)');
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith('Already streaming, ignoring new message');
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only called once

    consoleWarnSpy.mockRestore();
  });

  it('should clear messages and reset state', () => {
    const { result } = renderHook(() => useChatStream());

    // Add some messages first
    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('should abort ongoing requests when clearMessages is called', async () => {
    const abortSpy = vi.fn();
    const mockAbortController = {
      abort: abortSpy,
      signal: { aborted: false }
    };

    // Mock AbortController
    vi.stubGlobal('AbortController', vi.fn(() => mockAbortController));

    const mockReader = {
      read: vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
    };

    const mockResponse = {
      ok: true,
      status: 200,
      body: {
        getReader: () => mockReader
      }
    };

    mockFetch.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useChatStream());

    // Start streaming
    act(() => {
      result.current.sendMessage('conversation-123', 'Test message');
    });

    expect(result.current.isStreaming).toBe(true);

    // Clear messages (should abort)
    act(() => {
      result.current.clearMessages();
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);

    vi.unstubAllGlobals();
  });
});