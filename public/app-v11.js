console.log('Schedulle Reports UI v11 premium carregado - ícones SVG em todos os módulos');
const state = { agendamentos: [], historico: [], env: 'qas', grupos: [], relatorios: [], opcoes: [], variantes: [] };
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const moduleIcons = {
  tart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.75A2.75 2.75 0 0 1 7.75 2h6.9c.73 0 1.43.29 1.95.8l2.6 2.6c.51.52.8 1.22.8 1.95v11.9A2.75 2.75 0 0 1 17.25 22h-9.5A2.75 2.75 0 0 1 5 19.25V4.75Zm9.5-.5v2.3c0 .52.43.95.95.95h2.3L14.5 4.25ZM8 18h1.75v-5H8v5Zm3.2 0h1.75V9.5H11.2V18Zm3.2 0h1.75v-3.4H14.4V18Z"/></svg>`,
  icms: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4.75A2.75 2.75 0 0 1 6.75 2h10.5A2.75 2.75 0 0 1 20 4.75v14.5A2.75 2.75 0 0 1 17.25 22H6.75A2.75 2.75 0 0 1 4 19.25V4.75Zm3 1.75h10v2H7v-2Zm0 4h4v2H7v-2Zm6 0h4v2h-4v-2Zm-6 4h4v2H7v-2Zm6 0h4v2h-4v-2Z"/></svg>`,
  irrf: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.75 2h7.55c.73 0 1.43.29 1.95.8l2.95 2.95c.51.52.8 1.22.8 1.95v3.15a6.8 6.8 0 0 0-2-.73V8h-3.25A2.75 2.75 0 0 1 12 5.25V4H6.75A.75.75 0 0 0 6 4.75v14.5c0 .41.34.75.75.75h5.85c.42.78.99 1.46 1.68 2H6.75A2.75 2.75 0 0 1 4 19.25V4.75A2.75 2.75 0 0 1 6.75 2ZM8 10h7v1.25a6.72 6.72 0 0 0-2.05 1.25H8V10Zm0 4h3.68A6.8 6.8 0 0 0 11 16H8v-2Zm10 8a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm.55-7.85h-1.1v.65c-.74.18-1.25.7-1.25 1.42 0 .84.62 1.26 1.66 1.56.64.18.9.34.9.67 0 .34-.31.55-.78.55-.55 0-1.04-.18-1.48-.45l-.28.96c.34.24.8.4 1.27.46v.68h1.1v-.73c.86-.17 1.33-.75 1.33-1.5 0-.73-.39-1.2-1.55-1.55-.73-.23-1-.38-1-.68 0-.25.2-.51.74-.51.6 0 .98.19 1.2.3l.29-.92a3.06 3.06 0 0 0-1.05-.28v-.63Z"/></svg>`,
  iss: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.75 2h7.55c.73 0 1.43.29 1.95.8l2.95 2.95c.51.52.8 1.22.8 1.95v11.55A2.75 2.75 0 0 1 17.25 22H6.75A2.75 2.75 0 0 1 4 19.25V4.75A2.75 2.75 0 0 1 6.75 2ZM14 4.25v2.5c0 .41.34.75.75.75h2.5L14 4.25ZM8 11h8v1.8H8V11Zm0 3.3h5v1.8H8v-1.8Zm8.2 3.9a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm-2.4-5.7a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm-.8 5.7 4.6-5.7h-1.3l-4.6 5.7H13Z"/></svg>`,
  pcc: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 11.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Zm8 0a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7ZM2.5 19.25C2.5 15.8 4.75 13.5 8 13.5s5.5 2.3 5.5 5.75c0 .41-.34.75-.75.75h-9.5a.75.75 0 0 1-.75-.75Zm10.15-5.08A6.46 6.46 0 0 1 16 13.5c3.25 0 5.5 2.3 5.5 5.75 0 .41-.34.75-.75.75h-5.4c.1-.24.15-.5.15-.75a7.67 7.67 0 0 0-2.85-6.08Z"/></svg>`,
  efd_sped: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3.5 6.25 12 10.5l8.5-4.25L12 2Zm-8.5 6.5v9.25L11 22v-9.25L3.5 8.5Zm17 0L13 12.75V22l7.5-4.25V8.5Z"/></svg>`
};

