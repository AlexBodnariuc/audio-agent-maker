// Context Builder Utility for Voice Agents
// Builds context-aware prompts using user data and agent personality

export interface UserContext {
  user_id: string;
  email: string | null;
  learning_style: string | null;
  difficulty_preference: string | null;
  language_preference: string | null;
  daily_goal: number | null;
  total_xp: number | null;
  current_level: number | null;
  current_streak: number | null;
  longest_streak: number | null;
  last_activity_date: string | null;
  knowledge_areas: Array<{
    subject: string;
    proficiency_level: number;
    interest_level: number;
  }>;
  recent_quiz_performance: Array<{
    id: string;
    title: string;
    score: number;
    xp_earned: number;
    completed_at: string;
    total_questions: number;
  }>;
  learning_level: string | null;
  specialty_focus: string | null;
  completed_topics: any[] | null;
  recommended_topics: any[] | null;
  learning_path_style: string | null;
  recent_conversations: Array<{
    id: string;
    title: string;
    specialty_focus: string;
    started_at: string;
    total_messages: number;
  }>;
  total_achievements: number;
  context_generated_at: string;
}

export interface AgentPersona {
  teachingStyle?: string;
  personality?: string;
  expertise?: string[];
  communicationPreferences?: {
    formality?: string;
    encouragementLevel?: string;
    explanationDepth?: string;
  };
  adaptationRules?: {
    beginnerApproach?: string;
    advancedApproach?: string;
    strugglingStudentSupport?: string;
  };
}

export interface ContextualPrompt {
  systemPrompt: string;
  userContext: UserContext | null;
  contextSummary: string;
}

/**
 * Fetches user context from the materialized view
 */
export async function fetchUserContext(
  supabase: any,
  identifier: string,
  identifierType: 'email' | 'user_id' = 'user_id'
): Promise<UserContext | null> {
  try {
    console.log(`Fetching user context for ${identifierType}: ${identifier}`);
    
    const column = identifierType === 'email' ? 'email' : 'user_id';
    const { data, error } = await supabase
      .from('v_agent_context')
      .select('*')
      .eq(column, identifier)
      .single();

    if (error) {
      console.error('Error fetching user context:', error);
      return null;
    }

    console.log('User context fetched successfully');
    return data as UserContext;
  } catch (error) {
    console.error('Exception in fetchUserContext:', error);
    return null;
  }
}

/**
 * Builds a personalized context summary from user data
 */
export function buildContextSummary(context: UserContext): string {
  const parts: string[] = [];

  // Basic user info
  if (context.email) {
    parts.push(`Utilizator: ${context.email}`);
  }

  // Learning profile
  if (context.learning_style || context.difficulty_preference) {
    const style = context.learning_style || 'nedefinit';
    const difficulty = context.difficulty_preference || 'începător';
    parts.push(`Profil de învățare: stilul ${style}, nivel ${difficulty}`);
  }

  // Progress summary
  if (context.total_xp !== null || context.current_level !== null) {
    const xp = context.total_xp || 0;
    const level = context.current_level || 1;
    const streak = context.current_streak || 0;
    parts.push(`Progres: ${xp} XP, nivel ${level}, streak curent ${streak} zile`);
  }

  // Recent performance
  if (context.recent_quiz_performance && context.recent_quiz_performance.length > 0) {
    const recentQuizzes = context.recent_quiz_performance.slice(0, 3);
    const avgScore = recentQuizzes.reduce((sum, quiz) => sum + (quiz.score || 0), 0) / recentQuizzes.length;
    parts.push(`Performanță recentă: ${recentQuizzes.length} chestionare, scor mediu ${avgScore.toFixed(1)}%`);
  }

  // Knowledge areas
  if (context.knowledge_areas && context.knowledge_areas.length > 0) {
    const subjects = context.knowledge_areas.map(ka => ka.subject).join(', ');
    parts.push(`Domenii de interes: ${subjects}`);
  }

  // Learning path
  if (context.specialty_focus) {
    parts.push(`Specializare: ${context.specialty_focus}`);
  }

  // Recent activity
  if (context.recent_conversations && context.recent_conversations.length > 0) {
    parts.push(`${context.recent_conversations.length} conversații recente`);
  }

  return parts.join('. ') + '.';
}

/**
 * Builds a comprehensive, context-aware system prompt
 */
