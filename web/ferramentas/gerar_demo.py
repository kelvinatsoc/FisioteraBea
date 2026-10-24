"""Gera SQL com pacientes de exemplo (ids "demo-") para uma conta do FisioBea.
Uso: python -I gerar_demo.py <user_id> <pasta_rostos> <saida.sql>"""
import base64, datetime as dt, json, random, sys

USER, ROSTOS, SAIDA = sys.argv[1], sys.argv[2], sys.argv[3]
random.seed(7)
HOJE = dt.date(2026, 10, 24)
AGORA = '2026-10-24T13:00:00.000Z'
d = lambda s: dt.date.fromisoformat(s)
iso = lambda x: x.isoformat()
foto = lambda f: 'data:image/jpeg;base64,' + base64.b64encode(open(f'{ROSTOS}/{f}.jpg', 'rb').read()).decode()
wd = lambda x: (x.weekday() + 1) % 7  # JS: domingo = 0
LETRAS = 'ABCDEF'

def ex(nome, series='', reps='', carga=''):
    return {'nome': nome, 'series': series, 'reps': reps, 'carga': carga}

def treinos(*lista):
    return [{'letra': LETRAS[i], 'nome': n, 'obs': o, 'exercicios': e} for i, (n, o, e) in enumerate(lista)]

