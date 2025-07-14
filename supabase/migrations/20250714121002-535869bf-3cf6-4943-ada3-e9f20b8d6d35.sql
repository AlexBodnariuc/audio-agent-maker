-- Add new columns to voice_personalities table
ALTER TABLE public.voice_personalities 
ADD COLUMN persona_json jsonb DEFAULT '{}',
ADD COLUMN tts_voice_id text,
ADD COLUMN limits_json jsonb DEFAULT '{}',
ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update RLS policies for voice_personalities
DROP POLICY IF EXISTS "Anyone can view voice personalities" ON public.voice_personalities;
DROP POLICY IF EXISTS "System can manage voice personalities" ON public.voice_personalities;

-- Create new RLS policies
CREATE POLICY "Users can view all active voice personalities"
ON public.voice_personalities
FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Users can create their own voice personalities"
ON public.voice_personalities  
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own voice personalities"
ON public.voice_personalities
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own voice personalities"
ON public.voice_personalities
FOR DELETE  
TO authenticated
USING (auth.uid() = user_id);

-- Add index for better performance
CREATE INDEX idx_voice_personalities_user_id ON public.voice_personalities(user_id);
CREATE INDEX idx_voice_personalities_is_active ON public.voice_personalities(is_active);