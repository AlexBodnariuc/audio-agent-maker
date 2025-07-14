import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Speech2SpeechOptions {
  conversationId: string;
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  language?: 'ro' | 'en';
  onTranscription?: (text: string) => void;
  onAIResponse?: (text: string) => void;
  onError?: (error: string) => void;
}

export interface Speech2SpeechState {
  isRecording: boolean;
  isProcessing: boolean;
  isPlaying: boolean;
  transcription: string | null;
  aiResponse: string | null;
  error: string | null;
}

export const useSpeech2Speech = (options: Speech2SpeechOptions) => {
  const [state, setState] = useState<Speech2SpeechState>({
    isRecording: false,
    isProcessing: false,
    isPlaying: false,
    transcription: null,
    aiResponse: null,
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null, transcription: null, aiResponse: null }));
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudio(audioBlob);
        
        // Clean up stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      
      setState(prev => ({ ...prev, isRecording: true }));
    } catch (error) {
      console.error('Error starting recording:', error);
      const errorMessage = 'Nu se poate accesa microfonul. Verificați permisiunile.';
      setState(prev => ({ ...prev, error: errorMessage }));
      options.onError?.(errorMessage);
    }
  }, [options]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      setState(prev => ({ ...prev, isRecording: false, isProcessing: true }));
    }
  }, [state.isRecording]);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const base64Audio = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(audioBlob);
      });

      console.log('Speech2Speech: Sending audio to server');

      // Call speech2speech edge function
      const { data, error } = await supabase.functions.invoke('speech2speech-chat', {
        body: {
          audio: base64Audio,
          conversationId: options.conversationId,
          voice: options.voice || 'alloy',
          language: options.language || 'ro',
        }
      });

      if (error) {
        throw new Error(error.message || 'Speech2Speech processing failed');
      }

      const { transcription, aiResponse, audioContent } = data;

      setState(prev => ({
        ...prev,
        transcription,
        aiResponse,
        isProcessing: false
      }));

      // Notify callbacks
      options.onTranscription?.(transcription);
      options.onAIResponse?.(aiResponse);

      // Play audio response
      await playAudioResponse(audioContent);

    } catch (error) {
      console.error('Error processing audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Eroare la procesarea audio';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isProcessing: false
      }));
      options.onError?.(errorMessage);
    }
  }, [options]);

  const playAudioResponse = useCallback(async (base64Audio: string) => {
    try {
      setState(prev => ({ ...prev, isPlaying: true }));

      // Stop any currently playing audio
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }

      // Create audio from base64
      const audioBlob = new Blob([
        new Uint8Array(atob(base64Audio).split('').map(c => c.charCodeAt(0)))
      ], { type: 'audio/mp3' });

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;

      // Set up audio event handlers
      audio.onended = () => {
        setState(prev => ({ ...prev, isPlaying: false }));
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
      };

      audio.onerror = () => {
        setState(prev => ({ ...prev, isPlaying: false, error: 'Eroare la redarea audio' }));
        URL.revokeObjectURL(audioUrl);
        currentAudioRef.current = null;
      };

      // Play audio
      await audio.play();

    } catch (error) {
      console.error('Error playing audio response:', error);
      setState(prev => ({
        ...prev,
        isPlaying: false,
        error: 'Nu se poate reda răspunsul audio'
      }));
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
      setState(prev => ({ ...prev, isPlaying: false }));
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const reset = useCallback(() => {
    stopRecording();
    stopAudio();
    setState({
      isRecording: false,
      isProcessing: false,
      isPlaying: false,
      transcription: null,
      aiResponse: null,
      error: null,
    });
  }, [stopRecording, stopAudio]);

  return {
    ...state,
    startRecording,
    stopRecording,
    stopAudio,
    clearError,
    reset
  };
};