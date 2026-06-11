const state={env:'qas',view:'dashboard',grupos:[],relatorios:[],filter:'todos',selecionados:new Set(),linhasAtuais:[],opcoesModulo:[],variantesModulo:[],moduloSelecionados:new Set()};
const $=s=>document.querySelector(s);const $$=s=>document.querySelectorAll(s);


const modules={
  tart:{nome:'Relatórios de Apoio',icone:'📊',cor:'blue',hint:'Selecione o grupo e marque um ou mais relatórios.'},
  icms:{nome:'Apuração de ICMS',icone:'🏢',cor:'purple',hint:'Apuração fiscal por estrutura organizacional.'},
  irrf:{nome:'Apuração do IRRF',icone:'💰',cor:'green',hint:'Rotina fiscal para retenções de IRRF.'},
  iss:{nome:'Apuração de ISS',icone:'📄',cor:'cyan',hint:'Rotina fiscal para serviços e ISS.'},
  pcc:{nome:'Apuração do PCC',icone:'👥',cor:'amber',hint:'Rotina fiscal de PIS/COFINS/CSLL.'},
  efd_sped:{nome:'EFD-Sped Fiscal',icone:'📦',cor:'indigo',hint:'Geração e controle do EFD-Sped Fiscal.'}
};

function moduloAtual(){return $('#schedModulo')?.value || '';}
function moduloInfo(k=moduloAtual()){return modules[k] || {nome:'',icone:'',cor:'blue',hint:'Selecione um módulo para continuar.'};}

function renderModuleCards(){
  const box=$('#moduleCards');
  const sel=$('#schedModulo');
  if(!box || !sel) return;
  const atual=sel.value || '';
  box.innerHTML=Object.entries(modules).map(([key,m])=>`
    <button type="button" class="module-card ${key===atual?'active':''}" data-module="${key}">
      <span class="module-card-icon ${m.cor}">${m.icone}</span>
      <strong>${m.nome}</strong>
      <small>${m.hint}</small>
    </button>
  `).join('');
  box.querySelectorAll('[data-module]').forEach(btn=>{
    btn.onclick=()=>{
      sel.value=btn.dataset.module;
      renderModuleCards();
      loadModuleOptions();
  atualizarVisibilidadeListaRelatorios();
      atualizarVisibilidadeListaRelatorios();
    };
  });
}


function escapeHtml(v){
  return String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function normalizar(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

function tituloModulo(m){
  const info=moduloInfo(m);
  const titulos={
    tart:'Grupo e relatórios',
    icms:'Estabelecimentos / Estruturas',
    irrf:'Matrizes / Empresas',
    iss:'Matrizes / Empresas',
    pcc:'Matrizes / Empresas',
    efd_sped:'Estruturas e Variantes'
  };
  return titulos[m] || info.nome;
}

function hintModulo(m){
  const hints={
    tart:'Selecione o grupo e marque um ou mais relatórios para agendamento.',
    icms:'Selecione um ou mais estabelecimentos / estruturas para execução do ICMS.',
    irrf:'Selecione uma ou mais matrizes / empresas para execução do IRRF.',
    iss:'Selecione uma ou mais matrizes / empresas para execução do ISS.',
    pcc:'Selecione uma ou mais matrizes / empresas para execução do PCC.',
    efd_sped:'Selecione uma ou mais estruturas e a variante TaxOne para o EFD-Sped Fiscal.'
  };
  return hints[m] || 'Selecione as opções disponíveis para o módulo.';
}

function renderBulkActions(inputName,label){
  return `<div class="bulk-actions">
    <button class="btn ghost small" type="button" data-bulk-select="${inputName}">Selecionar todos</button>
    <button class="btn ghost small" type="button" data-bulk-clear="${inputName}">Limpar seleção</button>
    <span class="bulk-counter" id="bulkCounter_${inputName}">0 ${label} selecionado(s)</span>
  </div>`;
}

function bindBulkActions(inputName){
  document.querySelectorAll(`[data-bulk-select="${inputName}"]`).forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(`input[name="${inputName}"]`).forEach(i=>{i.checked=true; state.moduloSelecionados.add(i.value);});
    updateBulkCounter(inputName);
  });
  document.querySelectorAll(`[data-bulk-clear="${inputName}"]`).forEach(btn=>btn.onclick=()=>{
    document.querySelectorAll(`input[name="${inputName}"]`).forEach(i=>i.checked=false);
    state.moduloSelecionados.clear();
    updateBulkCounter(inputName);
  });
  document.querySelectorAll(`input[name="${inputName}"]`).forEach(i=>i.onchange=()=>{
    i.checked?state.moduloSelecionados.add(i.value):state.moduloSelecionados.delete(i.value);
    updateBulkCounter(inputName);
  });
  updateBulkCounter(inputName);
}

