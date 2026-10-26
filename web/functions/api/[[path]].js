// API do FisioBea (Cloudflare Pages Functions + D1)
// Públicas:  GET /api/status            POST /api/instalar {nome, email, senha} (só enquanto não há nenhuma conta)
//            POST /api/login {email, senha}   POST /api/pedido {nome, email, telefone, mensagem}
//            POST /api/esqueci {email}        GET /api/redefinir?codigo=   POST /api/redefinir {codigo, senha}
//            POST /api/cadastro {nome, email, telefone, cpf, senha} (conta nova com 7 dias de teste grátis)
//            POST /api/login/2fa {desafio, codigo}   GET /api/site (preços, promoção, Pix, fotos)
//            GET /api/arquivo/site/:nome (foto do site)   POST /api/avisar-pagamento {plano, email?}
// Logada:    POST /api/sair-conta {motivo, detalhe} (pede a exclusão da conta)   GET /api/comunicados
//            POST /api/2fa/iniciar | /api/2fa/ativar {codigo} | /api/2fa/desativar {codigo}
// Logada:    POST /api/sair   GET /api/eu   POST /api/senha {atual, nova}
//            GET /api/dados   PUT/DELETE /api/doc/:col/:id
// Admin:     GET /api/admin/resumo
//            GET/POST /api/admin/usuarios          PATCH /api/admin/usuarios/:id
//            POST /api/admin/usuarios/:id/pagamento {valor, dias, data, forma}
//            GET /api/admin/usuarios/:id/pagamentos
//            POST /api/admin/usuarios/:id/link-senha {pedido?}
//            PATCH /api/admin/pedidos/:id {status}
//            DELETE /api/admin/usuarios/:id {confirmacao, motivo, detalhe}   POST /api/admin/usuarios/:id/saida {motivo, detalhe}
//            GET/PUT /api/admin/ajustes/:chave   PUT/DELETE /api/admin/fotos/:lugar
//            GET /api/admin/historico   GET /api/admin/emails   GET /api/admin/pagamentos
//            GET/POST /api/admin/comunicados   DELETE /api/admin/comunicados/:id

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
const cpfValido = v => {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); return (s * 10 % 11) % 10; };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
};
const cpfFormatado = v => soDigitos(v).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const reais = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
const MOTIVOS = ['Achei caro', 'Não tive tempo de usar', 'Faltou alguma função', 'Fui para outro sistema', 'Parei de atender', 'Outro motivo'];

// ---------- Ajustes do site (o administrador muda pelo painel) ----------
const AJUSTES_PADRAO = {
  precos: { mensal: 49.9, semestral: 254.9, anual: 479 },
  promo: { ativa: false, nome: 'Promoção de lançamento', mensal: 39.9, ate: '', texto: 'Assine agora e pague menos por mês.' },
  pix: { chave: '', nome: '', cidade: 'SAO BERNARDO DO CAMPO' },
  fotos: {},
  avisos: { email: 'kelvinnascimentocosta@live.com', cadastro: true, pagamento: true, saida: true },
};
const CHAVES_AJUSTES = ['precos', 'promo', 'pix', 'avisos'];
async function lerAjustes(env) {
  const a = JSON.parse(JSON.stringify(AJUSTES_PADRAO));
  try {
    const { results } = await env.DB.prepare('SELECT chave, valor FROM ajustes').all();
    for (const r of results) try { a[r.chave] = { ...a[r.chave], ...JSON.parse(r.valor) }; } catch (e) {}
  } catch (e) {}
  return a;
}
const gravarAjuste = (env, chave, valor) => env.DB.prepare('INSERT INTO ajustes (chave, valor, atualizado) VALUES (?, ?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, atualizado = excluded.atualizado')
  .bind(chave, JSON.stringify(valor), agora()).run();
const promoValida = a => a.promo.ativa && (!a.promo.ate || a.promo.ate >= hoje());

// ---------- Histórico ----------
async function registrar(env, quem, acao, detalhe = '', request = null) {
  try {
    await env.DB.prepare('INSERT INTO historico (quando, quem, acao, detalhe, ip) VALUES (?, ?, ?, ?, ?)')
      .bind(agora(), String(quem || '').slice(0, 160), acao, String(detalhe || '').slice(0, 500), request ? ipDe(request) : '').run();
  } catch (e) {}
}

