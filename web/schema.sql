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
-- Ajustes do site editados pelo administrador: preços, promoção, Pix, fotos, e-mail de avisos (valor em JSON)
CREATE TABLE IF NOT EXISTS ajustes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  atualizado TEXT NOT NULL
);
-- Histórico do que aconteceu no sistema (entradas, pagamentos, alterações), para conferência e segurança
CREATE TABLE IF NOT EXISTS historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quando TEXT NOT NULL,
  quem TEXT NOT NULL DEFAULT '',
  acao TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_historico_quando ON historico(quando);
-- Comunicados que aparecem no topo do app para todas as assinantes
CREATE TABLE IF NOT EXISTS comunicados (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL DEFAULT 'novidade',
  ate TEXT NOT NULL DEFAULT '',
  criado TEXT NOT NULL
);
-- Por que as assinantes saíram (fica mesmo depois de a conta ser excluída)
CREATE TABLE IF NOT EXISTS saidas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL,
  motivo TEXT NOT NULL,
  detalhe TEXT NOT NULL DEFAULT '',
  quando TEXT NOT NULL
);
-- Dados de cobrança das assinantes (CPF)
CREATE TABLE IF NOT EXISTS clientes (
  user_id TEXT PRIMARY KEY,
  cpf TEXT NOT NULL DEFAULT ''
);
-- Verificação em duas etapas (código do aplicativo autenticador)
CREATE TABLE IF NOT EXISTS segredos (
  user_id TEXT PRIMARY KEY,
  totp TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 0,
  criado TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS desafios (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expira INTEGER NOT NULL
);
-- E-mails que o sistema mandou (ou tentou mandar)
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  para TEXT NOT NULL,
  assunto TEXT NOT NULL,
  tipo TEXT NOT NULL,
  situacao TEXT NOT NULL,
  erro TEXT NOT NULL DEFAULT '',
  criado TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_emails_criado ON emails(criado);
