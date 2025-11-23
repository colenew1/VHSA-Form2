-- Create screener_users table for screening form authentication
CREATE TABLE IF NOT EXISTS screener_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Add index on email for fast lookups
CREATE INDEX idx_screener_users_email ON screener_users(email);

-- Optional: Add any additional fields you need (e.g., organization, role, etc.)

-- Add known screeners (optional)
-- INSERT INTO screener_users (email, name) VALUES
--   ('screener1@example.com', 'John Doe'),
--   ('screener2@example.com', 'Jane Smith')
-- ON CONFLICT (email) DO NOTHING;

