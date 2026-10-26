// Robô de backup do FisioBea (Cloudflare Worker com horário marcado).
// Todo dia gera um arquivo .sql com a estrutura e todos os dados do banco e guarda no R2:
//   diario/fisiobea-AAAA-MM-DD.sql  → as 30 cópias mais recentes
//   mensal/fisiobea-AAAA-MM.sql     → a cópia do dia 1 de cada mês, guardada por 12 meses
//   ultimo.json                     → quando foi o último backup e quantas linhas de cada tabela
// O arquivo é no mesmo formato do "wrangler d1 export", então restaura com "wrangler d1 execute --file".
// Não tem endereço público: só roda pelo horário.

const DIARIOS = 30, MENSAIS = 12, LOTE = 500;

const literal = v => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return "X'" + [...new Uint8Array(v.buffer || v)].map(b => b.toString(16).padStart(2, '0')).join('') + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
};
const nomeSql = n => '"' + String(n).replace(/"/g, '""') + '"';

async function gerarSql(db) {
  const { results: objetos } = await db.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'd1_migrations' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name"
  ).all();
  const partes = ['PRAGMA defer_foreign_keys=TRUE;'], contagem = {};
  for (const t of objetos.filter(o => o.type === 'table')) {
    partes.push(t.sql + ';');
    let n = 0;
    for (let ofs = 0; ; ofs += LOTE) {
      const { results } = await db.prepare(`SELECT * FROM ${nomeSql(t.name)} LIMIT ? OFFSET ?`).bind(LOTE, ofs).all();
      for (const linha of results) {
        const cols = Object.keys(linha);
        partes.push(`INSERT INTO ${nomeSql(t.name)} (${cols.map(nomeSql).join(',')}) VALUES(${cols.map(c => literal(linha[c])).join(',')});`);
      }
      n += results.length;
      if (results.length < LOTE) break;
    }
    contagem[t.name] = n;
  }
  for (const o of objetos.filter(o => o.type !== 'table')) partes.push(o.sql + ';');
  return { sql: partes.join('\n') + '\n', contagem };
}

