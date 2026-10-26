// Emergência: desliga a verificação em duas etapas de uma conta (por exemplo, se o celular com o autenticador foi perdido).
//   npm run desligar-2fa -- email@da.conta
// Depois de entrar só com a senha, ligue de novo em Ajustes > Segurança com o celular novo.
const { spawnSync } = require('child_process');
const path = require('path');

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Use: npm run desligar-2fa -- email@da.conta'); process.exit(1); }

const raiz = path.join(__dirname, '..');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const q = s => "'" + s.replace(/'/g, "''") + "'";
const r = spawnSync(npx, ['wrangler', 'd1', 'execute', 'fisiobea-db', '--remote', '--json',
  `--command=DELETE FROM segredos WHERE user_id = (SELECT id FROM users WHERE email = ${q(email)})`], { cwd: raiz, encoding: 'utf8', shell: process.platform === 'win32' });
if (r.status !== 0) { console.error(r.stdout + r.stderr); process.exit(1); }
let n = 0;
try { n = JSON.parse(r.stdout.slice(r.stdout.indexOf('[')))[0].meta.changes; } catch (e) {}
console.log(n ? `\nVerificação em duas etapas desligada para ${email}. Entre só com a senha e ligue de novo em Ajustes.\n` : `\nNada a desligar: ${email} não tinha a verificação ligada (ou a conta não existe).\n`);
