-- Update RLS policies for conversations to properly handle demo sessions
-- Drop existing policies
DROP POLICY IF EXISTS "Users can create own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.conversations;

-- Create updated policies that handle both auth users and demo sessions properly
CREATE POLICY "Users can create own conversations" 
ON public.conversations 
FOR INSERT 
WITH CHECK (
  -- For authenticated users via Supabase Auth
  (auth.uid() = user_id) 
  OR 
  -- For demo sessions with email_session_id (no JWT session_token needed)
  (user_id IS NULL AND email_session_id IS NOT NULL AND email_session_id IN (
    SELECT id FROM public.email_sessions 
    WHERE email LIKE '%@medmentor.demo' AND is_active = true
  ))
);

CREATE POLICY "Users can view own conversations" 
ON public.conversations 
FOR SELECT 
USING (
  -- For authenticated users via Supabase Auth
  (auth.uid() = user_id) 
  OR 
  -- For demo sessions
  (user_id IS NULL AND email_session_id IS NOT NULL AND email_session_id IN (
    SELECT id FROM public.email_sessions 
    WHERE email LIKE '%@medmentor.demo' AND is_active = true
  ))
);

CREATE POLICY "Users can update own conversations" 
ON public.conversations 
FOR UPDATE 
USING (
  -- For authenticated users via Supabase Auth
  (auth.uid() = user_id) 
  OR 
  -- For demo sessions
  (user_id IS NULL AND email_session_id IS NOT NULL AND email_session_id IN (
    SELECT id FROM public.email_sessions 
    WHERE email LIKE '%@medmentor.demo' AND is_active = true
  ))
);