function updateBulkCounter(inputName){
  const total=document.querySelectorAll(`input[name="${inputName}"]`).length;
  const checked=document.querySelectorAll(`input[name="${inputName}"]:checked`).length;
  const el=document.querySelector(`#bulkCounter_${inputName}`);
  if(el) el.textContent=`${checked} de ${total} selecionado(s)`;
}

function renderOpcoesModulo(inputName='opcao', field='id'){
  const box=$('#optionList');
  if(!box) return;
  const q=normalizar($('#optionSearch')?.value||'');
  const list=(state.opcoesModulo||[]).filter(o=>normalizar(JSON.stringify(o)).includes(q));
  box.innerHTML=list.map((o,i)=>{
    const val=String(o[field]||o.orgstr||o.ORGSTR||o.empresa||o.EMPRESA||o.id||o.ID||o.codigo||'');
    const nome=String(o.nome||o.NOME||o.descricao||o.DESCRICAO||o.CENTRAL_EFD||o.central_efd||val);
    const extra=[o.uf||o.UF,o.filial||o.FILIAL_MAIN,o.cnpj||o.CNPJ].filter(Boolean).join(' • ');
    return `<label class="option-row">
      <input type="checkbox" name="${inputName}" value="${escapeHtml(val)}" ${i===0?'checked':''} data-nome="${escapeHtml(nome)}">
      <span><strong>${escapeHtml(val)}</strong><small>${escapeHtml(nome)}${extra?' • '+escapeHtml(extra):''}</small></span>
    </label>`;
  }).join('') || '<div class="empty">Nenhuma opção encontrada para este módulo.</div>';
  state.moduloSelecionados.clear();
  document.querySelectorAll(`input[name="${inputName}"]:checked`).forEach(i=>state.moduloSelecionados.add(i.value));
  bindBulkActions(inputName);
}

function renderVariantesModulo(){
  const select=$('#varianteSelect');
  if(!select) return;
  const q=normalizar($('#varianteSearch')?.value||'');
  const vars=(state.variantesModulo||[]).filter(v=>normalizar(`${v.codigo||''} ${v.id||''} ${v.descricao||v.nome||''}`).includes(q));
  select.innerHTML=vars.map(v=>{
    const id=v.id||v.codigo||'';
    const codigo=v.codigo||v.id||'';
    const nome=v.descricao||v.nome||codigo||id;
    return `<option value="${escapeHtml(id)}" data-codigo="${escapeHtml(codigo)}">${escapeHtml(codigo)}${nome&&nome!==codigo?' - '+escapeHtml(nome):''}</option>`;
  }).join('');
  const hint=$('#variantHint');
  if(hint) hint.textContent=vars.length?`${vars.length} variante(s) encontrada(s).`:'Nenhuma variante encontrada.';
}