PACIENTES = [
    dict(id='demo-lucia', nome='Lúcia Ferreira Campos', foto='8727416', nascimento='1947-03-12', cpf='123.456.789-01', celular='(11) 98765-4321',
         endereco='Rua das Acácias, 120, Vila Mariana · domicílio', responsavel='Cláudia Campos (filha)', convenio='Particular', valorSessao='150',
         diagnostico='Prevenção de quedas · fraqueza de MMII', medico='Dra. Renata Alves (geriatra)', dias=[1, 3, 5], horario='08:00', inicio='2026-09-07',
         obs='Atendimento a domicílio. Mora com a filha. Usa andador fora de casa.', tipo_aval='geriatrica',
         treinos=treinos(
             ('Força de MMII', 'Sempre com apoio na cadeira. Descanso de 60 s.', [ex('Sentar e levantar da cadeira', '3', '8'), ex('Elevação de calcanhares com apoio', '3', '12'), ex('Abdução de quadril em pé', '3', '10', 'caneleira 1 kg'), ex('Marcha estacionária', '2', '1 min')]),
             ('Equilíbrio', 'Ficar ao lado dela o tempo todo.', [ex('Apoio unipodal com apoio', '3', '20 s'), ex('Marcha tandem no corredor', '3', '3 m'), ex('Transferência de peso lateral', '2', '10'), ex('Alcance funcional', '2', '8')]),
             ('Marcha e funcional', '', [ex('Marcha com obstáculos baixos', '3', '4 m'), ex('Subir e descer degrau', '3', '8'), ex('Levantar do chão (treino)', '1', '3')]),
         )),
    dict(id='demo-antonio', nome='Antônio Carlos Ribeiro', foto='40036710', nascimento='1955-07-02', cpf='234.567.890-12', celular='(11) 97654-3210',
         endereco='Av. Jabaquara, 1500, ap. 42 · domicílio', responsavel='Márcia Ribeiro (esposa)', convenio='Particular', valorSessao='160',
         diagnostico='AVC isquêmico · hemiparesia à direita', medico='Dr. Paulo Nogueira (neurologista)', dias=[2, 4], horario='09:30', inicio='2026-08-25',
         obs='AVC em julho/2026. Hipertenso. Medir PA antes de cada sessão.', tipo_aval='neurologica',
         treinos=treinos(
             ('Membro superior direito', 'Inibir padrão flexor antes dos exercícios.', [ex('Alcance com bastão', '3', '10'), ex('Preensão com massinha', '3', '1 min'), ex('Descarga de peso no MSD', '3', '30 s'), ex('Flexão de ombro ativo-assistida', '3', '10')]),
             ('Tronco e transferências', '', [ex('Ponte', '3', '10'), ex('Rolar para os dois lados', '2', '5'), ex('Deitado para sentado', '2', '5'), ex('Sentado para em pé', '3', '8')]),
             ('Marcha', 'Usar bengala de 4 pontas.', [ex('Marcha com bengala no corredor', '3', '10 m'), ex('Passo lateral', '3', '5 m'), ex('Treino de escada', '2', '1 lance')]),
             ('Equilíbrio sentado e em pé', '', [ex('Alcance sentado na bola', '3', '10'), ex('Apoio em pé com transferência de peso', '3', '30 s'), ex('Ficar em pé sem apoio', '3', '20 s')]),
         )),
    dict(id='demo-marina', nome='Marina Souza Prado', foto='16152597', nascimento='1997-05-20', cpf='345.678.901-23', celular='(11) 96543-2109',
         email='marina.prado@exemplo.com', endereco='Rua Augusta, 900, Consolação', convenio='Particular', valorSessao='130',
         diagnostico='Pós-operatório de LCA · joelho esquerdo', medico='Dr. Fábio Lima (ortopedista)', dias=[1, 3, 5], horario='18:30', inicio='2026-09-14',
         obs='Cirurgia em 01/09/2026, enxerto de flexores. Joga vôlei amador, quer voltar até março.', tipo_aval='ortopedica',
         treinos=treinos(
             ('Quadríceps e ADM', '', [ex('Extensão de joelho em cadeia aberta 90-45°', '3', '12', '2 kg'), ex('Leg press 45°', '3', '12', '30 kg'), ex('Bicicleta ergométrica', '1', '10 min'), ex('Mobilização patelar', '2', '1 min')]),
             ('Posterior e glúteos', '', [ex('Ponte unipodal', '3', '10'), ex('Stiff com halteres', '3', '10', '6 kg'), ex('Abdução com mini band', '3', '15'), ex('Flexão de joelho em pé', '3', '12', '1 kg')]),
             ('Funcional e propriocepção', '', [ex('Step up 15 cm', '3', '10'), ex('Agachamento até 60°', '3', '12'), ex('Apoio unipodal no disco', '3', '30 s'), ex('Marcha lateral com elástico', '3', '10 m')]),
             ('Fortalecimento global', 'Gelo 15 min ao final.', [ex('Agachamento búlgaro com apoio', '3', '8'), ex('Prancha frontal', '3', '30 s'), ex('Panturrilha unipodal', '3', '15'), ex('Esteira caminhada', '1', '8 min')]),
         )),
    dict(id='demo-carlos', nome='Carlos Henrique Mendes', foto='36291553', nascimento='1980-11-08', cpf='456.789.012-34', celular='(11) 95432-1098',
         email='carlos.mendes@exemplo.com', endereco='Rua Vergueiro, 3100, Vila Mariana', convenio='Unimed', valorSessao='120',
         diagnostico='Lombalgia crônica · protrusão L4-L5', medico='Dra. Simone Arruda (ortopedista)', dias=[2, 4], horario='07:00', inicio='2026-09-01',
         obs='Trabalha sentado 9 h por dia. Dor piora no fim do expediente.', tipo_aval='dor',
         treinos=treinos(
             ('Estabilização', '', [ex('Perdigueiro', '3', '10 cada lado'), ex('Prancha lateral', '3', '20 s'), ex('Dead bug', '3', '10'), ex('Ponte', '3', '12')]),
             ('Mobilidade', '', [ex('Gato-camelo', '2', '10'), ex('Rotação de tronco deitado', '2', '10'), ex('Alongamento de isquiotibiais', '3', '30 s'), ex('Mobilidade de quadril 90/90', '2', '8')]),
             ('Fortalecimento', '', [ex('Levantamento terra com kettlebell', '3', '10', '12 kg'), ex('Remada com elástico', '3', '12'), ex('Agachamento livre', '3', '12'), ex('Farmer walk', '3', '20 m', '2 x 8 kg')]),
         )),
    dict(id='demo-helena', nome='Helena Martins Duarte', foto='12644998', nascimento='1960-01-30', cpf='567.890.123-45', celular='(11) 94321-0987',
         endereco='Rua Domingos de Morais, 2200, Vila Mariana', convenio='Particular', valorSessao='140',
         diagnostico='Capsulite adesiva · ombro direito', medico='Dr. Ricardo Telles (ortopedista)', dias=[1, 4], horario='10:00', inicio='2026-09-21',
         obs='Diabética tipo 2. Dor noturna no início do tratamento.', tipo_aval='ortopedica',
         treinos=treinos(
             ('ADM passiva e ativo-assistida', 'Calor úmido 10 min antes.', [ex('Pendular de Codman', '2', '1 min'), ex('Flexão com bastão', '3', '10'), ex('Rotação externa com bastão', '3', '10'), ex('Escalada na parede', '3', '8')]),
             ('Fortalecimento leve', '', [ex('Rotação externa com elástico amarelo', '3', '12'), ex('Rotação interna com elástico amarelo', '3', '12'), ex('Retração escapular', '3', '15'), ex('Elevação no plano da escápula', '3', '10', '0,5 kg')]),
         )),
    dict(id='demo-rafael', nome='Rafael Teixeira Lopes', foto='614810', nascimento='1999-04-17', cpf='678.901.234-56', celular='(11) 93210-9876',
         email='rafael.lopes@exemplo.com', endereco='Rua Tutóia, 500, Paraíso', convenio='Particular', valorSessao='120',
         diagnostico='Entorse de tornozelo grau II · retorno à corrida', medico='', dias=[3, 5], horario='19:00', inicio='2026-10-05',
         obs='Corredor de rua, 30 km por semana. Entorse em 22/09 em trilha.', tipo_aval='ortopedica',
         treinos=treinos(
             ('Propriocepção', '', [ex('Apoio unipodal olhos fechados', '3', '30 s'), ex('Apoio unipodal no disco', '3', '30 s'), ex('Star excursion balance', '2', '5 cada direção')]),
             ('Força', '', [ex('Panturrilha unipodal', '3', '15'), ex('Eversão com elástico', '3', '15'), ex('Agachamento unipodal', '3', '8')]),
             ('Retorno à corrida', 'Sem dor acima de 3/10 durante e após.', [ex('Saltitos no lugar', '3', '30 s'), ex('Corrida leve na esteira', '1', '10 min'), ex('Skipping', '3', '20 s')]),
         )),
    dict(id='demo-juliana', nome='Juliana Alves Nascimento', foto='4531837', nascimento='1993-09-25', cpf='789.012.345-67', celular='(11) 92109-8765',
         email='juliana.nascimento@exemplo.com', endereco='Rua Loefgren, 1800, Vila Clementino', convenio='Particular', valorSessao='150',
         diagnostico='Incontinência urinária de esforço pós-parto', medico='Dra. Beatriz Fontes (ginecologista)', dias=[2], horario='14:00', inicio='2026-09-08',
         obs='Parto normal em maio/2026. Perde urina ao tossir e ao correr.', tipo_aval='pelvica',
         treinos=treinos(
             ('Assoalho pélvico', 'Respiração diafragmática antes de cada série.', [ex('Contração lenta do assoalho pélvico', '3', '8 x 5 s'), ex('Contração rápida', '3', '10'), ex('Ponte com contração', '3', '10')]),
             ('Funcional', '', [ex('Agachamento com contração prévia', '3', '10'), ex('Tosse com contração (the knack)', '3', '5'), ex('Prancha modificada', '3', '20 s')]),
         )),
    dict(id='demo-jorge', nome='Jorge Batista Silva', foto='21906850', nascimento='1952-06-14', cpf='890.123.456-78', celular='(11) 91098-7654',
         endereco='Rua Santa Cruz, 700, Vila Mariana · domicílio', responsavel='Ana Silva (filha)', convenio='Particular', valorSessao='150',
         diagnostico='DPOC · reabilitação pulmonar', medico='Dr. Hélio Bastos (pneumologista)', dias=[2, 5], horario='11:00', inicio='2026-09-15',
         obs='Ex-tabagista (40 anos-maço). Usa oxigênio só para dormir. Atendimento em casa.', tipo_aval='respiratoria',
         treinos=treinos(
             ('Respiratório', 'Monitorar SpO2: parar se < 88%.', [ex('Respiração com freno labial', '3', '10'), ex('Respiração diafragmática', '3', '10'), ex('Incentivador inspiratório', '3', '10'), ex('Huffing para higiene brônquica', '2', '5')]),
             ('Condicionamento', 'Borg máximo 4.', [ex('Caminhada no corredor', '3', '3 min'), ex('Sentar e levantar', '3', '10'), ex('Flexão de ombro com bastão', '3', '10'), ex('Bicicleta de pedal na poltrona', '1', '10 min')]),
         )),
    dict(id='demo-paula', nome='Paula Regina Costa', foto=None, nascimento='1974-02-11', cpf='901.234.567-89', celular='(11) 99876-5432',
         endereco='Rua Pedro de Toledo, 1000, Vila Clementino', convenio='Particular', valorSessao='120',
         diagnostico='Fascite plantar à esquerda', medico='', dias=[1, 3], horario='16:00', inicio='2026-08-10', fim='2026-10-07', ativo=False,
         obs='Recebeu alta em 07/10/2026 sem dor.', tipo_aval='dor',
         treinos=treinos(('Pé e panturrilha', '', [ex('Alongamento de panturrilha na parede', '3', '30 s'), ex('Rolar bolinha na planta do pé', '1', '2 min'), ex('Toalha com os dedos', '3', '10')])),
         ),
]

