# Debug Session: Live Chat RLS Issues

## Context
After refactoring live-chat functionality with demo/auth + TTS, the application is stuck with RLS policy violations.

## ETAPA 1 · ÎNTREBĂRI DIAGNOSTIC

| ID | Întrebare | Răspuns |
|----|-----------|---------|
| Q1 | Care e **error trace** exact (stack + requestId) din Edge Logs când mesajul de chat e trimis? | RLS violation: "new row violates row-level security policy for table \"conversations\"" - Error occurs in create-conversation function |
| Q2 | Requestul către `/openai-chat-stream` conține **Authorization**? ce JWT? | Yes, contains Bearer token eyJhbGciOiJIUzI1NiIsImtpZCI6Im9GZkJNZGw... (authenticated user) |
| Q3 | Câmpurile conversației nou-create (`conversations`): `user_id`, `email_session_id`, `demo_chat` – ce valori au? | For demo_chat: user_id=null, email_session_id=generated_demo_session_id. RLS policy was looking for session_token in JWT claims |
| Q4 | Politica RLS activă pentru `conversation_messages` — ce condiție eșuează? | Policy relied on session_token from JWT claims which doesn't exist for Supabase Auth users |
| Q5 | Se inserează rând în `tts_jobs`? Dacă nu, ce eroare/contrângere apare? | Cannot reach this step due to conversation creation failure from RLS violation |
| Q6 | În `supabase.functions.logs`, vezi vreun `RATE_LIMIT`? Câte cereri/min? | No rate limit errors visible in current logs |

## Root Cause
RLS policies for `conversations` and `conversation_messages` tables were using `session_token` from JWT claims to identify email sessions. However, users authenticated via Supabase Auth don't have custom `session_token` in their JWT claims. The policies needed to be updated to properly handle both:
1. Authenticated users: Use `auth.uid() = user_id` 
2. Demo sessions: Use `email_session_id` with demo email pattern (`%@medmentor.demo`)

## Fix Applied
- Updated RLS policies for `conversations` table to handle both auth users and demo sessions
- Updated RLS policies for `conversation_messages` table with consistent logic
- Removed dependency on JWT `session_token` claims for demo session validation
- Demo sessions now validated by checking email_session_id with demo email pattern