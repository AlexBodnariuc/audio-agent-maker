import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { text, voice_id = 'pNInz6obpgDQGcFmaJgB', model = 'eleven_multilingual_v2' } = await req.json()
    
    if (!text) {
      throw new Error('Text is required')
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get user context from JWT
    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      
      if (user) {
        supabase.auth.setSession({
          access_token: token,
          refresh_token: '',
        })
      }
    }

    console.log('Enqueueing TTS job for text:', text.substring(0, 50) + '...')

    // Enqueue TTS job
    const { data: jobId, error: enqueueError } = await supabase.rpc('enqueue_tts_job', {
      p_text: text,
      p_voice_id: voice_id,
      p_model: model,
      p_user_id: null, // Will be filled by trigger if authenticated
      p_email_session_id: null,
      p_conversation_id: null,
      p_message_id: null,
      p_priority: 5,
    })

    if (enqueueError) {
      console.error('Error enqueueing TTS job:', enqueueError)
      throw enqueueError
    }

    console.log('TTS job enqueued with ID:', jobId)

    // Poll for job completion (with timeout)
    const maxAttempts = 30 // 30 seconds max
    let attempts = 0
    let jobResult = null

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
      attempts++

      const { data: statusData, error: statusError } = await supabase.rpc('get_tts_job_status', {
        p_job_id: jobId,
      })

      if (statusError) {
        console.error('Error checking job status:', statusError)
        continue
      }

      if (statusData && statusData.length > 0) {
        const status = statusData[0]
        
        if (status.status === 'completed' && status.audio_url) {
          jobResult = {
            job_id: jobId,
            audio_url: status.audio_url,
            status: 'completed',
          }
          break
        } else if (status.status === 'failed') {
          throw new Error(`TTS job failed: ${status.error_message}`)
        }
      }

      console.log(`Waiting for TTS job completion... attempt ${attempts}/${maxAttempts}`)
    }

    if (!jobResult) {
      // Job is still processing, return job ID for client to poll
      return new Response(
        JSON.stringify({
          job_id: jobId,
          status: 'processing',
          message: 'TTS job is being processed. Use job_id to check status.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify(jobResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('ElevenLabs TTS error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})