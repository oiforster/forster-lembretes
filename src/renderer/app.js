/* app.js — Renderer process do Forster Lembretes */

// ---------------------------------------------------------------------------
// Navegação entre páginas
// ---------------------------------------------------------------------------
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
    btn.classList.add('active')
    document.getElementById(`page-${btn.dataset.page}`).classList.add('active')
    if (btn.dataset.page === 'logs') carregarLog()
    if (btn.dataset.page === 'clientes') carregarClientes()
    if (btn.dataset.page === 'config') carregarConfig()
  })
})

// ---------------------------------------------------------------------------
// Status do WhatsApp
// ---------------------------------------------------------------------------
function aplicarStatus (status) {
  const dot  = document.getElementById('statusDot')
  const text = document.getElementById('statusText')

  const estados = {
    conectado:     { dot: 'conectado',  label: 'Conectado' },
    autenticando:  { dot: 'conectando', label: 'Autenticando...' },
    aguardando_qr: { dot: 'conectando', label: 'Aguardando QR' },
    conectando:    { dot: 'conectando', label: 'Conectando...' },
    desconectado:  { dot: '',           label: 'Desconectado' },
    erro:          { dot: 'erro',       label: 'Erro' },
  }

  const e = estados[status] || estados.desconectado
  dot.className  = `status-dot ${e.dot}`
  text.textContent = e.label

  // Painel no dashboard
  document.getElementById('waConectado').classList.toggle('hidden', status !== 'conectado')
  document.getElementById('waConectando').classList.toggle('hidden', status === 'conectado' || status === 'aguardando_qr' || status === 'erro')
  document.getElementById('waQr').classList.toggle('hidden', status !== 'aguardando_qr')
  document.getElementById('waErro').classList.toggle('hidden', status !== 'erro')
}

window.api.onWaStatus(status => aplicarStatus(status))

window.api.onWaQr(dataUrl => {
  aplicarStatus('aguardando_qr')
  document.getElementById('qrImg').src = dataUrl
})

window.api.onNovaLog(linha => {
  const logList = document.getElementById('logList')
  if (document.getElementById('page-logs').classList.contains('active')) {
    const div = document.createElement('div')
    div.className = `log-line ${linha.includes('✓') ? 'sucesso' : linha.includes('✗') ? 'erro' : ''}`
    div.textContent = linha
    logList.prepend(div)
  }
})

// ---------------------------------------------------------------------------
// Dashboard — cards e disparo manual
// ---------------------------------------------------------------------------
async function atualizarDashboard () {
  const [clientes, config] = await Promise.all([
    window.api.listarClientes(),
    window.api.lerConfig()
  ])

  const ativos = clientes.filter(c => c.ativo?.toLowerCase() === 'sim')
  document.getElementById('totalAtivos').textContent = ativos.length

  const hoje = new Date()
  const dias = config.diasAntecedencia || 5
  const alvo = new Date(hoje)
  alvo.setDate(alvo.getDate() + dias)
  const vencSet = new Set()
  ativos.forEach(c => { if (parseInt(c.dia_vencimento) === alvo.getDate()) vencSet.add(c.cliente) })
  document.getElementById('vencimentos5').textContent = vencSet.size
  document.getElementById('proximoEnvio').textContent = `${config.horario || '09:00'}h`
}

document.getElementById('btnDisparar').addEventListener('click', async () => {
  const btn = document.getElementById('btnDisparar')
  btn.disabled = true
  btn.textContent = 'Enviando...'
  try {
    await window.api.rodarDisparo()
  } catch (e) {
    alert('Erro: ' + e.message)
  } finally {
    btn.disabled = false
    btn.textContent = 'Rodar verificação agora'
    await atualizarDashboard()
  }
})

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
let listaClientes = []
let idxEditando   = null

async function carregarClientes () {
  listaClientes = await window.api.listarClientes()
  renderizarTabela()
}