const modules = {
  tart: { nome:'Relatórios de Apoio', icone: moduleIcons.tart, textoIcone:'📊', cor:'orange', title:'Relatórios de Apoio', hint:'Selecione o grupo e marque um ou mais relatórios.' },
  icms: { nome:'Apuração de ICMS', icone: moduleIcons.icms, textoIcone:'🏢', cor:'purple', title:'Estrutura Organizacional', hint:'Selecione a estrutura para execução da apuração ICMS.' },
  irrf: { nome:'Apuração do IRRF', icone: moduleIcons.irrf, textoIcone:'💰', cor:'green', title:'Matriz / Empresa', hint:'Selecione a matriz para execução do IRRF.' },
  iss: { nome:'Apuração de ISS', icone: moduleIcons.iss, textoIcone:'📄', cor:'blue', title:'Matriz / Empresa', hint:'Selecione a matriz para execução do ISS.' },
  pcc: { nome:'Apuração do PCC', icone: moduleIcons.pcc, textoIcone:'👥', cor:'amber', title:'Matriz / Empresa', hint:'Selecione a matriz para execução do PCC.' },
  efd_sped: { nome:'EFD-Sped Fiscal', icone: moduleIcons.efd_sped, textoIcone:'📦', cor:'cyan', title:'Estrutura e Variante', hint:'Selecione a estrutura organizacional e a variante.' }
};

