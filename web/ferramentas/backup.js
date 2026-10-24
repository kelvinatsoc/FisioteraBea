// Backup do banco publicado: npm run backup
// Salva uma cópia completa (estrutura + dados) em web/backups/fisiobea-AAAA-MM-DD-HHMM.sql
// e mantém só as 12 cópias mais recentes. A pasta backups/ não vai para o GitHub (tem dados de saúde).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const pasta = path.join(raiz, 'backups');
fs.mkdirSync(pasta, { recursive: true });
const d = new Date(), p = n => String(n).padStart(2, '0');
const nome = `fisiobea-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.sql`;
const destino = path.join(pasta, nome);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const r = spawnSync(npx, ['wrangler', 'd1', 'export', 'fisiobea-db', '--remote', `--output=${destino}`], { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status !== 0 || !fs.existsSync(destino)) { console.error('\n✖ O backup falhou. Veja a mensagem acima.'); process.exit(1); }

const antigos = fs.readdirSync(pasta).filter(f => /^fisiobea-.*\.sql$/.test(f)).sort().reverse().slice(12);
antigos.forEach(f => fs.unlinkSync(path.join(pasta, f)));
console.log(`\n✔ Backup salvo: backups/${nome} (${(fs.statSync(destino).size / 1024).toFixed(0)} KB)`);
