# FisioBea: como rodar e publicar no seu computador

## 1. Instale o Node.js (uma vez só)
Baixe a versão **LTS** em https://nodejs.org e instale com as opções padrão.

## 2. Abra a pasta do projeto no terminal
- **Windows:** abra esta pasta no Explorador, clique na barra de endereço, digite `cmd` e aperte Enter.
- **Mac:** clique com o botão direito na pasta → *Novo Terminal na Pasta*.

## 3. Publique no Cloudflare (um comando)
```
npm install
npm run publicar
```
O navegador vai abrir para você entrar no Cloudflare e clicar em **Allow**.
Se aparecer uma pergunta no terminal, responda `y` e aperte Enter.
No final, aparecem os dois links: a página de vendas e o aplicativo (`/app/`).

**Logo depois, abra o link do aplicativo e crie a conta de administradora.** Essa opção só aparece no primeiro acesso.

## 4. Testar no computador antes de publicar (opcional)
```
npm run db:local
npm run dev
```
Abra http://localhost:8788

## Usando o Claude Code no seu computador
Instale o Claude Code (https://claude.com/claude-code), abra esta pasta e peça, por exemplo:
"publique o FisioBea no Cloudflare" ou "mude o preço para R$ 39,90 e publique".
O arquivo `CLAUDE.md` explica o projeto para ele.