async function loadModuleOptions(){
  const modulo=moduloAtual();
  if(!modulo){
    const title=$('#dynamicTitle'), hint=$('#dynamicHint'), content=$('#dynamicContent');
    if(title) title.textContent='Selecione um módulo';
    if(hint) hint.textContent='Escolha um dos cards acima para carregar grupos, estabelecimentos, matrizes ou variantes.';
    if(content) content.innerHTML='<div class="info-soft">Nenhum módulo selecionado.</div>';
    atualizarVisibilidadeListaRelatorios();
    return;
  }
  const env=$('#schedEnv')?.value || state.env;
  const mes=$('#mes')?.value || new Date().getMonth()+1;
  const ano=$('#ano')?.value || new Date().getFullYear();
  const title=$('#dynamicTitle'), hint=$('#dynamicHint'), content=$('#dynamicContent');
  if(title) title.textContent=tituloModulo(modulo);
  if(hint) hint.textContent=hintModulo(modulo);
  if(!content) return;
  state.moduloSelecionados.clear();

  if(modulo==='tart'){
    content.innerHTML='<div class="info-soft">Use o campo “Grupo” e a lista de relatórios abaixo para selecionar os relatórios de apoio.</div>';
    return;
  }

  content.innerHTML='<div class="loading">Carregando opções do módulo...</div>';
  try{
    if(['irrf','iss','pcc'].includes(modulo)){
      const arr=await api(`/api/${env}/${modulo}/matrizes`);
      state.opcoesModulo=Array.isArray(arr)?arr:[];
      content.innerHTML=`<label class="dynamic-search">Buscar matriz / empresa<input id="optionSearch" placeholder="Digite empresa, matriz ou descrição" /></label>${renderBulkActions('empresa','empresas')}<div id="optionList" class="radio-list"></div>`;
      $('#optionSearch').oninput=()=>renderOpcoesModulo('empresa','empresa');
      renderOpcoesModulo('empresa','empresa');
    } else if(modulo==='icms'){
      const arr=await api(`/api/${env}/icms/estruturas?mes=${mes}&ano=${ano}`);
      state.opcoesModulo=Array.isArray(arr)?arr:[];
      content.innerHTML=`<label class="dynamic-search">Buscar estabelecimento / estrutura<input id="optionSearch" placeholder="Digite loja, filial, UF ou estrutura" /></label>${renderBulkActions('orgstr','estruturas')}<div id="optionList" class="radio-list"></div>`;
      $('#optionSearch').oninput=()=>renderOpcoesModulo('orgstr','orgstr');
      renderOpcoesModulo('orgstr','orgstr');
    } else if(modulo==='efd_sped'){
      const estruturas=await api(`/api/${env}/efd-sped/estruturas?mes=${mes}&ano=${ano}`).catch(()=>[]);
      const variantes=await api(`/api/${env}/efd-sped/variantes`).catch(()=>[]);
      state.opcoesModulo=Array.isArray(estruturas)?estruturas:[];
      state.variantesModulo=Array.isArray(variantes)?variantes:[];
      content.innerHTML=`
        <div class="dynamic-two">
          <label>Buscar estrutura<input id="optionSearch" placeholder="Digite loja, filial, UF ou estrutura" /></label>
          <label>Filtrar variante<input id="varianteSearch" placeholder="Digite código ou descrição da variante" /></label>
        </div>
        <label class="dynamic-search">Variante TaxOne<select id="varianteSelect"></select></label>
        <div id="variantHint" class="field-hint"></div>
        ${renderBulkActions('orgstr','estruturas')}
        <div id="optionList" class="radio-list"></div>`;
      $('#optionSearch').oninput=()=>renderOpcoesModulo('orgstr','orgstr');
      $('#varianteSearch').oninput=renderVariantesModulo;
      renderVariantesModulo();
      renderOpcoesModulo('orgstr','orgstr');
    }
  }catch(e){
    content.innerHTML=`<div class="empty erro-box">Não foi possível carregar as opções do módulo: ${escapeHtml(e.message||e)}</div>`;
  }
}

function opcoesSelecionadasPayload(){
  const modulo=moduloAtual();
  if(modulo==='tart') return [];
  return Array.from(document.querySelectorAll('#dynamicContent input[type="checkbox"]:checked')).map(i=>({
    id:i.value,
    nome:i.dataset.nome || i.value,
    tipo: i.name
  }));
}

function initModuleFilter(){
  const sel=$('#schedModulo');
  if(!sel) return;
  sel.value = sel.value || '';
  sel.onchange=()=>{renderModuleCards();loadModuleOptions();atualizarVisibilidadeListaRelatorios();};
  renderModuleCards();
}


function initPeriod(){
  const mes=$('#mes'),ano=$('#ano');
  for(let i=1;i<=12;i++)mes.innerHTML+=`<option value="${i}">${String(i).padStart(2,'0')}</option>`;
  const y=new Date().getFullYear();const start=2020;const end=Math.max(2035,y+10);
  for(let i=start;i<=end;i++)ano.innerHTML+=`<option value="${i}" ${i===y?'selected':''}>${i}</option>`;
  mes.value=new Date().getMonth()+1;
}

