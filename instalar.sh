#!/bin/bash
# =============================================================================
# instalar.sh — Forster Lembretes
# Setup automático para macOS
# Repositório: https://github.com/forsterfilmes/forster-lembretes
# =============================================================================

set -e

VERDE='\033[0;32m'
AMARELO='\033[1;33m'
VERMELHO='\033[0;31m'
RESET='\033[0m'

ok()   { echo -e "${VERDE}✓ $1${RESET}"; }
info() { echo -e "${AMARELO}→ $1${RESET}"; }
erro() { echo -e "${VERMELHO}✗ $1${RESET}"; exit 1; }

DEST="$HOME/Documents/forster-lembretes"
PLIST="$HOME/Library/LaunchAgents/com.forsterfilmes.lembretes.plist"

echo ""
echo "💸 Forster Lembretes — Instalação"
echo "=================================="
echo ""

# -----------------------------------------------------------------------------
# 1. Homebrew
# -----------------------------------------------------------------------------
info "Verificando Homebrew..."
if ! command -v brew &>/dev/null; then
    info "Instalando Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Adiciona brew ao PATH em sessões ARM (Apple Silicon)
    if [[ -f /opt/homebrew/bin/brew ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    ok "Homebrew instalado"
else
    ok "Homebrew já instalado ($(brew --version | head -1))"
fi

# -----------------------------------------------------------------------------
# 2. Node.js
# -----------------------------------------------------------------------------
info "Verificando Node.js..."
if ! command -v node &>/dev/null; then
    info "Instalando Node.js via Homebrew..."
    brew install node
    ok "Node.js instalado"
else
    ok "Node.js já instalado ($(node -v))"
fi

# -----------------------------------------------------------------------------
# 3. Python 3
# -----------------------------------------------------------------------------
info "Verificando Python 3..."
if ! command -v python3 &>/dev/null; then
    info "Instalando Python 3 via Homebrew..."
    brew install python3
    ok "Python 3 instalado"
else
    ok "Python 3 já instalado ($(python3 --version))"
fi

# -----------------------------------------------------------------------------
# 4. Estrutura de pastas
# -----------------------------------------------------------------------------
info "Criando estrutura de pastas..."
mkdir -p "$DEST/logs"
mkdir -p "$DEST/sessao"
ok "Pastas criadas em $DEST"

# -----------------------------------------------------------------------------
# 5. Dependências Node.js (whatsapp-web.js)
# -----------------------------------------------------------------------------
info "Instalando dependências Node.js..."
if [[ ! -f "$DEST/package.json" ]]; then
    erro "package.json não encontrado em $DEST. Verifique se os arquivos do repositório estão na pasta correta."
fi
cd "$DEST"
npm install --silent
ok "Dependências instaladas"

# -----------------------------------------------------------------------------
# 6. clientes.csv — cria modelo se não existir
# -----------------------------------------------------------------------------
if [[ ! -f "$DEST/clientes.csv" ]]; then
    info "Criando modelo de clientes.csv..."
    cat > "$DEST/clientes.csv" << 'CSV'
cliente;whatsapp;dia_vencimento;chave_pix;ativo
Nome do Cliente;5551999999999;10;00.000.000/0001-00;sim
CSV
    ok "Modelo clientes.csv criado — preencha com os dados reais"
else
    ok "clientes.csv já existe"
fi

# -----------------------------------------------------------------------------
# 7. LaunchAgent — abre o app automaticamente no login
# -----------------------------------------------------------------------------
info "Configurando inicialização automática no login..."

NODE_BIN="$(which node)"

cat > "$PLIST" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.forsterfilmes.lembretes</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${DEST}/node_modules/.bin/electron</string>
        <string>${DEST}</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${DEST}/logs/output.log</string>

    <key>StandardErrorPath</key>
    <string>${DEST}/logs/error.log</string>
</dict>
</plist>
PLIST

# Descarrega versão antiga se existir, carrega a nova
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
ok "Agendamento configurado"

# -----------------------------------------------------------------------------
# 8. Ícone da pasta
# -----------------------------------------------------------------------------
info "Aplicando ícone da pasta..."
swift - << 'SWIFT' 2>/dev/null && ok "Ícone aplicado" || info "Ícone não pôde ser aplicado (não crítico)"
import AppKit
let size = NSSize(width: 512, height: 512)
let image = NSImage(size: size)
image.lockFocus()
if let font = NSFont(name: "Apple Color Emoji", size: 420) {
    let attrs: [NSAttributedString.Key: Any] = [.font: font]
    NSAttributedString(string: "💸", attributes: attrs).draw(at: NSPoint(x: 46, y: 46))
}
image.unlockFocus()
let path = (NSHomeDirectory() as NSString).appendingPathComponent("Documents/forster-lembretes")
NSWorkspace.shared.setIcon(image, forFile: path, options: [])
SWIFT

# -----------------------------------------------------------------------------
# Conclusão
# -----------------------------------------------------------------------------
echo ""
echo "=================================="
ok "Instalação concluída!"
echo ""
echo "  Próximo passo obrigatório:"
echo "  Execute o comando abaixo e escaneie o QR code"
echo "  com o WhatsApp do seu celular (Aparelhos conectados):"
echo ""
echo "  node ~/Documents/forster-lembretes/disparar.js \"Teste\" \"SEU_NUMERO\" \"01/01\" \"chave-pix\""
echo ""
echo "  Após escanear, o sistema está pronto."
echo "  Lembretes serão enviados automaticamente às 9h."
echo ""
