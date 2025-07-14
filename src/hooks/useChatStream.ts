
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ChatMessage {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  isStreaming?: boolean;
}

interface StreamChunk {
  type: 'partial' | 'done' | 'error';
  content?: string;
  role?: 'assistant';
  conversation_id?: string;
  message_id?: string;
  full_content?: string;
  error?: string;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (conversationId: string, text: string) => Promise<void>;
  clearMessages: () => void;
}

export const useChatStream = (): UseChatStreamReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentStreamingMessageRef = useRef<string>('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const sendMessage = useCallback(async (conversationId: string, text: string) => {
    if (isStreaming) {
      console.warn('Already streaming, ignoring new message');
      return;
    }

    setError(null);
    setIsStreaming(true);
    currentStreamingMessageRef.current = '';

    // Add user message immediately
    const userMessage: ChatMessage = {
      content: text,
      role: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);

    // Add placeholder for assistant message that will be streamed
    const assistantPlaceholder: ChatMessage = {
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      isStreaming: true
    };

    setMessages(prev => [...prev, assistantPlaceholder]);

    try {
      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      console.log('Starting chat stream request...');

      // For demo purposes, we'll call the edge function without authentication
      // but pass the conversation_id which contains the demo session
      const response = await fetch(
        `https://ybdvhqmjlztlvrfurkaf.supabase.co/functions/v1/openai-chat-stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InliZHZocW1qbHp0bHZyZnVya2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkwNjE2MTcsImV4cCI6MjA2NDYzNzYxN30.UrS172jVmUo5XEEl0BrevGjwg2pwu0T8Jss3p3gxMrg'
          },
          body: JSON.stringify({
            conversation_id: conversationId,
            text: text
          }),
          signal: abortControllerRef.current.signal
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Nu s-a primit stream de la server');
      }

      console.log('Stream established, processing chunks...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('Stream completed');
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: StreamChunk = JSON.parse(line.slice(6));
              
              if (data.type === 'partial' && data.content) {
                // Accumulate streaming content
                currentStreamingMessageRef.current += data.content;
                
                // Update the last message (assistant placeholder) with accumulated content
                setMessages(prev => {
                  const updated = [...prev];
                  if (updated[updated.length - 1]?.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1],
                      content: currentStreamingMessageRef.current,
                      isStreaming: true
                    };
                  }
                  return updated;
                });
                
              } else if (data.type === 'done') {
                console.log('Stream completed with full content');
                
                // Update the last message with final content and remove streaming flag
                setMessages(prev => {
                  const updated = [...prev];
                  if (updated[updated.length - 1]?.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...updated[updated.length - 1],
                      id: data.message_id,
                      content: data.full_content || currentStreamingMessageRef.current,
                      isStreaming: false
                    };
                  }
                  return updated;
                });
                
              } else if (data.type === 'error') {
                console.error('Stream error:', data.error);
                setError(data.error || 'Eroare în procesarea răspunsului');
                
                // Remove the placeholder assistant message on error
                setMessages(prev => prev.filter((_, index) => index !== prev.length - 1));
              }
              
            } catch (parseError) {
              console.error('Error parsing stream data:', parseError);
            }
          }
        }
      }

    } catch (err: any) {
      console.error('Chat stream error:', err);
      
      if (err.name === 'AbortError') {
        console.log('Stream aborted by user');
      } else {
        setError(err.message || 'Eroare în conectarea la serviciul de chat');
        
        // Remove the placeholder assistant message on error
        setMessages(prev => prev.filter((_, index) => index !== prev.length - 1));
      }
    } finally {
      setIsStreaming(false);
      currentStreamingMessageRef.current = '';
      abortControllerRef.current = null;
    }
  }, [isStreaming]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    
    // Abort any ongoing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    clearMessages
  };
};
