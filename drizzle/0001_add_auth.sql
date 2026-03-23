-- Add password_hash to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Dev seed: set password for patrick@company.se to 'Test1234!'
UPDATE users
SET password_hash = '$2b$10$3UVzM5ZhKVb7wWLeRsEQd.WDjkO2JQwB3wOZGABkahet5k56Np6z.'
WHERE email = 'patrick@company.se'
  AND password_hash IS NULL;
