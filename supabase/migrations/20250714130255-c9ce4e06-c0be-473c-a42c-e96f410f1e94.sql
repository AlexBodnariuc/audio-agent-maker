-- Create TTS jobs table for asynchronous audio generation
CREATE TABLE public.tts_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  text TEXT NOT NULL,
  voice_id TEXT NOT NULL DEFAULT 'alloy',
  model TEXT NOT NULL DEFAULT 'tts-1',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  audio_url TEXT,
  error_message TEXT,
  user_id UUID,
  email_session_id UUID,
  conversation_id UUID,
  message_id UUID,
  priority INTEGER NOT NULL DEFAULT 5,
  max_retries INTEGER NOT NULL DEFAULT 3,
  retry_count INTEGER NOT NULL DEFAULT 0,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_tts_jobs_status ON public.tts_jobs(status);
CREATE INDEX idx_tts_jobs_priority ON public.tts_jobs(priority DESC, created_at ASC);
CREATE INDEX idx_tts_jobs_conversation ON public.tts_jobs(conversation_id);
CREATE INDEX idx_tts_jobs_user ON public.tts_jobs(user_id);
CREATE INDEX idx_tts_jobs_email_session ON public.tts_jobs(email_session_id);

-- Enable RLS
ALTER TABLE public.tts_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own TTS jobs" 
ON public.tts_jobs 
FOR SELECT 
USING (
  (user_id = auth.uid()) OR 
  (email_session_id IN (
    SELECT id FROM email_sessions 
    WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token') 
    AND is_active = true
  ))
);

CREATE POLICY "Users can create their own TTS jobs" 
ON public.tts_jobs 
FOR INSERT 
WITH CHECK (
  (user_id = auth.uid()) OR 
  (email_session_id IN (
    SELECT id FROM email_sessions 
    WHERE session_token = ((current_setting('request.jwt.claims', true))::json ->> 'session_token') 
    AND is_active = true
  ))
);

CREATE POLICY "System can update TTS jobs" 
ON public.tts_jobs 
FOR UPDATE 
USING (true);

-- Create function to enqueue TTS jobs
CREATE OR REPLACE FUNCTION public.enqueue_tts_job(
  p_text TEXT,
  p_voice_id TEXT DEFAULT 'alloy',
  p_model TEXT DEFAULT 'tts-1',
  p_user_id UUID DEFAULT NULL,
  p_email_session_id UUID DEFAULT NULL,
  p_conversation_id UUID DEFAULT NULL,
  p_message_id UUID DEFAULT NULL,
  p_priority INTEGER DEFAULT 5
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_id UUID;
BEGIN
  INSERT INTO public.tts_jobs (
    text, voice_id, model, user_id, email_session_id, 
    conversation_id, message_id, priority
  ) VALUES (
    p_text, p_voice_id, p_model, p_user_id, p_email_session_id,
    p_conversation_id, p_message_id, p_priority
  ) RETURNING id INTO job_id;
  
  RETURN job_id;
END;
$$;

-- Create function to get next pending job
CREATE OR REPLACE FUNCTION public.get_next_tts_job()
RETURNS TABLE (
  id UUID,
  text TEXT,
  voice_id TEXT,
  model TEXT,
  user_id UUID,
  email_session_id UUID,
  conversation_id UUID,
  message_id UUID,
  retry_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_record RECORD;
BEGIN
  -- Get the highest priority pending job
  SELECT * INTO job_record
  FROM public.tts_jobs
  WHERE status = 'pending' 
    AND retry_count < max_retries
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  
  IF job_record.id IS NOT NULL THEN
    -- Mark as processing
    UPDATE public.tts_jobs
    SET status = 'processing',
        processing_started_at = now(),
        updated_at = now()
    WHERE id = job_record.id;
    
    -- Return the job details
    RETURN QUERY
    SELECT 
      job_record.id,
      job_record.text,
      job_record.voice_id,
      job_record.model,
      job_record.user_id,
      job_record.email_session_id,
      job_record.conversation_id,
      job_record.message_id,
      job_record.retry_count;
  END IF;
END;
$$;

-- Create function to mark job as completed
CREATE OR REPLACE FUNCTION public.complete_tts_job(
  p_job_id UUID,
  p_audio_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tts_jobs
  SET status = 'completed',
      audio_url = p_audio_url,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_job_id AND status = 'processing';
  
  RETURN FOUND;
END;
$$;

-- Create function to mark job as failed
CREATE OR REPLACE FUNCTION public.fail_tts_job(
  p_job_id UUID,
  p_error_message TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tts_jobs
  SET status = CASE 
    WHEN retry_count + 1 >= max_retries THEN 'failed'
    ELSE 'pending'
  END,
  retry_count = retry_count + 1,
  error_message = p_error_message,
  processing_started_at = NULL,
  updated_at = now()
  WHERE id = p_job_id AND status = 'processing';
  
  RETURN FOUND;
END;
$$;

-- Create function to get job status
CREATE OR REPLACE FUNCTION public.get_tts_job_status(p_job_id UUID)
RETURNS TABLE (
  id UUID,
  status TEXT,
  audio_url TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id,
    j.status,
    j.audio_url,
    j.error_message,
    j.created_at,
    j.completed_at
  FROM public.tts_jobs j
  WHERE j.id = p_job_id;
END;
$$;

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_tts_jobs_updated_at
  BEFORE UPDATE ON public.tts_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();