# Faltas e mudanças de status (o restante do passado fica "realizado")
FALTAS = {('demo-carlos', '2026-09-24'): 'faltou', ('demo-lucia', '2026-10-09'): 'justificada', ('demo-marina', '2026-10-02'): 'faltou',
          ('demo-antonio', '2026-10-15'): 'justificada', ('demo-jorge', '2026-10-10'): 'cancelado', ('demo-rafael', '2026-10-17'): 'faltou'}
FUTURO = {('demo-carlos', '2026-10-27'): 'confirmado', ('demo-antonio', '2026-10-27'): 'confirmado', ('demo-lucia', '2026-10-26'): 'confirmado'}

def dias_atendimento(p, ate):
    x, out = d(p['inicio']), []
    fim = min(ate, d(p['fim'])) if p.get('fim') else ate
    while x <= fim:
        if wd(x) in p['dias']:
            out.append(x)
        x += dt.timedelta(days=1)
    return out

docs = []  # (col, id, obj)
def add(col, obj):
    docs.append((col, obj['id'], obj))

evo_textos = {
    'geriatrica': (['Refere estar mais firme para levantar da cama.', 'Relata cansaço nas pernas após o banho.', 'Sem quedas desde a última sessão.', 'Animada, fez os exercícios com a filha.'],
                   ['Realizou todos os exercícios com supervisão, sem desequilíbrios.', 'Boa tolerância. Precisou de pausas maiores no sentar e levantar.', 'Melhora visível na marcha tandem, menos oscilação.']),
    'neurologica': (['Esposa relata que ele já abotoa a camisa sozinho.', 'Chegou sonolento, dormiu mal.', 'Refere dor leve no ombro direito ao final do dia.', 'Motivado, quer voltar a caminhar até a padaria.'],
                    ['Maior controle de tronco nas transferências.', 'Marcha com bengala 4 pontas por 30 m sem pausa.', 'Ganho de preensão no MSD, ainda com padrão flexor ao esforço.']),
    'ortopedica': (['Refere menos dor ao subir escadas.', 'Sentiu o joelho/ombro "travar" uma vez na semana.', 'Dormiu melhor, sem dor noturna.', 'Chegou com leve edema após trabalho.'],
                   ['Boa execução, ganho de ADM em relação à sessão anterior.', 'Tolerou aumento de carga sem dor.', 'Leve dor ao final, aliviada com gelo.']),
    'dor': (['Refere melhora da dor ao acordar.', 'Passou o fim de semana sentado e a dor voltou.', 'Conseguiu trabalhar o dia todo com dor leve.', 'Sem dor ao dirigir.'],
            ['Boa ativação de core, menos compensação lombar.', 'Dor reduziu durante a sessão.', 'Executou fortalecimento com carga sem piora.']),
    'pelvica': (['Relata menos perdas ao tossir.', 'Teve uma perda ao pegar o bebê no colo.', 'Fazendo os exercícios em casa todos os dias.'],
                ['Contração mais forte e sustentada.', 'Boa coordenação respiração e contração.', 'Conseguiu realizar o knack em todas as tosses.']),
    'respiratoria': (['Refere menos falta de ar para tomar banho.', 'Está com tosse produtiva há 2 dias.', 'Caminhou até o portão sem parar.'],
                     ['SpO2 se manteve acima de 90% durante o condicionamento.', 'Boa expectoração após huffing.', 'Borg 3 ao final da caminhada, melhor que a semana anterior.']),
}

