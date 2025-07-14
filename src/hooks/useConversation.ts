import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'

export interface ConversationMessage {
  id: string
  content: string
  message_type: 'user' | 'assistant'
  audio_url?: string
  created_at: string
}

export interface UseConversationReturn {
  messages: ConversationMessage[]
  isLoading: boolean
  error: string | null
  sendMessage: (content: string, generateAudio?: boolean) => Promise<void>
  clearConversation: () => void
}

export const useConversation = (conversationId?: string): UseConversationReturn => {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const conversationIdRef = useRef<string | null>(conversationId || null)

  const sendMessage = useCallback(async (content: string, generateAudio = true) => {
    if (!content.trim()) return

    setIsLoading(true)
    setError(null)

    try {
      // Add user message immediately
      const userMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        content,
        message_type: 'user',
        created_at: new Date().toISOString(),
      }

      setMessages(prev => [...prev, userMessage])

      // Get AI response
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke(
        'openai-conversation-assistant',
        {
          body: {
            message: content,
            conversation_id: conversationIdRef.current,
          },
        }
      )

      if (aiError) throw aiError

      const assistantMessage: ConversationMessage = {
        id: crypto.randomUUID(),
        content: aiResponse.response,
        message_type: 'assistant',
        created_at: new Date().toISOString(),
      }

      // Add assistant message without audio first
      setMessages(prev => [...prev, assistantMessage])

      // Generate audio for assistant message if requested
      if (generateAudio && aiResponse.response) {
        try {
          const { data: ttsResponse, error: ttsError } = await supabase.functions.invoke(
            'elevenlabs-text-to-speech',
            {
              body: {
                text: aiResponse.response,
                voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam voice
                model: 'eleven_multilingual_v2',
              },
            }
          )

          if (ttsError) {
            console.error('TTS error:', ttsError)
            // Don't throw - audio generation is optional
          } else if (ttsResponse?.audio_url) {
            // Update the assistant message with audio URL
            setMessages(prev => 
              prev.map(msg => 
                msg.id === assistantMessage.id 
                  ? { ...msg, audio_url: ttsResponse.audio_url }
                  : msg
              )
            )
          }
        } catch (audioError) {
          console.error('Audio generation failed:', audioError)
          // Continue without audio
        }
      }

      // Update conversation ID if this was the first message
      if (aiResponse.conversation_id && !conversationIdRef.current) {
        conversationIdRef.current = aiResponse.conversation_id
      }

    } catch (err) {
      console.error('Conversation error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred')
      
      // Remove the user message if AI response failed
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearConversation = useCallback(() => {
    setMessages([])
    setError(null)
    conversationIdRef.current = null
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearConversation,
  }
}