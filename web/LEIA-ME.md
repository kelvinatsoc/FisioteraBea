# FisioBea: versão hospedada (Cloudflare, plano gratuito)

Site com cadastro e login próprios. Cada fisioterapeuta vê só os próprios pacientes.
**A primeira conta criada vira administradora.** Por isso, crie a sua antes de passar o link para alguém.

## Estrutura
- `public/index.html`: o aplicativo (telas)
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
5. Abra o endereço `https://<nome>.pages.dev` e **crie a sua conta primeiro**.

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
