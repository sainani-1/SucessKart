-- Add DELETE policy for admins on visitor_logs
CREATE POLICY "Admins can delete visitor logs"
  ON visitor_logs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add username/email columns for logged-in user tracking
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS email TEXT;
