// API do FisioBea (Cloudflare Pages Functions + D1)
// Públicas:  GET /api/status            POST /api/instalar {nome, email, senha} (só enquanto não há nenhuma conta)
//            POST /api/login {email, senha}   POST /api/pedido {nome, email, telefone, mensagem}
//            POST /api/esqueci {email}        GET /api/redefinir?codigo=   POST /api/redefinir {codigo, senha}
//            POST /api/cadastro {nome, email, telefone, senha} (conta nova com 7 dias de teste grátis)
// Logada:    POST /api/sair   GET /api/eu   POST /api/senha {atual, nova}
//            GET /api/dados   PUT/DELETE /api/doc/:col/:id
// Admin:     GET /api/admin/resumo
//            GET/POST /api/admin/usuarios          PATCH /api/admin/usuarios/:id
//            POST /api/admin/usuarios/:id/pagamento {valor, dias, data, forma}
//            GET /api/admin/usuarios/:id/pagamentos
//            POST /api/admin/usuarios/:id/link-senha {pedido?}
//            PATCH /api/admin/pedidos/:id {status}

const COLECOES = ['pacientes', 'evolucoes', 'avaliacoes', 'sessoes', 'pagamentos', 'config'];
const SESSAO_DIAS = 30;
const ITERACOES = 100000;

