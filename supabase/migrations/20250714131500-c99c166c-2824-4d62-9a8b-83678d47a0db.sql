-- Create voices-cache storage bucket for TTS audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('voices-cache', 'voices-cache', true);

-- Create policies for voices-cache bucket
CREATE POLICY "Anyone can view cached voice files"
ON storage.objects FOR SELECT
USING (bucket_id = 'voices-cache');

CREATE POLICY "System can create cached voice files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'voices-cache');

CREATE POLICY "System can update cached voice files"
ON storage.objects FOR UPDATE
USING (bucket_id = 'voices-cache');

CREATE POLICY "System can delete cached voice files"
ON storage.objects FOR DELETE
USING (bucket_id = 'voices-cache');