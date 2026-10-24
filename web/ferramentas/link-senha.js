// Link de nova senha pelo terminal, para quando a própria administradora esquecer a senha:
//   npm run link-senha -- email@da.conta
// Gera um código aleatório, grava só o hash dele no banco publicado (vale 24 horas, uso único) e mostra o link.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Use: npm run link-senha -- email@da.conta'); process.exit(1); }

const raiz = path.join(__dirname, '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const d1 = sql => spawnSync(npx, ['wrangler', 'd1', 'execute', 'fisiobea-db', '--remote', '--json', `--command=${sql}`], { cwd: raiz, encoding: 'utf8', shell: process.platform === 'win32' });
const q = s => "'" + s.replace(/'/g, "''") + "'";

const busca = d1(`SELECT id, nome FROM users WHERE email = ${q(email)} AND ativo = 1`);
let u = null;
try { u = JSON.parse(busca.stdout.slice(busca.stdout.indexOf('[')))[0].results[0]; } catch (e) {}
if (!u) { console.error('Não achei uma conta ativa com esse e-mail.'); process.exit(1); }

const codigo = crypto.randomBytes(32).toString('hex');
const hash = crypto.createHash('sha256').update(codigo).digest('hex');
const grava = d1(`INSERT INTO recuperacoes (token_hash, user_id, expira, usado, criado) VALUES (${q(hash)}, ${q(u.id)}, ${Date.now() + 24 * 3600e3}, 0, ${q(new Date().toISOString())})`);
if (grava.status !== 0) { console.error(grava.stdout + grava.stderr); process.exit(1); }
console.log(`\nLink de nova senha para ${u.nome} (vale 24 horas, uso único):\n\nhttps://fisiobea.pages.dev/app/?redefinir=${codigo}\n`);