for p in PACIENTES:
    pid, tipo = p['id'], p['tipo_aval']
    pac = {k: v for k, v in p.items() if k not in ('tipo_aval',)}
    pac['foto'] = foto(p['foto']) if p['foto'] else ''
    pac.setdefault('email', ''); pac.setdefault('responsavel', ''); pac.setdefault('ativo', True); pac.setdefault('fim', '')
    add('pacientes', pac)

    # Sessões passadas (realizado/faltas) e algumas futuras confirmadas
    passadas = [x for x in dias_atendimento(p, HOJE - dt.timedelta(days=1))]
    realizadas, n = [], 0
    for x in passadas:
        st = FALTAS.get((pid, iso(x)), 'realizado')
        letra = LETRAS[n % len(p['treinos'])] if st == 'realizado' else ''
        add('sessoes', {'id': f'{pid}_{iso(x)}', 'pacienteId': pid, 'data': iso(x), 'horario': p['horario'], 'avulsa': False, 'treino': letra, 'obs': '', 'status': st})
        if st == 'realizado':
            realizadas.append((x, letra)); n += 1
    for (k, data), st in FUTURO.items():
        if k == pid:
            add('sessoes', {'id': f'{pid}_{data}', 'pacienteId': pid, 'data': data, 'horario': p['horario'], 'avulsa': False, 'treino': '', 'obs': '', 'status': st})

    # Evoluções das últimas sessões realizadas, com dor caindo aos poucos
    queixas, respostas = evo_textos['ortopedica' if tipo == 'geriatrica' and False else tipo]
    ultimas = realizadas[-6:]
    for i, (x, letra) in enumerate(ultimas):
        t = next(t for t in p['treinos'] if t['letra'] == letra)
        dor = max(0, 6 - i - random.randint(0, 1)) if tipo not in ('respiratoria', 'pelvica') else random.randint(0, 2)
        pa = f"{random.choice([118, 122, 126, 130, 134, 138])}/{random.choice([76, 78, 80, 82, 84])}"
        campos = [
            {'rotulo': 'Queixa / como chegou', 'tipo': 'texto', 'valor': random.choice(queixas)},
            {'rotulo': 'PA (mmHg)', 'tipo': 'linha', 'valor': pa},
            {'rotulo': 'FC (bpm)', 'tipo': 'linha', 'valor': str(random.randint(68, 92))},
            {'rotulo': 'SpO2 (%)', 'tipo': 'linha', 'valor': str(random.randint(91, 94) if tipo == 'respiratoria' else random.randint(96, 99))},
            {'rotulo': 'Dor (EVA 0-10)', 'tipo': 'linha', 'valor': str(dor)},
            {'rotulo': 'Conduta / exercícios realizados', 'tipo': 'texto', 'valor': '\n'.join(f"{e['nome']} — " + ' · '.join(v for v in (e['series'] and e['series'] + 'x', e['reps'], e['carga']) if v) for e in t['exercicios'])},
            {'rotulo': 'Resposta ao tratamento', 'tipo': 'texto', 'valor': random.choice(respostas)},
            {'rotulo': 'Plano para a próxima sessão', 'tipo': 'texto', 'valor': random.choice(['Manter conduta e progredir carga.', 'Seguir rodízio de treinos.', 'Reavaliar dor e ADM.', 'Incluir mais um exercício funcional.'])},
        ]
        add('evolucoes', {'id': f'demo-evo-{pid[5:]}-{iso(x)}', 'pacienteId': pid, 'data': iso(x), 'treino': letra, 'campos': campos})

