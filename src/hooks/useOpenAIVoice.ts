import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface VoiceSession {
  conversationId: string;
  threadId?: string;
  assistantId?: string;
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
}

interface OpenAIVoiceHookOptions {
  onTranscription?: (text: string) => void;
  onResponse?: (text: string, audio?: string) => void;
  onError?: (error: string) => void;
  useVoice?: boolean;
  voice?: string;
}

export const useOpenAIVoice = (options: OpenAIVoiceHookOptions = {}) => {
  const { toast } = useToast();
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  const {
    onTranscription,
    onResponse,
    onError,
    useVoice = true,
    voice = 'alloy'
  } = options;

  const startSession = useCallback(async (conversationId: string) => {
    try {
      setSession({
        conversationId,
        isListening: false,
        isProcessing: false,
        isSpeaking: false
      });

      // Create OpenAI assistant thread
      const { data, error } = await supabase.functions.invoke('openai-conversation-assistant', {
        body: {
          conversationId,
          action: 'create_thread'
        }
      });

      if (error) throw error;

      setSession(prev => prev ? {
        ...prev,
        threadId: data.data.threadId,
        assistantId: data.data.assistantId
      } : null);

      toast({
        title: "AI Voice Assistant Ready",
        description: "You can now start speaking or typing messages",
      });

    } catch (error) {
      console.error('Error starting OpenAI voice session:', error);
      onError?.(error.message);
      toast({
        title: "Error",
        description: "Failed to start AI voice session",
        variant: "destructive",
      });
    }
  }, [toast, onError]);

  const endSession = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    setSession(null);
    setMessages([]);
    
    toast({
      title: "Session Ended",
      description: "AI voice session has been terminated",
    });
  }, [toast]);

  const startListening = useCallback(async () => {
    if (!session) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudioBlob(audioBlob);
      };

      mediaRecorderRef.current.start();
      setSession(prev => prev ? { ...prev, isListening: true } : null);

    } catch (error) {
      console.error('Error starting voice recording:', error);
      onError?.('Failed to access microphone');
      toast({
        title: "Microphone Error",
        description: "Failed to access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [session, onError, toast]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setSession(prev => prev ? { ...prev, isListening: false } : null);
  }, []);

  const processAudioBlob = useCallback(async (audioBlob: Blob) => {
    if (!session?.conversationId) return;

    try {
      setSession(prev => prev ? { ...prev, isProcessing: true } : null);

      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      // Transcribe audio
      const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke('openai-speech-to-text', {
        body: {
          audio: base64Audio,
          conversationId: session.conversationId,
          language: 'en'
        }
      });

      if (transcriptionError) throw transcriptionError;

      const transcription = transcriptionData.text;
      onTranscription?.(transcription);

      // Add user message to local state
      const userMessage = {
        role: 'user' as const,
        content: transcription,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // Send to OpenAI assistant if we have a thread
      if (session.threadId) {
        await processWithAssistant(transcription);
      } else {
        // Fallback to direct chat
        await processWithDirectChat(transcription);
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      onError?.(error.message);
    } finally {
      setSession(prev => prev ? { ...prev, isProcessing: false } : null);
    }
  }, [session, onTranscription, onError]);

  const processWithAssistant = useCallback(async (message: string) => {
    if (!session?.conversationId || !session.threadId) return;

    try {
      // Send message to assistant
      const { data: runData, error: runError } = await supabase.functions.invoke('openai-conversation-assistant', {
        body: {
          conversationId: session.conversationId,
          action: 'send_message',
          message,
          threadId: session.threadId
        }
      });

      if (runError) throw runError;

      // Poll for completion
      const runId = runData.data.runId;
      await pollForCompletion(runId);

    } catch (error) {
      console.error('Error processing with assistant:', error);
      onError?.(error.message);
    }
  }, [session, onError]);

  const pollForCompletion = useCallback(async (runId: string) => {
    if (!session?.threadId) return;

    const maxAttempts = 30; // 30 seconds timeout
    let attempts = 0;

    const poll = async (): Promise<void> => {
      try {
        const { data, error } = await supabase.functions.invoke('openai-conversation-assistant', {
          body: {
            conversationId: session.conversationId,
            action: 'get_status',
            threadId: session.threadId,
            runId
          }
        });

        if (error) throw error;

        const status = data.data.status;

        if (status === 'completed') {
          const responseText = data.data.message;
          
          // Add assistant message to local state
          const assistantMessage = {
            role: 'assistant' as const,
            content: responseText,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, assistantMessage]);

          // Generate speech if voice is enabled
          if (useVoice && responseText) {
            await generateAndPlaySpeech(responseText);
          }

          onResponse?.(responseText);
          return;
        }

        if (status === 'failed' || status === 'cancelled' || status === 'expired') {
          throw new Error(`Assistant run ${status}`);
        }

        // Continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
        } else {
          throw new Error('Assistant response timeout');
        }

      } catch (error) {
        console.error('Error polling assistant status:', error);
        onError?.(error.message);
      }
    };

    poll();
  }, [session, useVoice, onResponse, onError]);

  const processWithDirectChat = useCallback(async (message: string) => {
    if (!session?.conversationId) return;

    try {
      const { data, error } = await supabase.functions.invoke('openai-voice-chat', {
        body: {
          conversationId: session.conversationId,
          message,
          useVoice,
          voice
        }
      });

      if (error) throw error;

      const responseText = data.response;
      const audioContent = data.audioContent;

      // Add assistant message to local state
      const assistantMessage = {
        role: 'assistant' as const,
        content: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Play audio if available
      if (audioContent) {
        await playAudioFromBase64(audioContent);
      }

      onResponse?.(responseText, audioContent);

    } catch (error) {
      console.error('Error processing with direct chat:', error);
      onError?.(error.message);
    }
  }, [session, useVoice, voice, onResponse, onError]);

  const generateAndPlaySpeech = useCallback(async (text: string) => {
    try {
      setSession(prev => prev ? { ...prev, isSpeaking: true } : null);

      const { data, error } = await supabase.functions.invoke('openai-voice-chat', {
        body: {
          conversationId: session?.conversationId,
          message: '', // Empty message for TTS only
          useVoice: true,
          voice,
          ttsOnly: true,
          text // Add the text to convert
        }
      });

      if (error) throw error;

      if (data.audioContent) {
        await playAudioFromBase64(data.audioContent);
      }

    } catch (error) {
      console.error('Error generating speech:', error);
    } finally {
      setSession(prev => prev ? { ...prev, isSpeaking: false } : null);
    }
  }, [session, voice]);

  const playAudioFromBase64 = useCallback(async (base64Audio: string) => {
    try {
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < audioData.length; i++) {
        uint8Array[i] = audioData.charCodeAt(i);
      }

      const blob = new Blob([arrayBuffer], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(blob);

      if (audioElementRef.current) {
        audioElementRef.current.src = audioUrl;
        await audioElementRef.current.play();
      } else {
        audioElementRef.current = new Audio(audioUrl);
        await audioElementRef.current.play();
      }

    } catch (error) {
      console.error('Error playing audio:', error);
    }
  }, []);

  const sendTextMessage = useCallback(async (text: string) => {
    if (!session?.conversationId) return;

    try {
      setSession(prev => prev ? { ...prev, isProcessing: true } : null);

      // Add user message to local state
      const userMessage = {
        role: 'user' as const,
        content: text,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // Process with assistant or direct chat
      if (session.threadId) {
        await processWithAssistant(text);
      } else {
        await processWithDirectChat(text);
      }

    } catch (error) {
      console.error('Error sending text message:', error);
      onError?.(error.message);
    } finally {
      setSession(prev => prev ? { ...prev, isProcessing: false } : null);
    }
  }, [session, processWithAssistant, processWithDirectChat, onError]);

  return {
    session,
    messages,
    startSession,
    endSession,
    startListening,
    stopListening,
    sendTextMessage,
    isListening: session?.isListening || false,
    isProcessing: session?.isProcessing || false,
    isSpeaking: session?.isSpeaking || false,
    isConnected: !!session
  };
};