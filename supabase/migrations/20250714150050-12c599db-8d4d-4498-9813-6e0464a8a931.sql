-- Update RLS policies for conversation_messages to properly handle demo sessions
-- Drop existing policies
DROP POLICY IF EXISTS "Users can create own conversation messages" ON public.conversation_messages;
DROP POLICY IF EXISTS "Users can view own conversation messages" ON public.conversation_messages;
DROP POLICY IF EXISTS "Temporary - Users can create conversation messages with better" ON public.conversation_messages;

-- Create updated policies that handle both auth users and demo sessions properly
CREATE POLICY "Users can create conversation messages" 
ON public.conversation_messages 
FOR INSERT 
WITH CHECK (
  conversation_id IN (
    SELECT id FROM public.conversations 
    WHERE 
      -- For authenticated users via Supabase Auth
      (auth.uid() = user_id) 
      OR 
      -- For demo sessions
      (user_id IS NULL AND email_session_id IS NOT NULL AND email_session_id IN (
        SELECT id FROM public.email_sessions 
        WHERE email LIKE '%@medmentor.demo' AND is_active = true
      ))
  )
);

CREATE POLICY "Users can view conversation messages" 
ON public.conversation_messages 
FOR SELECT 
USING (
  conversation_id IN (
    SELECT id FROM public.conversations 
    WHERE 
      -- For authenticated users via Supabase Auth
      (auth.uid() = user_id) 
      OR 
      -- For demo sessions
      (user_id IS NULL AND email_session_id IS NOT NULL AND email_session_id IN (
        SELECT id FROM public.email_sessions 
        WHERE email LIKE '%@medmentor.demo' AND is_active = true
      ))
  )
);