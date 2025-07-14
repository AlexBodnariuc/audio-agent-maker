-- Add display_in_ui column to conversation_messages table
ALTER TABLE public.conversation_messages 
ADD COLUMN display_in_ui BOOLEAN DEFAULT true;

-- Create index for better query performance
CREATE INDEX idx_conversation_messages_display_in_ui 
ON public.conversation_messages(conversation_id, display_in_ui, created_at);

-- Add comment explaining the column
COMMENT ON COLUMN public.conversation_messages.display_in_ui IS 'Whether this message should be displayed in the UI. Used for filtering out system/internal messages in speech-to-speech flows.';