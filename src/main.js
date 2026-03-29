const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')
const { Client, LocalAuth } = require('whatsapp-web.js')
const schedule = require('node-schedule')
const { parse } = require('csv-parse/sync')
const { stringify } = require('csv-stringify/sync')
const QRCode = require('qrcode')

// ---------------------------------------------------------------------------
// Caminhos
// ---------------------------------------------------------------------------
const ROOT       = path.join(__dirname, '..')
const CSV_PATH   = path.join(ROOT, 'clientes.csv')
const LOG_PATH   = path.join(ROOT, 'logs', 'historico.log')
const SESSAO_DIR = path.join(ROOT, 'sessao')
const CONFIG_PATH = path.join(ROOT, 'config.json')

fs.mkdirSync(path.join(ROOT, 'logs'), { recursive: true })

// Garante instância única — se já estiver rodando, foca a janela existente
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function lerConfig () {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) }
  catch { return { horario: '09:00', diasAntecedencia: 5 } }
}
function salvarConfig (cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------
function log (msg) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`
  fs.appendFileSync(LOG_PATH, linha + '\n')
  return linha
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------
function lerClientes () {
  if (!fs.existsSync(CSV_PATH)) return []
  const raw = fs.readFileSync(CSV_PATH, 'utf8')
  return parse(raw, { delimiter: ';', columns: true, skip_empty_lines: true })
}

function salvarClientes (clientes) {
  const csv = stringify(clientes, { header: true, delimiter: ';' })
  fs.writeFileSync(CSV_PATH, csv)
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------
let waClient   = null
let waStatus   = 'desconectado'
let mainWindow = null
let tray       = null
let isQuitting = false

// ---------------------------------------------------------------------------
// Tray — ícone na barra de menu
// ---------------------------------------------------------------------------
// Ícones de tray pré-gerados em assets/tray/ (cross-platform)
const ICONES_TRAY = {}

function carregarIconesTray () {
  const trayDir = path.join(ROOT, 'assets', 'tray')
  for (const nome of ['verde', 'vermelho', 'amarelo']) {
    const arquivo = path.join(trayDir, `tray-${nome}.png`)
    try {
      ICONES_TRAY[nome] = nativeImage.createFromPath(arquivo).resize({ width: 22, height: 22, quality: 'best' })
    } catch (e) { console.error(`Erro ao carregar ícone tray-${nome}:`, e.message) }
  }
}

function iconeTray (tipo) {
  return ICONES_TRAY[tipo] || ICONES_TRAY.vermelho || nativeImage.createEmpty()
}

function atualizarTray () {
  if (!tray) return
  const cfg = lerConfig()
  const pausado = cfg.pausado || false

  let icone, statusLabel
  if (pausado) {
    icone = iconeTray('amarelo')
    statusLabel = '⏸ Serviço pausado'
  } else if (waStatus === 'conectado') {
    icone = iconeTray('verde')
    statusLabel = '✅ Rodando normalmente'
  } else {
    icone = iconeTray('vermelho')
    statusLabel = '❌ WhatsApp desconectado'
  }

  tray.setImage(icone)

  const menu = Menu.buildFromTemplate([
    { label: '💸 Forster Lembretes', enabled: false },
    { label: statusLabel,            enabled: false },
    { type: 'separator' },
    { label: 'Abrir',  click: () => { if (process.platform === 'darwin') app.dock?.show(); mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    {
      label: pausado ? '▶ Reativar serviço' : '⏸ Pausar serviço',
      click: () => alternarPausa()
    },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(statusLabel)
}

function criarTray () {
  tray = new Tray(iconeTray('vermelho'))
  atualizarTray()
}

// ---------------------------------------------------------------------------
// Pausar / Reativar
// ---------------------------------------------------------------------------
function alternarPausa () {
  const cfg = lerConfig()
  cfg.pausado = !cfg.pausado
  salvarConfig(cfg)
  atualizarTray()
  mainWindow?.webContents.send('servico:status', cfg.pausado)
  log(cfg.pausado ? 'Serviço pausado pelo usuário' : 'Serviço reativado pelo usuário')
}

function matarChromiumOrfao () {
  try {
    const { execSync } = require('child_process')
    // Mata processos Chromium órfãos do Puppeteer (não do Google Chrome nem do Electron)
    const ps = execSync('ps aux', { encoding: 'utf8' })
    ps.split('\n')
      .filter(l => l.includes('chromium') || l.includes('headless_shell'))
      .filter(l => l.includes('sessao/session') || l.includes('puppeteer'))
      .filter(l => !l.includes('Google Chrome'))
      .forEach(l => {
        const pid = l.trim().split(/\s+/)[1]
        if (pid) try { process.kill(Number(pid), 'SIGKILL') } catch (_) {}
      })
  } catch (_) {}
}

function criarCliente () {
  log('Iniciando conexão WhatsApp...')

  // Mata processos Chromium órfãos que impedem o Puppeteer de iniciar
  matarChromiumOrfao()

  // Remove lock files do Chromium que ficam presos quando o app fecha abruptamente
  ;['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(f => {
    try { fs.unlinkSync(path.join(SESSAO_DIR, 'session', f)) } catch (_) {}
  })

  // Resolve o caminho do Chrome for Testing no cache do Puppeteer
  const cacheBase = path.join(require('os').homedir(), '.cache', 'puppeteer', 'chrome')
  let chromePath = null
  try {
    const dirs = fs.readdirSync(cacheBase).filter(d => d.startsWith('mac_arm'))
    if (dirs.length > 0) {
      const latest = dirs.sort().pop()
      const candidate = path.join(cacheBase, latest, 'chrome-mac-arm64',
        'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
      if (fs.existsSync(candidate)) chromePath = candidate
    }
  } catch (_) {}

  // Fallback para o Google Chrome instalado
  if (!chromePath) {
    const fallback = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    if (fs.existsSync(fallback)) chromePath = fallback
  }

  log(chromePath ? `Chrome encontrado: ${chromePath}` : 'Chrome NÃO encontrado — Puppeteer usará o padrão')

  const puppeteerOpts = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run'
    ]
  }
  if (chromePath) puppeteerOpts.executablePath = chromePath

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSAO_DIR }),
    puppeteer: puppeteerOpts
  })

  waClient.on('loading_screen', (percent) => {
    log(`WhatsApp carregando: ${percent}%`)
  })

  waClient.on('qr', async qr => {
    log('QR code recebido — aguardando escaneamento')
    waStatus = 'aguardando_qr'
    const dataUrl = await QRCode.toDataURL(qr, { width: 220, margin: 1 })
    mainWindow?.webContents.send('wa:qr', dataUrl)
  })

  waClient.on('authenticated', () => {
    log('Sessão autenticada — carregando chats...')
    waStatus = 'autenticando'
    mainWindow?.webContents.send('wa:status', 'autenticando')
  })

  waClient.on('auth_failure', () => {
    log('Falha na autenticação — sessão expirada?')
  })

  waClient.on('ready', () => {
    waStatus = 'conectado'
    mainWindow?.webContents.send('wa:status', 'conectado')
    log('WhatsApp conectado')
    atualizarTray()
    configurarAgendamento()
    configurarMensagensAgendadas()
  })

  // auth_failure já logado acima — aqui só atualiza estado da UI
  waClient.on('auth_failure', () => {
    waStatus = 'erro'
    mainWindow?.webContents.send('wa:status', 'erro')
    atualizarTray()
  })

  waClient.on('disconnected', async () => {
    waStatus = 'desconectado'
    mainWindow?.webContents.send('wa:status', 'desconectado')
    log('WhatsApp desconectado — tentando reconectar em 30s...')
    atualizarTray()

    // Reconexão automática após desconexão
    await new Promise(r => setTimeout(r, 30000))
    try {
      await waClient.destroy().catch(() => {})
    } catch (_) {}
    criarCliente()
  })

  log('Chamando waClient.initialize()...')
  waClient.initialize().catch(async (err) => {
    log(`Erro ao inicializar WhatsApp: ${err.message} — tentando novamente em 15s...`)
    waStatus = 'erro'
    mainWindow?.webContents.send('wa:status', 'erro')
    atualizarTray()

    await new Promise(r => setTimeout(r, 15000))
    try {
      await waClient.destroy().catch(() => {})
    } catch (_) {}
    criarCliente()
  })
}

const MSG_PADRAO = 'Olá, {nome}! Lembrete automático da Forster Filmes: o pagamento de {mes}/{ano} vence dia {data}. Chave PIX: {pix}. Em caso de dúvidas, estamos à disposição!'

async function enviarMensagem (cliente, dataFmt) {
  const [, mes] = dataFmt.split('/')
  const meses = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro']
  const nomeMes = meses[parseInt(mes, 10) - 1]
  const ano = new Date().getFullYear()

  const cfg = lerConfig()
  const template = cfg.mensagem || MSG_PADRAO
  const mensagem = template
    .replace(/\{nome\}/g, cliente.cliente)
    .replace(/\{mes\}/g,  nomeMes)
    .replace(/\{ano\}/g,  ano)
    .replace(/\{data\}/g, dataFmt)
    .replace(/\{pix\}/g,  cliente.chave_pix)

  const numero = cliente.whatsapp.replace(/\D/g, '')
  const suffix = numero.slice(-8)
  const chats = await waClient.getChats()
  const chat = chats.find(c => !c.isGroup && c.id.user.endsWith(suffix))

  if (!chat) throw new Error(`Chat não encontrado para ${cliente.whatsapp}`)

  await chat.sendMessage(mensagem)
  await new Promise(r => setTimeout(r, 5000))
  return mensagem
}

// ---------------------------------------------------------------------------
// Envio livre — mensagem customizada para qualquer número
// ---------------------------------------------------------------------------
const AGENDADOS_PATH = path.join(ROOT, 'agendados.json')

function lerAgendados () {
  try { return JSON.parse(fs.readFileSync(AGENDADOS_PATH, 'utf8')) }
  catch { return [] }
}

function salvarAgendados (lista) {
  fs.writeFileSync(AGENDADOS_PATH, JSON.stringify(lista, null, 2))
}

async function enviarMensagemLivre (numero, mensagem) {
  if (waStatus !== 'conectado') throw new Error('WhatsApp não está conectado')

  const num = numero.replace(/\D/g, '')

  // Tenta encontrar chat existente primeiro (mais confiável)
  const suffix = num.slice(-8)
  const chats = await waClient.getChats()
  const chat = chats.find(c => !c.isGroup && c.id.user.endsWith(suffix))

  if (chat) {
    await chat.sendMessage(mensagem)
  } else {
    // Número sem conversa carregada: resolve o ID via getNumberId
    const numberId = await waClient.getNumberId(num)
    if (!numberId) throw new Error(`Número ${numero} não encontrado no WhatsApp`)
    await waClient.sendMessage(numberId._serialized, mensagem)
  }

  await new Promise(r => setTimeout(r, 5000))
  log(`✓ Mensagem livre enviada → ${numero}`)
  return true
}

// Jobs agendados (mensagens livres com horário programado)
let jobsAgendados = []

function configurarMensagensAgendadas () {
  // Cancela jobs anteriores
  jobsAgendados.forEach(j => j.job?.cancel())
  jobsAgendados = []

  const agendados = lerAgendados()
  const agora = new Date()

  for (const item of agendados) {
    const dataEnvio = new Date(item.dataEnvio)
    if (dataEnvio <= agora) continue // já passou

    const job = schedule.scheduleJob(dataEnvio, async () => {
      try {
        await enviarMensagemLivre(item.numero, item.mensagem)
        new Notification({
          title: '💸 Forster Lembretes',
          body: `✓ Mensagem agendada enviada → ${item.numero}`,
          timeoutType: 'never'
        }).show()
      } catch (e) {
        log(`✗ Falha ao enviar agendada → ${item.numero}: ${e.message}`)
        new Notification({
          title: '💸 Forster Lembretes',
          body: `✗ Falha ao enviar para ${item.numero}`,
          timeoutType: 'never'
        }).show()
      }
      // Remove da lista após envio
      const lista = lerAgendados().filter(a => a.id !== item.id)
      salvarAgendados(lista)
      mainWindow?.webContents.send('agendados:atualizado', lista)
    })

    jobsAgendados.push({ id: item.id, job })
  }
}

// ---------------------------------------------------------------------------
// Agendamento
// ---------------------------------------------------------------------------
let jobAgendado = null

function configurarAgendamento () {
  if (jobAgendado) jobAgendado.cancel()

  const cfg = lerConfig()
  const [hora, minuto] = cfg.horario.split(':').map(Number)

  jobAgendado = schedule.scheduleJob({ hour: hora, minute: minuto }, () => {
    verificarEDisparar()
  })
}

async function verificarEDisparar () {
  const cfg = lerConfig()
  const clientes = lerClientes()
  const hoje = new Date()

  if (cfg.pausado) { log('Verificação ignorada — serviço pausado'); return }

  const dias = cfg.diasAntecedencia || 5
  const alvo = new Date(hoje)
  alvo.setDate(alvo.getDate() + dias)

  const enviados = []
  const erros = []

  for (const c of clientes) {
    if (c.ativo?.toLowerCase() !== 'sim') continue

    const dia = parseInt(c.dia_vencimento, 10)
    if (isNaN(dia) || dia !== alvo.getDate()) continue

    const dataFmt = `${String(alvo.getDate()).padStart(2,'0')}/${String(alvo.getMonth()+1).padStart(2,'0')}`

    try {
      await enviarMensagem(c, dataFmt)
      const linha = log(`✓ Lembrete enviado (${dias}d antes) → ${c.cliente}`)
      enviados.push(c.cliente)
      mainWindow?.webContents.send('log:nova', linha)
    } catch (e) {
      const linha = log(`✗ Falha → ${c.cliente}: ${e.message}`)
      erros.push(c.cliente)
      mainWindow?.webContents.send('log:nova', linha)
    }
  }

  // Notificação do sistema
  if (enviados.length === 0 && erros.length === 0) {
    new Notification({ title: '💸 Forster Lembretes', body: 'Sem mensagens para hoje.', timeoutType: 'never' }).show()
  } else if (erros.length === 0) {
    new Notification({ title: '💸 Forster Lembretes', body: `✓ ${enviados.length} lembrete(s) enviado(s)`, timeoutType: 'never' }).show()
  } else {
    new Notification({ title: '💸 Forster Lembretes', body: `${enviados.length} enviado(s), ${erros.length} com erro`, timeoutType: 'never' }).show()
  }

  mainWindow?.webContents.send('disparo:concluido', { enviados, erros })
}

// ---------------------------------------------------------------------------
// Janela principal
// ---------------------------------------------------------------------------
function criarJanela () {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    minWidth: 800,
    minHeight: 520,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  // Fechar a janela esconde, não encerra — o serviço continua rodando
  mainWindow.on('close', e => {
    if (isQuitting) return // permite encerrar quando app.quit() for chamado
    e.preventDefault()
    mainWindow.hide()
    if (process.platform === 'darwin') app.dock?.hide() // sai do Dock, fica só na barra
  })

  criarCliente()
  carregarIconesTray()
  criarTray()
}

app.whenReady().then(() => {
  log('App iniciado')
  // Ícone no Dock (macOS only)
  if (process.platform === 'darwin') {
    const dockIcon = path.join(__dirname, '..', 'assets', 'icon.png')
    if (fs.existsSync(dockIcon)) app.dock?.setIcon(dockIcon)
  }
  criarJanela()
})
app.on('before-quit', () => { isQuitting = true })
app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus() })
app.on('window-all-closed', e => { if (!isQuitting) e.preventDefault() })
app.on('activate', () => { if (process.platform === 'darwin') app.dock?.show(); mainWindow?.show() })

// ---------------------------------------------------------------------------
// IPC — comunicação com o renderer
// ---------------------------------------------------------------------------
ipcMain.handle('wa:status', () => waStatus)

ipcMain.handle('clientes:listar', () => lerClientes())

ipcMain.handle('clientes:salvar', (_, clientes) => {
  salvarClientes(clientes)
  return true
})

ipcMain.handle('config:ler', () => lerConfig())

ipcMain.handle('config:salvar', (_, cfg) => {
  salvarConfig(cfg)
  configurarAgendamento()
  return true
})

ipcMain.handle('log:ler', () => {
  if (!fs.existsSync(LOG_PATH)) return []
  return fs.readFileSync(LOG_PATH, 'utf8')
    .split('\n')
    .filter(Boolean)
    .reverse()
    .slice(0, 200)
})

ipcMain.handle('disparo:testar', async (_, clienteNome) => {
  if (waStatus !== 'conectado') throw new Error('WhatsApp não está conectado')
  const clientes = lerClientes()
  const cliente = clientes.find(c => c.cliente === clienteNome)
  if (!cliente) throw new Error('Cliente não encontrado')
  const hoje = new Date()
  const dataFmt = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}`
  await enviarMensagem(cliente, dataFmt)
  return true
})

