-- Visitor tracking table for website analytics
CREATE TABLE IF NOT EXISTS visitor_logs (
  id BIGSERIAL PRIMARY KEY,
  ip_address TEXT,
  user_agent TEXT,
  device_type TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  referrer TEXT,
  page_url TEXT,
  country TEXT,
  city TEXT,
  isp TEXT,
  latitude TEXT,
  longitude TEXT,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_visitor_logs_created_at ON visitor_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_user_id ON visitor_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_ip_address ON visitor_logs(ip_address);

-- Enable RLS
ALTER TABLE visitor_logs ENABLE ROW LEVEL SECURITY;

-- Policies: only admins can read visitor_logs, anyone can insert
CREATE POLICY "Admins can read visitor logs"
  ON visitor_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can insert visitor logs"
  ON visitor_logs
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
