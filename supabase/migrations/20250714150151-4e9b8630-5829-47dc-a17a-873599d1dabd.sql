-- Clean up remaining old policy
DROP POLICY IF EXISTS "Temporary - Users can create conversation messages with better" ON public.conversation_messages;