# FisioBea: versão hospedada (Cloudflare, plano gratuito)

- `/` página de vendas, com formulário "Quero conhecer" (os contatos aparecem no painel da administradora)
- `/app/` o aplicativo, só com login. Não existe cadastro aberto: a administradora cria as contas.
- Cada pagamento registrado libera 30 dias (ou 90/180/365). Venceu, o acesso é bloqueado automaticamente; os dados ficam guardados.
- Cada fisioterapeuta vê só os próprios pacientes.

**Instalação:** no primeiro acesso a `/app/` (banco vazio) aparece "Criar conta de administradora". Faça isso logo depois de publicar.

**Preço:** o valor aparece em dois lugares: `public/index.html` (página de vendas, texto "R$ 49,90") e `PRECO_PADRAO` em `public/app/index.html` (valor sugerido ao registrar pagamento).

## Estrutura
- `public/index.html`: página de vendas
- `public/app/index.html`: o aplicativo
- `functions/api/[[path]].js`: a API (login, cadastro, salvar dados, administração)
- `schema.sql`: as tabelas do banco D1

## Publicar pelo painel do Cloudflare (sem instalar nada)
1. **Criar o banco:** Workers & Pages → D1 SQL Database → *Create* → nome `fisiobea-db`.
2. **Criar as tabelas:** abra o banco → aba *Console* → cole o conteúdo de `schema.sql` → *Execute*.
3. **Criar o site:** Workers & Pages → *Create* → aba *Pages* → *Connect to Git* → escolha o repositório `FisioteraBea`.
   - Branch de produção: `ccr-5ff2e9fb-3ochwh` (ou `main`, depois do merge)
   - Framework: *None*
   - Build command: deixe vazio
   - Build output directory: `public`
   - Root directory (em *Advanced*): `web`
   - *Save and Deploy*
4. **Ligar o banco ao site:** no projeto do Pages → *Settings* → *Bindings* → *Add* → *D1 database* →
   nome da variável `DB`, banco `fisiobea-db` → salvar. Depois, em *Deployments*, clique em *Retry deployment*.
5. Abra `https://<nome>.pages.dev/app/` e **crie a conta de administradora**.

Cada `git push` nesse branch publica uma versão nova automaticamente.

## Publicar pela linha de comando (opcional)
```
npm install
npx wrangler login
npx wrangler d1 create fisiobea-db      # copie o database_id para o wrangler.toml
npm run db:remoto
npm run deploy
```

## Testar no computador
```
npm install
npm run db:local
npm run dev        # abre em http://localhost:8788
```
