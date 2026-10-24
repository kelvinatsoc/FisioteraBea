// API do FisioBea (Cloudflare Pages Functions + D1)
// Rotas:
//   POST /api/cadastro {nome, email, senha}     POST /api/login {email, senha}
//   POST /api/sair                              GET  /api/eu
//   GET  /api/dados                             PUT/DELETE /api/doc/:col/:id
//   POST /api/senha {atual, nova}
//   Admin: GET /api/admin/usuarios, PATCH /api/admin/usuarios/:id {ativo, role, senha}

const COLECOES = ['pacientes', 'evolucoes', 'avaliacoes', 'sessoes', 'pagamentos', 'config'];
const SESSAO_DIAS = 30;
const ITERACOES = 100000;

const json = (dados, status = 200, headers = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const erro = (msg, status = 400) => json({ erro: msg }, status);
const agora = () => new Date().toISOString();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const aleatorio = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashSenha(senha, salt) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITERACOES }, chave, 256);
  return hex(bits);
}
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function cookieSessao(token, url, maxAge) {
  const seguro = url.protocol === 'https:' ? '; Secure' : '';
  return `sessao=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro}`;
}
async function criarSessao(env, userId, url) {
  const token = aleatorio();
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expira) VALUES (?, ?, ?)')
    .bind(token, userId, Date.now() + SESSAO_DIAS * 864e5).run();
  return cookieSessao(token, url, SESSAO_DIAS * 86400);
}
async function usuarioAtual(env, request) {
  const m = /(?:^|;\s*)sessao=([a-f0-9]{64})/.exec(request.headers.get('cookie') || '');
  if (!m) return null;
  const u = await env.DB.prepare(
    'SELECT u.id, u.email, u.nome, u.role, u.ativo FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expira > ?'
  ).bind(m[1], Date.now()).first();
  if (!u || !u.ativo) return null;
  return { ...u, token: m[1] };
}
const publico = u => ({ id: u.id, email: u.email, nome: u.nome, role: u.role });

