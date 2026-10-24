# Contexto do projeto FisioBea (para continuar no Claude Code local)

Leia este arquivo antes de qualquer coisa. Ele resume o que já foi feito e decidido.
Fale com a Beatriz em português do Brasil, em linguagem simples (ela é fisioterapeuta, não programadora).

## Quem é quem
- **Beatriz:** fisioterapeuta, dona do produto. Usa um Samsung S24 FE e um Galaxy Tab S6 Lite.
- **Kelvin:** namorado dela, dono da conta do GitHub (`kelvinatsoc/FisioteraBea`).

## O produto
App para fisioterapeutas planejarem atendimentos, vendido por **assinatura mensal** para colegas.
A referência de funcionalidades foi a plataforma Nura (plataformanura.com.br). Use como inspiração, **sem copiar** visual, textos ou código.

Funcionalidades prontas:
- Agenda da semana: pacientes com dias fixos e status (agendado, confirmado, realizado, faltou, falta justificada, cancelado), remarcar, sessões avulsas, lembrete pelo WhatsApp.
- Treinos A, B, C, D… por paciente, com rodízio automático (faltas não avançam o treino) e envio pelo WhatsApp.
- Evolução com modelo editável. Os exercícios do treino do dia entram preenchidos, e salvar a evolução marca o atendimento como realizado.
- Avaliações por área: inicial, ortopédica, neurológica, respiratória, geriátrica, pélvica e dor.
- Financeiro: pagamentos, pacotes com saldo de sessões, meta mensal e gráfico de 6 meses.
- Documentos: atestado, declaração, recibo, relatório e alta.
- Painel inicial, aniversariantes, evoluções pendentes, ocultar nomes, tema claro/escuro/automático, importar pacientes por CSV.
- Visual: verde e amarelo (símbolo da fisioterapia) com branco, fonte Figtree, limpo.

## Versão atual (a que vale): pasta `web/`
Cloudflare Pages + Functions + D1, tudo no plano gratuito. Veja `web/CLAUDE.md` e `web/COMECE-AQUI.md`.
- `/` página de vendas, com formulário de interessadas.
- `/app/` aplicativo, só com login.
- **Cadastro com teste grátis.** A primeira conta criada vira a administradora (hoje o Kelvin). Depois, a própria fisio se cadastra no site (`POST /api/cadastro`) e ganha 7 dias (`obs = "Teste grátis pelo site"`); "em teste" = sem nenhum pagamento em `assinaturas`. Limites: 3 cadastros por IP a cada 15 min e 30 por hora no total. O botão "Quero assinar" abre o WhatsApp do telefone da administradora. A administradora também pode criar contas em "Nova assinante".
- Cada pagamento registrado pela admin libera 30 dias (ou 90/180/365). Pagamento antes do vencimento soma a partir do vencimento. Vencida, o acesso é bloqueado e os dados ficam guardados. A assinante vê um aviso 5 dias antes de vencer.
- Cada assinante vê só os próprios pacientes, nem a admin vê os das outras.
- Pagamento hoje é **manual** (Pix, e a admin registra no painel).

## Pendências e decisões em aberto
1. **Publicado** em https://fisiobea.pages.dev (24/10/2026). Para republicar só o site, sem tocar no banco: `npx wrangler pages deploy public --project-name fisiobea --branch main --commit-dirty=true` dentro de `web/`. Conferir se a Beatriz já criou a conta de administradora em `/app/`.
   - **Visual atual: "Consultório"** (opção A escolhida pela Beatriz): verde-floresta `#123c2e`, areia, pêssego, Instrument Serif + Hanken Grotesk, fotos em arco.
   - Fotos em `web/public/img/` são do Pexels (uso comercial liberado), só provisórias: trocar por fotos reais da Beatriz, principalmente a da seção "Por que existe".
2. **Preço:** "R$ 49,90" é provisório. Confirmar com a Beatriz e trocar em `web/public/index.html` e em `PRECO_PADRAO` (`web/public/app/index.html`).
3. **Frase da Beatriz na página de vendas** ("Eu precisava planejar os treinos…"): foi escrita pelo Claude. Ela precisa aprovar ou reescrever.
4. Ideias futuras: pagamento automático (Mercado Pago ou Asaas), "esqueci minha senha" por e-mail, termos de uso e política de privacidade (LGPD: dados de saúde são sensíveis), domínio próprio e publicação na Play Store.

## Situação em 24/10/2026
- Quem fala comigo é o **Kelvin** (namorado da Beatriz), que está montando o app para ela. A conta administradora publicada é a dele ("Kelvin Costa").
- A conta do Kelvin tem **pacientes de exemplo** (ids `demo-…`), para ver o app preenchido. Quando a Beatriz criar a conta dela, os exemplos podem ir para lá. Veja `web/ferramentas/LEIA-ME.md` (gerar e apagar).
- **Acesso vitalício**: conta com `valido_ate = 9999-12-31` nunca vence e não aceita pagamento (para a Beatriz). Escolhido em "Nova assinante" ou em "Editar".
- **Foto do paciente**: campo `foto` (JPEG 240 px em data URL) no cadastro; aparece na lista, na agenda e no prontuário.

## Segurança (24/10/2026)
- Login bloqueia 15 min após 5 senhas erradas no mesmo e-mail (ou 20 do mesmo IP). Tabela `tentativas`.
- "Esqueci minha senha" vira pedido (pedidos.status = 'senha'); a admin gera link de 24 h e uso único (tabela `recuperacoes`, só o hash do código). Sem domínio próprio ainda não há e-mail automático.
- Ajustes → "Meus dados": baixa JSON completo ou CSV de pacientes.
- Backup: `npm run backup` e Time Travel do D1. Ver `web/ferramentas/LEIA-ME.md`.

## Versões antigas (só referência)
- `index.html`, `app.js`, `style.css`: primeira versão (salva só no navegador).
- `fisiobea.html`: versão publicada como artifact no claude.ai, que usa o banco do claude.ai.
  Link: https://claude.ai/artifact/6ePfmpM8kyJr34v1zmBe2v (tem pacientes de exemplo).

## Testes já feitos (servidor local do wrangler)
- Instalação, login, criação de assinante, pagamento de 30 dias (24/10 → 22/11), soma de pagamentos, bloqueio ao vencer (inclusive com a sessão aberta), formulário da página de vendas, isolamento entre usuárias e aviso de vencimento.

## Git
Branch de trabalho: `ccr-5ff2e9fb-3ochwh` (ainda não foi para a `main`).
