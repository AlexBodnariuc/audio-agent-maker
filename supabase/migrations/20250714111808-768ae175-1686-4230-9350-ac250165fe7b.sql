-- Enable RLS on all required tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_analytics ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policies and create strict user-scoped policies
DROP POLICY IF EXISTS "Enhanced voice conversations access" ON public.conversations;
DROP POLICY IF EXISTS "Temporary - Users can view conversations with better auth check" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

DROP POLICY IF EXISTS "Enhanced voice message access" ON public.conversation_messages;
DROP POLICY IF EXISTS "Temporary - Users can create conversation messages with better" ON public.conversation_messages;

-- Conversations: Users can only access their own conversations
CREATE POLICY "Users can view own conversations" ON public.conversations
  FOR SELECT USING (
    auth.uid() = user_id OR 
    email_session_id IN (
      SELECT id FROM email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
        AND is_active = true
    )
  );

CREATE POLICY "Users can create own conversations" ON public.conversations
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    email_session_id IN (
      SELECT id FROM email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
        AND is_active = true
    )
  );

CREATE POLICY "Users can update own conversations" ON public.conversations
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    email_session_id IN (
      SELECT id FROM email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
        AND is_active = true
    )
  );

-- Conversation Messages: Users can only access messages from their conversations
CREATE POLICY "Users can view own conversation messages" ON public.conversation_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations 
      WHERE auth.uid() = user_id OR 
        email_session_id IN (
          SELECT id FROM email_sessions 
          WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
            AND is_active = true
        )
    )
  );

CREATE POLICY "Users can create own conversation messages" ON public.conversation_messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations 
      WHERE auth.uid() = user_id OR 
        email_session_id IN (
          SELECT id FROM email_sessions 
          WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
            AND is_active = true
        )
    )
  );

-- Voice Analytics: Users can only access their own analytics
CREATE POLICY "Users can view own voice analytics" ON public.voice_analytics
  FOR SELECT USING (
    auth.uid() = user_id OR 
    email_session_id IN (
      SELECT id FROM email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
        AND is_active = true
    )
  );

CREATE POLICY "Users can create own voice analytics" ON public.voice_analytics
  FOR INSERT WITH CHECK (
    auth.uid() = user_id OR 
    email_session_id IN (
      SELECT id FROM email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
        AND is_active = true
    )
  );

CREATE POLICY "Users can update own voice analytics" ON public.voice_analytics
  FOR UPDATE USING (
    auth.uid() = user_id OR 
    email_session_id IN (
      SELECT id FROM email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token')
        AND is_active = true
    )
  );