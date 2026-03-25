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
// Gera os 3 ícones de tray em PNG via Swift (emoji 💸 + bolinha de status)
const ICONES_TRAY = {}

function gerarIconesTray () {
  const { execSync } = require('child_process')
  const os = require('os')

  // 3 variantes: colorido (on), cinza (off/erro), apagado (pausado)
  const variantes = [
    { nome: 'verde',    modo: 'color' },
    { nome: 'vermelho', modo: 'gray'  },
    { nome: 'amarelo',  modo: 'dim'   }
  ]

  for (const { nome, modo } of variantes) {
    const destino = path.join(os.tmpdir(), `fl-tray-${nome}.png`)
    try {
      execSync(`swift - <<'SWIFT'
import AppKit
import CoreImage

let px = CGFloat(44)
let modo = "${modo}"

// Desenha o emoji colorido em 44x44 (Retina 2x)
let base = NSImage(size: NSSize(width: px, height: px))
base.lockFocus()
if let font = NSFont(name: "Apple Color Emoji", size: 30) {
    let attrs: [NSAttributedString.Key: Any] = [.font: font]
    NSAttributedString(string: "💸", attributes: attrs).draw(at: NSPoint(x: 7, y: 7))
}
base.unlockFocus()

var final: NSImage = base

if modo == "gray" {
    // Converte para escala de cinza via CIFilter
    if let tiff = base.tiffRepresentation, let ci = CIImage(data: tiff) {
        let f = CIFilter(name: "CIColorMonochrome")!
        f.setValue(ci, forKey: kCIInputImageKey)
        f.setValue(CIColor(red: 0.5, green: 0.5, blue: 0.5), forKey: kCIInputColorKey)
        f.setValue(1.0, forKey: kCIInputIntensityKey)
        let ctx = CIContext()
        if let cg = ctx.createCGImage(f.outputImage!, from: ci.extent) {
            final = NSImage(cgImage: cg, size: NSSize(width: px, height: px))
        }
    }
} else if modo == "dim" {
    // Apaga levemente com overlay semitransparente
    let dim = NSImage(size: NSSize(width: px, height: px))
    dim.lockFocus()
    base.draw(in: NSRect(x: 0, y: 0, width: px, height: px),
              from: NSRect(x: 0, y: 0, width: px, height: px),
              operation: .sourceOver, fraction: 0.45)
    dim.unlockFocus()
    final = dim
}

if let tiff = final.tiffRepresentation,
   let rep = NSBitmapImageRep(data: tiff),
   let png = rep.representation(using: .png, properties: [:]) {
    try! png.write(to: URL(fileURLWithPath: "${destino}"))
}
SWIFT`)
      ICONES_TRAY[nome] = nativeImage.createFromPath(destino).resize({ width: 22, height: 22, quality: 'best' })
    } catch (e) { console.error('Erro ao gerar ícone tray:', e.message) }
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
    { label: 'Abrir',  click: () => { if (process.platform === 'darwin') app.dock.show(); mainWindow?.show(); mainWindow?.focus() } },
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

function criarCliente () {
  // Remove lock files do Chromium que ficam presos quando o app fecha abruptamente
  ;['SingletonLock', 'SingletonCookie', 'SingletonSocket'].forEach(f => {
    try { fs.unlinkSync(path.join(SESSAO_DIR, 'session', f)) } catch (_) {}
  })

  waClient = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSAO_DIR }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  })

  waClient.on('qr', async qr => {
    waStatus = 'aguardando_qr'
    const dataUrl = await QRCode.toDataURL(qr, { width: 220, margin: 1 })
    mainWindow?.webContents.send('wa:qr', dataUrl)
  })

  waClient.on('authenticated', () => {
    waStatus = 'autenticando'
    mainWindow?.webContents.send('wa:status', 'autenticando')
  })

  waClient.on('ready', () => {
    waStatus = 'conectado'
    mainWindow?.webContents.send('wa:status', 'conectado')
    log('WhatsApp conectado')
    atualizarTray()
    configurarAgendamento()
  })

  waClient.on('auth_failure', () => {
    waStatus = 'erro'
    mainWindow?.webContents.send('wa:status', 'erro')
    atualizarTray()
  })

  waClient.on('disconnected', () => {
    waStatus = 'desconectado'
    mainWindow?.webContents.send('wa:status', 'desconectado')
    log('WhatsApp desconectado')
    atualizarTray()
  })

  waClient.initialize()
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

  // Notificação macOS
  if (enviados.length === 0 && erros.length === 0) {
    new Notification({ title: '💸 Forster Lembretes', body: 'Sem mensagens para hoje.' }).show()
  } else if (erros.length === 0) {
    new Notification({ title: '💸 Forster Lembretes', body: `✓ ${enviados.length} lembrete(s) enviado(s)` }).show()
  } else {
    new Notification({ title: '💸 Forster Lembretes', body: `${enviados.length} enviado(s), ${erros.length} com erro` }).show()
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
    titleBarStyle: 'hiddenInset',
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
    if (process.platform === 'darwin') app.dock.hide() // sai do Dock, fica só na barra
  })

  criarCliente()
  gerarIconesTray()
  criarTray()
}

app.whenReady().then(() => {
  // Ícone no Dock
  const dockIcon = path.join(__dirname, '..', 'assets', 'icon.png')
  if (process.platform === 'darwin' && require('fs').existsSync(dockIcon)) {
    app.dock.setIcon(dockIcon)
  }
  criarJanela()
})
app.on('before-quit', () => { isQuitting = true })
app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus() })
app.on('window-all-closed', e => { if (!isQuitting) e.preventDefault() })
app.on('activate', () => { if (process.platform === 'darwin') app.dock.show(); mainWindow?.show() })

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

ipcMain.handle('servico:desinstalar', async () => {
  const { execSync } = require('child_process')
  const plist = path.join(app.getPath('home'), 'Library/LaunchAgents/com.forsterfilmes.lembretes.plist')
  try { execSync(`launchctl unload "${plist}" 2>/dev/null; rm -f "${plist}"`) } catch {}
  if (waClient) await waClient.destroy()
  log('Sistema desinstalado pelo usuário')
  app.exit(0)
})