export function buildPrompt(
  baseInstructions: string,
  agentPersona: AgentPersona | null,
  userContext: UserContext | null,
  specialtyFocus?: string
): ContextualPrompt {
  let systemPrompt = baseInstructions;
  let contextSummary = '';

  // Add personality and teaching style from agent persona
  if (agentPersona) {
    if (agentPersona.personality) {
      systemPrompt += `\n\nPersonalitate: ${agentPersona.personality}`;
    }
    
    if (agentPersona.teachingStyle) {
      systemPrompt += `\nStil de predare: ${agentPersona.teachingStyle}`;
    }

    if (agentPersona.expertise && agentPersona.expertise.length > 0) {
      systemPrompt += `\nDomenii de expertiză: ${agentPersona.expertise.join(', ')}`;
    }

    if (agentPersona.communicationPreferences) {
      const prefs = agentPersona.communicationPreferences;
      systemPrompt += `\nPreferințe comunicare:`;
      if (prefs.formality) systemPrompt += ` ${prefs.formality}`;
      if (prefs.encouragementLevel) systemPrompt += `, nivel încurajare ${prefs.encouragementLevel}`;
      if (prefs.explanationDepth) systemPrompt += `, adâncime explicații ${prefs.explanationDepth}`;
    }
  }

  // Add user context if available
  if (userContext) {
    contextSummary = buildContextSummary(userContext);
    
    systemPrompt += `\n\nCONTEXT UTILIZATOR:\n${contextSummary}`;

    // Add adaptive instructions based on user level
    if (userContext.difficulty_preference === 'începător' || userContext.current_level === 1) {
      systemPrompt += `\n\nADAPTARI PENTRU ÎNCEPĂTORI:
- Folosește terminologie simplă și explică conceptele de bază
- Oferă exemple concrete și analogii
- Încurajează și oferă feedback pozitiv frecvent
- Împarte informațiile complexe în pași mici`;
    } else if (userContext.current_level && userContext.current_level > 5) {
      systemPrompt += `\n\nADAPTARI PENTRU NIVEL AVANSAT:
- Poți folosi terminologie medicală specifică
- Oferă explicații mai detaliate și tehnice
- Pune întrebări provocatoare pentru a testa înțelegerea
- Conectează conceptele cu aplicații practice`;
    }

    // Add performance-based adaptations
    if (userContext.recent_quiz_performance && userContext.recent_quiz_performance.length > 0) {
      const avgScore = userContext.recent_quiz_performance.reduce((sum, quiz) => sum + (quiz.score || 0), 0) / userContext.recent_quiz_performance.length;
      
      if (avgScore < 70) {
        systemPrompt += `\n\nSUPORT PENTRU DIFICULTĂȚI:
- Observ că ai avut provocări în testele recente (scor mediu ${avgScore.toFixed(1)}%)
- Oferă explicații mai detaliate și verifică înțelegerea frecvent
- Sugerează metode alternative de învățare
- Încurajează și subliniază progresul pozitiv`;
      } else if (avgScore > 85) {
        systemPrompt += `\n\nRECUNOAȘTERE PERFORMANȚĂ:
- Felicitări pentru performanța excelentă (scor mediu ${avgScore.toFixed(1)}%)!
- Poți introduce concepte mai avansate
- Provocă cu întrebări de nivel superior
- Sugerează subiecte suplimentare de explorat`;
      }
    }

    // Add learning style adaptations
    if (userContext.learning_style) {
      const adaptations = {
        'visual': 'Folosește descrieri vizuale, diagrame conceptuale și analogii spațiale',
        'auditiv': 'Explică verbal cu detalii, folosește repetări și discuții interactive',
        'kinestezic': 'Sugerează exerciții practice, experimente simple și aplicații hands-on',
        'mixed': 'Combină multiple stiluri de învățare pentru o experiență completă'
      };
      
      if (adaptations[userContext.learning_style as keyof typeof adaptations]) {
        systemPrompt += `\n\nADAPTARE STIL ÎNVĂȚARE (${userContext.learning_style}):
${adaptations[userContext.learning_style as keyof typeof adaptations]}`;
      }
    }
  }

  // Add specialty focus if specified
  if (specialtyFocus) {
    systemPrompt += `\n\nFOCUS SPECIALIZARE: ${specialtyFocus}
Concentrează-te pe subiecte și exemple relevante pentru această specializare.`;
  }

  systemPrompt += `\n\nRESPUNDE ÎNTOTDEAUNA ÎN ROMÂNĂ și adaptează-te la nivelul și nevoile utilizatorului bazat pe contextul de mai sus.`;

  return {
    systemPrompt,
    userContext,
    contextSummary
  };
}

/**
 * Refreshes the materialized view (call periodically or after significant user activity)
 */
export async function refreshUserContext(supabase: any): Promise<boolean> {
  try {
    console.log('Refreshing user context materialized view...');
    
    const { error } = await supabase.rpc('refresh_agent_context_view');
    
    if (error) {
      console.error('Error refreshing user context:', error);
      return false;
    }
    
    console.log('User context refreshed successfully');
    return true;
  } catch (error) {
    console.error('Exception in refreshUserContext:', error);
    return false;
  }
}