ipcMain.handle('disparo:rodar', async () => {
  if (waStatus !== 'conectado') throw new Error('WhatsApp não está conectado')
  await verificarEDisparar()
  return true
})

ipcMain.handle('servico:status', () => lerConfig().pausado || false)

ipcMain.handle('servico:pausar', () => {
  const cfg = lerConfig()
  cfg.pausado = true
  salvarConfig(cfg)
  atualizarTray()
  mainWindow?.webContents.send('servico:status', true)
  log('Serviço pausado pelo usuário')
  return true
})

ipcMain.handle('servico:reativar', () => {
  const cfg = lerConfig()
  cfg.pausado = false
  salvarConfig(cfg)
  atualizarTray()
  mainWindow?.webContents.send('servico:status', false)
  log('Serviço reativado pelo usuário')
  return true
})

// ---------------------------------------------------------------------------
// IPC — Envio livre e agendamento
// ---------------------------------------------------------------------------
ipcMain.handle('mensagem:enviar-livre', async (_, { numero, mensagem }) => {
  await enviarMensagemLivre(numero, mensagem)
  return true
})

ipcMain.handle('mensagem:agendar', (_, { numero, mensagem, dataEnvio }) => {
  const agendados = lerAgendados()
  const item = {
    id: Date.now().toString(),
    numero,
    mensagem,
    dataEnvio,
    criadoEm: new Date().toISOString()
  }
  agendados.push(item)
  salvarAgendados(agendados)
  configurarMensagensAgendadas()
  log(`Mensagem agendada → ${numero} para ${new Date(dataEnvio).toLocaleString('pt-BR')}`)
  return item
})

ipcMain.handle('mensagem:listar-agendadas', () => lerAgendados())

ipcMain.handle('mensagem:cancelar-agendada', (_, id) => {
  const agendados = lerAgendados().filter(a => a.id !== id)
  salvarAgendados(agendados)
  configurarMensagensAgendadas()
  log(`Mensagem agendada cancelada (id: ${id})`)
  return agendados
})

ipcMain.handle('servico:desinstalar', async () => {
  const { execSync } = require('child_process')
  if (process.platform === 'win32') {
    try { execSync('schtasks /delete /tn "ForsterLembretes" /f', { stdio: 'ignore' }) } catch {}
  } else {
    const plist = path.join(app.getPath('home'), 'Library/LaunchAgents/com.forsterfilmes.lembretes.plist')
    try { execSync(`launchctl unload "${plist}" 2>/dev/null; rm -f "${plist}"`) } catch {}
  }
  if (waClient) await waClient.destroy()
  log('Sistema desinstalado pelo usuário')
  app.exit(0)
})
