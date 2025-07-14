-- Create materialized view for agent context
CREATE MATERIALIZED VIEW public.v_agent_context AS
SELECT 
    -- User identification
    COALESCE(es.id, up.id) as user_id,
    es.email,
    
    -- User preferences and learning profile
    up.learning_style,
    up.difficulty_preference,
    up.language_preference,
    up.daily_goal,
    
    -- Progress and achievements
    uprog.total_xp,
    uprog.current_level,
    uprog.current_streak,
    uprog.longest_streak,
    uprog.last_activity_date,
    
    -- Knowledge areas (aggregated)
    COALESCE(
        array_agg(
            DISTINCT jsonb_build_object(
                'subject', uka.subject,
                'proficiency_level', uka.proficiency_level,
                'interest_level', uka.interest_level
            )
        ) FILTER (WHERE uka.subject IS NOT NULL),
        ARRAY[]::jsonb[]
    ) as knowledge_areas,
    
    -- Recent quiz performance (last 10 sessions)
    COALESCE(
        array_agg(
            DISTINCT jsonb_build_object(
                'id', qs.id,
                'title', qs.title,
                'score', qs.score,
                'xp_earned', qs.xp_earned,
                'completed_at', qs.updated_at,
                'total_questions', qs.total_questions
            ) ORDER BY qs.updated_at DESC
        ) FILTER (WHERE qs.is_completed = true AND qs.updated_at >= NOW() - INTERVAL '30 days'),
        ARRAY[]::jsonb[]
    )[1:10] as recent_quiz_performance,
    
    -- Learning path progress
    lp.current_level as learning_level,
    lp.specialty_focus,
    lp.completed_topics,
    lp.recommended_topics,
    lp.learning_style as learning_path_style,
    
    -- Recent conversation topics (last 5 conversations)
    COALESCE(
        array_agg(
            DISTINCT jsonb_build_object(
                'id', c.id,
                'title', c.title,
                'specialty_focus', c.specialty_focus,
                'started_at', c.started_at,
                'total_messages', c.total_messages
            ) ORDER BY c.started_at DESC
        ) FILTER (WHERE c.status = 'active' OR c.ended_at >= NOW() - INTERVAL '7 days'),
        ARRAY[]::jsonb[]
    )[1:5] as recent_conversations,
    
    -- Achievements count
    COUNT(DISTINCT ua.id) as total_achievements,
    
    -- Context generation timestamp
    NOW() as context_generated_at
    
FROM email_sessions es
LEFT JOIN user_preferences up ON up.user_id IS NULL -- Since user_preferences requires auth.uid()
LEFT JOIN user_progress uprog ON uprog.email_session_id = es.id
LEFT JOIN user_knowledge_areas uka ON uka.user_id IS NULL -- Since this also requires auth.uid()
LEFT JOIN learning_paths lp ON lp.email_session_id = es.id
LEFT JOIN conversations c ON c.email_session_id = es.id
LEFT JOIN quiz_sessions qs ON qs.email_session_id = es.id
LEFT JOIN user_achievements ua ON ua.email_session_id = es.id
WHERE es.is_active = true
GROUP BY 
    es.id, es.email, up.learning_style, up.difficulty_preference, 
    up.language_preference, up.daily_goal, up.id,
    uprog.total_xp, uprog.current_level, uprog.current_streak, 
    uprog.longest_streak, uprog.last_activity_date,
    lp.current_level, lp.specialty_focus, lp.completed_topics, 
    lp.recommended_topics, lp.learning_style;

-- Create index for better performance
CREATE INDEX idx_v_agent_context_user_id ON public.v_agent_context (user_id);
CREATE INDEX idx_v_agent_context_email ON public.v_agent_context (email);

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_agent_context_view()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW public.v_agent_context;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Set up automatic refresh (every 15 minutes) using pg_cron if available
-- This will only work if pg_cron extension is enabled
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'refresh-agent-context',
            '*/15 * * * *', -- Every 15 minutes
            'SELECT refresh_agent_context_view();'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Ignore errors if pg_cron is not available
        NULL;
END
$$;