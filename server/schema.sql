CREATE TABLE IF NOT EXISTS answer_keys (
  passage_id TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  option_index INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  explanation TEXT NOT NULL,
  PRIMARY KEY (passage_id, question_index)
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  passage_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'submitted', 'timed_out')),
  answers_json TEXT NOT NULL DEFAULT '{}',
  flags_json TEXT NOT NULL DEFAULT '{}',
  events_json TEXT NOT NULL DEFAULT '[]',
  exits INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  submitted_at INTEGER,
  result_json TEXT
);

CREATE INDEX IF NOT EXISTS attempts_status_idx ON attempts(status);
CREATE INDEX IF NOT EXISTS attempts_passage_idx ON attempts(passage_id);