const json = (dados, status = 200, headers = {}) =>
  new Response(JSON.stringify(dados), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
const erro = (msg, status = 400, extra = {}) => json({ erro: msg, ...extra }, status);
const agora = () => new Date().toISOString();
// Datas de assinatura seguem o horário de Brasília
const hoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const br = iso => iso ? iso.split('-').reverse().join('/') : '';
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const aleatorio = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
const emailValido = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const dataValida = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
// Acesso vitalício (sem mensalidade) é guardado como uma data de validade que nunca chega
const VITALICIO = '9999-12-31';
// Teste grátis: conta criada pela própria pessoa no site; vale até ela fazer o primeiro pagamento
const TESTE_DIAS = 7, OBS_TESTE = 'Teste grátis pelo site';
const soDigitos = v => String(v || '').replace(/\D/g, '');

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
const vencida = u => u.role !== 'admin' && (!u.valido_ate || u.valido_ate < hoje());
const emTeste = async (env, u) => u.role !== 'admin' && u.valido_ate !== VITALICIO
  && !(await env.DB.prepare('SELECT 1 FROM assinaturas WHERE user_id = ? LIMIT 1').bind(u.id).first());
// WhatsApp da administradora, para o botão de assinar/renovar
const contatoAdmin = async env => (await env.DB.prepare("SELECT telefone FROM users WHERE role = 'admin' ORDER BY criado LIMIT 1").first())?.telefone || '';
async function respostaVencida(env, u) {
  const teste = await emTeste(env, u);
  const msg = !u.valido_ate ? 'Sua assinatura ainda não foi ativada. Fale com a FisioBea.'
    : teste ? `Seu teste grátis terminou em ${br(u.valido_ate)}. Gostou? Assine para continuar usando: seus dados estão guardados.`
    : `Sua assinatura venceu em ${br(u.valido_ate)}. Renove para continuar: seus dados estão guardados.`;
  return erro(msg, 402, { vencida: true, teste, whatsapp: await contatoAdmin(env), email: u.email });
}

async function usuarioAtual(env, request) {
  const m = /(?:^|;\s*)sessao=([a-f0-9]{64})/.exec(request.headers.get('cookie') || '');
  if (!m) return null;
  const u = await env.DB.prepare(
    'SELECT u.id, u.email, u.nome, u.role, u.ativo, u.valido_ate FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expira > ?'
  ).bind(m[1], Date.now()).first();
  if (!u || !u.ativo) return null;
  return { ...u, token: m[1] };
}
const publico = u => ({ id: u.id, email: u.email, nome: u.nome, role: u.role, valido_ate: u.valido_ate || '' });

// Limite de tentativas: 5 erros no mesmo e-mail (ou 20 do mesmo endereço de internet) em 15 minutos
// bloqueiam por 15 minutos. Se a tabela falhar, o login continua funcionando (não trava ninguém por erro nosso).
const JANELA = 15 * 60e3, BLOQUEIO = 15 * 60e3;
const ipDe = request => request.headers.get('cf-connecting-ip') || 'local';
async function minutosBloqueado(env, chaves) {
  try {
    const ms = Date.now();
    for (const c of chaves) {
      const t = await env.DB.prepare('SELECT bloqueado_ate FROM tentativas WHERE chave = ?').bind(c).first();
      if (t && t.bloqueado_ate > ms) return Math.ceil((t.bloqueado_ate - ms) / 60e3);
    }
  } catch (e) {}
  return 0;
}
async function registrarErro(env, chave, limite) {
  try {
    const ms = Date.now();
    const t = await env.DB.prepare('SELECT n, inicio FROM tentativas WHERE chave = ?').bind(chave).first();
    const n = t && ms - t.inicio < JANELA ? t.n + 1 : 1, inicio = n === 1 ? ms : t.inicio;
    await env.DB.prepare('INSERT INTO tentativas (chave, n, inicio, bloqueado_ate) VALUES (?, ?, ?, ?) ON CONFLICT(chave) DO UPDATE SET n = excluded.n, inicio = excluded.inicio, bloqueado_ate = excluded.bloqueado_ate')
      .bind(chave, n, inicio, n >= limite ? ms + BLOQUEIO : 0).run();
  } catch (e) {}
}
async function limparErros(env, chave) { try { await env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind(chave).run(); } catch (e) {} }
const msgBloqueio = min => `Muitas tentativas. Por segurança, espere ${min} minuto${min > 1 ? 's' : ''} e tente de novo.`;

// Link de nova senha: o código vai só no link; no banco fica apenas o hash dele
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const LINK_HORAS = 24;
async function recuperacaoValida(env, codigo) {
  if (!/^[a-f0-9]{64}$/.test(codigo || '')) return null;
  return env.DB.prepare('SELECT r.token_hash, u.id, u.nome, u.email FROM recuperacoes r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.usado = 0 AND r.expira > ? AND u.ativo = 1')
    .bind(await sha256(codigo), Date.now()).first();
}

async function lerJson(request) {
  try { return await request.json(); } catch (e) { return {}; }
}

async function novaConta(env, { nome, email, senha, telefone = '', role = 'user', valido_ate = '', obs = '' }) {
  const e = String(email || '').trim().toLowerCase();
  if (!String(nome || '').trim()) return 'Informe o nome.';
  if (!emailValido(e)) return 'Informe um e-mail válido.';
  if (String(senha || '').length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(e).first()) return 'Já existe uma conta com este e-mail.';
  const id = aleatorio(12), salt = aleatorio(16);
  await env.DB.prepare('INSERT INTO users (id, email, nome, telefone, senha_hash, salt, role, ativo, valido_ate, obs, criado) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
    .bind(id, e, String(nome).trim(), String(telefone).trim(), await hashSenha(senha, salt), salt, role, valido_ate, String(obs), agora()).run();
  return { id, email: e, nome: String(nome).trim(), role, valido_ate };
}

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const partes = params.path || [];
  const rota = partes[0];
  const metodo = request.method;

  // Proteção contra requisições vindas de outros sites
  if (metodo !== 'GET') {
    const origem = request.headers.get('origin');
    if (origem && origem !== url.origin) return erro('Origem não permitida', 403);
  }

  try {
    const total = async () => (await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first()).n;

    if (rota === 'status' && metodo === 'GET') return json({ instalado: (await total()) > 0 });

    // Primeira conta (administradora). Depois disso, só a administradora cria contas.
    if (rota === 'instalar' && metodo === 'POST') {
      if ((await total()) > 0) return erro('O sistema já foi instalado. Faça login.', 403);
      const r = await novaConta(env, { ...(await lerJson(request)), role: 'admin' });
      if (typeof r === 'string') return erro(r);
      return json({ usuario: r }, 201, { 'set-cookie': await criarSessao(env, r.id, url) });
    }

    if (rota === 'login' && metodo === 'POST') {
      const { email, senha } = await lerJson(request);
      const e = String(email || '').trim().toLowerCase(), kEmail = 'email:' + e, kIp = 'ip:' + ipDe(request);
      const espera = await minutosBloqueado(env, [kEmail, kIp]);
      if (espera) return erro(msgBloqueio(espera), 429);
      const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(e).first();
      if (!u || !iguais(await hashSenha(String(senha || ''), u.salt), u.senha_hash)) {
        await registrarErro(env, kEmail, 5); await registrarErro(env, kIp, 20);
        return erro('E-mail ou senha incorretos.', 401);
      }
      await limparErros(env, kEmail);
      if (!u.ativo) return erro('Sua conta está desativada. Fale com a FisioBea.', 403);
      if (vencida(u)) return respostaVencida(env, u);
      return json({ usuario: publico(u) }, 200, { 'set-cookie': await criarSessao(env, u.id, url) });
    }

    // Cadastro pelo site: a pessoa cria a própria conta e já entra com 7 dias de teste grátis
    if (rota === 'cadastro' && metodo === 'POST') {
      const d = await lerJson(request);
      if (d.site) return json({ ok: true }); // campo invisível: robôs preenchem, pessoas não
      if ((await total()) === 0) return erro('O sistema ainda não foi instalado.', 403);
      const kIp = 'cad:' + ipDe(request), espera = await minutosBloqueado(env, [kIp]);
      if (espera) return erro(`Muitos cadastros seguidos. Espere ${espera} minuto${espera > 1 ? 's' : ''} e tente de novo.`, 429);
      if (soDigitos(d.telefone).length < 10) return erro('Informe seu WhatsApp com DDD.');
      const recentes = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE criado > ?').bind(new Date(Date.now() - 3600e3).toISOString()).first();
      if (recentes.n > 30) return erro('Muitos cadastros agora. Tente de novo mais tarde.', 429);
      const r = await novaConta(env, {
        nome: String(d.nome || '').slice(0, 120), email: String(d.email || '').slice(0, 160), senha: d.senha,
        telefone: String(d.telefone).slice(0, 40), valido_ate: somaDias(hoje(), TESTE_DIAS - 1), obs: OBS_TESTE,
      });
      if (typeof r === 'string') return erro(r);
      await registrarErro(env, kIp, 3); // no máximo 3 contas novas do mesmo endereço de internet a cada 15 minutos
      // Aparece no painel da administradora, para ela dar as boas-vindas
      await env.DB.prepare('INSERT INTO pedidos (id, nome, email, telefone, mensagem, status, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(aleatorio(12), r.nome, r.email, String(d.telefone).trim().slice(0, 40), `Começou o teste grátis (até ${br(r.valido_ate)})`, 'convertido', agora()).run();
      return json({ usuario: { ...publico(r), teste: true }, contato: await contatoAdmin(env) }, 201, { 'set-cookie': await criarSessao(env, r.id, url) });
    }

    // Formulário "Quero conhecer" da página de vendas
    if (rota === 'pedido' && metodo === 'POST') {
      const { nome, email, telefone, mensagem, site } = await lerJson(request);
      if (site) return json({ ok: true }); // campo invisível: robôs preenchem, pessoas não
      const e = String(email || '').trim().toLowerCase();
      if (!String(nome || '').trim() || !emailValido(e)) return erro('Informe seu nome e um e-mail válido.');
      const recentes = await env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE criado > ?").bind(new Date(Date.now() - 3600e3).toISOString()).first();
      if (recentes.n > 30) return erro('Muitos pedidos agora. Tente de novo mais tarde.', 429);
      await env.DB.prepare('INSERT INTO pedidos (id, nome, email, telefone, mensagem, status, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(aleatorio(12), String(nome).trim().slice(0, 120), e.slice(0, 160), String(telefone || '').trim().slice(0, 40), String(mensagem || '').trim().slice(0, 1000), 'novo', agora()).run();
      return json({ ok: true }, 201);
    }

    // "Esqueci minha senha": vira um pedido no painel da administradora, que manda o link pelo WhatsApp.
    // A resposta é sempre a mesma, para ninguém descobrir quais e-mails têm conta.
    if (rota === 'esqueci' && metodo === 'POST') {
      const kIp = 'esq:' + ipDe(request), espera = await minutosBloqueado(env, [kIp]);
      if (espera) return erro(msgBloqueio(espera), 429);
      await registrarErro(env, kIp, 5);
      const e = String((await lerJson(request)).email || '').trim().toLowerCase();
      const u = emailValido(e) && await env.DB.prepare('SELECT nome, email, telefone FROM users WHERE email = ? AND ativo = 1').bind(e).first();
      if (u) {
        const recente = await env.DB.prepare("SELECT 1 FROM pedidos WHERE email = ? AND status = 'senha' AND criado > ?").bind(e, new Date(Date.now() - 3600e3).toISOString()).first();
        if (!recente) await env.DB.prepare('INSERT INTO pedidos (id, nome, email, telefone, mensagem, status, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(aleatorio(12), u.nome, u.email, u.telefone || '', 'Pediu uma nova senha pelo app', 'senha', agora()).run();
      }
      return json({ ok: true });
    }

    if (rota === 'redefinir') {
      if (metodo === 'GET') {
        const r = await recuperacaoValida(env, url.searchParams.get('codigo'));
        if (!r) return erro('Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".', 410);
        return json({ nome: r.nome.split(' ')[0], email: r.email });
      }
      if (metodo === 'POST') {
        const { codigo, senha } = await lerJson(request);
        const r = await recuperacaoValida(env, codigo);
        if (!r) return erro('Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".', 410);
        if (String(senha || '').length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
        const salt = aleatorio(16);
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET senha_hash = ?, salt = ? WHERE id = ?').bind(await hashSenha(senha, salt), salt, r.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(r.id),
          env.DB.prepare('UPDATE recuperacoes SET usado = 1 WHERE user_id = ?').bind(r.id),
        ]);
        await limparErros(env, 'email:' + r.email);
        return json({ ok: true, email: r.email });
      }
    }

    const eu = await usuarioAtual(env, request);
    if (!eu) return erro('Faça login para continuar.', 401);

    if (rota === 'sair' && metodo === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(eu.token).run();
      return json({ ok: true }, 200, { 'set-cookie': cookieSessao('', url, 0) });
    }
    // Assinatura vencida: pode sair, mas não usa o app
    if (vencida(eu)) return respostaVencida(env, eu);

    if (rota === 'eu' && metodo === 'GET') return json({ usuario: { ...publico(eu), teste: await emTeste(env, eu) }, contato: await contatoAdmin(env), hoje: hoje() });

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
      if (eu.role !== 'admin') return erro('Só o administrador pode fazer isso.', 403);
      const [, recurso, alvo, acao] = partes;

      if (recurso === 'resumo' && metodo === 'GET') {
        const h = hoje(), mes = h.slice(0, 7);
        const { results: usuarios } = await env.DB.prepare(
          `SELECT u.id, u.email, u.nome, u.telefone, u.role, u.ativo, u.valido_ate, u.obs, u.criado,
             (SELECT COUNT(*) FROM docs d WHERE d.user_id = u.id AND d.col = 'pacientes') AS pacientes,
             (SELECT MAX(atualizado) FROM docs d WHERE d.user_id = u.id) AS ultimo_uso,
             (SELECT MAX(data) FROM assinaturas a WHERE a.user_id = u.id) AS ultimo_pagamento,
             (SELECT valor FROM assinaturas a WHERE a.user_id = u.id ORDER BY data DESC, rowid DESC LIMIT 1) AS ultimo_valor,
             (SELECT dias FROM assinaturas a WHERE a.user_id = u.id ORDER BY data DESC, rowid DESC LIMIT 1) AS ultimo_dias,
             (SELECT COALESCE(SUM(valor), 0) FROM assinaturas a WHERE a.user_id = u.id) AS total_pago
           FROM users u ORDER BY u.nome`
        ).all();
        const { results: ultimosPagamentos } = await env.DB.prepare(
          'SELECT a.data, a.valor, a.dias, a.forma, u.nome FROM assinaturas a JOIN users u ON u.id = a.user_id ORDER BY a.data DESC, a.rowid DESC LIMIT 8'
        ).all();
        const { results: pedidos } = await env.DB.prepare('SELECT * FROM pedidos ORDER BY criado DESC LIMIT 100').all();
        const receitaMes = (await env.DB.prepare('SELECT COALESCE(SUM(valor), 0) AS v FROM assinaturas WHERE data LIKE ?').bind(mes + '%').first()).v;
        const { results: porMes } = await env.DB.prepare('SELECT substr(data, 1, 7) AS mes, SUM(valor) AS v FROM assinaturas GROUP BY mes ORDER BY mes DESC LIMIT 12').all();
        return json({ hoje: h, usuarios, pedidos, receitaMes, porMes, ultimosPagamentos });
      }

      if (recurso === 'usuarios' && !alvo && metodo === 'POST') {
        const d = await lerJson(request);
        const dias = Math.max(0, Math.min(366, Number(d.dias) || 0));
        const r = await novaConta(env, { ...d, role: 'user', valido_ate: d.dias === 'vitalicio' ? VITALICIO : dias ? somaDias(hoje(), dias - 1) : '' });
        if (typeof r === 'string') return erro(r);
        return json({ usuario: r }, 201);
      }

      if (recurso === 'usuarios' && alvo && acao === 'pagamento' && metodo === 'POST') {
        const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(alvo).first();
        if (!u) return erro('Usuária não encontrada.', 404);
        if (u.valido_ate === VITALICIO) return erro('Esta conta tem acesso vitalício e não precisa de pagamento.');
        const { valor, dias = 30, data, forma = '' } = await lerJson(request);
        const n = Math.max(1, Math.min(366, Number(dias) || 30));
        const pago = dataValida(data) ? data : hoje();
        // Renova a partir do vencimento se ainda estiver em dia; senão, a partir da data do pagamento
        const base = u.valido_ate && u.valido_ate >= pago ? somaDias(u.valido_ate, 1) : pago;
        const validoAte = somaDias(base, n - 1);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO assinaturas (id, user_id, data, valor, dias, valido_ate, forma) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(aleatorio(12), alvo, pago, Number(valor) || 0, n, validoAte, String(forma).slice(0, 40)),
          env.DB.prepare('UPDATE users SET valido_ate = ?, ativo = 1 WHERE id = ?').bind(validoAte, alvo),
        ]);
        return json({ ok: true, valido_ate: validoAte });
      }

      // Gera um link de nova senha (24 horas, uso único) para mandar pelo WhatsApp
      if (recurso === 'usuarios' && alvo && acao === 'link-senha' && metodo === 'POST') {
        const u = await env.DB.prepare('SELECT id, nome, telefone FROM users WHERE id = ? AND ativo = 1').bind(alvo).first();
        if (!u) return erro('Conta não encontrada ou desativada.', 404);
        const codigo = aleatorio(32);
        await env.DB.prepare('INSERT INTO recuperacoes (token_hash, user_id, expira, usado, criado) VALUES (?, ?, ?, 0, ?)')
          .bind(await sha256(codigo), u.id, Date.now() + LINK_HORAS * 3600e3, agora()).run();
        const { pedido } = await lerJson(request);
        if (pedido) await env.DB.prepare("UPDATE pedidos SET status = 'contatado' WHERE id = ? AND status = 'senha'").bind(String(pedido)).run();
        return json({ link: `${url.origin}/app/?redefinir=${codigo}`, horas: LINK_HORAS, nome: u.nome, telefone: u.telefone || '' });
      }

      if (recurso === 'usuarios' && alvo && acao === 'pagamentos' && metodo === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM assinaturas WHERE user_id = ? ORDER BY data DESC').bind(alvo).all();
        return json({ pagamentos: results });
      }

      if (recurso === 'usuarios' && alvo && !acao && metodo === 'PATCH') {
        const { ativo, senha, valido_ate, nome, telefone, obs } = await lerJson(request);
        if (alvo === eu.id && ativo === false) return erro('Você não pode desativar a própria conta.');
        const ops = [];
        if (typeof ativo === 'boolean') {
          ops.push(env.DB.prepare('UPDATE users SET ativo = ? WHERE id = ?').bind(ativo ? 1 : 0, alvo));
          if (!ativo) ops.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(alvo));
        }
        if (valido_ate !== undefined) {
          if (valido_ate !== '' && !dataValida(valido_ate)) return erro('Data inválida.');
          ops.push(env.DB.prepare('UPDATE users SET valido_ate = ? WHERE id = ?').bind(valido_ate, alvo));
        }
        if (typeof nome === 'string' && nome.trim()) ops.push(env.DB.prepare('UPDATE users SET nome = ? WHERE id = ?').bind(nome.trim(), alvo));
        if (typeof telefone === 'string') ops.push(env.DB.prepare('UPDATE users SET telefone = ? WHERE id = ?').bind(telefone.trim(), alvo));
        if (typeof obs === 'string') ops.push(env.DB.prepare('UPDATE users SET obs = ? WHERE id = ?').bind(obs, alvo));
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

      if (recurso === 'pedidos' && alvo && metodo === 'PATCH') {
        const { status } = await lerJson(request);
        if (!['novo', 'contatado', 'convertido', 'descartado'].includes(status)) return erro('Situação inválida.');
        await env.DB.prepare('UPDATE pedidos SET status = ? WHERE id = ?').bind(status, alvo).run();
        return json({ ok: true });
      }
    }

    return erro('Rota não encontrada.', 404);
  } catch (e) {
    return erro('Erro no servidor. Tente de novo.', 500);
  }
}
