PRAGMA foreign_keys = ON;
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  nickname TEXT,
  consent_version TEXT,
  created_at INTEGER NOT NULL,
  registered_at INTEGER,
  UNIQUE(provider, subject)
);
CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX account_session_expiry ON account_sessions(expires_at);
CREATE TABLE account_challenges (
  nonce_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX account_challenge_expiry ON account_challenges(expires_at);
CREATE TABLE account_data (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  entries TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE account_data_history (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  entries TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(account_id, revision)
);
-- 현재 저장과 복구본 기록이 한 트랜잭션 안에서 함께 성공해야 한다.
CREATE TRIGGER account_data_insert AFTER INSERT ON account_data BEGIN
  INSERT INTO account_data_history VALUES(NEW.account_id, NEW.revision, NEW.entries, NEW.updated_at);
END;
CREATE TRIGGER account_data_update AFTER UPDATE ON account_data BEGIN
  INSERT INTO account_data_history VALUES(NEW.account_id, NEW.revision, NEW.entries, NEW.updated_at);
  DELETE FROM account_data_history WHERE account_id = NEW.account_id AND revision <= NEW.revision - 5;
END;
