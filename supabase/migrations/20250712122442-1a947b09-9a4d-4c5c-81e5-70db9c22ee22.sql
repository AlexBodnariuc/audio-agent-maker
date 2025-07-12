-- Fix voice analytics table to add unique constraint for conversation_id
-- This will resolve the UPSERT issues that have been causing database errors

-- First, check if there are any duplicate conversation_ids and handle them
DELETE FROM voice_analytics 
WHERE id NOT IN (
  SELECT MIN(id) 
  FROM voice_analytics 
  GROUP BY conversation_id
);

-- Add unique constraint on conversation_id to make upserts work properly
ALTER TABLE voice_analytics 
ADD CONSTRAINT voice_analytics_conversation_id_unique 
UNIQUE (conversation_id);

-- Add missing columns that might be referenced but don't exist
DO $$ 
BEGIN
  -- Add word_count column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'voice_analytics' AND column_name = 'word_count') THEN
    ALTER TABLE voice_analytics ADD COLUMN word_count INTEGER DEFAULT 0;
  END IF;
  
  -- Add medical_terms_used column if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'voice_analytics' AND column_name = 'medical_terms_used') THEN
    ALTER TABLE voice_analytics ADD COLUMN medical_terms_used TEXT[] DEFAULT '{}';
  END IF;
END $$;