// ---------- E-mail ----------
// Envia pelo Cloudflare Email Service quando o domínio estiver configurado (segredos EMAIL_TOKEN, EMAIL_CONTA e EMAIL_DE).
// Sem isso, o e-mail fica só registrado no painel como "sem domínio", e nada quebra.
const emailAtivo = env => !!(env.EMAIL_TOKEN && env.EMAIL_CONTA && env.EMAIL_DE);
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const htmlEmail = (titulo, texto) => `<div style="background:#f6f1e9;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;color:#1f2a24">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:18px;padding:28px">
  <div style="font:400 26px Georgia,serif;color:#1d5a43">Fisio<i style="color:#b4583a">Bea</i></div>
  <h1 style="font:600 19px Helvetica,Arial,sans-serif;margin:18px 0 10px">${escHtml(titulo)}</h1>
  ${texto.split('\n\n').map(p => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escHtml(p).replace(/\n/g, '<br>').replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d5a43">$1</a>')}</p>`).join('')}
  </div><p style="text-align:center;font-size:12px;color:#7b8580;margin-top:14px">FisioBea · agenda, prontuário e treinos para fisioterapeutas</p></div>`;
async function enviarEmail(env, { para, assunto, texto, tipo }) {
  let situacao = 'sem domínio', falha = '';
  if (emailAtivo(env) && para) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.EMAIL_CONTA}/email/sending/send`, {
        method: 'POST', headers: { authorization: 'Bearer ' + env.EMAIL_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ to: para, from: env.EMAIL_DE, subject: assunto, text: texto, html: htmlEmail(assunto, texto) }),
      });
      const c = await r.json().catch(() => ({}));
      situacao = r.ok && c.success ? 'enviado' : 'falhou';
      if (situacao === 'falhou') falha = JSON.stringify(c.errors || r.status).slice(0, 300);
    } catch (e) { situacao = 'falhou'; falha = String(e).slice(0, 300); }
  }
  try {
    await env.DB.prepare('INSERT INTO emails (id, para, assunto, tipo, situacao, erro, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(aleatorio(8), String(para || '—'), assunto, tipo, situacao, falha, agora()).run();
  } catch (e) {}
  return situacao;
}
// Aviso para o administrador (cadastro novo, pagamento avisado, pedido de saída)
async function avisarAdmin(env, tipo, assunto, texto) {
  const a = await lerAjustes(env);
  if (a.avisos[tipo] === false || !a.avisos.email) return;
  await enviarEmail(env, { para: a.avisos.email, assunto, texto, tipo: 'aviso-' + tipo });
}

// ---------- Verificação em duas etapas (TOTP, o mesmo padrão do Google Authenticator) ----------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const paraBase32 = bytes => { let bits = '', out = ''; for (const b of bytes) bits += b.toString(2).padStart(8, '0'); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; };
const deBase32 = s => { let bits = ''; for (const c of s) bits += B32.indexOf(c).toString(2).padStart(5, '0'); return Uint8Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)); };
async function codigoTotp(segredo, passo) {
  const k = await crypto.subtle.importKey('raw', deBase32(segredo), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new ArrayBuffer(8); new DataView(msg).setUint32(4, passo);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg)), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}
async function totpValido(segredo, codigo) {
  const c = soDigitos(codigo), p = Math.floor(Date.now() / 30000);
  if (c.length !== 6) return false;
  for (const d of [-1, 0, 1]) if (await codigoTotp(segredo, p + d) === c) return true; // aceita 30 s de diferença no relógio
  return false;
}

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