async function api(path,opt={}){
  const options={...opt};
  options.headers={...(options.headers||{})};
  if(options.body && !options.headers['Content-Type']) options.headers['Content-Type']='application/json';
  const r=await fetch(path,options);
  if(!r.ok){
    let msg=await r.text();
    try{const j=JSON.parse(msg);msg=j.erro||j.message||msg}catch(_){ }
    throw new Error(msg);
  }
  return r.status===204?null:r.json();
}

function setLoading(v){$('#btnAtualizar').textContent=v?'Carregando...':'⟳ Atualizar'}


function dentroPeriodoSelecionado(valor){
  if(!valor) return false;
  const d = new Date(valor);
  if(Number.isNaN(d.getTime())) return false;
  return d.getMonth()+1 === Number($('#mes')?.value || new Date().getMonth()+1)
    && d.getFullYear() === Number($('#ano')?.value || new Date().getFullYear());
}

async function carregarExecucoesDashboard(){
  try{
    const historico = await api('/api/agendamentos-historico');
    const lista = Array.isArray(historico) ? historico : [];
    const total = lista.filter(item => {
      const data = item.executado_em || item.data || item.criado_em || item.startedAt || item.finalizado_em || item.timestamp;
      return dentroPeriodoSelecionado(data);
    }).length;
    const el = $('#kpiRelatorios');
    if(el) el.textContent = total;
  }catch(e){
    const el = $('#kpiRelatorios');
    if(el) el.textContent = 0;
  }
}

async function carregar(){
  setLoading(true);
  try{await Promise.all([carregarGrupos(),carregarAgendamentos(),carregarConfig(),carregarExecucoesDashboard()]);await carregarRelatorios()}catch(e){console.warn(e)}
  finally{setLoading(false);$('#lastUpdate')&&($('#lastUpdate').textContent=new Date().toLocaleTimeString('pt-BR'));}
}

async function carregarGrupos(){
  try{state.grupos=await api(`/api/${state.env}/grupos`)}catch(e){state.grupos=[]}
  $('#kpiGrupos').textContent=6;
  const sel=$('#grupoSelect');
  sel.innerHTML='<option value="">Selecione o grupo</option>'+state.grupos.map(g=>`<option value="${g.id||g.ID||g.grupo_id}">${g.nome||g.NOME||('Grupo '+(g.id||g.ID||g.grupo_id))}</option>`).join('');
}

async function carregarRelatorios(){
  const grupo=$('#grupoSelect').value || (state.grupos[0]&&(state.grupos[0].id||state.grupos[0].ID||state.grupos[0].grupo_id));
  if(!grupo){state.relatorios=[];state.selecionados.clear();renderTabela();return}
  try{state.relatorios=await api(`/api/${state.env}/grupos/${encodeURIComponent(grupo)}/relatorios?mes=${$('#mes').value}&ano=${$('#ano').value}`)}catch(e){state.relatorios=[]}
  state.selecionados.clear();
  renderTabela();
}

function relatorioId(r){return String(r.id||r.ID||r.relatorio_id||r.RELATORIO_ID||'');}
function relatorioNome(r){return String(r.nome||r.NOME||'');}
function grupoAtualId(){return $('#grupoSelect').value || (state.grupos[0]&&(state.grupos[0].id||state.grupos[0].ID||state.grupos[0].grupo_id)) || '';}
function grupoAtualNome(){const id=String(grupoAtualId());const g=state.grupos.find(x=>String(x.id||x.ID||x.grupo_id)===id);return g?(g.nome||g.NOME||`Grupo ${id}`):id;}

function atualizarContadorSelecao(){
  const el=$('#selectedCount');
  if(el) el.textContent=`${state.selecionados.size} selecionado${state.selecionados.size===1?'':'s'}`;
}

