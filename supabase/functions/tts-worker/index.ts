import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TTSJob {
  id: string
  text: string
  voice_id: string
  model: string
  user_id: string | null
  email_session_id: string | null
  conversation_id: string | null
  message_id: string | null
  retry_count: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role key for admin access
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('TTS Worker starting job processing...')

    // Get the next TTS job from the queue
    const { data: jobs, error: fetchError } = await supabase.rpc('get_next_tts_job')
    
    if (fetchError) {
      console.error('Error fetching TTS job:', fetchError)
      throw fetchError
    }

    if (!jobs || jobs.length === 0) {
      console.log('No TTS jobs in queue')
      return new Response(
        JSON.stringify({ message: 'No jobs in queue' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const job = jobs[0] as TTSJob
    console.log(`Processing TTS job ${job.id}`)

    try {
      // Generate speech using ElevenLabs API
      const elevenLabsResponse = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + job.voice_id, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': Deno.env.get('ELEVENLABS_API_KEY') ?? '',
        },
        body: JSON.stringify({
          text: job.text,
          model_id: job.model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
      })

      if (!elevenLabsResponse.ok) {
        const errorText = await elevenLabsResponse.text()
        throw new Error(`ElevenLabs API error: ${elevenLabsResponse.status} - ${errorText}`)
      }

      // Get audio data
      const audioData = await elevenLabsResponse.arrayBuffer()
      console.log(`Generated audio of size: ${audioData.byteLength} bytes`)

      // Upload to Supabase Storage
      const fileName = `${job.id}.mp3`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('voices-cache')
        .upload(fileName, audioData, {
          contentType: 'audio/mpeg',
          upsert: true,
        })

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
        throw uploadError
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('voices-cache')
        .getPublicUrl(fileName)

      const audioUrl = urlData.publicUrl
      console.log(`Audio uploaded to: ${audioUrl}`)

      // Mark job as completed
      const { error: completeError } = await supabase.rpc('complete_tts_job', {
        p_job_id: job.id,
        p_audio_url: audioUrl,
      })

      if (completeError) {
        console.error('Error completing TTS job:', completeError)
        throw completeError
      }

      console.log(`TTS job ${job.id} completed successfully`)

      return new Response(
        JSON.stringify({ 
          success: true, 
          job_id: job.id,
          audio_url: audioUrl 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } catch (processingError) {
      console.error(`Error processing TTS job ${job.id}:`, processingError)

      // Mark job as failed
      const { error: failError } = await supabase.rpc('fail_tts_job', {
        p_job_id: job.id,
        p_error_message: processingError.message,
      })

      if (failError) {
        console.error('Error marking job as failed:', failError)
      }

      throw processingError
    }

  } catch (error) {
    console.error('TTS Worker error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})