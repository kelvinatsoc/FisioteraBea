// FisioBea — tudo salvo no navegador (localStorage)

const CHAVE = 'fisiobea-dados';
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const LETRAS = 'ABCDEFGH'.split('');

const MODELO_PADRAO = [
  { rotulo: 'Queixa principal / como chegou', tipo: 'texto' },
  { rotulo: 'PA (mmHg)', tipo: 'linha' },
  { rotulo: 'FC (bpm)', tipo: 'linha' },
  { rotulo: 'SpO2 (%)', tipo: 'linha' },
  { rotulo: 'Dor (EVA 0-10)', tipo: 'linha' },
  { rotulo: 'Conduta / exercícios realizados', tipo: 'texto' },
  { rotulo: 'Resposta ao tratamento', tipo: 'texto' },
  { rotulo: 'Observações / plano para a próxima sessão', tipo: 'texto' },
];

let db = carregar();
let semanaOffset = 0;

function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE));
    if (d) return d;
  } catch (e) {}
  return { pacientes: [], treinos: {}, evolucoes: [], modelo: MODELO_PADRAO.map(c => ({ ...c })) };
}
function salvar() { localStorage.setItem(CHAVE, JSON.stringify(db)); }

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const deIso = s => { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); };
const br = s => s ? s.split('-').reverse().join('/') : '';
const paciente = pid => db.pacientes.find(p => p.id === pid);
const treinosDe = pid => db.treinos[pid] || (db.treinos[pid] = []);

