# Live Chat Streaming API Documentation

## Overview

The MedMentor Live Chat system provides real-time AI-powered conversations for Romanian medical school admission preparation. This document covers the complete API and component usage.

## Architecture

```
Frontend (React) ↔ useChatStream Hook ↔ Supabase Edge Function ↔ OpenAI API
                                      ↕
                              PostgreSQL Database
                                      ↕
                              Real-time Subscriptions
```

## Components

### LiveChatInterface

Main chat component that provides complete chat functionality.

```tsx
import { LiveChatInterface } from '@/components/chat';

<LiveChatInterface
  conversationId="uuid-string"
  title="Chat MedMentor"
  showHeader={true}
  maxHeight="600px"
  onMessageSent={(message) => console.log('Sent:', message)}
  onTypingChange={(isTyping) => console.log('Typing:', isTyping)}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `conversationId` | `string` | - | **Required.** UUID of the conversation |
| `title` | `string` | `"Chat MedMentor"` | Chat window title |
| `className` | `string` | `""` | Additional CSS classes |
| `showHeader` | `boolean` | `true` | Show/hide chat header |
| `maxHeight` | `string` | `"600px"` | Maximum height of chat area |
| `onMessageSent` | `(message: string) => void` | - | Callback when message is sent |
| `onTypingChange` | `(isTyping: boolean) => void` | - | Callback when typing state changes |

### ChatMessage

Individual message component with rich features.

```tsx
import { ChatMessage } from '@/components/chat';

<ChatMessage
  message={{
    id: "msg-id",
    content: "Hello!",
    role: "user",
    timestamp: "2024-01-01T10:00:00Z"
  }}
  showAvatar={true}
  showTimestamp={true}
  showActions={true}
  onFeedback={(id, feedback) => console.log('Feedback:', id, feedback)}
  onTTS={(text) => console.log('TTS:', text)}
/>
```

#### Message Object

```typescript
interface ChatMessage {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  isStreaming?: boolean;
  metadata?: {
    tokens?: number;
    model?: string;
    confidence?: number;
  };
}
```

### MessageInput

Advanced input component with features like character counting and voice input.

```tsx
import { MessageInput } from '@/components/chat';

<MessageInput
  onSendMessage={(message) => handleSend(message)}
  disabled={false}
  placeholder="Scrie mesajul tău..."
  maxLength={2000}
  showCharCount={true}
  showVoiceInput={false}
  onTypingChange={(isTyping) => console.log('Typing:', isTyping)}
/>
```

### TypingIndicator

Shows when AI is generating a response.

```tsx
import { TypingIndicator } from '@/components/chat';

<TypingIndicator
  message="MedMentor generează răspunsul..."
  variant="dots" // 'dots' | 'pulse' | 'wave'
  showAvatar={true}
/>
```

### ConnectionStatus

Real-time connection status indicator.

```tsx
import { ConnectionStatus } from '@/components/chat';

<ConnectionStatus
  isConnected={true}
  isReconnecting={false}
  latency={150}
/>
```

### ChatAnalytics

Real-time analytics and monitoring dashboard.

```tsx
import { ChatAnalytics } from '@/components/chat';

<ChatAnalytics
  conversationId="uuid-string"
  showRealtime={true}
/>
```

## Hooks

### useChatStream

Core hook for managing chat streaming functionality.

```tsx
import { useChatStream } from '@/hooks/useChatStream';

