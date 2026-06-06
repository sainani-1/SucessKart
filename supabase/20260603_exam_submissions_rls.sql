DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students can read own exam submissions' AND tablename = 'exam_submissions') THEN
    CREATE POLICY "Students can read own exam submissions" ON exam_submissions FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Students can insert own exam submissions' AND tablename = 'exam_submissions') THEN
    CREATE POLICY "Students can insert own exam submissions" ON exam_submissions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can read all exam submissions' AND tablename = 'exam_submissions') THEN
    CREATE POLICY "Admins can read all exam submissions" ON exam_submissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END
$$;