# Reposições hoje (sábado), para o painel inicial não ficar vazio
add('sessoes', {'id': 'av-demo-marina-rep', 'pacienteId': 'demo-marina', 'data': '2026-10-24', 'horario': '09:00', 'avulsa': True, 'treino': '', 'obs': 'Reposição da falta de 02/10', 'status': 'confirmado'})
add('sessoes', {'id': 'av-demo-rafael-rep', 'pacienteId': 'demo-rafael', 'data': '2026-10-24', 'horario': '10:30', 'avulsa': True, 'treino': '', 'obs': 'Reposição da falta de 17/10', 'status': 'agendado'})

# Avaliações iniciais (uma por paciente, com os rótulos das fichas do app)
BASE_INI = ['Queixa principal', 'História da doença atual (HDA)', 'História pregressa / comorbidades', 'Medicamentos em uso', 'Exames complementares']
BASE_FIM = ['_Dor (EVA 0-10)', 'Diagnóstico cinético-funcional', 'Objetivos do tratamento', 'Plano de tratamento']
FICHAS = {
    'ortopedica': ('Ortopédica', BASE_INI + ['Inspeção (postura, edema, cicatriz)', 'Palpação', 'Goniometria (ADM em graus)', 'Força muscular (0-5)', 'Testes especiais', 'Perimetria'] + BASE_FIM),
    'neurologica': ('Neurológica', BASE_INI + ['Nível de consciência / cognição', 'Tônus (Ashworth)', 'Reflexos', 'Sensibilidade', 'Coordenação', '_Escala de Berg (0-56)', 'Marcha', 'Transferências e AVDs'] + BASE_FIM),
    'respiratoria': ('Respiratória', BASE_INI + ['_FR (irpm)', '_SpO2 (%)', 'Padrão e ritmo respiratório', 'Ausculta pulmonar', 'Tosse e secreção', '_Dispneia (Borg 0-10)', 'Cirtometria', '_Teste de caminhada de 6 min (m)'] + BASE_FIM),
    'geriatrica': ('Geriátrica', BASE_INI + ['Histórico de quedas (últimos 12 meses)', '_TUG (segundos)', '_Sentar e levantar em 30 s (repetições)', '_Escala de Berg (0-56)', 'AVDs (Katz) / AIVDs (Lawton)', 'Cognição / humor (GDS)', 'Ambiente domiciliar'] + BASE_FIM),
    'pelvica': ('Pélvica', BASE_INI + ['História obstétrica', 'Hábitos urinários e intestinais', 'Perdas urinárias (quando, quanto)', 'Função sexual', 'Avaliação perineal / PERFECT', 'Diário miccional'] + BASE_FIM),
    'dor': ('Dor', ['Localização da dor', '_Intensidade (EVA 0-10)', 'Característica (queimação, pontada, peso…)', 'Início e duração', 'Fatores de piora', 'Fatores de melhora', 'Impacto no sono e nas atividades', 'Objetivos do tratamento', 'Plano de tratamento']),
}
AVAL = {
    'demo-lucia': {'Queixa principal': 'Medo de cair e fraqueza nas pernas.', 'História da doença atual (HDA)': 'Duas quedas em casa nos últimos 6 meses, a última ao levantar à noite para ir ao banheiro.', 'História pregressa / comorbidades': 'HAS, osteoporose, catarata operada.', 'Medicamentos em uso': 'Losartana 50 mg, alendronato semanal, cálcio + vitamina D.', 'Histórico de quedas (últimos 12 meses)': '2 quedas, sem fratura.', 'TUG (segundos)': '16', 'Sentar e levantar em 30 s (repetições)': '7', 'Escala de Berg (0-56)': '41', 'AVDs (Katz) / AIVDs (Lawton)': 'Independente nas AVDs; precisa de ajuda para compras e transporte.', 'Cognição / humor (GDS)': 'Orientada, GDS 4.', 'Ambiente domiciliar': 'Tapetes soltos na sala, banheiro sem barra de apoio. Orientada a filha.', 'Dor (EVA 0-10)': '2', 'Diagnóstico cinético-funcional': 'Diminuição de força de MMII e de equilíbrio estático e dinâmico, com alto risco de quedas.', 'Objetivos do tratamento': 'Reduzir risco de quedas, TUG abaixo de 12 s e Berg acima de 48 em 3 meses.', 'Plano de tratamento': 'Fortalecimento de MMII, treino de equilíbrio e marcha 3x por semana em domicílio, adaptação do ambiente.'},
    'demo-antonio': {'Queixa principal': 'Não consegue usar a mão direita e anda com dificuldade.', 'História da doença atual (HDA)': 'AVC isquêmico em 12/07/2026, internado por 9 dias. Alta com hemiparesia à direita.', 'História pregressa / comorbidades': 'HAS, dislipidemia, ex-tabagista.', 'Medicamentos em uso': 'AAS, atorvastatina, enalapril.', 'Nível de consciência / cognição': 'Lúcido, orientado, compreende comandos.', 'Tônus (Ashworth)': 'Flexores de cotovelo D: 1+. Flexores de punho D: 1.', 'Sensibilidade': 'Hipoestesia tátil em MSD.', 'Escala de Berg (0-56)': '34', 'Marcha': 'Com bengala 4 pontas e supervisão, padrão ceifante à D.', 'Transferências e AVDs': 'Transferências com supervisão. Precisa de ajuda para vestir e tomar banho.', 'Dor (EVA 0-10)': '3', 'Diagnóstico cinético-funcional': 'Hemiparesia à direita com espasticidade leve, déficit de equilíbrio e marcha.', 'Objetivos do tratamento': 'Marcha independente com bengala em casa, melhorar uso funcional do MSD e independência no vestir.', 'Plano de tratamento': 'Cinesioterapia neurofuncional, treino de transferências e marcha, 2x por semana em domicílio.'},
    'demo-marina': {'Queixa principal': 'Dor e rigidez no joelho esquerdo após cirurgia.', 'História da doença atual (HDA)': 'Ruptura de LCA no vôlei em junho. Reconstrução com enxerto de flexores em 01/09/2026.', 'Medicamentos em uso': 'Dipirona se dor.', 'Exames complementares': 'RM pré-operatória: ruptura completa do LCA.', 'Inspeção (postura, edema, cicatriz)': 'Edema leve, cicatrizes boas, sem sinais flogísticos.', 'Goniometria (ADM em graus)': 'Flexão 95°, extensão -5°.', 'Força muscular (0-5)': 'Quadríceps E 3, flexores E 3+.', 'Perimetria': '5 cm acima da patela: E 41 cm / D 44 cm.', 'Dor (EVA 0-10)': '5', 'Diagnóstico cinético-funcional': 'Restrição de ADM e fraqueza de quadríceps no pós-operatório de LCA.', 'Objetivos do tratamento': 'ADM completa em 6 semanas, simetria de força acima de 85% e retorno ao vôlei em 6 a 8 meses.', 'Plano de tratamento': 'Protocolo acelerado de LCA, 3x por semana, com progressão por fases.'},
    'demo-carlos': {'Localização da dor': 'Lombar baixa, às vezes irradia para glúteo esquerdo.', 'Intensidade (EVA 0-10)': '7', 'Característica (queimação, pontada, peso…)': 'Peso e queimação.', 'Início e duração': 'Há 2 anos, piora nos últimos 3 meses.', 'Fatores de piora': 'Ficar sentado muito tempo, dirigir.', 'Fatores de melhora': 'Caminhar, banho quente.', 'Impacto no sono e nas atividades': 'Acorda com dor 2 a 3 vezes por semana. Parou a academia.', 'Objetivos do tratamento': 'Dor abaixo de 3, voltar à academia e trabalhar o dia sem dor.', 'Plano de tratamento': 'Estabilização segmentar, mobilidade e fortalecimento progressivo 2x por semana, orientação ergonômica.'},
    'demo-helena': {'Queixa principal': 'Não consegue levantar o braço para pentear o cabelo.', 'História da doença atual (HDA)': 'Dor no ombro D há 5 meses, perda progressiva de movimento.', 'História pregressa / comorbidades': 'Diabetes tipo 2, hipotireoidismo.', 'Medicamentos em uso': 'Metformina, levotiroxina.', 'Goniometria (ADM em graus)': 'Flexão 90°, abdução 70°, RE 15°.', 'Força muscular (0-5)': 'Limitada pela dor, 4 em amplitude disponível.', 'Testes especiais': 'Padrão capsular, sem sinais de lesão de manguito.', 'Dor (EVA 0-10)': '6', 'Diagnóstico cinético-funcional': 'Capsulite adesiva em fase de congelamento, com grande restrição de ADM.', 'Objetivos do tratamento': 'Flexão acima de 150° e voltar a se pentear e vestir sozinha.', 'Plano de tratamento': 'Termoterapia, mobilização articular, alongamento capsular e fortalecimento leve.'},
    'demo-rafael': {'Queixa principal': 'Instabilidade no tornozelo esquerdo para correr.', 'História da doença atual (HDA)': 'Entorse em inversão em trilha em 22/09/2026.', 'Inspeção (postura, edema, cicatriz)': 'Edema residual em maléolo lateral.', 'Testes especiais': 'Gaveta anterior levemente positiva à E.', 'Força muscular (0-5)': 'Eversores E 4.', 'Dor (EVA 0-10)': '3', 'Diagnóstico cinético-funcional': 'Instabilidade funcional de tornozelo após entorse grau II.', 'Objetivos do tratamento': 'Voltar a correr 10 km sem dor em 6 semanas.', 'Plano de tratamento': 'Propriocepção, fortalecimento de eversores e retorno gradual à corrida.'},
    'demo-juliana': {'Queixa principal': 'Perde urina ao tossir, espirrar e correr.', 'História da doença atual (HDA)': 'Começou após o parto, em maio/2026.', 'História obstétrica': 'G1P1, parto normal com episiotomia, bebê de 3,6 kg.', 'Perdas urinárias (quando, quanto)': 'Gotas, cerca de 3 vezes por dia.', 'Avaliação perineal / PERFECT': 'P2 E4 R3 F5.', 'Dor (EVA 0-10)': '0', 'Diagnóstico cinético-funcional': 'Fraqueza e baixa resistência da musculatura do assoalho pélvico.', 'Objetivos do tratamento': 'Zerar as perdas aos esforços e voltar a correr em 3 meses.', 'Plano de tratamento': 'Treino da musculatura do assoalho pélvico, consciência corporal e exercícios domiciliares diários.'},
    'demo-jorge': {'Queixa principal': 'Falta de ar para andar e tomar banho.', 'História da doença atual (HDA)': 'DPOC diagnosticada em 2019. Duas internações por exacerbação em 2026.', 'História pregressa / comorbidades': 'Ex-tabagista, HAS.', 'Medicamentos em uso': 'Tiotrópio, formoterol + budesonida, O2 noturno 1 L/min.', 'FR (irpm)': '22', 'SpO2 (%)': '92', 'Padrão e ritmo respiratório': 'Misto, uso de musculatura acessória.', 'Ausculta pulmonar': 'MV diminuído globalmente, sibilos esparsos.', 'Tosse e secreção': 'Tosse produtiva pela manhã, secreção clara.', 'Dispneia (Borg 0-10)': '5', 'Teste de caminhada de 6 min (m)': '280', 'Dor (EVA 0-10)': '0', 'Diagnóstico cinético-funcional': 'Intolerância ao esforço e dispneia por DPOC moderada a grave.', 'Objetivos do tratamento': 'Aumentar o TC6 em pelo menos 30 m e tomar banho sem pausas.', 'Plano de tratamento': 'Reabilitação pulmonar domiciliar 2x por semana: higiene brônquica, reexpansão e condicionamento.'},
    'demo-paula': {'Localização da dor': 'Calcanhar esquerdo.', 'Intensidade (EVA 0-10)': '7', 'Característica (queimação, pontada, peso…)': 'Pontada nos primeiros passos da manhã.', 'Início e duração': 'Há 4 meses.', 'Fatores de piora': 'Ficar em pé muito tempo.', 'Objetivos do tratamento': 'Andar sem dor pela manhã.', 'Plano de tratamento': 'Alongamento, liberação miofascial e fortalecimento intrínseco do pé.'},
}
for p in PACIENTES:
    nome_ficha, campos = FICHAS[p['tipo_aval']]
    valores = AVAL[p['id']]
    add('avaliacoes', {'id': f"demo-aval-{p['id'][5:]}", 'pacienteId': p['id'], 'data': p['inicio'], 'tipo': p['tipo_aval'], 'titulo': nome_ficha,
                       'campos': [{'rotulo': c.lstrip('_'), 'tipo': 'linha' if c.startswith('_') else 'texto', 'valor': valores.get(c.lstrip('_'), '')} for c in campos]})