const {
  messages,        // ChatMessage[]
  isStreaming,     // boolean
  error,          // string | null
  sendMessage,    // (conversationId: string, text: string) => Promise<void>
  clearMessages   // () => void
} = useChatStream();
```

#### Usage Example

```tsx
function ChatComponent() {
  const { messages, isStreaming, sendMessage, error } = useChatStream();
  const [conversationId] = useState('your-conversation-id');

  const handleSend = async (text: string) => {
    try {
      await sendMessage(conversationId, text);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  return (
    <div>
      {messages.map(msg => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      {isStreaming && <TypingIndicator />}
      {error && <div>Error: {error}</div>}
      <MessageInput onSendMessage={handleSend} disabled={isStreaming} />
    </div>
  );
}
```

## Edge Function API

### Endpoint

```
POST https://your-project.supabase.co/functions/v1/openai-chat-stream
```

### Headers

```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

### Request Body

```json
{
  "conversation_id": "uuid-string",
  "text": "Care sunt organitele celulei?"
}
```

### Response

Server-Sent Events (SSE) stream with the following event types:

#### Partial Response
```json
{
  "type": "partial",
  "content": "text-chunk",
  "role": "assistant",
  "conversation_id": "uuid-string"
}
```

#### Complete Response
```json
{
  "type": "done",
  "message_id": "uuid-string",
  "full_content": "complete-response-text",
  "conversation_id": "uuid-string"
}
```

#### Error Response
```json
{
  "type": "error",
  "error": "error-message",
  "conversation_id": "uuid-string"
}
```

## Database Schema

### Conversations Table

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  email_session_id UUID,
  voice_personality_id UUID NOT NULL,
  title TEXT,
  status TEXT DEFAULT 'active',
  specialty_focus TEXT,
  total_messages INTEGER DEFAULT 0,
  learning_context JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Conversation Messages Table

```sql
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL, -- 'user' | 'assistant'
  audio_url TEXT,
  processing_time INTEGER,
  confidence_score REAL,
  language_detected TEXT DEFAULT 'en',
  medical_entities JSONB,
  voice_metadata JSONB,
  metadata JSONB,
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Real-time Features

### Broadcasting

The system automatically broadcasts message updates to all connected clients:

```typescript
// Listen for real-time updates
supabase
  .channel(`chat:${conversationId}`)
  .on('broadcast', { event: 'message_chunk' }, (payload) => {
    console.log('New chunk:', payload);
  })
  .on('broadcast', { event: 'message_complete' }, (payload) => {
    console.log('Message complete:', payload);
  })
  .subscribe();
```

### Analytics Events

Real-time analytics are broadcast for monitoring:

```typescript
supabase
  .channel('chat-analytics')
  .on('broadcast', { event: 'conversation_metrics' }, (payload) => {
    updateAnalytics(payload);
  })
  .subscribe();
```

## Rate Limiting

The system implements rate limiting at multiple levels:

- **User Level**: 30 messages per hour per user
- **Conversation Level**: Prevents message flooding
- **Token Level**: Limits based on OpenAI token usage

### Rate Limit Response

```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT",
  "details": {
    "remaining": 0,
    "resetTime": "2024-01-01T11:00:00Z"
  }
}
```

## Error Handling

### Frontend Error Handling

```tsx
const { messages, error, sendMessage } = useChatStream();

// Handle errors
useEffect(() => {
  if (error) {
    toast({
      title: "Chat Error",
      description: error,
      variant: "destructive",
    });
  }
}, [error]);
```

### Common Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `UNAUTHORIZED` | Invalid or missing JWT token | Re-authenticate user |
| `VALIDATION_ERROR` | Invalid request format | Check request parameters |
| `RATE_LIMIT` | Too many requests | Show rate limit warning |
| `CONVERSATION_NOT_FOUND` | Invalid conversation ID | Create new conversation |
| `INTERNAL_ERROR` | Server error | Retry or contact support |

## Performance Optimization

### Message Batching

Messages are automatically batched for efficient rendering:

```tsx
// Automatic batching in useChatStream
const BATCH_DELAY = 50; // ms
const BATCH_SIZE = 10;   // messages
```

### Memory Management

```tsx
// Limit message history for performance
const MAX_MESSAGES = 100;

// Cleanup on unmount
useEffect(() => {
  return () => {
    abortController.abort();
    cleanup();
  };
}, []);
```

## Testing

### Unit Tests

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveChatInterface } from '@/components/chat';

test('sends message correctly', async () => {
  const mockSend = vi.fn();
  render(<LiveChatInterface conversationId="test" />);
  
  const input = screen.getByPlaceholderText(/întreabă/i);
  fireEvent.change(input, { target: { value: 'Test message' } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
  
  expect(mockSend).toHaveBeenCalledWith('test', 'Test message');
});
```

### Integration Tests

```tsx
import { createConversation } from '@/lib/test-utils';

test('full chat flow', async () => {
  const conversationId = await createConversation();
  // Test complete flow...
});
```

## Deployment

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your-openai-key
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key

# Optional
CHAT_RATE_LIMIT=30
MAX_MESSAGE_LENGTH=2000
```

### Edge Function Deployment

```bash
# Deploy automatically via Lovable
# No manual deployment needed
```

## Security

### Authentication

All chat requests require valid JWT authentication:

```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session) throw new Error('Not authenticated');
```

### Input Validation

```typescript
const RequestSchema = z.object({
  conversation_id: z.string().uuid(),
  text: z.string().min(1).max(2000)
});
```

### Rate Limiting

Implemented at multiple levels to prevent abuse.

## Monitoring

### Analytics Dashboard

Real-time monitoring of:
- Message volume
- Response times
- Error rates
- User engagement
- Token usage

### Alerts

Configure alerts for:
- High error rates (>5%)
- Slow response times (>2s)
- Rate limit breaches
- API quota warnings

## Troubleshooting

### Common Issues

1. **Streaming stops mid-response**
   - Check network connection
   - Verify OpenAI API key
   - Check rate limits

2. **Messages not saving to database**
   - Verify Supabase connection
   - Check RLS policies
   - Validate conversation ID

3. **High latency**
   - Check OpenAI API status
   - Monitor database performance
   - Verify edge function deployment

### Debug Mode

Enable debug logging:

```typescript
const useChatStream = () => {
  const DEBUG = process.env.NODE_ENV === 'development';
  
  if (DEBUG) {
    console.log('Chat state:', { messages, isStreaming, error });
  }
  
  // ...
};
```

## Best Practices

1. **Always handle errors gracefully**
2. **Implement proper loading states**
3. **Use appropriate rate limiting**
4. **Monitor performance metrics**
5. **Test with realistic data volumes**
6. **Implement proper cleanup**
7. **Use semantic HTML for accessibility**
8. **Provide clear user feedback**

## Support

For issues or questions:
- Check the troubleshooting section
- Review the test suite for examples
- Contact the development team