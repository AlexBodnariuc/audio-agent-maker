# MedMentor Voice-Tutor MVP - Manual QA Checklist

## Scop
Acest checklist acoperă toate scenariile critice pentru MVP-ul MedMentor Voice-Tutor înainte de release. Testele automatizate (Vitest, Jest, Playwright) rulează în CI, dar aceste verificări manuale asigură calitatea end-to-end.

## Instrucțiuni
- [ ] Verifică că toate testele automatizate trec (`pnpm vitest && pnpm jest`)
- [ ] Rulează `ci-check.sh` și verifică că nu există erori
- [ ] Completează fiecare rând din tabelul de mai jos
- [ ] Marchează cu ✅ dacă testul trece, cu ❌ dacă eșuează
- [ ] Pentru eșecuri, documentează problema în coloana "Observații"

---

## Matrice de Testare Manuală

| ID  | Zonă                  | Scenariu de Test                                          | Pași de Executare                                                                                                     | Rezultat Așteptat                                                           | Status | Observații |
|-----|-----------------------|-----------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------|--------|------------|
| A-1 | JWT Guard             | Cerere fără JWT                                           | `curl -X POST https://[project].supabase.co/functions/v1/create-voice-agent -d '{"test":"data"}'`                   | 401 Unauthorized, mesaj "authentication required"                           |        |            |
| A-2 | JWT Guard             | JWT invalid                                               | `curl -X POST ... -H "Authorization: Bearer invalid-token"`                                                          | 401 Unauthorized, mesaj "invalid token"                                     |        |            |
| A-3 | JWT Guard             | JWT valid                                                 | `curl -X POST ... -H "Authorization: Bearer [valid-jwt]" -d '{"name":"Test","agent_id":"test"}'`                    | 200 OK sau status valid (nu 401/403)                                       |        |            |
| B-1 | RLS Cross-Tenant      | User A încearcă să acceseze resursele User B             | Login ca User A, apoi GET `/manage-voice-agents?id=[agent-id-user-b]`                                                | 403 Forbidden sau 404 Not Found                                            |        |            |
| B-2 | RLS Cross-Tenant      | User A accesează propriile resurse                       | Login ca User A, apoi GET `/manage-voice-agents?id=[agent-id-user-a]`                                                | 200 OK, returnează datele corecte pentru User A                            |        |            |
| B-3 | RLS Cross-Tenant      | User B PATCH pe resursa User A                           | Login ca User B, apoi PATCH `/manage-voice-agents` cu `{"id":"[agent-user-a]","name":"hacked"}`                     | 404 Not Found (RLS blochează accesul)                                      |        |            |
| C-1 | CRUD Agents           | CREATE agent nou                                         | POST `/create-voice-agent` cu date valide                                                                            | 201 Created, agent creat cu ID și proprietăți corecte                      |        |            |
| C-2 | CRUD Agents           | LIST proprii agents + paginare                          | GET `/manage-voice-agents?limit=5&offset=0`                                                                          | 200 OK, max 5 agenți, paginare funcțională                                 |        |            |
| C-3 | CRUD Agents           | UPDATE agent existent                                    | PATCH `/manage-voice-agents` cu modificări validei                                                                   | 200 OK, modificările aplicate corect                                       |        |            |
| C-4 | CRUD Agents           | DELETE (soft) agent                                      | DELETE `/manage-voice-agents` cu `{"id":"[agent-id]"}`                                                               | 200 OK, agent marcat ca `is_active=false`                                  |        |            |
| D-1 | Voice Chat + TTS      | Trimite întrebare → mesaj assistant cu audio_url=null   | POST `/openai-voice-chat` cu întrebare                                                                               | 200 OK, assistant_message cu content ≠ null, audio_url = null              |        |            |
| D-2 | Voice Chat + TTS      | TTS Worker procesează job-ul                             | Verifică tabela `tts_jobs`, rulează worker manual/auto                                                               | Job cu status="completed", audio_url populat                               |        |            |
| D-3 | Voice Chat + TTS      | Audio URL accesibil                                      | `curl [audio_url]` sau access browser                                                                                | 200 OK, Content-Type: audio/mpeg, fișier MP3 valid                        |        |            |
| D-4 | Voice Chat + TTS      | Multiple joburi TTS în coadă                            | Creează 3+ mesaje rapid, verifică tabela `tts_jobs`                                                                  | Toate joburile create, procesate în ordine priorităților                   |        |            |
| E-1 | Rate Limiting         | 20 cereri OK, a 21-a eșuează                            | Script cu 25 cereri rapide către același endpoint                                                                    | Prime 20 → 200 OK, următoarele → 429 Too Many Requests                   |        |            |
| E-2 | Rate Limiting         | Rate limit independent per user                         | User A face 20 cereri, User B face cerere                                                                           | User B să primească 200 OK (nu 429)                                       |        |            |
| E-3 | Rate Limiting         | Reset după expirarea ferestrei                          | Așteaptă expirarea ferestrei de rate limit, apoi încearcă din nou                                                    | Cereri permise din nou după reset                                          |        |            |
| F-1 | Context Builder       | User fără progres → prompt "nespecificat"               | Apelează context builder pentru user nou (fără XP/streak)                                                           | buildContextSummary() conține "nedefinit" sau "nespecificat"               |        |            |
| F-2 | Context Builder       | User cu progres → prompt cu valori reale                | User cu XP=1250, level=5, streak=7 → apelează context builder                                                       | Prompt conține "1250 XP", "nivel 5", "streak curent 7"                   |        |            |
| F-3 | Context Builder       | Agregare date din tabele multiple                       | User cu quiz_performance, knowledge_areas, achievements                                                               | Context include performanță, domenii, achievements                         |        |            |
| G-1 | Frontend UI           | AudioBubble loading state                                | Trimite mesaj în chat, observă UI                                                                                    | Spinner apare în timpul TTS, dispare când audio e ready                   |        |            |
| G-2 | Frontend UI           | Audio playback controls                                  | Click pe butonul play din AudioBubble                                                                                | Audio se reproduce, controale play/pause funcționale                      |        |            |
| G-3 | Frontend UI           | Error handling pentru TTS failed                        | Forțează eroare TTS (text foarte lung, caractere speciale)                                                          | UI arată eroare, buton retry sau mesaj "Audio generation failed"          |        |            |
| G-4 | Frontend UI           | Multiple messages cu TTS                                 | Trimite 3 întrebări consecutive                                                                                      | Fiecare răspuns are AudioBubble separat, toate cu audio funcțional        |        |            |
| H-1 | Securitate            | Service role key NU în functions                        | `grep -r "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/`                                                            | Niciun rezultat găsit (sau doar comentarii/README)                        |        |            |
| H-2 | Securitate            | Input validation pentru XSS                             | POST cu `<script>alert('xss')</script>` în input                                                                     | Input sanitizat, script tags eliminate                                     |        |            |
| H-3 | Securitate            | SQL injection protection                                 | POST cu `'; DROP TABLE users; --` în parametri                                                                       | Cerere respinsă sau parametri sanitizați                                   |        |            |
| I-1 | Performance           | TTS job processing time                                  | Măsoară timpul de la enqueue la completed                                                                            | < 30 secunde pentru text normal (200-300 caractere)                       |        |            |
| I-2 | Performance           | Audio file size                                          | Verifică dimensiunea fișierelor MP3 generate                                                                         | < 5MB pentru răspunsuri normale, format comprimat                         |        |            |
| I-3 | Performance           | Concurrent TTS jobs                                      | Trimite 5 mesaje simultan, măsoară processing time                                                                   | Toate procesate în < 2 minute, fără deadlock                              |        |            |
| J-1 | Edge Cases            | Text foarte lung pentru TTS                              | Trimite text de 2000+ caractere pentru TTS                                                                           | TTS splitting sau error handling corespunzător                             |        |            |
| J-2 | Edge Cases            | Caractere speciale românești                            | Text cu "ă, â, î, ș, ț" și semne diacritice                                                                         | Audio generat corect, pronunție română                                     |        |            |
| J-3 | Edge Cases            | User deletion cu resources active                       | Șterge user cu agents activi și TTS jobs în progres                                                                  | Cleanup corespunzător, nu se întrerup alte users                          |        |            |
| K-1 | Mobile Responsiveness | Interface pe telefon (viewport 375px)                   | Testează pe dispozitiv mobil sau DevTools mobile view                                                                | UI responsive, controale audio accesibile                                  |        |            |
| K-2 | Mobile Responsiveness | Audio playback pe mobile                                | Testează redarea audio pe telefon                                                                                    | Audio funcționează pe iOS/Android                                          |        |            |
| K-3 | Mobile Responsiveness | Touch interactions                                       | Testează tap pe butoane, swipe, long press                                                                           | Toate interacțiunile touch responsive                                      |        |            |

