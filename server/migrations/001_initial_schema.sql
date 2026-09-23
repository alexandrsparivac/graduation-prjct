CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('admin', 'trainer', 'learner');
CREATE TYPE cefr_level AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
CREATE TYPE exercise_kind AS ENUM ('multiple_choice', 'fill_blank', 'matching', 'free_text', 'speaking');
CREATE TYPE lesson_status AS ENUM ('not_started', 'in_progress', 'completed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'learner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE professional_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(80) NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE learner_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_language VARCHAR(32) NOT NULL DEFAULT 'English',
  domain_id UUID REFERENCES professional_domains(id),
  cefr_level cefr_level,
  weekly_goal SMALLINT NOT NULL DEFAULT 3 CHECK (weekly_goal BETWEEN 1 AND 14),
  onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES professional_domains(id),
  author_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  level cefr_level NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  content JSONB NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL CHECK (position > 0),
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes > 0),
  UNIQUE(course_id, position)
);

CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  type exercise_kind NOT NULL,
  skill VARCHAR(40) NOT NULL,
  prompt TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  answer_key JSONB NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL CHECK (position > 0),
  UNIQUE(lesson_id, position)
);

CREATE TABLE enrollments (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, course_id)
);

CREATE TABLE placement_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  cefr_level cefr_level NOT NULL,
  answers JSONB NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE learning_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(280) NOT NULL,
  target_date DATE,
  completed_at TIMESTAMPTZ
);

CREATE TABLE lesson_progress (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status lesson_status NOT NULL DEFAULT 'not_started',
  percent SMALLINT NOT NULL DEFAULT 0 CHECK (percent BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, lesson_id)
);

CREATE TABLE exercise_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  answer JSONB NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  feedback TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(40) NOT NULL,
  message TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ
);

CREATE TABLE recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX exercise_results_user_exercise_idx ON exercise_results(user_id, exercise_id);
CREATE INDEX recommendations_user_score_idx ON recommendations(user_id, score DESC);
CREATE INDEX notifications_due_idx ON notifications(user_id, scheduled_for) WHERE read_at IS NULL;
