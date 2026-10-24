-- Usuários (fisioterapeutas). O primeiro cadastro vira administrador.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expira INTEGER NOT NULL
);
-- Todos os registros do app (pacientes, evoluções, etc.), separados por usuário
CREATE TABLE IF NOT EXISTS docs (
  user_id TEXT NOT NULL,
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  atualizado TEXT NOT NULL,
  PRIMARY KEY (user_id, col, id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