async function lerJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const partes = params.path || [];
  const rota = partes[0];
  const metodo = request.method;

  // Proteção básica contra requisições de outros sites
  if (metodo !== 'GET') {
    const origem = request.headers.get('origin');
    if (origem && origem !== url.origin) return erro('Origem não permitida', 403);
  }

  try {
    if (rota === 'cadastro' && metodo === 'POST') {
      const { nome, email, senha } = await lerJson(request);
      const e = String(email || '').trim().toLowerCase();
      if (!String(nome || '').trim()) return erro('Informe seu nome.');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return erro('Informe um e-mail válido.');
      if (String(senha || '').length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
      if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()) return erro('Este e-mail já tem cadastro. Faça login.');
      const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
      const role = total.n === 0 ? 'admin' : 'user';
      const id = aleatorio(12), salt = aleatorio(16);
      await env.DB.prepare('INSERT INTO users (id, email, nome, senha_hash, salt, role, ativo, criado) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
        .bind(id, e, String(nome).trim(), await hashSenha(senha, salt), salt, role, agora()).run();
      const cookie = await criarSessao(env, id, url);
      return json({ usuario: { id, email: e, nome: String(nome).trim(), role } }, 201, { 'set-cookie': cookie });
    }

    if (rota === 'login' && metodo === 'POST') {
      const { email, senha } = await lerJson(request);
      const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(String(email || '').trim().toLowerCase()).first();
      if (!u || !iguais(await hashSenha(String(senha || ''), u.salt), u.senha_hash)) return erro('E-mail ou senha incorretos.', 401);
      if (!u.ativo) return erro('Sua conta está desativada. Fale com a administradora.', 403);
      const cookie = await criarSessao(env, u.id, url);
      return json({ usuario: publico(u) }, 200, { 'set-cookie': cookie });
    }

    const eu = await usuarioAtual(env, request);
    if (!eu) return erro('Faça login para continuar.', 401);

    if (rota === 'sair' && metodo === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(eu.token).run();
      return json({ ok: true }, 200, { 'set-cookie': cookieSessao('', url, 0) });
    }
    if (rota === 'eu' && metodo === 'GET') return json({ usuario: publico(eu) });

    if (rota === 'senha' && metodo === 'POST') {
      const { atual, nova } = await lerJson(request);
      const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(eu.id).first();
      if (!iguais(await hashSenha(String(atual || ''), u.salt), u.senha_hash)) return erro('Senha atual incorreta.', 401);
      if (String(nova || '').length < 8) return erro('A nova senha precisa ter pelo menos 8 caracteres.');
      const salt = aleatorio(16);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET senha_hash = ?, salt = ? WHERE id = ?').bind(await hashSenha(nova, salt), salt, eu.id),
        env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').bind(eu.id, eu.token),
      ]);
      return json({ ok: true });
    }

    if (rota === 'dados' && metodo === 'GET') {
      const { results } = await env.DB.prepare('SELECT col, id, data FROM docs WHERE user_id = ?').bind(eu.id).all();
      const dados = Object.fromEntries(COLECOES.map(c => [c, []]));
      for (const r of results) if (dados[r.col]) dados[r.col].push({ ...JSON.parse(r.data), id: r.id });
      return json(dados);
    }

    if (rota === 'doc') {
      const [, col, id] = partes;
      if (!COLECOES.includes(col) || !/^[A-Za-z0-9_\-.:]{1,100}$/.test(id || '')) return erro('Registro inválido.');
      if (metodo === 'PUT') {
        const corpo = await request.text();
        if (corpo.length > 500000) return erro('Registro grande demais.');
        let obj; try { obj = JSON.parse(corpo); } catch (e) { return erro('Dados inválidos.'); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return erro('Dados inválidos.');
        await env.DB.prepare('INSERT INTO docs (user_id, col, id, data, atualizado) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, col, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado')
          .bind(eu.id, col, id, JSON.stringify({ ...obj, id }), agora()).run();
        return json({ ok: true });
      }
      if (metodo === 'DELETE') {
        await env.DB.prepare('DELETE FROM docs WHERE user_id = ? AND col = ? AND id = ?').bind(eu.id, col, id).run();
        return json({ ok: true });
      }
    }

    if (rota === 'admin') {
      if (eu.role !== 'admin') return erro('Apenas a administradora pode fazer isso.', 403);
      if (partes[1] === 'usuarios' && !partes[2] && metodo === 'GET') {
        const { results } = await env.DB.prepare(
          `SELECT u.id, u.email, u.nome, u.role, u.ativo, u.criado,
             (SELECT COUNT(*) FROM docs d WHERE d.user_id = u.id AND d.col = 'pacientes') AS pacientes
           FROM users u ORDER BY u.criado`
        ).all();
        return json({ usuarios: results });
      }
      if (partes[1] === 'usuarios' && partes[2] && metodo === 'PATCH') {
        const alvo = partes[2];
        const { ativo, role, senha } = await lerJson(request);
        if (alvo === eu.id && (ativo === false || role === 'user')) return erro('Você não pode tirar seu próprio acesso de administradora.');
        const ops = [];
        if (typeof ativo === 'boolean') {
          ops.push(env.DB.prepare('UPDATE users SET ativo = ? WHERE id = ?').bind(ativo ? 1 : 0, alvo));
          if (!ativo) ops.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(alvo));
        }
        if (role === 'admin' || role === 'user') ops.push(env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, alvo));
        if (senha) {
          if (String(senha).length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
          const salt = aleatorio(16);
          ops.push(env.DB.prepare('UPDATE users SET senha_hash = ?, salt = ? WHERE id = ?').bind(await hashSenha(senha, salt), salt, alvo));
          ops.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(alvo));
        }
        if (!ops.length) return erro('Nada para alterar.');
        await env.DB.batch(ops);
        return json({ ok: true });
      }
    }

    return erro('Rota não encontrada.', 404);
  } catch (e) {
    return erro('Erro no servidor. Tente de novo.', 500);
  }
}