async function apagarAntigos(bucket, prefixo, manter) {
  const chaves = [];
  let cursor;
  do {
    const r = await bucket.list({ prefix: prefixo, cursor });
    chaves.push(...r.objects.map(o => o.key));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  const sobra = chaves.sort().reverse().slice(manter); // nomes têm a data, então ordem alfabética = ordem de data
  if (sobra.length) await bucket.delete(sobra);
  return sobra.length;
}

export async function fazerBackup(env) {
  const inicio = Date.now();
  const brasilia = new Date(inicio - 3 * 3600e3).toISOString(); // horário de Brasília
  const dia = brasilia.slice(0, 10), mes = brasilia.slice(0, 7);
  const { sql, contagem } = await gerarSql(env.DB);
  const meta = { httpMetadata: { contentType: 'application/sql; charset=utf-8' }, customMetadata: { gerado: new Date(inicio).toISOString() } };
  await env.BACKUPS.put(`diario/fisiobea-${dia}.sql`, sql, meta);
  if (dia.endsWith('-01') || !(await env.BACKUPS.head(`mensal/fisiobea-${mes}.sql`))) await env.BACKUPS.put(`mensal/fisiobea-${mes}.sql`, sql, meta);
  const apagados = (await apagarAntigos(env.BACKUPS, 'diario/', DIARIOS)) + (await apagarAntigos(env.BACKUPS, 'mensal/', MENSAIS));
  const resumo = { quando: new Date(inicio).toISOString(), arquivo: `diario/fisiobea-${dia}.sql`, kb: Math.round(sql.length / 1024), linhas: contagem, apagados, segundos: (Date.now() - inicio) / 1000 };
  await env.BACKUPS.put('ultimo.json', JSON.stringify(resumo, null, 2), { httpMetadata: { contentType: 'application/json' } });
  return resumo;
}

// ---------- Lembretes por e-mail (todo dia às 9h de Brasília) ----------
// Só envia com o domínio configurado (segredos EMAIL_TOKEN, EMAIL_CONTA e EMAIL_DE); sem isso, registra como "sem domínio".
const VITALICIO = '9999-12-31';
const br = iso => iso ? iso.split('-').reverse().join('/') : '';
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const escHtml = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
async function enviarEmail(env, { para, assunto, texto, tipo }) {
  let situacao = 'sem domínio', falha = '';
  if (env.EMAIL_TOKEN && env.EMAIL_CONTA && env.EMAIL_DE) {
    try {
      const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2a24"><div style="font:400 26px Georgia,serif;color:#1d5a43">Fisio<i style="color:#b4583a">Bea</i></div><h1 style="font-size:19px">${escHtml(assunto)}</h1>${texto.split('\n\n').map(p => `<p style="font-size:15px;line-height:1.55">${escHtml(p).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.EMAIL_CONTA}/email/sending/send`, {
        method: 'POST', headers: { authorization: 'Bearer ' + env.EMAIL_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({ to: para, from: env.EMAIL_DE, subject: assunto, text: texto, html }),
      });
      const c = await r.json().catch(() => ({}));
      situacao = r.ok && c.success ? 'enviado' : 'falhou';
      if (situacao === 'falhou') falha = JSON.stringify(c.errors || r.status).slice(0, 300);
    } catch (e) { situacao = 'falhou'; falha = String(e).slice(0, 300); }
  }
  await env.DB.prepare('INSERT INTO emails (id, para, assunto, tipo, situacao, erro, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID().slice(0, 16), para, assunto, tipo, situacao, falha, new Date().toISOString()).run();
}
export async function lembretes(env) {
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10), site = env.SITE || 'https://fisiobea.pages.dev';
  const { results } = await env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.valido_ate, u.obs, (SELECT COUNT(*) FROM assinaturas a WHERE a.user_id = u.id) AS pagos
     FROM users u WHERE u.ativo = 1 AND u.role <> 'admin' AND u.valido_ate IN (?, ?, ?)`
  ).bind(somaDias(hoje, 1), somaDias(hoje, 3), somaDias(hoje, -1)).all();
  let n = 0;
  for (const u of results) {
    if (u.valido_ate === VITALICIO) continue;
    const nome = u.nome.split(' ')[0], teste = !u.pagos;
    let tipo, assunto, texto;
    if (teste && u.valido_ate === somaDias(hoje, 1)) {
      tipo = 'teste-acabando'; assunto = 'Seu teste grátis do FisioBea acaba amanhã';
      texto = `Olá, ${nome}!

Seu teste grátis vai até amanhã (${br(u.valido_ate)}). Se o FisioBea está ajudando na sua rotina, é só assinar para continuar: seus pacientes e registros ficam todos lá.

Para assinar, entre no app e toque em "Quero assinar": ${site}/app/`;
    } else if (!teste && u.valido_ate === somaDias(hoje, 3)) {
      tipo = 'vencendo'; assunto = 'Sua assinatura do FisioBea vence em 3 dias';
      texto = `Olá, ${nome}!

Sua assinatura vence em ${br(u.valido_ate)}. Para não perder o acesso, renove pelo app (o código Pix já vem pronto): ${site}/app/`;
    } else if (u.valido_ate === somaDias(hoje, -1)) {
      tipo = 'vencida'; assunto = teste ? 'Seu teste grátis terminou' : 'Seu acesso ao FisioBea venceu';
      texto = `Olá, ${nome}!

${teste ? 'Seu teste grátis terminou ontem.' : 'Sua assinatura venceu ontem.'} Seus dados continuam guardados: assim que você ${teste ? 'assinar' : 'renovar'}, tudo volta como estava.

Entre no app para ${teste ? 'assinar' : 'renovar'}: ${site}/app/`;
    } else continue;
    const ja = await env.DB.prepare('SELECT 1 FROM emails WHERE para = ? AND tipo = ? AND criado > ?').bind(u.email, tipo, new Date(Date.now() - 20 * 3600e3).toISOString()).first();
    if (ja) continue;
    await enviarEmail(env, { para: u.email, assunto, texto, tipo }); n++;
  }
  return n;
}

export default {
  async scheduled(evento, env, ctx) {
    if (evento.cron === '0 12 * * *') ctx.waitUntil(lembretes(env).then(n => console.log('Lembretes', n)));
    else ctx.waitUntil(fazerBackup(env).then(r => console.log('Backup feito', JSON.stringify(r))));
  },
  async fetch() {
    return new Response('Nada aqui.', { status: 404 });
  },
};
