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
    const currentSession = session;
    if (!currentSession) {
      console.warn('Cannot start listening: no active session');
      return;
    }

    try {
      console.log('Starting voice recording...');
      
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
        console.log('Audio data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        console.log('Recording stopped, processing audio...');
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log('Audio blob created:', audioBlob.size, 'bytes');
        
        // Process audio without blocking and without circular dependency
        processAudioBlobInternal(audioBlob).catch(error => {
          console.error('Error processing audio:', error);
          onError?.(error.message || 'Failed to process audio');
        });
      };

      mediaRecorderRef.current.start();
      setSession(prev => prev ? { ...prev, isListening: true } : null);
      console.log('Recording started successfully');

    } catch (error) {
      console.error('Error starting voice recording:', error);
      onError?.('Failed to access microphone');
      toast({
        title: "Microphone Error",
        description: "Failed to access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  }, [session?.conversationId]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setSession(prev => prev ? { ...prev, isListening: false } : null);
  }, []);

  // Internal audio processing without circular dependencies
  const processAudioBlobInternal = async (audioBlob: Blob) => {
    const currentSession = session;
    if (!currentSession?.conversationId) {
      console.warn('Cannot process audio: no active session');
      return;
    }

    try {
      console.log('Processing audio blob...');
      setSession(prev => prev ? { ...prev, isProcessing: true } : null);

      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      console.log('Audio converted to base64, length:', base64Audio.length);

      // Transcribe audio
      console.log('Sending audio for transcription...');
      const { data: transcriptionData, error: transcriptionError } = await supabase.functions.invoke('openai-speech-to-text', {
        body: {
          audio: base64Audio,
          conversationId: currentSession.conversationId,
          language: 'en'
        }
      });

      if (transcriptionError) {
        console.error('Transcription error:', transcriptionError);
        throw transcriptionError;
      }

      const transcription = transcriptionData?.text || '';
      console.log('Transcription received:', transcription);
      
      if (!transcription.trim()) {
        console.warn('Empty transcription received');
        toast({
          title: "No Speech Detected",
          description: "Please try speaking more clearly.",
          variant: "destructive",
        });
        return;
      }

      onTranscription?.(transcription);

      // Add user message to local state
      const userMessage = {
        role: 'user' as const,
        content: transcription,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // Send to OpenAI assistant if we have a thread
      if (currentSession.threadId) {
        console.log('Processing with assistant...');
        await processWithAssistantInternal(transcription, currentSession);
      } else {
        console.log('Processing with direct chat...');
        await processWithDirectChatInternal(transcription, currentSession);
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      onError?.(error.message || 'Failed to process audio');
      toast({
        title: "Processing Error",
        description: "Failed to process voice input. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSession(prev => prev ? { ...prev, isProcessing: false } : null);
    }
  };

  const processAudioBlob = useCallback(async (audioBlob: Blob) => {
    await processAudioBlobInternal(audioBlob);
  }, [session?.conversationId]);

  // Internal assistant processing without circular dependencies
  const processWithAssistantInternal = async (message: string, currentSession: VoiceSession) => {
    if (!currentSession?.conversationId || !currentSession.threadId) {
      console.warn('Cannot process with assistant: missing session data');
      return;
    }

    try {
      console.log('Sending message to assistant...');
      // Send message to assistant
      const { data: runData, error: runError } = await supabase.functions.invoke('openai-conversation-assistant', {
        body: {
          conversationId: currentSession.conversationId,
          action: 'send_message',
          message,
          threadId: currentSession.threadId
        }
      });

      if (runError) {
        console.error('Assistant run error:', runError);
        throw runError;
      }

      // Poll for completion
      const runId = runData.data?.runId;
      if (runId) {
        console.log('Polling for completion, runId:', runId);
        await pollForCompletionInternal(runId, currentSession);
      } else {
        throw new Error('No run ID received from assistant');
      }

    } catch (error) {
      console.error('Error processing with assistant:', error);
      onError?.(error.message || 'Assistant processing failed');
    }
  };

  const processWithAssistant = useCallback(async (message: string) => {
    const currentSession = session;
    if (currentSession) {
      await processWithAssistantInternal(message, currentSession);
    }
  }, [session?.conversationId, session?.threadId]);

  // Internal polling without circular dependencies
  const pollForCompletionInternal = async (runId: string, currentSession: VoiceSession) => {
    if (!currentSession?.threadId) {
      console.warn('Cannot poll: missing thread ID');
      return;
    }

    const maxAttempts = 30; // 30 seconds timeout
    let attempts = 0;

    const poll = async (): Promise<void> => {
      try {
        console.log(`Polling attempt ${attempts + 1}/${maxAttempts}`);
        const { data, error } = await supabase.functions.invoke('openai-conversation-assistant', {
          body: {
            conversationId: currentSession.conversationId,
            action: 'get_status',
            threadId: currentSession.threadId,
            runId
          }
        });

        if (error) {
          console.error('Polling error:', error);
          throw error;
        }

        const status = data.data?.status;
        console.log('Assistant status:', status);

        if (status === 'completed') {
          const responseText = data.data?.message;
          console.log('Assistant response:', responseText);
          
          if (responseText) {
            // Add assistant message to local state
            const assistantMessage = {
              role: 'assistant' as const,
              content: responseText,
              timestamp: new Date()
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Generate speech if voice is enabled
            if (useVoice && responseText) {
              console.log('Generating speech for response...');
              await generateAndPlaySpeechInternal(responseText);
            }

            onResponse?.(responseText);
          } else {
            console.warn('No response text received from assistant');
          }
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
        onError?.(error.message || 'Polling failed');
      }
    };

    poll();
  };

  const pollForCompletion = useCallback(async (runId: string) => {
    const currentSession = session;
    if (currentSession) {
      await pollForCompletionInternal(runId, currentSession);
    }
  }, [session?.conversationId, session?.threadId]);

  // Internal direct chat processing without circular dependencies
  const processWithDirectChatInternal = async (message: string, currentSession: VoiceSession) => {
    if (!currentSession?.conversationId) {
      console.warn('Cannot process with direct chat: missing conversation ID');
      return;
    }

    try {
      console.log('Processing with direct chat...');
      const { data, error } = await supabase.functions.invoke('openai-voice-chat', {
        body: {
          conversationId: currentSession.conversationId,
          message,
          useVoice,
          voice
        }
      });

      if (error) {
        console.error('Direct chat error:', error);
        throw error;
      }

      const responseText = data?.response;
      const audioContent = data?.audioContent;
      console.log('Direct chat response:', responseText);

      if (responseText) {
        // Add assistant message to local state
        const assistantMessage = {
          role: 'assistant' as const,
          content: responseText,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);

        // Play audio if available
        if (audioContent) {
          console.log('Playing audio response...');
          await playAudioFromBase64(audioContent);
        }

        onResponse?.(responseText, audioContent);
      } else {
        console.warn('No response text received from direct chat');
      }

    } catch (error) {
      console.error('Error processing with direct chat:', error);
      onError?.(error.message || 'Direct chat processing failed');
    }
  };

  const processWithDirectChat = useCallback(async (message: string) => {
    const currentSession = session;
    if (currentSession) {
      await processWithDirectChatInternal(message, currentSession);
    }
  }, [session?.conversationId, useVoice, voice]);

  // Internal speech generation without circular dependencies
  const generateAndPlaySpeechInternal = async (text: string) => {
    const currentSession = session;
    if (!currentSession?.conversationId) {
      console.warn('Cannot generate speech: no active session');
      return;
    }

    try {
      console.log('Generating speech...');
      setSession(prev => prev ? { ...prev, isSpeaking: true } : null);

      const { data, error } = await supabase.functions.invoke('openai-voice-chat', {
        body: {
          conversationId: currentSession.conversationId,
          message: '', // Empty message for TTS only
          useVoice: true,
          voice,
          ttsOnly: true,
          text // Add the text to convert
        }
      });

      if (error) {
        console.error('Speech generation error:', error);
        throw error;
      }

      if (data?.audioContent) {
        console.log('Playing generated speech...');
        await playAudioFromBase64(data.audioContent);
      } else {
        console.warn('No audio content received from TTS');
      }

    } catch (error) {
      console.error('Error generating speech:', error);
    } finally {
      setSession(prev => prev ? { ...prev, isSpeaking: false } : null);
    }
  };

  const generateAndPlaySpeech = useCallback(async (text: string) => {
    await generateAndPlaySpeechInternal(text);
  }, [session?.conversationId, voice]);

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
    const currentSession = session;
    if (!currentSession?.conversationId) return;

    try {
      setSession(prev => prev ? { ...prev, isProcessing: true } : null);

      // Add user message to local state
      const userMessage = {
        role: 'user' as const,
        content: text,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // Process with assistant or direct chat using internal functions directly
      if (currentSession.threadId) {
        await processWithAssistantInternal(text, currentSession);
      } else {
        await processWithDirectChatInternal(text, currentSession);
      }

    } catch (error) {
      console.error('Error sending text message:', error);
      onError?.(error.message);
    } finally {
      setSession(prev => prev ? { ...prev, isProcessing: false } : null);
    }
  }, [session?.conversationId, session?.threadId]);

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