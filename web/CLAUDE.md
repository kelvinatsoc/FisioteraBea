# FisioBea

App para fisioterapeutas (agenda, treinos A/B/C/D, evoluções, avaliações, financeiro, documentos), vendido por assinatura mensal.
Dona do produto: Beatriz (fisioterapeuta). Responda em português do Brasil, em linguagem simples.

## Estrutura
- `public/index.html`: página de vendas (landing). Formulário envia para `POST /api/pedido`.
- `public/app/index.html`: o aplicativo inteiro (HTML + CSS + JS num arquivo só, sem build).
- `functions/api/[[path]].js`: API em Cloudflare Pages Functions. Contas, sessões por cookie, dados por usuária, painel admin.
- `schema.sql`: tabelas do D1 (users, sessions, docs, assinaturas, pedidos).
- `publicar.js` (`npm run publicar`): login no Cloudflare, cria o D1, aplica o schema e publica.

## Regras do negócio
- Sem cadastro aberto. A primeira conta (`/api/instalar`, só com o banco vazio) é a administradora; ela cria as demais.
- Cada pagamento registrado libera N dias (padrão 30). Se ainda está em dia, soma a partir do vencimento. Vencida: bloqueio (HTTP 402).
- Cada usuária só acessa os próprios `docs`; nem a admin vê pacientes de outras.
- Preço: texto "R$ 49,90" em `public/index.html` e `PRECO_PADRAO` em `public/app/index.html`.

## Comandos
- `npm run db:local && npm run dev`: testa em http://localhost:8788
- `npm run publicar`: publica no Cloudflare (plano gratuito)
