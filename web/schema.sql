-- Usuárias (fisioterapeutas). A primeira conta, criada na instalação, é a administradora.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL DEFAULT '',
  senha_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  ativo INTEGER NOT NULL DEFAULT 1,
  valido_ate TEXT NOT NULL DEFAULT '',   -- último dia de acesso (AAAA-MM-DD); vazio = sem limite (admin)
  obs TEXT NOT NULL DEFAULT '',
  criado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expira INTEGER NOT NULL
);
-- Registros do app (pacientes, evoluções, etc.), separados por usuária
CREATE TABLE IF NOT EXISTS docs (
  user_id TEXT NOT NULL,
  col TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  atualizado TEXT NOT NULL,
  PRIMARY KEY (user_id, col, id)
);
-- Pagamentos das mensalidades
CREATE TABLE IF NOT EXISTS assinaturas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  dias INTEGER NOT NULL,
  valido_ate TEXT NOT NULL,
  forma TEXT NOT NULL DEFAULT ''
);
-- Interessadas que preencheram o formulário da página de vendas
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL DEFAULT '',
  mensagem TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'novo',
  criado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_assinaturas_user ON assinaturas(user_id);
-- Tentativas de login erradas (por e-mail e por endereço de internet), para bloquear quem fica chutando senhas
CREATE TABLE IF NOT EXISTS tentativas (
  chave TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  inicio INTEGER NOT NULL,
  bloqueado_ate INTEGER NOT NULL DEFAULT 0
);
-- Links de nova senha: guarda só o hash do código; vale 24 horas e uma única vez
CREATE TABLE IF NOT EXISTS recuperacoes (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expira INTEGER NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0,
  criado TEXT NOT NULL
);
