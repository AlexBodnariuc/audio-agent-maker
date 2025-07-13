-- Insert Romanian medical voice personalities (only if they don't exist)
INSERT INTO voice_personalities (name, description, medical_specialty, agent_id, is_active) 
SELECT * FROM (VALUES
  ('Dr. Ana Popescu', 'Profesor de biologie specializat în pregătirea pentru admiterea la medicină. Îmi place să explic conceptele complexe într-un mod simplu și memorabil, folosind exemple din viața de zi cu zi.', 'Biology', 'ana-bio-mentor-2025', true),
  ('Dr. Radu Ionescu', 'Specialist în chimie organică și anorganică, cu 15 ani de experiență în pregătirea elevilor pentru UMF. Fac conexiuni clare între teoria chimică și aplicațiile medicale.', 'Chemistry', 'radu-chem-mentor-2025', true),
  ('Prof. Elena Marinescu', 'Mentor dedicat pentru pregătirea admiterii la medicina din România, specializat în biologia celulară și moleculară. Ajut elevii să înțeleagă procesele biologice fundamentale.', 'Biology', 'elena-bio-expert-2025', true),
  ('Dr. Mihai Georgescu', 'Chimist cu experiență în educația medicală, focalizat pe chimia organică necesară pentru înțelegerea proceselor biologice. Îmi place să folosesc analogii pentru explicații clare.', 'Chemistry', 'mihai-chem-expert-2025', true),
  ('Asist. Maria Dumitrescu', 'Tânăr cadru didactic cu pasiune pentru predarea biologiei la nivel de liceu. Știu exact ce provocări întâmpină elevii în pregătirea pentru admiterea la medicină.', 'General Medicine', 'maria-general-mentor-2025', true)
) AS v (name, description, medical_specialty, agent_id, is_active)
WHERE NOT EXISTS (SELECT 1 FROM voice_personalities WHERE agent_id = v.agent_id);

-- Insert achievements (only if they don't exist)
INSERT INTO achievements (name, description, icon, condition_type, condition_value, xp_reward)
SELECT * FROM (VALUES
  ('Primul Pas', 'Ai completat primul quiz de biologie sau chimie', '🎯', 'quiz_completed', 1, 50),
  ('Curiozitatea Ucide Pisica', 'Ai pus 10 întrebări asistentului vocal', '❓', 'voice_questions', 10, 100),
  ('Studentul Dedicat', 'Ai învățat 7 zile consecutiv', '📚', 'streak_days', 7, 200),
  ('Viitorul Medic', 'Ai atins scorul de 90% la un quiz', '🏥', 'quiz_score', 90, 150),
  ('Expertul în Biologie', 'Ai completat 50 de întrebări de biologie', '🧬', 'biology_questions', 50, 300),
  ('Maestrul Chimiei', 'Ai completat 50 de întrebări de chimie', '⚗️', 'chemistry_questions', 50, 300),
  ('Conversația Perfectă', 'Ai avut o conversație de 5 minute cu asistentul vocal', '🎤', 'voice_duration', 300, 100)
) AS a (name, description, icon, condition_type, condition_value, xp_reward)
WHERE NOT EXISTS (SELECT 1 FROM achievements WHERE name = a.name);

-- Update existing subscription plans with Romanian descriptions
UPDATE subscription_plans SET 
  description = CASE 
    WHEN name = 'free' THEN 'Planul de bază pentru a începe pregătirea'
    WHEN name = 'premium' THEN 'Planul complet pentru pregătirea optimă'
    WHEN name = 'teacher' THEN 'Pentru profesorii care vor să-și monitorizeze elevii'
    ELSE description
  END,
  features = CASE 
    WHEN name = 'free' THEN '["20 întrebări pe zi", "Explicații AI de bază", "Acces la asistentul vocal"]'::jsonb
    WHEN name = 'premium' THEN '["Întrebări nelimitate", "Explicații AI avansate", "Asistent vocal premium", "Statistici detaliate", "Conținut personalizat"]'::jsonb
    WHEN name = 'teacher' THEN '["Toate funcțiile premium", "Dashboard pentru 30 elevi", "Rapoarte de progres", "Gestionarea claselor"]'::jsonb
    ELSE features
  END
WHERE name IN ('free', 'premium', 'teacher');