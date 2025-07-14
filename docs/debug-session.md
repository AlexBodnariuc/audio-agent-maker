# Debug Session: Live Chat RLS Issues

## Context
After refactoring live-chat functionality with demo/auth + TTS, the application is stuck with RLS policy violations.

## ETAPA 1 · ÎNTREBĂRI DIAGNOSTIC

| ID | Întrebare | Răspuns (TODO) |
|----|-----------|----------------|
| Q1 | Care e **error trace** exact (stack + requestId) din Edge Logs când mesajul de chat e trimis? | RLS violation: "new row violates row-level security policy for table \"conversations\"" - Error occurs in create-conversation function |
| Q2 | Requestul către `/openai-chat-stream` conține **Authorization**? ce JWT? | Yes, contains Bearer token eyJhbGciOiJIUzI1NiIsImtpZCI6Im9GZkJNZGw... |
| Q3 | Câmpurile conversației nou-create (`conversations`): `user_id`, `email_session_id`, `demo_chat` – ce valori au? | TODO - need to check exact values being inserted |
| Q4 | Politica RLS activă pentru `conversation_messages` — ce condiție eșuează? (rule check cu `EXPLAIN POLICY`) | TODO - need to check RLS policies |
| Q5 | Se inserează rând în `tts_jobs`? Dacă nu, ce eroare/contrângere apare? | TODO - cannot reach this step due to conversation creation failure |
| Q6 | În `supabase.functions.logs`, vezi vreun `RATE_LIMIT`? Câte cereri/min? | No rate limit errors visible in current logs |

## Root Cause
TODO - To be determined after investigation

## Fix Applied
TODO - To be applied after root cause identification