# Reavaliação para mostrar a evolução dos números
add('avaliacoes', {'id': 'demo-aval-lucia-2', 'pacienteId': 'demo-lucia', 'data': '2026-10-19', 'tipo': 'geriatrica', 'titulo': 'Geriátrica',
                   'campos': [{'rotulo': c.lstrip('_'), 'tipo': 'linha' if c.startswith('_') else 'texto', 'valor': v} for c, v in [
                       ('Queixa principal', 'Reavaliação após 6 semanas.'), ('_TUG (segundos)', '13'), ('_Sentar e levantar em 30 s (repetições)', '10'), ('_Escala de Berg (0-56)', '46'),
                       ('Histórico de quedas (últimos 12 meses)', 'Nenhuma queda desde o início do tratamento.'), ('Objetivos do tratamento', 'Manter os ganhos e chegar a Berg 48. Treinar levantar do chão.')]]})

# Pagamentos: sessões avulsas, pacotes e algumas pendências
pg = []
def pag(pid, data, valor, tipo='sessao', status='pago', forma='Pix', qtd=None, desc=''):
    pg.append({'id': f'demo-pg-{len(pg) + 1:02d}', 'pacienteId': pid, 'tipo': tipo, 'data': data, 'valor': valor, 'status': status, 'forma': forma, 'qtd': qtd, 'descricao': desc})
