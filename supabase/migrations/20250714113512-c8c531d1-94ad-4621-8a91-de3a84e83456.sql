-- Add user_id column to rate_limits table for hybrid rate limiting
ALTER TABLE public.rate_limits 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for efficient lookups
CREATE INDEX idx_rate_limits_user_window ON public.rate_limits(user_id, window_start);
CREATE INDEX idx_rate_limits_identifier_window ON public.rate_limits(identifier, window_start);

-- Create composite unique constraint to prevent duplicate entries
ALTER TABLE public.rate_limits 
ADD CONSTRAINT unique_rate_limit_entry 
UNIQUE (identifier, identifier_type, action, window_start, user_id);

-- Update RLS policy to allow user-based rate limiting
DROP POLICY IF EXISTS "Users can read their own rate limits" ON public.rate_limits;

CREATE POLICY "Users can read their own rate limits" ON public.rate_limits
FOR SELECT USING (
  ((identifier_type = 'user' AND identifier = (auth.uid())::text) OR 
   (identifier_type = 'email' AND identifier = ((current_setting('request.jwt.claims', true))::json ->> 'email')) OR
   (user_id = auth.uid()))
);