function renderTabela(){
  if((typeof moduloAtual === 'function' ? moduloAtual() : ($('#schedModulo')?.value || 'tart')) !== 'tart'){
    const grid=document.querySelector('.content-grid'); if(grid) grid.style.display='none';
    return;
  }
  let rows=[...state.relatorios];
  const q=($('#busca').value||'').toLowerCase();
  if(q)rows=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q));
  if(state.filter==='empresa')rows=rows.filter(r=>r.empresa||r.EMPRESA);
  if(state.filter==='orgstr')rows=rows.filter(r=>r.orgstr||r.ORGSTR);
  state.linhasAtuais=rows;
  $('#kpiRelatorios').textContent=rows.length;
  $('#countBadge').textContent=`${rows.length} registros`;
  const tb=$('#tbody');
  tb.innerHTML=rows.map(r=>{
    const id=relatorioId(r);
    const checked=state.selecionados.has(id)?'checked':'';
    return `<tr><td class="select-col"><input class="report-check" type="checkbox" data-id="${id}" ${checked}></td><td>${r.grupo_id||r.GRUPO_ID||''}</td><td>${id}</td><td><b>${relatorioNome(r)}</b></td><td>${r.fonte_id||r.FONTE_ID||''}</td><td>${r.mandt||r.MANDT||''}</td><td>${r.empresa||r.EMPRESA||''}</td><td>${r.orgstr||r.ORGSTR||''}</td><td>${r.tipo||r.TIPO||''}</td><td>${r.tipo_exportacao||r.TIPO_EXPORTACAO||''}</td><td><button class="row-btn">Executar</button></td></tr>`
  }).join('');
  tb.querySelectorAll('.report-check').forEach(chk=>chk.onchange=()=>{chk.checked?state.selecionados.add(chk.dataset.id):state.selecionados.delete(chk.dataset.id);atualizarContadorSelecao();});
  $('#empty').classList.toggle('show',rows.length===0);
  atualizarContadorSelecao();
}

