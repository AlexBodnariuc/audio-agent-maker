-- Insert Romanian medical voice personalities for MedMentor
INSERT INTO voice_personalities (name, description, medical_specialty, agent_id, is_active) VALUES
  ('Dr. Ana Popescu', 'Profesor de biologie specializat în pregătirea pentru admiterea la medicină. Îmi place să explic conceptele complexe într-un mod simplu și memorabil, folosind exemple din viața de zi cu zi.', 'Biology', 'ana-bio-mentor-2025', true),
  ('Dr. Radu Ionescu', 'Specialist în chimie organică și anorganică, cu 15 ani de experiență în pregătirea elevilor pentru UMF. Fac conexiuni clare între teoria chimică și aplicațiile medicale.', 'Chemistry', 'radu-chem-mentor-2025', true),
  ('Prof. Elena Marinescu', 'Mentor dedicat pentru pregătirea admiterii la medicina din România, specializat în biologia celulară și moleculară. Ajut elevii să înțeleagă procesele biologice fundamentale.', 'Biology', 'elena-bio-expert-2025', true),
  ('Dr. Mihai Georgescu', 'Chimist cu experiență în educația medicală, focalizat pe chimia organică necesară pentru înțelegerea proceselor biologice. Îmi place să folosesc analogii pentru explicații clare.', 'Chemistry', 'mihai-chem-expert-2025', true),
  ('Asist. Maria Dumitrescu', 'Tânăr cadru didactic cu pasiune pentru predarea biologiei la nivel de liceu. Știu exact ce provocări întâmpină elevii în pregătirea pentru admiterea la medicină.', 'General Medicine', 'maria-general-mentor-2025', true);

-- Insert some sample achievements in Romanian
INSERT INTO achievements (name, description, icon, condition_type, condition_value, xp_reward) VALUES
  ('Primul Pas', 'Ai completat primul quiz de biologie sau chimie', '🎯', 'quiz_completed', 1, 50),
  ('Curiozitatea Ucide Pisica', 'Ai pus 10 întrebări asistentului vocal', '❓', 'voice_questions', 10, 100),
  ('Studentul Dedicat', 'Ai învățat 7 zile consecutiv', '📚', 'streak_days', 7, 200),
  ('Viitorul Medic', 'Ai atins scorul de 90% la un quiz', '🏥', 'quiz_score', 90, 150),
  ('Expertul în Biologie', 'Ai completat 50 de întrebări de biologie', '🧬', 'biology_questions', 50, 300),
  ('Maestrul Chimiei', 'Ai completat 50 de întrebări de chimie', '⚗️', 'chemistry_questions', 50, 300),
  ('Conversația Perfectă', 'Ai avut o conversație de 5 minute cu asistentul vocal', '🎤', 'voice_duration', 300, 100);

-- Insert difficulty levels in Romanian
INSERT INTO difficulty_levels (name, description, sort_order) VALUES
  ('începător', 'Pentru elevii care încep să învețe conceptele de bază', 1),
  ('intermediar', 'Pentru elevii cu cunoștințe solide care vor să aprofundeze', 2),
  ('avansat', 'Pentru elevii care se pregătesc intensiv pentru admitere', 3),
  ('expert', 'Pentru elevii care vor să exceleze la examenul de admitere', 4);

-- Insert subscription plans in Romanian
INSERT INTO subscription_plans (name, description, price_monthly, price_yearly, features, max_quizzes, max_storage_mb) VALUES
  ('gratuit', 'Planul de bază pentru a începe pregătirea', 0, 0, '["20 întrebări pe zi", "Explicații AI de bază", "Acces la asistentul vocal"]', 20, 100),
  ('premium', 'Planul complet pentru pregătirea optimă', 79, 790, '["Întrebări nelimitate", "Explicații AI avansate", "Asistent vocal premium", "Statistici detaliate", "Conținut personalizat"]', -1, 5000),
  ('profesor', 'Pentru profesorii care vor să-și monitorizeze elevii', 79, 790, '["Toate funcțiile premium", "Dashboard pentru 30 elevi", "Rapoarte de progres", "Gestionarea claselor"]', -1, 10000);

COMMENT ON TABLE voice_personalities IS 'Personalități vocale românești specializate în educația medicală';
COMMENT ON TABLE achievements IS 'Realizări pentru gamificarea experienței de învățare în română';
COMMENT ON TABLE difficulty_levels IS 'Nivelurile de dificultate pentru curriculum-ul românesc';
COMMENT ON TABLE subscription_plans IS 'Planurile de abonament pentru piața românească';