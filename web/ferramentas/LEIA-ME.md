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
