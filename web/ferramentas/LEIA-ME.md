# Pacientes de exemplo (demonstração)

`gerar_demo.py` cria 9 pacientes fictícios com foto, treinos, agenda, avaliações, evoluções e pagamentos.
Todos os registros têm id começando com `demo-` (ou `av-demo-`), para apagar de uma vez.

Gerar e gravar numa conta (troque USER_ID pelo id da conta, em `SELECT id, nome FROM users`):

    python -I ferramentas/gerar_demo.py USER_ID pasta-com-as-fotos demo.sql
    npx wrangler d1 execute fisiobea-db --remote --file=demo.sql

As fotos (Pexels, 240x240) ficam em uma pasta com os arquivos 8727416.jpg, 40036710.jpg, 16152597.jpg,
36291553.jpg, 12644998.jpg, 614810.jpg, 4531837.jpg e 21906850.jpg.

Apagar os exemplos de uma conta (pergunte antes de rodar no banco publicado):

    npx wrangler d1 execute fisiobea-db --remote --command "DELETE FROM docs WHERE user_id = 'USER_ID' AND (id LIKE 'demo-%' OR id LIKE 'av-demo-%')"

# Backup do banco

- **Cópia própria:** `npm run backup` (dentro de `web/`) salva o banco publicado inteiro em `web/backups/` e guarda as 12 mais recentes. A pasta não vai para o GitHub porque tem dados de saúde. Rode toda semana, ou antes de qualquer mudança grande.
- **Voltar no tempo (Cloudflare):** o próprio Cloudflare guarda as versões do banco dos últimos dias (Time Travel).
  - Ver o ponto atual: `npx wrangler d1 time-travel info fisiobea-db`
  - Voltar para uma data e hora: `npx wrangler d1 time-travel restore fisiobea-db --timestamp=2026-10-24T12:00:00-03:00`
  - Isso substitui o banco inteiro. Faça um `npm run backup` antes e só rode com certeza.
- **Restaurar um arquivo de backup:** `npx wrangler d1 execute fisiobea-db --remote --file=backups/ARQUIVO.sql` (num banco vazio).

# Senha esquecida

- A assinante toca em "Esqueci minha senha"; o pedido aparece em Assinantes. "Gerar link" cria um link de 24 horas, de uso único, para mandar pelo WhatsApp.
- Se a administradora esquecer a própria senha: `npm run link-senha -- email@da.conta` mostra um link no terminal.
- Quando houver domínio próprio, dá para trocar o WhatsApp por e-mail automático.