function fmtDate(v){ if(!v) return '-'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR'); }
function json(v){ return JSON.stringify(v, null, 2); }
function escapeHtml(v){ return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function statusBadge(status, ativo){
  if (ativo !== undefined) return `<span class="badge ${ativo ? 'ativo':'inativo'}">${ativo ? 'Ativo':'Inativo'}</span>`;
  const s = String(status || '').toUpperCase();
  if (s.includes('ERRO') || s.includes('ERROR')) return '<span class="badge erro">Erro</span>';
  if (s.includes('OK') || s.includes('SUCESS') || s.includes('CONCL')) return '<span class="badge ok">Sucesso</span>';
  return `<span class="badge warn">${escapeHtml(status || 'Pendente')}</span>`;
}
function showAlert(msg, type='ok'){ $('#alertArea').innerHTML = `<div class="alert ${type}">${escapeHtml(msg)}</div>`; setTimeout(()=>$('#alertArea').innerHTML='', 5000); }
async function api(path, opts={}){
  const resp = await fetch(path, { headers:{'Content-Type':'application/json'}, ...opts });
  const data = await resp.json().catch(()=>({}));
  const motivo = resp.headers.get('X-TaxOne-Filter-Motivo');
  const locked = resp.headers.get('X-TaxOne-Browser-Profile-Locked');
  if(motivo || locked){
    const msg = motivo ? decodeURIComponent(motivo) : 'Perfil do navegador TaxOne em uso. Feche o Chrome/Edge da automação ou finalize processos antigos.';
    setTimeout(()=>showAlert(msg, 'warn'), 50);
  }
  if(!resp.ok) throw new Error(data.erro || data.message || `HTTP ${resp.status}`);
  return data;
}
function getCompetencia(){ const v = $('#schedCompetencia').value; if(!v){ const d = new Date(); return { ano:d.getFullYear(), mes:d.getMonth()+1 }; } const [ano,mes] = v.split('-').map(Number); return { ano, mes }; }
function renderModuleCards(){
  const atual = $('#schedModulo')?.value || 'tart';
  const box = $('#moduleCards');
  if(!box) return;
  box.innerHTML = Object.entries(modules).map(([k,m]) => `
    <button type="button" class="module-card ${k===atual?'active':''}" data-module-card="${k}">
      <span class="module-icon ${m.cor || 'orange'}">${m.icone}</span>
      <strong>${m.nome}</strong>
      <small>${m.hint}</small>
    </button>`).join('');
  $$('[data-module-card]').forEach(btn => btn.addEventListener('click', () => {
    $('#schedModulo').value = btn.dataset.moduleCard;
    renderModuleCards();
    loadModuleOptions();
    $('#scheduleBuilder').scrollIntoView({behavior:'smooth', block:'start'});
  }));
}
function initModuleSelect(){
  $('#schedModulo').innerHTML = Object.entries(modules).map(([k,m])=>`<option value="${k}">${m.textoIcone || ''} ${m.nome}</option>`).join('');
  const d = new Date();
  $('#schedCompetencia').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  renderModuleCards();
}
async function loadAll(){ const [ag, hist] = await Promise.all([api('/api/agendamentos').catch(()=>[]), api('/api/agendamentos-historico').catch(()=>[])]); state.agendamentos = Array.isArray(ag) ? ag : []; state.historico = Array.isArray(hist) ? hist : []; renderDashboard(); renderSchedules(); renderHistory(); loadHealth(); }
function renderDashboard(){
  const ativos = state.agendamentos.filter(a=>a.ativo !== false).length;
  const sucesso = state.historico.filter(h=>/OK|SUCESS|CONCL/i.test(JSON.stringify(h))).length;
  const erro = state.historico.filter(h=>/ERRO|ERROR/i.test(JSON.stringify(h))).length;
  $('#statTotal').textContent = state.agendamentos.length; $('#statAtivos').textContent = ativos; $('#statSucesso').textContent = sucesso; $('#statErro').textContent = erro;
  const rows = [...state.agendamentos].sort((a,b)=>String(a.proxima_execucao||'').localeCompare(String(b.proxima_execucao||''))).slice(0,8).map(a=>`<tr><td><strong>${escapeHtml(a.moduloIcone||'📊')} ${escapeHtml(a.moduloNome||a.modulo||'-')}</strong><br><small>${escapeHtml(a.nome||'-')}</small></td><td><span class="badge env">${escapeHtml(String(a.env||'').toUpperCase())}</span></td><td>${escapeHtml(a.recorrencia||'-')} às ${escapeHtml(a.horario||'-')}</td><td>${fmtDate(a.proxima_execucao)}</td><td>${statusBadge(null, a.ativo !== false)}</td></tr>`).join('');
  $('#nextRunsBody').innerHTML = rows || '<tr><td colspan="5">Nenhum agendamento cadastrado.</td></tr>';
}
async function loadHealth(){ const box = $('#healthCards'); box.innerHTML = '<div class="health-item"><strong>Carregando...</strong><span>Consultando QAS e PRD.</span></div>'; const envs = await Promise.all(['qas','prd'].map(async env=>{ try { const r = await api(`/api/health/${env}`); return { env, ok:true, r }; } catch(e){ return { env, ok:false, e }; }})); box.innerHTML = envs.map(x=>`<div class="health-item"><strong>${x.env.toUpperCase()} ${x.ok ? '✅':'⚠️'}</strong><span>${x.ok ? `${escapeHtml(x.r.host)}:${escapeHtml(x.r.port)} | Schema ${escapeHtml(x.r.schema)}` : escapeHtml(x.e.message)}</span></div>`).join(''); }
function renderSchedules(){
  const q = ($('#scheduleSearch')?.value || '').toLowerCase(); const st = $('#scheduleStatus')?.value || '';
  let list = state.agendamentos.filter(a=>JSON.stringify(a).toLowerCase().includes(q));
  if(st==='ativos') list = list.filter(a=>a.ativo !== false); if(st==='inativos') list = list.filter(a=>a.ativo === false);
  $('#scheduleCards').innerHTML = list.map(a=>`<div class="schedule-card"><div><div class="schedule-title"><span class="schedule-icon">${escapeHtml(a.moduloIcone||'📊')}</span><div><strong>${escapeHtml(a.nome||a.moduloNome||'Agendamento')}</strong><div class="meta"><span>${escapeHtml(a.moduloNome||a.modulo)}</span><span>•</span><span>${escapeHtml(String(a.env||'').toUpperCase())}</span><span>•</span><span>${escapeHtml(a.recorrencia||'-')} ${escapeHtml(a.horario||'')}</span></div></div></div><div class="meta"><span>Próxima: ${fmtDate(a.proxima_execucao)}</span><span>Última: ${fmtDate(a.ultima_execucao)}</span>${statusBadge(null, a.ativo !== false)}</div></div><div class="card-actions"><button class="btn ghost" onclick="runNow('${a.id}')">Executar</button><button class="btn ghost" onclick="toggleSchedule('${a.id}', ${a.ativo === false})">${a.ativo === false ? 'Ativar':'Pausar'}</button><button class="btn danger" onclick="removeSchedule('${a.id}')">Remover</button></div></div>`).join('') || '<div class="health-item"><strong>Nenhum agendamento encontrado.</strong><span>Ajuste os filtros ou cadastre um novo agendamento.</span></div>';
}
function renderHistory(){ const q = ($('#historySearch')?.value || '').toLowerCase(); const st = $('#historyStatus')?.value || ''; const all = state.historico || []; const okCount = all.filter(h=>/OK|SUCESS|CONCL/i.test(JSON.stringify(h))).length; const errCount = all.filter(h=>/ERRO|ERROR|FALH/i.test(JSON.stringify(h))).length; if($('#histOk')) $('#histOk').textContent = okCount; if($('#histErro')) $('#histErro').textContent = errCount; if($('#histTotal')) $('#histTotal').textContent = all.length; if($('#histUltima')) $('#histUltima').textContent = all.length ? fmtDate(all[0].inicio || all[0].fim || all[0].executado_em || all[0].data) : '-'; let list = all.filter(h=>JSON.stringify(h).toLowerCase().includes(q)); if(st) list = list.filter(h=>JSON.stringify(h).toUpperCase().includes(st)); $('#historyBody').innerHTML = list.map((h,i)=>{ const status = h.status || h.resultado?.status || h.ultimo_status || (JSON.stringify(h).match(/ERRO|ERROR|FALH/i) ? 'ERRO':'OK'); return `<tr><td>${fmtDate(h.inicio || h.fim || h.executado_em || h.data)}</td><td>${escapeHtml(h.moduloNome || h.modulo || h.agendamento_nome || '-')}</td><td><span class="badge env">${escapeHtml(String(h.env||h.ambiente||'-').toUpperCase())}</span></td><td>${escapeHtml(h.periodo || h.ultimo_periodo || '-')}</td><td>${statusBadge(status)}</td><td><button class="btn ghost" onclick="openDetail(${i})">Ver detalhes</button></td></tr>`; }).join('') || '<tr><td colspan="6">Nenhum histórico encontrado.</td></tr>'; }


function renderBulkActions(targetSelector, inputName, label='opções'){
  return `<div class="bulk-actions" data-target="${escapeHtml(targetSelector)}" data-input-name="${escapeHtml(inputName)}">
    <button class="btn ghost small" type="button" data-bulk-select="${escapeHtml(inputName)}">Selecionar todos</button>
    <button class="btn ghost small" type="button" data-bulk-clear="${escapeHtml(inputName)}">Limpar seleção</button>
    <span class="bulk-counter" id="bulkCounter_${escapeHtml(inputName)}">0 ${escapeHtml(label)} selecionada(s)</span>
  </div>`;
}
function bindBulkActions(inputName){
  document.querySelectorAll(`[data-bulk-select="${inputName}"]`).forEach(btn => btn.onclick = () => { $$(`input[name="${inputName}"]`).forEach(i=>i.checked=true); updateBulkCounter(inputName); });
  document.querySelectorAll(`[data-bulk-clear="${inputName}"]`).forEach(btn => btn.onclick = () => { $$(`input[name="${inputName}"]`).forEach(i=>i.checked=false); updateBulkCounter(inputName); });
  $$(`input[name="${inputName}"]`).forEach(i => i.addEventListener('change', () => updateBulkCounter(inputName)));
  updateBulkCounter(inputName);
}
function updateBulkCounter(inputName){
  const total = $$(`input[name="${inputName}"]`).length;
  const checked = $$(`input[name="${inputName}"]:checked`).length;
  const el = $(`#bulkCounter_${inputName}`);
  if(el) el.textContent = `${checked} de ${total} selecionado(s)`;
}
function selectedCheckboxes(name){ return $$(`input[name="${name}"]:checked`); }

async function loadModuleOptions(){
  const env = $('#schedEnv').value; const modulo = $('#schedModulo').value; const {mes,ano} = getCompetencia(); const m = modules[modulo];
  $('#dynamicTitle').textContent = m.title; $('#dynamicHint').textContent = m.hint; $('#dynamicContent').innerHTML = '<div class="loading">Carregando opções...</div>';
  try{
    if(modulo === 'tart'){
      state.grupos = await api(`/api/${env}/grupos`);
      $('#dynamicContent').innerHTML = `<div class="sub-grid"><label>Grupo de relatório<select id="grupoSelect">${state.grupos.map(g=>`<option value="${escapeHtml(g.id)}">${escapeHtml(g.nome)}</option>`).join('')}</select></label><label>Buscar relatório<input id="relatorioSearch" placeholder="Digite para filtrar" /></label></div>${renderBulkActions('#relatoriosList','relatorio','relatórios')}<div id="relatoriosList" class="check-list"></div>`;
      $('#grupoSelect').addEventListener('change', loadRelatoriosGrupo); $('#relatorioSearch').addEventListener('input', renderRelatorios); await loadRelatoriosGrupo();
    } else if(['irrf','iss','pcc'].includes(modulo)){
      const arr = await api(`/api/${env}/${modulo}/matrizes`); state.opcoes = arr;
      $('#dynamicContent').innerHTML = `${arr.length > 1 ? renderBulkActions('#empresaList','empresa','empresas') : ''}<div id="empresaList" class="radio-list">${arr.map((x,i)=>`<label class="option-row"><input type="checkbox" name="empresa" value="${escapeHtml(x.empresa)}" ${i===0?'checked':''} data-nome="${escapeHtml(x.nome||x.empresa)}"><span><strong>${escapeHtml(x.empresa)}</strong><small>${escapeHtml(x.nome||'')}</small></span></label>`).join('') || '<div class="empty">Nenhuma matriz retornada.</div>'}</div>`; bindBulkActions('empresa');
    } else if(modulo === 'icms'){
      const arr = await api(`/api/${env}/icms/estruturas?mes=${mes}&ano=${ano}`); state.opcoes = arr;
      $('#dynamicContent').innerHTML = `<label>Buscar estrutura<input id="optionSearch" placeholder="Digite para filtrar" /></label>${renderBulkActions('#optionList','orgstr','estruturas')}<div id="optionList" class="radio-list"></div>`; $('#optionSearch').addEventListener('input', ()=>renderRadioOptions('orgstr')); renderRadioOptions('orgstr'); bindBulkActions('orgstr');
    } else if(modulo === 'efd_sped'){
      const cacheKey = `taxone_efd_variantes_${env}`;
      let estruturas = [];
      let variantes = [];
      let variantError = '';
      try {
        estruturas = await api(`/api/${env}/efd-sped/estruturas?mes=${mes}&ano=${ano}`);
      } catch (err) {
        showAlert(`Estruturas EFD não carregaram pelo TaxOne: ${err.message}.`, 'erro');
        estruturas = [];
      }
      try {
        variantes = await api(`/api/${env}/efd-sped/variantes`);
        if (Array.isArray(variantes) && variantes.length) {
          localStorage.setItem(cacheKey, JSON.stringify(variantes));
        }
      } catch (err) {
        variantError = err.message;
        try { variantes = JSON.parse(localStorage.getItem(cacheKey) || '[]'); } catch (_) { variantes = []; }
        if (variantes.length) showAlert('Variantes EFD carregadas do cache local porque o TaxOne oscilou.', 'warn');
      }
      state.opcoes = Array.isArray(estruturas) ? estruturas : [];
      state.variantes = Array.isArray(variantes) ? variantes : [];
      $('#dynamicContent').innerHTML = `
        <div class="sub-grid">
          <label>Buscar estrutura
            <input id="optionSearch" placeholder="Digite loja, filial, UF ou estrutura" />
          </label>
          <label>Filtrar variante
            <input id="varianteSearch" placeholder="Digite código ou descrição da variante" />
          </label>
        </div>
        <div class="sub-grid">
          <label>Variante TaxOne
            <select id="varianteSelect"></select>
          </label>
          <label>Código da variante manual
            <input id="varianteManual" placeholder="Use se a lista do TaxOne não retornar" />
          </label>
        </div>
        <div id="variantHint" class="field-hint">${escapeHtml(variantError)}</div>
        ${renderBulkActions('#optionList','orgstr','estruturas')}
        <div id="optionList" class="radio-list"></div>`;
      $('#optionSearch').addEventListener('input', ()=>renderRadioOptions('orgstr'));
      $('#varianteSearch').addEventListener('input', renderVariantesEfd);
      renderVariantesEfd();
      renderRadioOptions('orgstr');
      bindBulkActions('orgstr');
    }
  } catch(e){ $('#dynamicContent').innerHTML = `<div class="empty erro-box">${escapeHtml(e.message)}</div>`; }
}
async function loadRelatoriosGrupo(){ const env=$('#schedEnv').value; const gid=$('#grupoSelect').value; const {mes,ano}=getCompetencia(); state.relatorios = gid ? await api(`/api/${env}/grupos/${gid}/relatorios?mes=${mes}&ano=${ano}`).catch(e=>{showAlert(e.message,'erro'); return [];}) : []; renderRelatorios(); }
function renderRelatorios(){ const q=($('#relatorioSearch')?.value||'').toLowerCase(); const list=state.relatorios.filter(r=>JSON.stringify(r).toLowerCase().includes(q)); $('#relatoriosList').innerHTML = list.map(r=>`<label class="option-row"><input type="checkbox" name="relatorio" value="${escapeHtml(r.id)}" data-nome="${escapeHtml(r.nome)}"><span><strong>${escapeHtml(r.nome)}</strong><small>ID ${escapeHtml(r.id)} • Empresa ${escapeHtml(r.empresa||'-')} • ORGSTR ${escapeHtml(r.orgstr||'-')}</small></span></label>`).join('') || '<div class="empty">Nenhum relatório disponível para esse grupo/período.</div>'; bindBulkActions('relatorio'); }

function normalizarBusca(v){
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function renderVariantesEfd(){
  const select = $('#varianteSelect');
  if(!select) return;
  const termo = normalizarBusca($('#varianteSearch')?.value || '');
  const variantes = (state.variantes || []).filter(v => normalizarBusca(`${v.codigo || ''} ${v.id || ''} ${v.descricao || v.nome || ''}`).includes(termo));
  select.innerHTML = variantes.map(v=>{
    const id = v.id || v.codigo || '';
    const codigo = v.codigo || v.id || '';
    const nome = v.descricao || v.nome || codigo || id;
    const label = `${codigo}${nome && nome !== codigo ? ' - ' + nome : ''}`;
    return `<option value="${escapeHtml(id)}" data-codigo="${escapeHtml(codigo)}" data-nome="${escapeHtml(nome)}">${escapeHtml(label)}</option>`;
  }).join('');
  const hint = $('#variantHint');
  if(hint){
    if(!(state.variantes || []).length) hint.textContent = 'Nenhuma variante retornada pelo TaxOne. Verifique sessão/perfil do navegador ou cadastre a variante no TaxOne.';
    else if(!variantes.length) hint.textContent = 'Nenhuma variante encontrada para o filtro informado.';
    else hint.textContent = `${variantes.length} variante(s) encontrada(s).`;
  }
}
function renderRadioOptions(field){ const q=($('#optionSearch')?.value||'').toLowerCase(); const list=(state.opcoes||[]).filter(o=>JSON.stringify(o).toLowerCase().includes(q)); $('#optionList').innerHTML = list.map((o,i)=>{ const val=o[field]||o.orgstr||o.empresa||o.id; const name=o.nome||o.descricao||val; return `<label class="option-row"><input type="checkbox" name="${field}" value="${escapeHtml(val)}" ${i===0?'checked':''} data-nome="${escapeHtml(name)}" data-empresa="${escapeHtml(o.empresa||o.EMPRESA_MAIN||'')}" data-filial="${escapeHtml(o.filial||o.FILIAL_MAIN||'')}"><span><strong>${escapeHtml(val)}</strong><small>${escapeHtml(name)}</small></span></label>`; }).join('') || '<div class="empty">Nenhuma opção encontrada.</div>'; bindBulkActions(field); }
function updateConditionalFields(){ const r=$('#schedRecorrencia').value; $$('.cond').forEach(el=>el.style.display='none'); if(r==='semanal') $('.cond.semanal').style.display='block'; if(r==='mensal') $('.cond.mensal').style.display='block'; }
function buildPayload(){
  const modulo=$('#schedModulo').value; const m=modules[modulo]; const {mes,ano}=getCompetencia();
  const payload={ nome:$('#schedNome').value.trim() || `${m.nome} - ${$('#schedEnv').value.toUpperCase()}`, env:$('#schedEnv').value, modulo, moduloNome:m.nome, moduloIcone:m.textoIcone || '📊', mes, ano, recorrencia:$('#schedRecorrencia').value, horario:$('#schedHorario').value, diaSemana:$('#schedDiaSemana').value, diaMes:$('#schedDiaMes').value, diaUtil:$('#schedDiaUtil')?.value || null };
  if(modulo==='tart'){ const grupo=state.grupos.find(g=>String(g.id)===String($('#grupoSelect')?.value)); const checked=$$('input[name="relatorio"]:checked'); payload.grupoId=grupo?.id; payload.grupoNome=grupo?.nome; payload.relatorioIds=checked.map(i=>i.value); payload.relatoriosSelecionados=checked.map(i=>({id:i.value,nome:i.dataset.nome})); }
  if(['irrf','iss','pcc'].includes(modulo)){ const el=$('input[name="empresa"]:checked'); payload.empresa=el?.value; payload.matrizNome=el?.dataset.nome || el?.value; }
  if(modulo==='icms'){ const el=$('input[name="orgstr"]:checked'); payload.orgstr=el?.value; payload.orgstrNome=el?.dataset.nome || el?.value; }
  if(modulo==='efd_sped'){ const el=$('input[name="orgstr"]:checked'); const varEl=$('#varianteSelect'); const opt=varEl?.selectedOptions?.[0]; const manual=($('#varianteManual')?.value || '').trim(); payload.orgstr=el?.value; payload.orgstrNome=el?.dataset.nome || el?.value; payload.empresaEfd=el?.dataset.empresa || ''; payload.filialEfd=el?.dataset.filial || ''; payload.varianteId=manual || varEl?.value || ''; payload.varianteCodigo=manual || opt?.dataset.codigo || varEl?.value || ''; payload.varianteNome=manual ? `Manual: ${manual}` : (opt?.dataset.nome || ''); }
  return payload;
}
function buildPayloadsForSelections(){
  const base = buildPayload();
  const modulo = base.modulo;
  if(modulo === 'tart') return [base];
  if(['irrf','iss','pcc'].includes(modulo)){
    const sels = selectedCheckboxes('empresa');
    return sels.map(el => ({...base, empresa:el.value, matrizNome:el.dataset.nome || el.value, nome: $('#schedNome').value.trim() || `${base.moduloNome} - ${el.value} - ${base.env.toUpperCase()}`}));
  }
  if(modulo === 'icms'){
    const sels = selectedCheckboxes('orgstr');
    return sels.map(el => ({...base, orgstr:el.value, orgstrNome:el.dataset.nome || el.value, nome: $('#schedNome').value.trim() || `${base.moduloNome} - ${el.value} - ${base.env.toUpperCase()}`}));
  }
  if(modulo === 'efd_sped'){
    const sels = selectedCheckboxes('orgstr');
    return sels.map(el => ({...base, orgstr:el.value, orgstrNome:el.dataset.nome || el.value, empresaEfd:el.dataset.empresa || '', filialEfd:el.dataset.filial || '', nome: $('#schedNome').value.trim() || `${base.moduloNome} - ${el.value} - ${base.env.toUpperCase()}`}));
  }
  return [base];
}
async function saveSchedule(e){
  e.preventDefault();
  try{
    const payloads = buildPayloadsForSelections();
    if(!payloads.length) throw new Error('Selecione ao menos uma opção para agendar.');
    if ($('#schedModulo').value === 'efd_sped' && !($('#varianteSelect')?.value || $('#varianteManual')?.value?.trim())) {
      throw new Error('Informe uma variante EFD-Sped Fiscal ou preencha o código manualmente.');
    }
    if ($('#schedModulo').value === 'tart' && !payloads[0].relatorioIds?.length) {
      throw new Error('Selecione ao menos um relatório de apoio.');
    }
    for(const payload of payloads){ await api('/api/agendamentos',{method:'POST',body:JSON.stringify(payload)}); }
    showAlert(payloads.length === 1 ? 'Agendamento salvo com sucesso.' : `${payloads.length} agendamentos salvos com sucesso.`);
    $('#scheduleForm').reset(); initModuleSelect(); updateConditionalFields(); await loadModuleOptions(); await loadAll();
  }catch(err){ showAlert(err.message,'erro'); }
}
async function runNow(id){ try{ await api(`/api/agendamentos/${id}/executar-agora`, {method:'POST'}); showAlert('Execução iniciada/concluída com registro no histórico.'); await loadAll(); }catch(e){ showAlert(e.message,'erro'); } }
async function toggleSchedule(id, active){ try{ await api(`/api/agendamentos/${id}`, {method:'PATCH', body:JSON.stringify({ativo:active})}); showAlert(active?'Agendamento ativado.':'Agendamento pausado.'); await loadAll(); }catch(e){ showAlert(e.message,'erro'); } }
async function removeSchedule(id){ if(!confirm('Remover este agendamento?')) return; try{ await api(`/api/agendamentos/${id}`, {method:'DELETE'}); showAlert('Agendamento removido.'); await loadAll(); }catch(e){ showAlert(e.message,'erro'); } }
function openDetail(i){ $('#modalContent').textContent = json(state.historico[i]); $('#detailModal').classList.add('open'); }
async function loadConfig(){ try{ $('#configOutput').textContent='Carregando...'; $('#configOutput').textContent=json(await api(`/api/${state.env}/config-execucao`)); }catch(e){ $('#configOutput').textContent=e.message; } }
async function testTaxone(){ try{ $('#testOutput').textContent='Executando teste...'; $('#testOutput').textContent=json(await api(`/api/${state.env}/teste-http-taxone`)); }catch(e){ $('#testOutput').textContent=e.message; } }
async function closeTaxoneBrowsers(){ try{ $('#testOutput').textContent='Fechando sessões controladas por este Node...'; $('#testOutput').textContent=json(await api('/api/taxone/browsers/fechar',{method:'POST'})); showAlert('Sessões TaxOne controladas por este Node foram fechadas.'); }catch(e){ $('#testOutput').textContent=e.message; showAlert(e.message,'erro'); } }
function setView(id){ $$('.view').forEach(v=>v.classList.toggle('active', v.id===id)); $$('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.view===id)); $('#pageTitle').textContent = ({dashboard:'Visão geral',agendamentos:'Agendamentos',historico:'Histórico',diagnostico:'Diagnóstico'})[id] || 'Schedulle Reports'; }

initModuleSelect(); updateConditionalFields();
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('#newScheduleTop').addEventListener('click',()=>{ setView('agendamentos'); $('#scheduleBuilder').scrollIntoView({behavior:'smooth'}); });
$('#refreshBtn').addEventListener('click', loadAll); $('#envSelect').addEventListener('change', e=>{state.env=e.target.value; loadHealth();});
$('#schedEnv').addEventListener('change', loadModuleOptions); $('#schedModulo').addEventListener('change', ()=>{ renderModuleCards(); loadModuleOptions(); }); $('#schedCompetencia').addEventListener('change', loadModuleOptions); $('#schedRecorrencia').addEventListener('change', updateConditionalFields); $('#reloadOptionsBtn').addEventListener('click', loadModuleOptions); $('#scheduleForm').addEventListener('submit', saveSchedule); $('#clearFormBtn').addEventListener('click',()=>{ $('#scheduleForm').reset(); initModuleSelect(); updateConditionalFields(); loadModuleOptions(); });
$('#scheduleSearch').addEventListener('input', renderSchedules); $('#scheduleStatus').addEventListener('change', renderSchedules); $('#historySearch').addEventListener('input', renderHistory); $('#historyStatus').addEventListener('change', renderHistory);
$('#clearHistoryBtn').addEventListener('click', async()=>{ if(!confirm('Limpar todo o histórico?')) return; try{ await api('/api/agendamentos-historico',{method:'DELETE'}); showAlert('Histórico limpo.'); await loadAll(); }catch(e){ showAlert(e.message,'erro'); }});
$('#loadConfigBtn').addEventListener('click', loadConfig); $('#testTaxoneBtn').addEventListener('click', testTaxone); $('#closeBrowsersBtn').addEventListener('click', closeTaxoneBrowsers); $('#closeModal').addEventListener('click',()=>$('#detailModal').classList.remove('open'));
loadModuleOptions(); loadAll();