function renderizarTabela () {
  const tbody = document.getElementById('tbodyClientes')
  tbody.innerHTML = ''

  if (listaClientes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#8e8e93;padding:24px">Nenhum cliente cadastrado</td></tr>'
    return
  }

  listaClientes.forEach((c, i) => {
    const ativo = c.ativo?.toLowerCase() === 'sim'
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${c.cliente}</td>
      <td>${c.whatsapp}</td>
      <td>Dia ${c.dia_vencimento}</td>
      <td><code style="font-size:12px">${c.chave_pix}</code></td>
      <td><span class="badge ${ativo ? 'badge-ativo' : 'badge-inativo'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div class="td-actions">
          <button class="btn btn-secondary" onclick="editarCliente(${i})">Editar</button>
          <button class="btn btn-danger" onclick="removerCliente(${i})">Remover</button>
        </div>
      </td>
    `
    tbody.appendChild(tr)
  })
}

window.editarCliente = (idx) => {
  idxEditando = idx
  const c = listaClientes[idx]
  document.getElementById('modalTitulo').textContent = 'Editar cliente'
  document.getElementById('fCliente').value  = c.cliente
  document.getElementById('fWhatsapp').value = c.whatsapp
  document.getElementById('fDia').value      = c.dia_vencimento
  document.getElementById('fPix').value      = c.chave_pix
  document.getElementById('fAtivo').checked  = c.ativo?.toLowerCase() === 'sim'
  abrirModal()
}

window.removerCliente = async (idx) => {
  if (!confirm(`Remover "${listaClientes[idx].cliente}"?`)) return
  listaClientes.splice(idx, 1)
  await window.api.salvarClientes(listaClientes)
  renderizarTabela()
}

document.getElementById('btnNovoCliente').addEventListener('click', () => {
  idxEditando = null
  document.getElementById('modalTitulo').textContent = 'Novo cliente'
  document.getElementById('fCliente').value  = ''
  document.getElementById('fWhatsapp').value = ''
  document.getElementById('fDia').value      = ''
  document.getElementById('fPix').value      = ''
  document.getElementById('fAtivo').checked  = true
  abrirModal()
})

document.getElementById('btnSalvarCliente').addEventListener('click', async () => {
  const cliente = {
    cliente:        document.getElementById('fCliente').value.trim(),
    whatsapp:       document.getElementById('fWhatsapp').value.trim(),
    dia_vencimento: document.getElementById('fDia').value.trim(),
    chave_pix:      document.getElementById('fPix').value.trim(),
    ativo:          document.getElementById('fAtivo').checked ? 'sim' : 'não'
  }

  if (!cliente.cliente || !cliente.whatsapp || !cliente.dia_vencimento || !cliente.chave_pix) {
    alert('Preencha todos os campos.')
    return
  }

  if (idxEditando !== null) {
    listaClientes[idxEditando] = cliente
  } else {
    listaClientes.push(cliente)
  }

  await window.api.salvarClientes(listaClientes)
  renderizarTabela()
  fecharModal()
})

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
function abrirModal  () { document.getElementById('modalOverlay').classList.remove('hidden') }
function fecharModal () { document.getElementById('modalOverlay').classList.add('hidden') }

document.getElementById('btnFecharModal').addEventListener('click', fecharModal)
document.getElementById('btnCancelarModal').addEventListener('click', fecharModal)
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) fecharModal()
})

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
const MSG_PADRAO = 'Olá, {nome}! Lembrete automático da Forster Filmes: o pagamento de {mes}/{ano} vence dia {data}. Chave PIX: {pix}. Em caso de dúvidas, estamos à disposição!'

// Garante que msg_padrao aparece no textarea ao carregar pela primeira vez


async function carregarConfig () {
  const cfg = await window.api.lerConfig()
  document.getElementById('cfgHorario').value  = cfg.horario || '09:00'
  document.getElementById('cfgDias').value     = cfg.diasAntecedencia || 5
  document.getElementById('cfgMensagem').value = cfg.mensagem || MSG_PADRAO
}

document.getElementById('btnSalvarConfig').addEventListener('click', async () => {
  const cfg = {
    horario:           document.getElementById('cfgHorario').value,
    diasAntecedencia:  parseInt(document.getElementById('cfgDias').value, 10) || 5,
    mensagem:          document.getElementById('cfgMensagem').value.trim() || MSG_PADRAO
  }
  await window.api.salvarConfig(cfg)

  const fb = document.getElementById('configFeedback')
  fb.classList.remove('hidden')
  setTimeout(() => fb.classList.add('hidden'), 2000)
})

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------
async function carregarLog () {
  const linhas = await window.api.lerLog()
  const logList = document.getElementById('logList')
  logList.innerHTML = ''

  if (linhas.length === 0) {
    logList.innerHTML = '<span style="color:#636366">Nenhum registro ainda.</span>'
    return
  }

  linhas.forEach(l => {
    const div = document.createElement('div')
    div.className = `log-line ${l.includes('✓') ? 'sucesso' : l.includes('✗') ? 'erro' : ''}`
    div.textContent = l
    logList.appendChild(div)
  })
}

document.getElementById('btnAtualizarLog').addEventListener('click', carregarLog)

// ---------------------------------------------------------------------------
// Botões de variável na mensagem
// ---------------------------------------------------------------------------
document.getElementById('btnRestaurarMensagem').addEventListener('click', () => {
  if (confirm('Restaurar a mensagem padrão? O texto atual será perdido.')) {
    document.getElementById('cfgMensagem').value = MSG_PADRAO
  }
})

document.querySelectorAll('.var-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const textarea = document.getElementById('cfgMensagem')
    const varText  = btn.dataset.var
    const start    = textarea.selectionStart
    const end      = textarea.selectionEnd
    const atual    = textarea.value
    textarea.value = atual.slice(0, start) + varText + atual.slice(end)
    textarea.selectionStart = textarea.selectionEnd = start + varText.length
    textarea.focus()
  })
})

// ---------------------------------------------------------------------------
// Pausar / Reativar
// ---------------------------------------------------------------------------
function aplicarEstadoServico (pausado) {
  const btn = document.getElementById('btnPausar')
  if (!btn) return
  if (pausado) {
    btn.textContent = '▶ Reativar serviço'
    btn.classList.add('pausado')
  } else {
    btn.textContent = '⏸ Pausar serviço'
    btn.classList.remove('pausado')
  }
}

document.getElementById('btnPausar').addEventListener('click', async () => {
  const pausado = await window.api.statusServico()
  if (pausado) {
    await window.api.reativarServico()
    aplicarEstadoServico(false)
  } else {
    await window.api.pausarServico()
    aplicarEstadoServico(true)
  }
})

window.api.onServicoStatus(pausado => aplicarEstadoServico(pausado))

// ---------------------------------------------------------------------------
// Desinstalar
// ---------------------------------------------------------------------------
document.getElementById('btnDesinstalar').addEventListener('click', async () => {
  const ok = confirm(
    'Tem certeza que deseja desinstalar o Forster Lembretes?\n\n' +
    'O agendamento automático será removido e o WhatsApp será desconectado. ' +
    'Seus dados e histórico serão mantidos.'
  )
  if (!ok) return
  await window.api.desinstalar()
})

// ---------------------------------------------------------------------------
// Preview da mensagem
// ---------------------------------------------------------------------------
document.getElementById('btnPreview').addEventListener('click', async () => {
  const template = document.getElementById('cfgMensagem').value || MSG_PADRAO
  const clientes = await window.api.listarClientes()
  const exemplo  = clientes.find(c => c.ativo?.toLowerCase() === 'sim') || {
    cliente: 'Vanessa Mainardi', chave_pix: '35.935.852/0001-55'
  }
  const hoje    = new Date()
  const meses   = ['janeiro','fevereiro','março','abril','maio','junho',
                   'julho','agosto','setembro','outubro','novembro','dezembro']
  const dataFmt = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}`
  const preview = template
    .replace(/\{nome\}/g, exemplo.cliente)
    .replace(/\{mes\}/g,  meses[hoje.getMonth()])
    .replace(/\{ano\}/g,  hoje.getFullYear())
    .replace(/\{data\}/g, dataFmt)
    .replace(/\{pix\}/g,  exemplo.chave_pix)

  const div = document.getElementById('msgPreview')
  div.innerHTML = `<div class="msg-preview-label">Pré-visualização com dados de ${exemplo.cliente}</div>${preview}`
  div.classList.remove('hidden')
})

// ---------------------------------------------------------------------------
// Wizard de primeiro acesso
// ---------------------------------------------------------------------------
let wizardStep = 1

function irParaPasso (n) {
  console.log('[wizard] irParaPasso chamado com n =', n)
  const steps = document.querySelectorAll('.wizard-step')
  const alvo  = document.querySelector(`.wizard-step[data-step="${n}"]`)
  console.log('[wizard] steps encontrados:', steps.length, '| alvo:', alvo)
  steps.forEach(s => s.classList.remove('active'))
  if (!alvo) { console.error('[wizard] Step não encontrado:', n); return }
  alvo.classList.add('active')
  document.querySelectorAll('.wz-dot').forEach(d => d.classList.remove('active'))
  const dot = document.querySelector(`.wz-dot[data-dot="${n}"]`)
  if (dot) dot.classList.add('active')
  wizardStep = n
  console.log('[wizard] wizardStep agora =', wizardStep)
}

// QR no wizard — reaproveita o mesmo evento do app
window.api.onWaQr(dataUrl => {
  if (wizardStep === 2) {
    document.getElementById('wzQrArea').innerHTML =
      `<img src="${dataUrl}" style="width:200px;border-radius:8px">`
  }
  aplicarStatus('aguardando_qr')
})

window.api.onWaStatus(status => {
  aplicarStatus(status)
  if (status === 'conectado' && wizardStep === 2) {
    document.getElementById('wzQrArea').classList.add('hidden')
    document.getElementById('wzConectado').classList.remove('hidden')
    document.getElementById('wzProximo2').disabled = false
  }
})

document.getElementById('wzProximo1').addEventListener('click', async () => {
  const agencia = document.getElementById('wzAgencia').value.trim()
  if (!agencia) { alert('Informe o nome da agência.'); return }
  irParaPasso(2)
  // Ao entrar no passo 2, verifica imediatamente se já está conectado
  const status = await window.api.waStatus()
  console.log('[wizard] ao entrar no passo 2, waStatus =', status)
  if (status === 'conectado') {
    document.getElementById('wzQrArea').classList.add('hidden')
    document.getElementById('wzConectado').classList.remove('hidden')
    document.getElementById('wzProximo2').disabled = false
    console.log('[wizard] wzProximo2 habilitado')
  }
})

document.getElementById('wzVoltar2').addEventListener('click', () => irParaPasso(1))

document.getElementById('wzProximo2').addEventListener('click', async () => {
  console.log('[wizard] botão Próximo2 clicado')
  try {
    const status = await window.api.waStatus()
    console.log('[wizard] waStatus =', status)
    if (status !== 'conectado') {
      alert('Conecte o WhatsApp antes de continuar.')
      return
    }
    irParaPasso(3)
  } catch (e) {
    console.error('[wizard] erro no clique Próximo2:', e)
  }
})

document.getElementById('wzVoltar3').addEventListener('click', () => irParaPasso(2))

document.getElementById('wzConcluir').addEventListener('click', async () => {
  const cliente = {
    cliente:        document.getElementById('wzCliente').value.trim(),
    whatsapp:       document.getElementById('wzWhatsapp').value.trim(),
    dia_vencimento: document.getElementById('wzDia').value.trim(),
    chave_pix:      document.getElementById('wzPix').value.trim(),
    ativo:          'sim'
  }

  if (cliente.cliente && cliente.whatsapp && cliente.dia_vencimento && cliente.chave_pix) {
    const lista = await window.api.listarClientes()
    lista.push(cliente)
    await window.api.salvarClientes(lista)
  }

  const cfg = await window.api.lerConfig()
  cfg.configurado = true
  cfg.agencia = document.getElementById('wzAgencia').value.trim()
  await window.api.salvarConfig(cfg)

  document.getElementById('wizardOverlay').classList.add('hidden')
  await atualizarDashboard()
  carregarClientes()
})

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init () {
  const [status, pausado, cfg] = await Promise.all([
    window.api.waStatus(),
    window.api.statusServico(),
    window.api.lerConfig()
  ])
  aplicarStatus(status)
  aplicarEstadoServico(pausado)
  await atualizarDashboard()

  // Mostra wizard se for primeiro acesso
  // Dupla checagem: ignora wizard se agencia já estiver configurada (proteção contra race condition)
  if (!cfg.configurado && !cfg.agencia) {
    document.getElementById('wizardOverlay').classList.remove('hidden')
    // Se WhatsApp já estava conectado antes de abrir o wizard, habilita botão
    if (status === 'conectado') {
      document.getElementById('wzQrArea').classList.add('hidden')
      document.getElementById('wzConectado').classList.remove('hidden')
      document.getElementById('wzProximo2').disabled = false
    }
  }
}

init()