export async function onRequest({ request, env, params, waitUntil }) {
  // Tarefas que não precisam segurar a resposta (e-mails)
  const depois = p => { const q = p.catch(() => {}); if (waitUntil) waitUntil(q); return q; };
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

    // Segunda etapa do login: código de 6 dígitos do aplicativo autenticador
    if (rota === 'login' && partes[1] === '2fa' && metodo === 'POST') {
      const { desafio, codigo } = await lerJson(request);
      const d = /^[a-f0-9]{64}$/.test(desafio || '') && await env.DB.prepare(
        'SELECT d.token_hash, s.totp, u.* FROM desafios d JOIN segredos s ON s.user_id = d.user_id AND s.ativo = 1 JOIN users u ON u.id = d.user_id WHERE d.token_hash = ? AND d.expira > ?'
      ).bind(await sha256(desafio), Date.now()).first();
      if (!d) return erro('O tempo para digitar o código acabou. Entre de novo.', 410);
      const k = '2fa:' + d.id, espera = await minutosBloqueado(env, [k]);
      if (espera) return erro(msgBloqueio(espera), 429);
      if (!(await totpValido(d.totp, codigo))) {
        await registrarErro(env, k, 5);
        await registrar(env, d.email, 'Código de verificação errado', '', request);
        return erro('Código incorreto. Confira o código no aplicativo autenticador.', 422);
      }
      await limparErros(env, k);
      await env.DB.prepare('DELETE FROM desafios WHERE token_hash = ? OR expira < ?').bind(d.token_hash, Date.now()).run();
      await registrar(env, d.email, 'Entrou (com verificação em duas etapas)', '', request);
      return json({ usuario: publico(d) }, 200, { 'set-cookie': await criarSessao(env, d.id, url) });
    }

    if (rota === 'login' && metodo === 'POST') {
      const { email, senha } = await lerJson(request);
      const e = String(email || '').trim().toLowerCase(), kEmail = 'email:' + e, kIp = 'ip:' + ipDe(request);
      const espera = await minutosBloqueado(env, [kEmail, kIp]);
      if (espera) return erro(msgBloqueio(espera), 429);
      const u = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(e).first();
      if (!u || !iguais(await hashSenha(String(senha || ''), u.salt), u.senha_hash)) {
        await registrarErro(env, kEmail, 5); await registrarErro(env, kIp, 20);
        if (u) await registrar(env, e, 'Senha errada', '', request);
        if (await minutosBloqueado(env, [kEmail])) await registrar(env, e, 'Login bloqueado por tentativas', '15 minutos', request);
        return erro('E-mail ou senha incorretos.', 401);
      }
      await limparErros(env, kEmail);
      if (!u.ativo) return erro('Sua conta está desativada. Fale com a FisioBea.', 403);
      if (vencida(u)) return respostaVencida(env, u);
      const s2 = await env.DB.prepare('SELECT 1 FROM segredos WHERE user_id = ? AND ativo = 1').bind(u.id).first();
      if (s2) {
        const desafio = aleatorio();
        await env.DB.prepare('INSERT INTO desafios (token_hash, user_id, expira) VALUES (?, ?, ?)').bind(await sha256(desafio), u.id, Date.now() + 5 * 60e3).run();
        return json({ doisFatores: true, desafio });
      }
      await registrar(env, u.email, 'Entrou', '', request);
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
      if (!cpfValido(d.cpf)) return erro('Confira o CPF: ele parece incompleto ou com algum número trocado.');
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
      await env.DB.prepare('INSERT OR REPLACE INTO clientes (user_id, cpf) VALUES (?, ?)').bind(r.id, cpfFormatado(d.cpf)).run();
      await registrar(env, r.email, 'Criou conta no teste grátis', r.nome, request);
      depois(avisarAdmin(env, 'cadastro', `Nova conta no teste grátis: ${r.nome}`, `${r.nome} criou uma conta no FisioBea e começou o teste grátis até ${br(r.valido_ate)}.\n\nE-mail: ${r.email}\nWhatsApp: ${d.telefone}\n\nAbra o painel: ${url.origin}/app/`));
      depois(enviarEmail(env, { para: r.email, tipo: 'boas-vindas', assunto: 'Bem-vinda ao FisioBea!', texto: `Olá, ${r.nome.split(' ')[0]}!\n\nSua conta está pronta e o seu teste grátis vai até ${br(r.valido_ate)}. Use tudo à vontade: agenda, treinos, evoluções, avaliações e financeiro.\n\nPara começar, cadastre um paciente e monte o treino A. Leva poucos minutos.\n\nEntrar: ${url.origin}/app/\n\nQualquer dúvida, é só responder pelo WhatsApp.` }));
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
      if (u && emailAtivo(env)) {
        // Com o e-mail configurado, o link vai direto para a pessoa
        const usuario = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(e).first();
        const codigo = aleatorio(32);
        await env.DB.prepare('INSERT INTO recuperacoes (token_hash, user_id, expira, usado, criado) VALUES (?, ?, ?, 0, ?)')
          .bind(await sha256(codigo), usuario.id, Date.now() + LINK_HORAS * 3600e3, agora()).run();
        await registrar(env, e, 'Pediu nova senha', 'link enviado por e-mail', request);
        depois(enviarEmail(env, { para: e, tipo: 'nova-senha', assunto: 'Sua nova senha do FisioBea', texto: `Olá, ${u.nome.split(' ')[0]}!\n\nRecebemos um pedido para criar uma nova senha. Use o link abaixo (vale por ${LINK_HORAS} horas e só funciona uma vez):\n\n${url.origin}/app/?redefinir=${codigo}\n\nSe não foi você, ignore este e-mail. Sua senha atual continua valendo.` }));
      } else if (u) {
        await registrar(env, e, 'Pediu nova senha', 'pedido no painel', request);
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
        await registrar(env, r.email, 'Criou nova senha pelo link', '', request);
        await limparErros(env, 'email:' + r.email);
        return json({ ok: true, email: r.email });
      }
    }

    // Preços, promoção, Pix e fotos: usados pela página de vendas e pela tela de assinar
    if (rota === 'site' && metodo === 'GET') {
      const a = await lerAjustes(env);
      return json({
        precos: a.precos, promo: promoValida(a) ? a.promo : null,
        pix: a.pix.chave ? { chave: a.pix.chave, nome: a.pix.nome, cidade: a.pix.cidade } : null,
        fotos: Object.fromEntries(Object.entries(a.fotos).map(([k, v]) => [k, `/api/arquivo/${v}`])),
      }, 200, { 'cache-control': 'no-store' });
    }
    // Fotos do site guardadas no R2 (o nome muda a cada troca, então pode ficar em cache por muito tempo)
    if (rota === 'arquivo' && metodo === 'GET' && partes[1] === 'site' && /^[a-z0-9\-]+\.jpg$/.test(partes[2] || '')) {
      if (!env.ARQUIVOS) return erro('Fotos indisponíveis.', 404);
      const obj = await env.ARQUIVOS.get('site/' + partes[2]);
      if (!obj) return erro('Foto não encontrada.', 404);
      return new Response(obj.body, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable' } });
    }

    const eu = await usuarioAtual(env, request);

    // "Já paguei": vira uma tarefa no painel e um aviso para o administrador. Funciona até com o acesso vencido.
    if (rota === 'avisar-pagamento' && metodo === 'POST') {
      const kIp = 'pag:' + ipDe(request), espera = await minutosBloqueado(env, [kIp]);
      if (espera) return erro(msgBloqueio(espera), 429);
      await registrarErro(env, kIp, 5);
      const { plano, email } = await lerJson(request);
      const u = eu ? await env.DB.prepare('SELECT nome, email, telefone FROM users WHERE id = ?').bind(eu.id).first()
        : emailValido(String(email || '').trim().toLowerCase()) && await env.DB.prepare('SELECT nome, email, telefone FROM users WHERE email = ?').bind(String(email).trim().toLowerCase()).first();
      if (!u) return erro('Não achamos a conta. Entre com seu e-mail e senha e tente de novo.', 404);
      const nomes = { mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual' }, p = nomes[plano] ? plano : 'mensal';
      const a = await lerAjustes(env), valor = p === 'mensal' && promoValida(a) ? a.promo.mensal : a.precos[p];
      await env.DB.prepare('INSERT INTO pedidos (id, nome, email, telefone, mensagem, status, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(aleatorio(12), u.nome, u.email, u.telefone || '', `Avisou que pagou o plano ${nomes[p]} (${reais(valor)})|${p}|${valor}`, 'pagamento', agora()).run();
      await registrar(env, u.email, 'Avisou que pagou', `${nomes[p]} · ${reais(valor)}`, request);
      depois(avisarAdmin(env, 'pagamento', `${u.nome} avisou que pagou`, `${u.nome} (${u.email}) avisou que pagou o plano ${nomes[p]}: ${reais(valor)}.\n\nConfira no banco e confirme no painel: ${url.origin}/app/`));
      return json({ ok: true });
    }

    if (!eu) return erro('Faça login para continuar.', 401);

    // Pedido de exclusão da conta (LGPD): o administrador recebe e exclui pelo painel
    if (rota === 'sair-conta' && metodo === 'POST') {
      const { motivo, detalhe } = await lerJson(request);
      const m = MOTIVOS.includes(motivo) ? motivo : 'Outro motivo', det = String(detalhe || '').trim().slice(0, 500);
      const u = await env.DB.prepare('SELECT nome, email, telefone FROM users WHERE id = ?').bind(eu.id).first();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO pedidos (id, nome, email, telefone, mensagem, status, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(aleatorio(12), u.nome, u.email, u.telefone || '', `Pediu para excluir a conta. Motivo: ${m}${det ? ' — ' + det : ''}`, 'exclusao', agora()),
        env.DB.prepare('INSERT INTO saidas (id, user_id, nome, motivo, detalhe, quando) VALUES (?, ?, ?, ?, ?, ?)').bind(aleatorio(12), eu.id, u.nome, m, det, agora()),
      ]);
      await registrar(env, u.email, 'Pediu para excluir a conta', m, request);
      depois(avisarAdmin(env, 'saida', `${u.nome} pediu para excluir a conta`, `${u.nome} (${u.email}) pediu para excluir a conta.\n\nMotivo: ${m}${det ? '\n' + det : ''}\n\nPela LGPD, exclua em até 15 dias pelo painel: ${url.origin}/app/`));
      return json({ ok: true });
    }

    if (rota === 'sair' && metodo === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(eu.token).run();
      return json({ ok: true }, 200, { 'set-cookie': cookieSessao('', url, 0) });
    }
    // Assinatura vencida: pode sair, mas não usa o app
    if (vencida(eu)) return respostaVencida(env, eu);

    if (rota === 'eu' && metodo === 'GET') {
      const s2 = await env.DB.prepare('SELECT 1 FROM segredos WHERE user_id = ? AND ativo = 1').bind(eu.id).first();
      return json({ usuario: { ...publico(eu), teste: await emTeste(env, eu), doisFatores: !!s2 }, contato: await contatoAdmin(env), hoje: hoje() });
    }

    if (rota === 'comunicados' && metodo === 'GET') {
      const { results } = await env.DB.prepare("SELECT id, titulo, texto, tipo, ate, criado FROM comunicados WHERE ate = '' OR ate >= ? ORDER BY criado DESC LIMIT 5").bind(hoje()).all();
      return json({ comunicados: results });
    }

    if (rota === '2fa' && metodo === 'POST') {
      const acao = partes[1], { codigo } = await lerJson(request);
      const atual = await env.DB.prepare('SELECT totp, ativo FROM segredos WHERE user_id = ?').bind(eu.id).first();
      if (acao === 'iniciar') {
        if (atual?.ativo) return erro('A verificação em duas etapas já está ligada.');
        const segredo = paraBase32(crypto.getRandomValues(new Uint8Array(20)));
        await env.DB.prepare('INSERT OR REPLACE INTO segredos (user_id, totp, ativo, criado) VALUES (?, ?, 0, ?)').bind(eu.id, segredo, agora()).run();
        return json({ segredo, uri: `otpauth://totp/FisioBea:${encodeURIComponent(eu.email)}?secret=${segredo}&issuer=FisioBea&digits=6&period=30` });
      }
      if (!atual) return erro('Comece pelo botão de ligar a verificação.');
      const k = '2fa:' + eu.id, espera = await minutosBloqueado(env, [k]);
      if (espera) return erro(msgBloqueio(espera), 429);
      if (!(await totpValido(atual.totp, codigo))) { await registrarErro(env, k, 5); return erro('Código incorreto. Confira o código no aplicativo autenticador.', 422); }
      await limparErros(env, k);
      if (acao === 'ativar') {
        await env.DB.prepare('UPDATE segredos SET ativo = 1 WHERE user_id = ?').bind(eu.id).run();
        await registrar(env, eu.email, 'Ligou a verificação em duas etapas', '', request);
        return json({ ok: true });
      }
      if (acao === 'desativar') {
        await env.DB.prepare('DELETE FROM segredos WHERE user_id = ?').bind(eu.id).run();
        await registrar(env, eu.email, 'Desligou a verificação em duas etapas', '', request);
        return json({ ok: true });
      }
    }

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
      await registrar(env, eu.email, 'Trocou a senha', '', request);
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
             (SELECT COALESCE(SUM(valor), 0) FROM assinaturas a WHERE a.user_id = u.id) AS total_pago,
             (SELECT cpf FROM clientes c WHERE c.user_id = u.id) AS cpf,
             (SELECT ativo FROM segredos s WHERE s.user_id = u.id) AS dois_fatores
           FROM users u ORDER BY u.nome`
        ).all();
        const { results: ultimosPagamentos } = await env.DB.prepare(
          "SELECT a.data, a.valor, a.dias, a.forma, COALESCE(u.nome, 'Conta excluída') AS nome FROM assinaturas a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.data DESC, a.rowid DESC LIMIT 8"
        ).all();
        const { results: saidas } = await env.DB.prepare('SELECT * FROM saidas ORDER BY quando DESC LIMIT 200').all();
        const { results: pedidos } = await env.DB.prepare('SELECT * FROM pedidos ORDER BY criado DESC LIMIT 100').all();
        const receitaMes = (await env.DB.prepare('SELECT COALESCE(SUM(valor), 0) AS v FROM assinaturas WHERE data LIKE ?').bind(mes + '%').first()).v;
        const { results: porMes } = await env.DB.prepare('SELECT substr(data, 1, 7) AS mes, SUM(valor) AS v FROM assinaturas GROUP BY mes ORDER BY mes DESC LIMIT 12').all();
        return json({ hoje: h, usuarios, pedidos, receitaMes, porMes, ultimosPagamentos, saidas, ajustes: await lerAjustes(env), motivos: MOTIVOS, emailAtivo: emailAtivo(env), fotosAtivas: !!env.ARQUIVOS });
      }

      if (recurso === 'usuarios' && !alvo && metodo === 'POST') {
        const d = await lerJson(request);
        const dias = Math.max(0, Math.min(366, Number(d.dias) || 0));
        if (d.cpf && !cpfValido(d.cpf)) return erro('Confira o CPF: ele parece incompleto ou com algum número trocado.');
        const r = await novaConta(env, { ...d, role: 'user', valido_ate: d.dias === 'vitalicio' ? VITALICIO : dias ? somaDias(hoje(), dias - 1) : '' });
        if (typeof r === 'string') return erro(r);
        if (d.cpf) await env.DB.prepare('INSERT OR REPLACE INTO clientes (user_id, cpf) VALUES (?, ?)').bind(r.id, cpfFormatado(d.cpf)).run();
        await registrar(env, eu.email, 'Criou conta pelo painel', r.nome + ' · ' + r.email, request);
        return json({ usuario: r }, 201);
      }

      if (recurso === 'usuarios' && alvo && acao === 'pagamento' && metodo === 'POST') {
        const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(alvo).first();
        if (!u) return erro('Usuária não encontrada.', 404);
        if (u.valido_ate === VITALICIO) return erro('Esta conta tem acesso vitalício e não precisa de pagamento.');
        const { valor, dias = 30, data, forma = '', pedido } = await lerJson(request);
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
        if (pedido) await env.DB.prepare("UPDATE pedidos SET status = 'convertido' WHERE id = ?").bind(String(pedido)).run();
        await registrar(env, eu.email, 'Registrou pagamento', `${u.nome} · ${reais(valor)} · ${n} dias · acesso até ${br(validoAte)}`, request);
        depois(enviarEmail(env, { para: u.email, tipo: 'recibo', assunto: 'Recebemos seu pagamento', texto: `Olá, ${u.nome.split(' ')[0]}!\n\nRecebemos seu pagamento de ${reais(valor)} em ${br(pago)}. Seu acesso ao FisioBea está garantido até ${br(validoAte)}.\n\nObrigado por usar o FisioBea!` }));
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
        await registrar(env, eu.email, 'Gerou link de nova senha', u.nome, request);
        return json({ link: `${url.origin}/app/?redefinir=${codigo}`, horas: LINK_HORAS, nome: u.nome, telefone: u.telefone || '' });
      }

      if (recurso === 'usuarios' && alvo && acao === 'pagamentos' && metodo === 'GET') {
        const { results } = await env.DB.prepare('SELECT * FROM assinaturas WHERE user_id = ? ORDER BY data DESC').bind(alvo).all();
        return json({ pagamentos: results });
      }

      if (recurso === 'usuarios' && alvo && !acao && metodo === 'PATCH') {
        const { ativo, senha, valido_ate, nome, telefone, obs, cpf } = await lerJson(request);
        if (cpf !== undefined && cpf !== '' && !cpfValido(cpf)) return erro('Confira o CPF: ele parece incompleto ou com algum número trocado.');
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
        if (typeof cpf === 'string') ops.push(env.DB.prepare('INSERT OR REPLACE INTO clientes (user_id, cpf) VALUES (?, ?)').bind(alvo, cpf ? cpfFormatado(cpf) : ''));
        if (senha) {
          if (String(senha).length < 8) return erro('A senha precisa ter pelo menos 8 caracteres.');
          const salt = aleatorio(16);
          ops.push(env.DB.prepare('UPDATE users SET senha_hash = ?, salt = ? WHERE id = ?').bind(await hashSenha(senha, salt), salt, alvo));
          ops.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(alvo));
        }
        if (!ops.length) return erro('Nada para alterar.');
        await env.DB.batch(ops);
        const quem = (await env.DB.prepare('SELECT nome FROM users WHERE id = ?').bind(alvo).first())?.nome || alvo;
        const mudou = [typeof ativo === 'boolean' && (ativo ? 'reativou' : 'desativou'), valido_ate !== undefined && 'acesso até ' + (valido_ate === VITALICIO ? 'vitalício' : br(valido_ate) || 'sem data'), senha && 'senha provisória', cpf !== undefined && 'CPF', typeof telefone === 'string' && 'WhatsApp', typeof nome === 'string' && 'nome'].filter(Boolean).join(', ');
        await registrar(env, eu.email, 'Editou conta', `${quem}: ${mudou}`, request);
        return json({ ok: true });
      }

      // Exclusão da conta e de todos os dados (LGPD). Pagamentos ficam guardados sem os dados da pessoa, para a contabilidade.
      if (recurso === 'usuarios' && alvo && !acao && metodo === 'DELETE') {
        const { confirmacao, motivo, detalhe } = await lerJson(request);
        const u = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(alvo).first();
        if (!u) return erro('Conta não encontrada.', 404);
        if (u.role === 'admin' || alvo === eu.id) return erro('A conta do administrador não pode ser excluída por aqui.');
        if (String(confirmacao || '').trim().toLowerCase() !== u.nome.trim().toLowerCase()) return erro('Digite o nome da conta exatamente como aparece para confirmar.');
        const ops = [
          env.DB.prepare('DELETE FROM docs WHERE user_id = ?').bind(alvo),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(alvo),
          env.DB.prepare('DELETE FROM recuperacoes WHERE user_id = ?').bind(alvo),
          env.DB.prepare('DELETE FROM clientes WHERE user_id = ?').bind(alvo),
          env.DB.prepare('DELETE FROM segredos WHERE user_id = ?').bind(alvo),
          env.DB.prepare('DELETE FROM pedidos WHERE email = ?').bind(u.email),
          env.DB.prepare('DELETE FROM users WHERE id = ?').bind(alvo),
        ];
        const jaTem = await env.DB.prepare('SELECT 1 FROM saidas WHERE user_id = ?').bind(alvo).first();
        if (!jaTem && motivo) ops.push(env.DB.prepare('INSERT INTO saidas (id, user_id, nome, motivo, detalhe, quando) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(aleatorio(12), alvo, u.nome.split(' ')[0], MOTIVOS.includes(motivo) ? motivo : 'Outro motivo', String(detalhe || '').slice(0, 500), agora()));
        ops.push(env.DB.prepare('UPDATE saidas SET nome = ? WHERE user_id = ?').bind(u.nome.split(' ')[0], alvo)); // guarda só o primeiro nome
        await env.DB.batch(ops);
        await registrar(env, eu.email, 'Excluiu conta e dados', u.nome.split(' ')[0] + ' (a pedido, LGPD)', request);
        return json({ ok: true });
      }

      // Motivo de saída de quem não renovou ou foi desativada
      if (recurso === 'usuarios' && alvo && acao === 'saida' && metodo === 'POST') {
        const { motivo, detalhe } = await lerJson(request);
        const u = await env.DB.prepare('SELECT nome FROM users WHERE id = ?').bind(alvo).first();
        if (!u) return erro('Conta não encontrada.', 404);
        await env.DB.prepare('INSERT INTO saidas (id, user_id, nome, motivo, detalhe, quando) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(aleatorio(12), alvo, u.nome, MOTIVOS.includes(motivo) ? motivo : 'Outro motivo', String(detalhe || '').slice(0, 500), agora()).run();
        await registrar(env, eu.email, 'Registrou motivo de saída', `${u.nome}: ${motivo}`, request);
        return json({ ok: true });
      }

      if (recurso === 'ajustes' && alvo && metodo === 'PUT') {
        if (!CHAVES_AJUSTES.includes(alvo)) return erro('Ajuste desconhecido.');
        const d = await lerJson(request), num = v => Math.max(0, Math.round(Number(String(v).replace(',', '.')) * 100) / 100 || 0);
        let v;
        if (alvo === 'precos') v = { mensal: num(d.mensal), semestral: num(d.semestral), anual: num(d.anual) };
        if (alvo === 'promo') v = { ativa: !!d.ativa, nome: String(d.nome || '').slice(0, 60), mensal: num(d.mensal), ate: dataValida(d.ate) ? d.ate : '', texto: String(d.texto || '').slice(0, 200) };
        if (alvo === 'pix') v = { chave: String(d.chave || '').trim().slice(0, 77), nome: String(d.nome || '').trim().slice(0, 25), cidade: String(d.cidade || '').trim().slice(0, 15) };
        if (alvo === 'avisos') {
          const e = String(d.email || '').trim().toLowerCase();
          if (e && !emailValido(e)) return erro('Confira o e-mail dos avisos.');
          v = { email: e, cadastro: !!d.cadastro, pagamento: !!d.pagamento, saida: !!d.saida };
        }
        if (alvo === 'precos' && !v.mensal) return erro('Informe o preço mensal.');
        await gravarAjuste(env, alvo, v);
        await registrar(env, eu.email, 'Alterou ajustes do site', { precos: 'preços', promo: 'promoção', pix: 'Pix', avisos: 'avisos por e-mail' }[alvo], request);
        return json({ ok: true, valor: v });
      }

      if (recurso === 'fotos' && alvo && ['hero', 'domicilio1', 'domicilio2', 'historia', 'login'].includes(alvo)) {
        if (!env.ARQUIVOS) return erro('O espaço das fotos ainda não foi ligado.', 503);
        const a = await lerAjustes(env), velha = a.fotos[alvo];
        if (metodo === 'PUT') {
          const corpo = await request.arrayBuffer();
          const b = new Uint8Array(corpo.slice(0, 3));
          if (corpo.byteLength > 4e6) return erro('Foto grande demais.');
          if (b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return erro('Envie uma foto em JPEG.');
          const nome = `site/${alvo}-${Date.now().toString(36)}.jpg`;
          await env.ARQUIVOS.put(nome, corpo, { httpMetadata: { contentType: 'image/jpeg' } });
          await gravarAjuste(env, 'fotos', { ...a.fotos, [alvo]: nome });
          if (velha) await env.ARQUIVOS.delete(velha);
          await registrar(env, eu.email, 'Trocou foto do site', alvo, request);
          return json({ ok: true, url: '/api/arquivo/' + nome });
        }
        if (metodo === 'DELETE') {
          const fotos = { ...a.fotos }; delete fotos[alvo];
          await gravarAjuste(env, 'fotos', fotos);
          if (velha) await env.ARQUIVOS.delete(velha);
          await registrar(env, eu.email, 'Voltou foto original do site', alvo, request);
          return json({ ok: true });
        }
      }

      if (recurso === 'historico' && metodo === 'GET') {
        const { results } = await env.DB.prepare('SELECT quando, quem, acao, detalhe, ip FROM historico ORDER BY id DESC LIMIT 400').all();
        return json({ historico: results });
      }
      if (recurso === 'emails' && metodo === 'GET') {
        const { results } = await env.DB.prepare('SELECT para, assunto, tipo, situacao, erro, criado FROM emails ORDER BY criado DESC LIMIT 100').all();
        return json({ emails: results, ativo: emailAtivo(env) });
      }
      if (recurso === 'pagamentos' && metodo === 'GET') {
        const { results } = await env.DB.prepare(
          "SELECT a.data, a.valor, a.dias, a.forma, a.valido_ate, COALESCE(u.nome, 'Conta excluída') AS nome, COALESCE(u.email, '') AS email, COALESCE(c.cpf, '') AS cpf FROM assinaturas a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN clientes c ON c.user_id = a.user_id ORDER BY a.data DESC"
        ).all();
        return json({ pagamentos: results });
      }
      if (recurso === 'comunicados') {
        if (metodo === 'GET') return json({ comunicados: (await env.DB.prepare('SELECT * FROM comunicados ORDER BY criado DESC LIMIT 50').all()).results });
        if (metodo === 'POST') {
          const { titulo, texto, tipo, ate } = await lerJson(request);
          if (!String(titulo || '').trim()) return erro('Escreva o título do comunicado.');
          await env.DB.prepare('INSERT INTO comunicados (id, titulo, texto, tipo, ate, criado) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(aleatorio(8), String(titulo).trim().slice(0, 80), String(texto || '').trim().slice(0, 600), ['novidade', 'aviso', 'promo'].includes(tipo) ? tipo : 'novidade', dataValida(ate) ? ate : '', agora()).run();
          await registrar(env, eu.email, 'Publicou comunicado', String(titulo).slice(0, 80), request);
          return json({ ok: true }, 201);
        }
        if (metodo === 'DELETE' && alvo) {
          await env.DB.prepare('DELETE FROM comunicados WHERE id = ?').bind(alvo).run();
          await registrar(env, eu.email, 'Apagou comunicado', '', request);
          return json({ ok: true });
        }
      }

      if (recurso === 'pedidos' && alvo && metodo === 'PATCH') {
        const { status } = await lerJson(request);
        if (!['novo', 'contatado', 'convertido', 'descartado', 'pagamento', 'exclusao'].includes(status)) return erro('Situação inválida.');
        await env.DB.prepare('UPDATE pedidos SET status = ? WHERE id = ?').bind(status, alvo).run();
        return json({ ok: true });
      }
    }

    return erro('Rota não encontrada.', 404);
  } catch (e) {
    return erro('Erro no servidor. Tente de novo.', 500);
  }
}
