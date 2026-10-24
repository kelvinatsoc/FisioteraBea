// Publica o FisioBea no Cloudflare (plano gratuito) com um comando: npm run publicar
// Faz login no Cloudflare (abre o navegador), cria o banco D1, as tabelas e publica o site.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJETO = 'fisiobea';
const BANCO = 'fisiobea-db';
const TOML = path.join(__dirname, 'wrangler.toml');
const wrangler = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const passo = msg => console.log('\n▶ ' + msg);
// Mostra a saída para a pessoa e permite responder perguntas do wrangler
const rodar = args => spawnSync(wrangler, ['wrangler', ...args], { stdio: 'inherit', cwd: __dirname, shell: process.platform === 'win32' }).status === 0;
// Captura a saída para ler informações (ids, URLs)
const ler = args => {
  const r = spawnSync(wrangler, ['wrangler', ...args], { encoding: 'utf8', cwd: __dirname, shell: process.platform === 'win32' });
  return { ok: r.status === 0, saida: (r.stdout || '') + (r.stderr || '') };
};
const falhar = msg => { console.error('\n✖ ' + msg); process.exit(1); };

passo('Verificando login no Cloudflare');
if (!ler(['whoami']).saida.match(/associated with the email|You are logged in/i)) {
  console.log('Vai abrir o navegador: entre na sua conta do Cloudflare e clique em "Allow".');
  if (!rodar(['login'])) falhar('Não foi possível fazer login no Cloudflare.');
}

passo('Preparando o banco de dados');
let toml = fs.readFileSync(TOML, 'utf8');
if (toml.includes('COLE_AQUI_O_ID_DO_BANCO')) {
  let id = null;
  const lista = ler(['d1', 'list', '--json']);
  try { id = (JSON.parse(lista.saida.slice(lista.saida.indexOf('['))).find(b => b.name === BANCO) || {}).uuid; } catch (e) {}
  if (!id) {
    const criado = ler(['d1', 'create', BANCO]);
    const m = criado.saida.match(/database_id\s*=\s*"([0-9a-f-]{36})"/) || criado.saida.match(/"database_id"\s*:\s*"([0-9a-f-]{36})"/);
    if (!m) { console.log(criado.saida); falhar('Não consegui criar o banco D1.'); }
    id = m[1];
  }
  toml = toml.replace('COLE_AQUI_O_ID_DO_BANCO', id);
  fs.writeFileSync(TOML, toml);
  console.log('Banco pronto: ' + id);
} else console.log('Banco já configurado.');

passo('Criando as tabelas (pode pedir confirmação: responda "y")');
if (!rodar(['d1', 'execute', BANCO, '--remote', '--file=schema.sql'])) falhar('Não consegui criar as tabelas.');

passo('Criando o projeto no Cloudflare Pages');
const proj = ler(['pages', 'project', 'create', PROJETO, '--production-branch', 'main']);
if (!proj.ok && !/already exists|8000002/i.test(proj.saida)) { console.log(proj.saida); falhar('Não consegui criar o projeto.'); }

passo('Publicando o site');
const pub = ler(['pages', 'deploy', 'public', '--project-name', PROJETO, '--branch', 'main', '--commit-dirty=true']);
console.log(pub.saida);
if (!pub.ok) falhar('A publicação falhou. Veja a mensagem acima.');

// O endereço principal pode ganhar um sufixo se "fisiobea" já estiver em uso no Cloudflare
const info = ler(['pages', 'project', 'list', '--json']);
let dominio = `${PROJETO}.pages.dev`;
try { const p = JSON.parse(info.saida.slice(info.saida.indexOf('['))).find(x => (x['Project Name'] || x.name) === PROJETO); const d = p && (p['Project Domains'] || p.domains); if (d) dominio = String(d).split(',')[0].trim(); } catch (e) {}
console.log(`
✔ Pronto!
  Página de vendas:  https://${dominio}
  Aplicativo:        https://${dominio}/app/

  Abra o aplicativo e crie a CONTA DE ADMINISTRADORA (só aparece no primeiro acesso).
  Para publicar de novo depois de alguma mudança: npm run publicar
`);
