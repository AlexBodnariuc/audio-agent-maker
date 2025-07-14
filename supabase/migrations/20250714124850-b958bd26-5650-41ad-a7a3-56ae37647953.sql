-- Create materialized view for agent context
CREATE MATERIALIZED VIEW public.v_agent_context AS
WITH recent_quizzes AS (
    SELECT 
        email_session_id,
        jsonb_build_object(
            'id', id,
            'title', title, 
            'score', score,
            'xp_earned', xp_earned,
            'completed_at', updated_at,
            'total_questions', total_questions
        ) as quiz_data,
        ROW_NUMBER() OVER (PARTITION BY email_session_id ORDER BY updated_at DESC) as rn
    FROM quiz_sessions 
    WHERE is_completed = true AND updated_at >= NOW() - INTERVAL '30 days'
),
recent_conversations_cte AS (
    SELECT 
        email_session_id,
        jsonb_build_object(
            'id', id,
            'title', title,
            'specialty_focus', specialty_focus,
            'started_at', started_at,
            'total_messages', total_messages
        ) as conversation_data,
        ROW_NUMBER() OVER (PARTITION BY email_session_id ORDER BY started_at DESC) as rn
    FROM conversations 
    WHERE status = 'active' OR ended_at >= NOW() - INTERVAL '7 days'
)
SELECT 
    -- User identification
    es.id as user_id,
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
        array_agg(rq.quiz_data ORDER BY rq.rn) FILTER (WHERE rq.rn <= 10),
        ARRAY[]::jsonb[]
    ) as recent_quiz_performance,
    
    -- Learning path progress
    lp.current_level as learning_level,
    lp.specialty_focus,
    lp.completed_topics,
    lp.recommended_topics,
    lp.learning_style as learning_path_style,
    
    -- Recent conversation topics (last 5 conversations)
    COALESCE(
        array_agg(rc.conversation_data ORDER BY rc.rn) FILTER (WHERE rc.rn <= 5),
        ARRAY[]::jsonb[]
    ) as recent_conversations,
    
    -- Achievements count
    COUNT(DISTINCT ua.id) as total_achievements,
    
    -- Context generation timestamp
    NOW() as context_generated_at
    
FROM email_sessions es
LEFT JOIN user_preferences up ON false -- Since user_preferences requires auth.uid(), we'll handle this differently
LEFT JOIN user_progress uprog ON uprog.email_session_id = es.id
LEFT JOIN user_knowledge_areas uka ON false -- Since this also requires auth.uid()
LEFT JOIN learning_paths lp ON lp.email_session_id = es.id
LEFT JOIN conversations c ON c.email_session_id = es.id
LEFT JOIN user_achievements ua ON ua.email_session_id = es.id
LEFT JOIN recent_quizzes rq ON rq.email_session_id = es.id
LEFT JOIN recent_conversations_cte rc ON rc.email_session_id = es.id
WHERE es.is_active = true
GROUP BY 
    es.id, es.email,
    up.learning_style, up.difficulty_preference, up.language_preference, up.daily_goal,
    uprog.total_xp, uprog.current_level, uprog.current_streak, uprog.longest_streak, uprog.last_activity_date,
    lp.current_level, lp.specialty_focus, lp.completed_topics, lp.recommended_topics, lp.learning_style;

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