pag('demo-lucia', '2026-09-07', 1500, 'pacote', qtd=10, desc='Pacote 10 sessões domiciliares')
pag('demo-lucia', '2026-10-05', 1500, 'pacote', qtd=10, desc='Pacote 10 sessões domiciliares', forma='Transferência')
pag('demo-antonio', '2026-09-01', 1600, 'pacote', qtd=10, desc='Pacote 10 sessões domiciliares')
pag('demo-antonio', '2026-10-06', 1600, 'pacote', qtd=10, desc='Pacote 10 sessões domiciliares')
pag('demo-antonio', '2026-10-20', 200, desc='Reavaliação neurológica domiciliar', status='pendente')
pag('demo-marina', '2026-09-14', 1200, 'pacote', qtd=10, desc='Pacote 10 sessões', forma='Cartão de crédito')
pag('demo-marina', '2026-10-13', 1200, 'pacote', qtd=10, desc='Pacote 10 sessões', forma='Cartão de crédito')
for x in ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20']:
    pag('demo-carlos', x, 480 if x != '2026-10-20' else 240, desc='Sessões da semana · Unimed (reembolso)' if x != '2026-10-20' else 'Sessões da semana', forma='Convênio', status='pago' if x != '2026-10-20' else 'pendente')
pag('demo-helena', '2026-09-21', 140); pag('demo-helena', '2026-09-28', 280, desc='2 sessões'); pag('demo-helena', '2026-10-05', 280, desc='2 sessões', forma='Dinheiro')
pag('demo-helena', '2026-10-12', 280, desc='2 sessões'); pag('demo-helena', '2026-10-19', 280, desc='2 sessões', status='pendente')
pag('demo-rafael', '2026-10-05', 960, 'pacote', qtd=8, desc='Pacote 8 sessões · retorno à corrida')
pag('demo-juliana', '2026-09-08', 600, desc='Mensal · 4 sessões'); pag('demo-juliana', '2026-10-06', 600, desc='Mensal · 4 sessões', forma='Cartão de débito')
pag('demo-jorge', '2026-09-15', 1200, 'pacote', qtd=8, desc='Pacote 8 sessões domiciliares'); pag('demo-jorge', '2026-10-13', 1200, 'pacote', qtd=8, desc='Pacote 8 sessões domiciliares')
pag('demo-jorge', '2026-10-23', 150, desc='Sessão extra (exacerbação)', status='pendente')
pag('demo-paula', '2026-08-10', 960, 'pacote', qtd=8, desc='Pacote 8 sessões'); pag('demo-paula', '2026-09-14', 600, desc='5 sessões', forma='Dinheiro')
for g in pg:
    if g['qtd'] is None: del g['qtd']
    add('pagamentos', g)

q = lambda s: "'" + s.replace("'", "''") + "'"
with open(SAIDA, 'w', encoding='utf-8') as f:
    for col, i, obj in docs:
        f.write(f"INSERT INTO docs (user_id, col, id, data, atualizado) VALUES ({q(USER)}, {q(col)}, {q(i)}, {q(json.dumps({**obj, 'id': i}, ensure_ascii=False))}, {q(AGORA)}) "
                "ON CONFLICT(user_id, col, id) DO UPDATE SET data = excluded.data, atualizado = excluded.atualizado;\n")
from collections import Counter
print(Counter(c for c, _, _ in docs), 'total', len(docs))
