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

export default {
  async scheduled(evento, env, ctx) {
    ctx.waitUntil(fazerBackup(env).then(r => console.log('Backup feito', JSON.stringify(r))));
  },
  async fetch() {
    return new Response('Nada aqui.', { status: 404 });
  },
};