function htmlEscape(valor){
  return String(valor ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatarDataHora(valor){
  if(!valor) return 'A calcular';
  const d=new Date(valor);
  if(Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}

function textoDiaSemana(valor){
  const mapa={0:'Domingo',1:'Segunda-feira',2:'Terça-feira',3:'Quarta-feira',4:'Quinta-feira',5:'Sexta-feira',6:'Sábado'};
  return mapa[String(valor)] || mapa[Number(valor)] || 'Não definido';
}

function textoRecorrencia(ag){
  const rec=String(ag.recorrencia||'diario').toLowerCase();
  if(rec==='semanal') return `Semanal • ${textoDiaSemana(ag.diaSemana)}`;
  if(rec==='mensal') return `Mensal • ${ag.diaUtil || ag.diaMes || 1}º dia útil`;
  return 'Diário';
}

function resumoAgendamento(ag){
  if(Array.isArray(ag.relatoriosSelecionados) && ag.relatoriosSelecionados.length){
    const nomes=ag.relatoriosSelecionados.map(r=>r.nome||r.NOME||r.id||r.ID).filter(Boolean);
    return `${ag.relatoriosSelecionados.length} relatório${ag.relatoriosSelecionados.length===1?'':'s'}${nomes.length?': '+nomes.slice(0,3).join(', ')+(nomes.length>3?'...':''):''}`;
  }
  if(Array.isArray(ag.relatorioIds) && ag.relatorioIds.length) return `${ag.relatorioIds.length} relatório${ag.relatorioIds.length===1?'':'s'} selecionado${ag.relatorioIds.length===1?'':'s'}`;
  return ag.moduloNome || ag.modulo || 'Agendamento';
}

function renderAgendamentos(lista){
  const agList=$('#agList');
  if(!agList) return;
  const ags=Array.isArray(lista)?lista:[];
  if(!ags.length){
    agList.innerHTML='<div class="agenda-empty">Nenhum agendamento cadastrado.</div>';
    return;
  }
  agList.innerHTML=ags.map(ag=>{
    const ativo=ag.ativo!==false;
    const status=ativo?'Ativo':'Pausado';
    const statusClass=ativo?'ativo':'pausado';
    return `<article class="agenda-card" data-id="${htmlEscape(ag.id)}">
      <div class="agenda-main">
        <div class="agenda-title-row">
          <div class="agenda-icon">${htmlEscape(ag.moduloIcone||'▦')}</div>
          <div>
            <h3>${htmlEscape(ag.nome||'Agendamento')}</h3>
            <p>${htmlEscape(resumoAgendamento(ag))}</p>
          </div>
        </div>
        <div class="agenda-meta">
          <span><small>Ambiente</small><b>${htmlEscape(String(ag.env||'-').toUpperCase())}</b></span>
          <span><small>Recorrência</small><b>${htmlEscape(textoRecorrencia(ag))}</b></span>
          <span><small>Horário</small><b>${htmlEscape(ag.horario||'-')}</b></span>
          <span><small>Próxima Execução</small><b>${htmlEscape(formatarDataHora(ag.proxima_execucao))}</b></span>
          <span><small>Status</small><b class="status-badge ${statusClass}">${status}</b></span>
        </div>
      </div>
      <div class="agenda-actions">
        <button class="agenda-btn run" data-action="run" data-id="${htmlEscape(ag.id)}" type="button">▶ Executar agora</button>
        <button class="agenda-btn pause" data-action="toggle" data-ativo="${ativo?'true':'false'}" data-id="${htmlEscape(ag.id)}" type="button">${ativo?'⏸ Pausar':'▶ Ativar'}</button>
        <button class="agenda-btn delete" data-action="delete" data-id="${htmlEscape(ag.id)}" type="button">🗑 Excluir</button>
      </div>
    </article>`;
  }).join('');

  agList.querySelectorAll('[data-action="run"]').forEach(btn=>btn.onclick=()=>executarAgendamentoAgora(btn.dataset.id,btn));
  agList.querySelectorAll('[data-action="toggle"]').forEach(btn=>btn.onclick=()=>alternarAgendamento(btn.dataset.id,btn.dataset.ativo==='true',btn));
  agList.querySelectorAll('[data-action="delete"]').forEach(btn=>btn.onclick=()=>excluirAgendamento(btn.dataset.id));
}

async function carregarAgendamentos(){
  try{
    const a=await api('/api/agendamentos');
    const lista=Array.isArray(a)?a:[];
    $('#kpiAgenda').textContent=lista.filter(a=>a.ativo!==false).length;
    renderAgendamentos(lista);
  }catch(e){
    const agList=$('#agList');
    if(agList) agList.innerHTML=`<div class="agenda-empty erro">Não foi possível carregar os agendamentos: ${htmlEscape(e.message||e)}</div>`;
  }
}

async function executarAgendamentoAgora(id,btn){
  if(!id) return;
  const old=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent='Executando...';}
  try{
    await api(`/api/agendamentos/${encodeURIComponent(id)}/executar-agora`,{method:'POST'});
    alert('Execução solicitada com sucesso.');
    await carregarAgendamentos();
  }catch(e){alert(e.message||'Erro ao executar agendamento.')}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}

async function alternarAgendamento(id,ativoAtual,btn){
  if(!id) return;
  const old=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent=ativoAtual?'Pausando...':'Ativando...';}
  try{
    await api(`/api/agendamentos/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({ativo:!ativoAtual})});
    await carregarAgendamentos();
  }catch(e){alert(e.message||'Erro ao atualizar agendamento.')}finally{if(btn){btn.disabled=false;btn.textContent=old;}}
}

async function excluirAgendamento(id){
  if(!id) return;
  if(!confirm('Deseja excluir este agendamento?')) return;
  try{
    await api(`/api/agendamentos/${encodeURIComponent(id)}`,{method:'DELETE'});
    await carregarAgendamentos();
  }catch(e){alert(e.message||'Erro ao excluir agendamento.')}
}
async function carregarConfig(){try{const c=await api(`/api/${state.env}/config-execucao`);const el=$('#execMode'); if(el) el.textContent=c.executionMode||c.modo||'Configurado'}catch(e){const el=$('#execMode'); if(el) el.textContent='Indisponível'}}

function selecionarTodos(){state.linhasAtuais.forEach(r=>{const id=relatorioId(r);if(id)state.selecionados.add(id)});renderTabela();}
function limparSelecao(){state.selecionados.clear();renderTabela();}

function updateScheduleConditionalFields(){
  const recorrencia = $('#schedRecorrencia')?.value || 'diario';
  const semanal = $('#campoDiaSemana');
  const mensal = $('#campoDiaUtil');

  if(semanal){
    const mostrarSemanal = recorrencia === 'semanal';
    semanal.classList.toggle('show', mostrarSemanal);
    semanal.style.display = mostrarSemanal ? 'grid' : 'none';
  }

  if(mensal){
    const mostrarMensal = recorrencia === 'mensal';
    mensal.classList.toggle('show', mostrarMensal);
    mensal.style.display = mostrarMensal ? 'grid' : 'none';
  }
}


function selecionadosPorNome(name){
  return Array.from(document.querySelectorAll(`#dynamicContent input[name="${name}"]:checked`));
}

function validarSelecaoModuloAtual(){
  const modulo = moduloAtual();

  if(!modulo){
    alert('Selecione um módulo para agendar.');
    return false;
  }

  if(modulo === 'tart'){
    if(!state.selecionados.size){
      alert('Selecione ao menos um relatório para agendar.');
      return false;
    }
    return true;
  }

  if(['irrf','iss','pcc'].includes(modulo)){
    const empresas = selecionadosPorNome('empresa');
    if(!empresas.length){
      alert(`Selecione uma Matriz / Empresa para agendar ${moduloInfo().nome}.`);
      return false;
    }
    return true;
  }

  if(modulo === 'icms'){
    const estruturas = selecionadosPorNome('orgstr');
    if(!estruturas.length){
      alert('Selecione uma Estrutura Organizacional para agendar a Apuração ICMS.');
      return false;
    }
    return true;
  }

  if(modulo === 'efd_sped'){
    const estruturas = selecionadosPorNome('orgstr');
    const variante = document.querySelector('#varianteSelect')?.value || document.querySelector('#varianteManual')?.value || '';
    if(!estruturas.length){
      alert('Selecione uma Estrutura Organizacional para agendar o EFD-Sped Fiscal.');
      return false;
    }
    if(!variante){
      alert('Selecione ou informe uma Variante TaxOne para agendar o EFD-Sped Fiscal.');
      return false;
    }
    return true;
  }

  return true;
}


function primeiraOpcaoModuloSelecionada(){
  const opcoes = opcoesSelecionadasPayload();
  return opcoes && opcoes.length ? opcoes[0] : null;
}

function camposLegadosModulo(){
  const modulo = moduloAtual();
  const primeira = primeiraOpcaoModuloSelecionada();
  const campos = {};

  if(['irrf','iss','pcc'].includes(modulo) && primeira){
    campos.empresa = primeira.id;
    campos.matrizNome = primeira.nome || primeira.id;
  }

  if(modulo === 'icms' && primeira){
    campos.orgstr = primeira.id;
    campos.orgstrNome = primeira.nome || primeira.id;
  }

  if(modulo === 'efd_sped' && primeira){
    campos.orgstr = primeira.id;
    campos.orgstrNome = primeira.nome || primeira.id;

    const varianteSelect = document.querySelector('#varianteSelect');
    const varianteManual = document.querySelector('#varianteManual');
    const selectedOption = varianteSelect?.selectedOptions?.[0];

    const varianteId = varianteSelect?.value || varianteManual?.value || '';
    const varianteCodigo = selectedOption?.dataset?.codigo || varianteId;

    campos.varianteId = varianteId;
    campos.varianteCodigo = varianteCodigo;
    campos.varianteNome = selectedOption?.textContent || varianteCodigo || varianteId;
  }

  return campos;
}

async function salvarAgendamento(){
  if(!validarSelecaoModuloAtual()) return;
  const horario=$('#schedHorario').value;
  if(!horario){alert('Informe o horário do agendamento.');return}
  const relatoriosSelecionados=state.relatorios
    .filter(r=>state.selecionados.has(relatorioId(r)))
    .map(r=>({id:relatorioId(r),nome:relatorioNome(r),fonte_id:r.fonte_id||r.FONTE_ID||'',tipo_exportacao:r.tipo_exportacao||r.TIPO_EXPORTACAO||''}));
  const env=$('#schedEnv').value||state.env;
  const camposModulo=camposLegadosModulo();
  const payload={
    ...camposModulo,
    nome:$('#schedNome').value.trim()||`Relatórios ${grupoAtualNome()} - ${env.toUpperCase()}`,
    env,
    modulo:moduloAtual(),
    moduloNome:moduloInfo().nome,
    moduloIcone:moduloInfo().icone,
    grupoId:grupoAtualId(),
    grupoNome:grupoAtualNome(),
    relatorioIds:moduloAtual()==='tart'?Array.from(state.selecionados):[],
    relatoriosSelecionados:moduloAtual()==='tart'?relatoriosSelecionados:[],
    opcoesSelecionadas:opcoesSelecionadasPayload(),
    variante:$('#varianteSelect')?.value || '',
    recorrencia:$('#schedRecorrencia').value||'diario',
    horario,
    diaSemana:$('#schedDiaSemana')?.value || new Date().getDay(),
    diaMes:1,
    diaUtil:$('#schedDiaUtil')?.value || 1,
    mes:$('#mes').value,
    ano:$('#ano').value,
    periodoModo:'dinamico'
  };
  const btn=$('#btnSalvarAgendamento');
  const old=btn.textContent;
  btn.disabled=true;btn.textContent='Salvando...';
  try{
    await api('/api/agendamentos',{method:'POST',body:JSON.stringify(payload)});
    alert('Agendamento criado com sucesso.');
    $('#schedNome').value='';
    limparSelecao();
    await carregarAgendamentos();
    setView('agendamentos','Agendamentos');
  }catch(e){alert(e.message||'Erro ao criar agendamento.')}finally{btn.disabled=false;btn.textContent=old;}
}

function setView(view, label){
  state.view=view;
  $$('.menu-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  $$('.view').forEach(v=>v.classList.remove('active'));
  const target=$(`#view-${view}`); if(target) target.classList.add('active');
  $('#pageTitle').textContent=label || ({dashboard:'Dashboard',relatorios:'Relatórios',agendamentos:'Agendamentos'})[view] || 'Dashboard';
}


function atualizarVisibilidadeListaRelatorios(){
  const modulo = (typeof moduloAtual === 'function' ? moduloAtual() : ($('#schedModulo')?.value || 'tart'));
  const mostrar = modulo === 'tart';

  const tabela = document.querySelector('.content-grid');
  if(tabela) tabela.style.display = mostrar ? '' : 'none';

  const count = document.querySelector('#selectedCount');
  if(count) count.style.display = mostrar ? '' : 'none';

  if(!mostrar && state && state.selecionados){
    state.selecionados.clear();
    if(typeof atualizarContadorSelecao === 'function') atualizarContadorSelecao();
  }
}

function bind(){
  $$('.env-btn').forEach(b=>b.onclick=()=>{$$('.env-btn').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.env=b.dataset.env;const se=$('#schedEnv'); if(se) se.value=state.env;$('#ambienteAtual').textContent=state.env.toUpperCase();carregar();loadModuleOptions();});
  $$('.menu-item').forEach(b=>b.onclick=()=>setView(b.dataset.view,b.innerText.trim()));
  $$('.chip').forEach(c=>c.onclick=()=>{$$('.chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');state.filter=c.dataset.filter;renderTabela()});
  $('#btnAtualizar').onclick=()=>{carregar();loadModuleOptions();};
  $('#grupoSelect').onchange=carregarRelatorios;
  $('#busca').oninput=renderTabela;
  $('#btnSelecionarTodos').onclick=selecionarTodos;
  $('#btnLimparSelecao').onclick=limparSelecao;
  $('#btnSalvarAgendamento').onclick=salvarAgendamento;
  const sr=$('#schedRecorrencia'); if(sr) sr.onchange=updateScheduleConditionalFields;
  updateScheduleConditionalFields();
  initModuleFilter();
  loadModuleOptions();
  atualizarVisibilidadeListaRelatorios();
  const se=$('#schedEnv'); if(se) se.value=state.env;
  const bh=$('#btnHealth'); if(bh) bh.onclick=async()=>{try{$('#diagOut').textContent=JSON.stringify(await api(`/api/health/${state.env}`),null,2)}catch(e){$('#diagOut').textContent=e.message}}
}
initPeriod();bind();setView('dashboard','Dashboard');carregar();
