-- Enhanced Voice AI Integration Database Schema

-- Create vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create conversation_embeddings table for semantic search
CREATE TABLE public.conversation_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  message_content TEXT NOT NULL,
  embedding vector(1536),
  medical_keywords TEXT[],
  specialty_context TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create voice_analytics table for learning insights
CREATE TABLE public.voice_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL,
  email_session_id UUID,
  user_id UUID,
  session_duration INTEGER, -- in seconds
  word_count INTEGER DEFAULT 0,
  confidence_scores JSONB, -- array of confidence scores
  medical_terms_used TEXT[],
  learning_topics TEXT[],
  comprehension_indicators JSONB,
  voice_metrics JSONB, -- pace, clarity, etc.
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quiz_voice_sessions linking table
CREATE TABLE public.quiz_voice_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_session_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  voice_assistance_type TEXT NOT NULL, -- 'explanation', 'guidance', 'review'
  topics_covered TEXT[],
  effectiveness_score INTEGER, -- 1-10 rating
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create learning_paths table for personalized voice assistance
CREATE TABLE public.learning_paths (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  email_session_id UUID,
  specialty_focus TEXT,
  current_level TEXT DEFAULT 'beginner',
  recommended_topics JSONB,
  completed_topics JSONB DEFAULT '[]'::jsonb,
  voice_preferences JSONB, -- preferred pace, complexity, etc.
  learning_style TEXT DEFAULT 'mixed', -- 'audio', 'visual', 'mixed'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add voice metadata to conversation_messages
ALTER TABLE public.conversation_messages 
ADD COLUMN IF NOT EXISTS voice_metadata JSONB,
ADD COLUMN IF NOT EXISTS confidence_score REAL,
ADD COLUMN IF NOT EXISTS processing_time INTEGER, -- milliseconds
ADD COLUMN IF NOT EXISTS language_detected TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS medical_entities JSONB;

-- Add learning context to conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS learning_context JSONB,
ADD COLUMN IF NOT EXISTS quiz_session_id UUID,
ADD COLUMN IF NOT EXISTS specialty_focus TEXT,
ADD COLUMN IF NOT EXISTS voice_session_type TEXT DEFAULT 'general'; -- 'quiz_assistance', 'learning', 'review'

-- Create indexes for performance
CREATE INDEX idx_conversation_embeddings_conversation_id ON public.conversation_embeddings(conversation_id);
CREATE INDEX idx_conversation_embeddings_specialty ON public.conversation_embeddings(specialty_context);
CREATE INDEX idx_conversation_embeddings_vector ON public.conversation_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_voice_analytics_conversation_id ON public.voice_analytics(conversation_id);
CREATE INDEX idx_voice_analytics_user_id ON public.voice_analytics(user_id);
CREATE INDEX idx_voice_analytics_email_session_id ON public.voice_analytics(email_session_id);
CREATE INDEX idx_voice_analytics_created_at ON public.voice_analytics(created_at);

CREATE INDEX idx_quiz_voice_sessions_quiz_id ON public.quiz_voice_sessions(quiz_session_id);
CREATE INDEX idx_quiz_voice_sessions_conversation_id ON public.quiz_voice_sessions(conversation_id);

CREATE INDEX idx_learning_paths_user_id ON public.learning_paths(user_id);
CREATE INDEX idx_learning_paths_email_session_id ON public.learning_paths(email_session_id);

CREATE INDEX idx_conversations_quiz_session_id ON public.conversations(quiz_session_id);
CREATE INDEX idx_conversations_specialty_focus ON public.conversations(specialty_focus);

-- Enable RLS on new tables
ALTER TABLE public.conversation_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversation_embeddings
CREATE POLICY "Users can view embeddings for their conversations" 
ON public.conversation_embeddings 
FOR SELECT 
USING (
  conversation_id IN (
    SELECT id FROM public.conversations 
    WHERE user_id = auth.uid() 
    OR email_session_id IN (
      SELECT id FROM public.email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims'::text, true))::json ->> 'session_token'::text)
      AND is_active = true
    )
  )
);

CREATE POLICY "System can manage conversation embeddings" 
ON public.conversation_embeddings 
FOR ALL 
USING (true)
WITH CHECK (true);

-- RLS Policies for voice_analytics
CREATE POLICY "Users can view their voice analytics" 
ON public.voice_analytics 
FOR SELECT 
USING (
  user_id = auth.uid() 
  OR email_session_id IN (
    SELECT id FROM public.email_sessions 
    WHERE session_token = ((current_setting('request.jwt.claims'::text, true))::json ->> 'session_token'::text)
    AND is_active = true
  )
);

CREATE POLICY "Users can create their voice analytics" 
ON public.voice_analytics 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() 
  OR email_session_id IN (
    SELECT id FROM public.email_sessions 
    WHERE session_token = ((current_setting('request.jwt.claims'::text, true))::json ->> 'session_token'::text)
    AND is_active = true
  )
);