// ---------- Abas ----------
document.querySelectorAll('.abas button').forEach(b => b.onclick = () => abrirAba(b.dataset.aba));
function abrirAba(nome) {
  document.querySelectorAll('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
  document.querySelectorAll('.aba').forEach(s => s.classList.toggle('ativa', s.id === nome));
  render();
}

// ---------- Diálogo genérico ----------
function dialogo(html, aoSalvar) {
  const dlg = $('#dialogo'), form = $('#dialogo-form');
  form.innerHTML = html + `<div class="rodape-dialogo"><button value="cancelar" class="sec" formnovalidate>Cancelar</button><button value="ok">Salvar</button></div>`;
  form.onsubmit = e => {
    if (e.submitter && e.submitter.value === 'ok') aoSalvar(new FormData(form), form);
  };
  dlg.showModal();
}

// ---------- Rodízio de treinos ----------
// Qual treino cai numa data: conta as sessões desde o início e gira A, B, C, D...
function treinoDoDia(p, dataIso) {
  const lista = treinosDe(p.id);
  if (!lista.length) return null;
  const inicio = deIso(p.inicio || dataIso), alvo = deIso(dataIso);
  if (alvo < inicio) return null;
  let n = 0;
  for (let d = new Date(inicio); d < alvo; d.setDate(d.getDate() + 1)) if (p.dias.includes(d.getDay())) n++;
  return lista[n % lista.length];
}

// ---------- Agenda ----------
$('#semana-ant').onclick = () => { semanaOffset--; render(); };
$('#semana-prox').onclick = () => { semanaOffset++; render(); };

function renderAgenda() {
  const hoje = new Date();
  const seg = new Date(hoje); seg.setDate(hoje.getDate() - (hoje.getDay() === 0 ? -1 : hoje.getDay() - 1) + semanaOffset * 7); // domingo já mostra a próxima semana
  const dias = [...Array(6)].map((_, i) => { const d = new Date(seg); d.setDate(seg.getDate() + i); return d; });
  $('#semana-titulo').textContent = `${br(iso(dias[0]))} a ${br(iso(dias[5]))}`;

  $('#grade-semana').innerHTML = dias.map(d => {
    const di = iso(d);
    const doDia = db.pacientes.filter(p => p.dias.includes(d.getDay())).sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
    const itens = doDia.map(p => {
      const t = treinoDoDia(p, di);
      const evo = db.evolucoes.find(e => e.pacienteId === p.id && e.data === di);
      return `<div class="atend">
        <strong>${esc(p.horario)} ${esc(p.nome)}</strong>
        ${t ? `<span class="etiqueta">Treino ${esc(t.letra)}${t.nome ? ' · ' + esc(t.nome) : ''}</span>` : '<span class="vazio">sem treino montado</span>'}
        <div style="margin-top:6px">${evo
          ? `<span class="feito">✔ Evolução feita</span> <button class="mini sec" onclick="editarEvolucao('${evo.id}')">Abrir</button>`
          : `<button class="mini" onclick="novaEvolucao('${p.id}','${di}')">Evoluir</button>`}
          ${t ? `<button class="mini sec" onclick="verTreino('${p.id}','${t.letra}')">Ver treino</button>` : ''}</div>
      </div>`;
    }).join('') || '<p class="vazio">Sem atendimentos</p>';
    return `<div class="dia ${di === iso(hoje) ? 'hoje' : ''}"><h4>${DIAS[d.getDay()]} <small>${br(di).slice(0, 5)}</small></h4>${itens}</div>`;
  }).join('');
}

window.verTreino = (pid, letra) => {
  const t = treinosDe(pid).find(x => x.letra === letra);
  dialogo(`<h3>${esc(paciente(pid).nome)} — Treino ${esc(letra)} ${esc(t.nome || '')}</h3>${tabelaExercicios(t)}`, () => {});
};
function tabelaExercicios(t) {
  if (!t.exercicios.length) return '<p class="vazio">Nenhum exercício.</p>';
  return `<div class="tabela-scroll"><table><tr><th>Exercício</th><th>Séries</th><th>Reps/Tempo</th><th>Carga</th><th>Obs.</th></tr>${t.exercicios.map(e =>
    `<tr><td>${esc(e.nome)}</td><td>${esc(e.series)}</td><td>${esc(e.reps)}</td><td>${esc(e.carga)}</td><td>${esc(e.obs)}</td></tr>`).join('')}</table></div>`;
}

// ---------- Pacientes ----------
$('#novo-paciente').onclick = () => editarPaciente();

function renderPacientes() {
  $('#lista-pacientes').innerHTML = db.pacientes.map(p => `
    <div class="cartao">
      <h3>${esc(p.nome)}</h3>
      ${p.diagnostico ? `<div>${esc(p.diagnostico)}</div>` : ''}
      <div>${p.dias.map(d => `<span class="etiqueta">${DIAS[d].slice(0, 3)}</span>`).join('')} ${esc(p.horario)}</div>
      <div class="dica">${treinosDe(p.id).length} treino(s) · ${db.evolucoes.filter(e => e.pacienteId === p.id).length} evolução(ões)</div>
      <div class="acoes">
        <button class="mini" onclick="irTreinos('${p.id}')">Treinos</button>
        <button class="mini" onclick="irEvolucoes('${p.id}')">Evoluções</button>
        <button class="mini sec" onclick="editarPaciente('${p.id}')">Editar</button>
      </div>
    </div>`).join('') || '<p class="vazio">Nenhum paciente ainda. Clique em “+ Novo paciente”.</p>';
}

window.editarPaciente = pid => {
  const p = pid ? paciente(pid) : { nome: '', diagnostico: '', dias: [], horario: '', inicio: iso(new Date()), obs: '' };
  dialogo(`
    <h3>${pid ? 'Editar' : 'Novo'} paciente</h3>
    <label>Nome</label><input name="nome" required value="${esc(p.nome)}">
    <label>Diagnóstico / objetivo</label><input name="diagnostico" value="${esc(p.diagnostico)}">
    <label>Dias de atendimento</label>
    <div class="dias-check">${[1, 2, 3, 4, 5, 6].map(d => `<label><input type="checkbox" name="dias" value="${d}" ${p.dias.includes(d) ? 'checked' : ''}>${DIAS[d]}</label>`).join('')}</div>
    <label>Horário</label><input name="horario" type="time" value="${esc(p.horario)}">
    <label>Início do rodízio de treinos</label><input name="inicio" type="date" value="${esc(p.inicio)}">
    <p class="dica">A partir dessa data os treinos giram A → B → C → D… a cada sessão.</p>
    <label>Observações</label><textarea name="obs">${esc(p.obs)}</textarea>
    ${pid ? `<p><button type="button" class="perigo mini" onclick="excluirPaciente('${pid}')">Excluir paciente</button></p>` : ''}
  `, f => {
    const dados = { nome: f.get('nome'), diagnostico: f.get('diagnostico'), dias: f.getAll('dias').map(Number), horario: f.get('horario'), inicio: f.get('inicio'), obs: f.get('obs') };
    if (pid) Object.assign(p, dados); else db.pacientes.push({ id: id(), ...dados });
    salvar(); render();
  });
};
window.excluirPaciente = pid => {
  if (!confirm('Excluir este paciente, seus treinos e evoluções?')) return;
  db.pacientes = db.pacientes.filter(p => p.id !== pid);
  delete db.treinos[pid];
  db.evolucoes = db.evolucoes.filter(e => e.pacienteId !== pid);
  salvar(); $('#dialogo').close(); render();
};
window.irTreinos = pid => { $('#treino-paciente').value = pid; abrirAba('treinos'); };
window.irEvolucoes = pid => { $('#evo-paciente').value = pid; abrirAba('evolucoes'); };

function preencherSelects() {
  ['#treino-paciente', '#evo-paciente'].forEach(s => {
    const el = $(s), atual = el.value;
    el.innerHTML = db.pacientes.length ? db.pacientes.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('') : '<option value="">Cadastre um paciente</option>';
    if (paciente(atual)) el.value = atual;
  });
}

// ---------- Treinos ----------
$('#treino-paciente').onchange = () => render();

function renderTreinos() {
  const pid = $('#treino-paciente').value;
  if (!pid) { $('#area-treinos').innerHTML = '<p class="vazio">Cadastre um paciente primeiro.</p>'; return; }
  const lista = treinosDe(pid);
  $('#area-treinos').innerHTML = lista.map((t, ti) => `
    <div class="treino">
      <div class="treino-cab">
        <h3><span class="letra">${t.letra}</span><input style="width:auto;display:inline-block" placeholder="Nome (ex.: Membros inferiores)" value="${esc(t.nome)}" onchange="campoTreino('${pid}',${ti},'nome',this.value)"></h3>
        <div class="linha">
          <button class="mini sec" onclick="duplicarTreino('${pid}',${ti})">Duplicar</button>
          <button class="mini perigo" onclick="excluirTreino('${pid}',${ti})">Excluir</button>
        </div>
      </div>
      <div class="tabela-scroll"><table>
        <tr><th>Exercício</th><th>Séries</th><th>Reps/Tempo</th><th>Carga</th><th>Obs.</th><th></th></tr>
        ${t.exercicios.map((e, ei) => `<tr>
          ${['nome', 'series', 'reps', 'carga', 'obs'].map(c => `<td><input value="${esc(e[c])}" onchange="campoExercicio('${pid}',${ti},${ei},'${c}',this.value)"></td>`).join('')}
          <td><button class="mini sec" onclick="removerExercicio('${pid}',${ti},${ei})">✕</button></td>
        </tr>`).join('')}
      </table></div>
      <button class="mini" style="margin-top:8px" onclick="addExercicio('${pid}',${ti})">+ Exercício</button>
    </div>`).join('') +
    (lista.length < LETRAS.length ? `<button onclick="addTreino('${pid}')">+ Treino ${LETRAS[lista.length]}</button>` : '');
}
const reletrar = pid => treinosDe(pid).forEach((t, i) => t.letra = LETRAS[i]);
window.addTreino = pid => { treinosDe(pid).push({ letra: '', nome: '', exercicios: [{ nome: '', series: '', reps: '', carga: '', obs: '' }] }); reletrar(pid); salvar(); render(); };
window.duplicarTreino = (pid, ti) => { const l = treinosDe(pid); if (l.length >= LETRAS.length) return; l.push(JSON.parse(JSON.stringify(l[ti]))); reletrar(pid); salvar(); render(); };
window.excluirTreino = (pid, ti) => { if (!confirm('Excluir este treino?')) return; treinosDe(pid).splice(ti, 1); reletrar(pid); salvar(); render(); };
window.campoTreino = (pid, ti, c, v) => { treinosDe(pid)[ti][c] = v; salvar(); };
window.campoExercicio = (pid, ti, ei, c, v) => { treinosDe(pid)[ti].exercicios[ei][c] = v; salvar(); };
window.addExercicio = (pid, ti) => { treinosDe(pid)[ti].exercicios.push({ nome: '', series: '', reps: '', carga: '', obs: '' }); salvar(); render(); };
window.removerExercicio = (pid, ti, ei) => { treinosDe(pid)[ti].exercicios.splice(ei, 1); salvar(); render(); };

// ---------- Evoluções ----------
$('#evo-paciente').onchange = () => render();
$('#nova-evolucao').onclick = () => { const pid = $('#evo-paciente').value; if (pid) novaEvolucao(pid, iso(new Date())); };

function renderEvolucoes() {
  const pid = $('#evo-paciente').value;
  const lista = db.evolucoes.filter(e => e.pacienteId === pid).sort((a, b) => b.data.localeCompare(a.data));
  $('#lista-evolucoes').innerHTML = lista.map(e => `
    <div class="evo">
      <div class="evo-cab">
        <strong>${br(e.data)} ${e.treino ? `<span class="etiqueta">Treino ${esc(e.treino)}</span>` : ''}</strong>
        <div class="linha"><button class="mini sec" onclick="editarEvolucao('${e.id}')">Editar</button><button class="mini sec" onclick="copiarEvolucao('${e.id}')">Copiar texto</button></div>
      </div>
      <dl>${e.campos.filter(c => c.valor).map(c => `<dt>${esc(c.rotulo)}</dt><dd>${esc(c.valor)}</dd>`).join('')}</dl>
    </div>`).join('') || '<p class="vazio">Nenhuma evolução para este paciente.</p>';
}

function formEvolucao(e) {
  const p = paciente(e.pacienteId);
  return `
    <h3>Evolução — ${esc(p.nome)}</h3>
    <div class="linha">
      <div><label>Data</label><input type="date" name="data" required value="${e.data}"></div>
      <div><label>Treino</label><select name="treino"><option value="">—</option>${treinosDe(p.id).map(t => `<option ${t.letra === e.treino ? 'selected' : ''}>${t.letra}</option>`).join('')}</select></div>
    </div>
    ${e.campos.map((c, i) => `<label>${esc(c.rotulo)}</label>${c.tipo === 'linha'
      ? `<input name="c${i}" value="${esc(c.valor)}">`
      : `<textarea name="c${i}">${esc(c.valor)}</textarea>`}`).join('')}
    ${e.id ? `<p><button type="button" class="perigo mini" onclick="excluirEvolucao('${e.id}')">Excluir evolução</button></p>` : ''}`;
}
function lerEvolucao(e, f) {
  e.data = f.get('data'); e.treino = f.get('treino');
  e.campos.forEach((c, i) => c.valor = f.get('c' + i));
}

window.novaEvolucao = (pid, data) => {
  const p = paciente(pid), t = treinoDoDia(p, data);
  const e = { pacienteId: pid, data, treino: t ? t.letra : '', campos: db.modelo.map(c => ({ ...c, valor: '' })) };
  // já deixa os exercícios do treino do dia na conduta
  const conduta = e.campos.find(c => /conduta|exerc/i.test(c.rotulo));
  if (conduta && t) conduta.valor = t.exercicios.filter(x => x.nome).map(x => `- ${x.nome} ${[x.series && x.series + 'x', x.reps, x.carga].filter(Boolean).join(' ')}`).join('\n');
  dialogo(formEvolucao(e), f => { lerEvolucao(e, f); e.id = id(); db.evolucoes.push(e); salvar(); render(); });
};
window.editarEvolucao = eid => {
  const e = db.evolucoes.find(x => x.id === eid);
  dialogo(formEvolucao(e), f => { lerEvolucao(e, f); salvar(); render(); });
};
window.excluirEvolucao = eid => {
  if (!confirm('Excluir esta evolução?')) return;
  db.evolucoes = db.evolucoes.filter(e => e.id !== eid);
  salvar(); $('#dialogo').close(); render();
};
window.copiarEvolucao = eid => {
  const e = db.evolucoes.find(x => x.id === eid);
  const txt = `${paciente(e.pacienteId).nome} — ${br(e.data)}${e.treino ? ' — Treino ' + e.treino : ''}\n\n` +
    e.campos.filter(c => c.valor).map(c => `${c.rotulo}: ${c.valor}`).join('\n');
  navigator.clipboard.writeText(txt).then(() => alert('Evolução copiada!'));
};

// ---------- Modelo ----------
$('#add-campo').onclick = () => { db.modelo.push({ rotulo: 'Novo campo', tipo: 'texto' }); salvar(); render(); };

function renderModelo() {
  $('#lista-campos').innerHTML = db.modelo.map((c, i) => `
    <div class="campo">
      <input value="${esc(c.rotulo)}" onchange="db.modelo[${i}].rotulo=this.value;salvar()">
      <select onchange="db.modelo[${i}].tipo=this.value;salvar()">
        <option value="linha" ${c.tipo === 'linha' ? 'selected' : ''}>Linha curta</option>
        <option value="texto" ${c.tipo === 'texto' ? 'selected' : ''}>Texto longo</option>
      </select>
      <button class="mini sec" onclick="moverCampo(${i},-1)">▲</button>
      <button class="mini sec" onclick="moverCampo(${i},1)">▼</button>
      <button class="mini perigo" onclick="db.modelo.splice(${i},1);salvar();render()">✕</button>
    </div>`).join('');
}
window.moverCampo = (i, d) => {
  const j = i + d; if (j < 0 || j >= db.modelo.length) return;
  [db.modelo[i], db.modelo[j]] = [db.modelo[j], db.modelo[i]]; salvar(); render();
};
window.salvar = salvar; window.render = render; window.db = db;

// ---------- Backup ----------
$('#exportar').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `fisiobea-backup-${iso(new Date())}.json`;
  a.click();
};
$('#importar').onchange = ev => {
  const arq = ev.target.files[0]; if (!arq) return;
  arq.text().then(t => {
    const d = JSON.parse(t);
    if (!d.pacientes || !confirm('Substituir todos os dados atuais pelo backup?')) return;
    db = d; window.db = db; salvar(); render(); alert('Backup restaurado!');
  }).catch(() => alert('Arquivo inválido.'));
};

// ---------- Render ----------
function render() {
  preencherSelects();
  renderAgenda(); renderPacientes(); renderTreinos(); renderEvolucoes(); renderModelo();
}
render();
