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

- **Automático no Cloudflare (R2):** o robô `web/backup/` roda todo dia às 3h (Brasília) e guarda no R2 (`fisiobea-backups`):
  `diario/` com as 30 cópias mais recentes, `mensal/` com uma cópia por mês (12 meses) e `ultimo.json` com o resumo do último backup.
  - Publicar ou atualizar o robô (dentro de `web/`): `npx wrangler deploy -c backup/wrangler.toml`
  - Ver o último backup: `npx wrangler r2 object get fisiobea-backups/ultimo.json --pipe -c backup/wrangler.toml`
  - Baixar uma cópia: `npx wrangler r2 object get fisiobea-backups/diario/fisiobea-AAAA-MM-DD.sql --file=restaurar.sql -c backup/wrangler.toml`
  - Também dá para baixar pelo painel do Cloudflare: R2 → fisiobea-backups.

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

## Verificação em duas etapas

Liga em **Ajustes > Segurança**: o app mostra um QR code para ler no Google Authenticator (ou Microsoft Authenticator) e pede o primeiro código para confirmar. Depois disso, entrar pede a senha e o código de 6 números.

**Perdeu o celular?** No computador, dentro de `web/`:

```
npm run desligar-2fa -- seu@email.com
```

Isso desliga a verificação daquela conta. Entre só com a senha e ligue de novo com o celular novo.

## E-mails automáticos e avisos

O sistema já está pronto para mandar:

- para você: aviso de conta nova no teste, de "já paguei" e de pedido de saída;
- para as assinantes: boas-vindas, recibo, link de nova senha e, pelo robô das 9h, "seu teste acaba amanhã", "sua assinatura vence em 3 dias" e "seu acesso venceu".

Enquanto não houver domínio próprio, nada sai: tudo fica registrado em **Assinantes > Site e app > Ver e-mails enviados** como "sem domínio". Para ligar:

1. Compre um domínio (ex.: fisiobea.com.br no registro.br) e coloque-o no Cloudflare.
2. No Cloudflare, ative o **Email Sending** para esse domínio.
3. Crie um token com permissão de envio de e-mail e grave três segredos no site e no robô:
   `EMAIL_TOKEN` (o token), `EMAIL_CONTA` (o ID da conta Cloudflare) e `EMAIL_DE` (ex.: `contato@fisiobea.com.br`).

## Fotos do site

Ficam no R2, no espaço `fisiobea-site`. Troque em **Assinantes > Site e app > Fotos do site**; o sistema reduz a foto no próprio aparelho antes de enviar. "Voltar original" usa as fotos de `public/img/`.