---

## Criterii de Acceptanță pentru Release

### ✅ MUST PASS (Blocante pentru release)
- [ ] Toate testele A-1 până A-3 (JWT Guard) trec
- [ ] Toate testele B-1 până B-3 (RLS Cross-Tenant) trec  
- [ ] Teste C-1 până C-4 (CRUD Agents) trec
- [ ] Teste D-1 până D-3 (Voice Chat + TTS core flow) trec
- [ ] Testul H-1 (Service role key security) trece
- [ ] CI-check.sh rulează fără erori
- [ ] `pnpm vitest && pnpm jest` trec 100%

### ⚠️ SHOULD PASS (Important, dar nu blocant)
- [ ] Rate limiting (E-1, E-2, E-3) funcționează
- [ ] Context builder (F-1, F-2, F-3) corect
- [ ] Frontend UI (G-1 până G-4) responsive și funcțional
- [ ] Performance (I-1, I-2, I-3) în limite acceptabile

### 📋 NICE TO HAVE (Post-release)
- [ ] Edge cases (J-1, J-2, J-3) handled gracefully
- [ ] Mobile experience (K-1, K-2, K-3) optimal
- [ ] Security extras (H-2, H-3) implemented

---

## Notițe pentru QA Engineer

### Setup Environment
1. **Supabase Project**: Folosește project ID `ybdvhqmjlztlvrfurkaf`
2. **Test Users**: Creează users cu `test+1@medmentor.ro`, `test+2@medmentor.ro`
3. **API Keys**: Asigură-te că `ELEVENLABS_API_KEY` și `OPENAI_API_KEY` sunt setate
4. **Database**: Verifică că migrațiile sunt aplicate (tabele `tts_jobs`, `voice_personalities`, etc.)

### Common Issues și Troubleshooting
- **401 Unauthorized**: Verifică că JWT token e valid și nu e expirat
- **TTS nu funcționează**: Verifică `ELEVENLABS_API_KEY` și storage bucket `voices-cache`
- **Rate limiting prea strict**: Ajustează limitele în tabela `rate_limits`
- **Audio nu se reproduce**: Verifică Content-Type și CORS headers

### Raportare Bug-uri
Pentru fiecare eșec, includde:
1. **ID Test**: (ex: "D-2") 
2. **Environment**: (dev/staging/prod)
3. **User**: (email test user)
4. **Steps to Reproduce**: Pași exacti
5. **Expected vs Actual**: Ce era de așteptat vs ce s-a întâmplat
6. **Logs**: Console errors, network tab, server logs
7. **Screenshots**: Pentru UI issues

---

**Semnat QA**: _________________ **Data**: _________

**Semnat PM**: _________________ **Data**: _________

**Status Final**: [ ] ✅ APPROVED FOR RELEASE [ ] ❌ NEEDS FIXES