-- RLS Policies for quiz_voice_sessions
CREATE POLICY "Users can view their quiz voice sessions" 
ON public.quiz_voice_sessions 
FOR SELECT 
USING (
  quiz_session_id IN (
    SELECT id FROM public.quiz_sessions 
    WHERE user_id = auth.uid() 
    OR email_session_id IN (
      SELECT id FROM public.email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims'::text, true))::json ->> 'session_token'::text)
      AND is_active = true
    )
  )
);

CREATE POLICY "Users can create quiz voice sessions" 
ON public.quiz_voice_sessions 
FOR INSERT 
WITH CHECK (
  quiz_session_id IN (
    SELECT id FROM public.quiz_sessions 
    WHERE user_id = auth.uid() 
    OR email_session_id IN (
      SELECT id FROM public.email_sessions 
      WHERE session_token = ((current_setting('request.jwt.claims'::text, true))::json ->> 'session_token'::text)
      AND is_active = true
    )
  )
);

-- RLS Policies for learning_paths
CREATE POLICY "Users can manage their learning paths" 
ON public.learning_paths 
FOR ALL 
USING (
  user_id = auth.uid() 
  OR email_session_id IN (
    SELECT id FROM public.email_sessions 
    WHERE session_token = ((current_setting('request.jwt.claims'::text, true))::json ->> 'session_token'::text)
    AND is_active = true
  )
);

-- Create function to generate embeddings (placeholder for OpenAI integration)
CREATE OR REPLACE FUNCTION public.generate_conversation_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be populated by edge function
  INSERT INTO public.conversation_embeddings (
    conversation_id,
    message_content,
    specialty_context
  ) VALUES (
    NEW.conversation_id,
    NEW.content,
    COALESCE(
      (SELECT specialty_focus FROM public.conversations WHERE id = NEW.conversation_id),
      'general'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for automatic embedding generation
CREATE TRIGGER generate_embedding_on_message
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_conversation_embedding();

-- Create function to update analytics
CREATE OR REPLACE FUNCTION public.update_voice_analytics()
RETURNS TRIGGER AS $$
DECLARE
  word_count_val INTEGER;
  medical_terms TEXT[];
BEGIN
  -- Calculate word count
  word_count_val := array_length(string_to_array(NEW.content, ' '), 1);
  
  -- Extract medical keywords (simplified - could be enhanced with NLP)
  medical_terms := ARRAY(
    SELECT unnest(string_to_array(lower(NEW.content), ' '))
    WHERE unnest(string_to_array(lower(NEW.content), ' ')) 
    SIMILAR TO '%(medical|diagnosis|treatment|symptom|patient|clinical|anatomy|pathology|therapy|medication|surgery|examination)%'
  );

  -- Update or insert analytics
  INSERT INTO public.voice_analytics (
    conversation_id,
    user_id,
    email_session_id,
    word_count,
    medical_terms_used,
    voice_metrics
  ) VALUES (
    NEW.conversation_id,
    (SELECT user_id FROM public.conversations WHERE id = NEW.conversation_id),
    (SELECT email_session_id FROM public.conversations WHERE id = NEW.conversation_id),
    word_count_val,
    medical_terms,
    COALESCE(NEW.voice_metadata, '{}'::jsonb)
  )
  ON CONFLICT (conversation_id) 
  DO UPDATE SET
    word_count = voice_analytics.word_count + word_count_val,
    medical_terms_used = array_cat(voice_analytics.medical_terms_used, medical_terms),
    voice_metrics = voice_analytics.voice_metrics || COALESCE(NEW.voice_metadata, '{}'::jsonb),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for analytics updates
CREATE TRIGGER update_analytics_on_message
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_voice_analytics();

-- Create function for semantic search
CREATE OR REPLACE FUNCTION public.semantic_search_conversations(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 10,
  user_context UUID DEFAULT NULL
)
RETURNS TABLE (
  conversation_id UUID,
  message_content TEXT,
  similarity FLOAT,
  specialty_context TEXT,
  medical_keywords TEXT[]
)
LANGUAGE SQL STABLE
AS $$
  SELECT 
    ce.conversation_id,
    ce.message_content,
    1 - (ce.embedding <=> query_embedding) as similarity,
    ce.specialty_context,
    ce.medical_keywords
  FROM conversation_embeddings ce
  JOIN conversations c ON c.id = ce.conversation_id
  WHERE 
    (user_context IS NULL OR c.user_id = user_context OR c.email_session_id IN (
      SELECT id FROM email_sessions WHERE session_token = ((current_setting('request.jwt.claims'::text, true))::json ->> 'session_token'::text)
    ))
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
$$;