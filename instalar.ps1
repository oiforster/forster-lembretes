# =============================================================================
# instalar.ps1 — Forster Lembretes
# Setup automático para Windows
# Repositório: https://github.com/oiforster/forster-lembretes
# =============================================================================

$ErrorActionPreference = "Stop"

function Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Info($msg)  { Write-Host "  → $msg" -ForegroundColor Yellow }
function Erro($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

$DEST = "$env:USERPROFILE\Documents\forster-lembretes"

Write-Host ""
Write-Host "💸 Forster Lembretes — Instalação Windows"
Write-Host "==========================================="
Write-Host ""

# -----------------------------------------------------------------------------
# 1. Node.js
# -----------------------------------------------------------------------------
Info "Verificando Node.js..."
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Info "Node.js não encontrado. Tentando instalar via winget..."
    $wingetCmd = Get-Command winget -ErrorAction SilentlyContinue
    if ($wingetCmd) {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        # Atualiza PATH na sessão atual
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeCmd) {
            Erro "Node.js foi instalado mas não está no PATH. Feche e reabra o PowerShell, depois rode este script novamente."
        }
        Ok "Node.js instalado via winget"
    } else {
        Erro "Node.js não encontrado e winget não disponível. Instale o Node.js manualmente em https://nodejs.org e rode este script novamente."
    }
} else {
    $nodeVersion = node -v
    Ok "Node.js já instalado ($nodeVersion)"
}

# -----------------------------------------------------------------------------
# 2. Estrutura de pastas
# -----------------------------------------------------------------------------
Info "Criando estrutura de pastas..."
New-Item -ItemType Directory -Force -Path "$DEST\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "$DEST\sessao" | Out-Null
Ok "Pastas criadas em $DEST"

# -----------------------------------------------------------------------------
# 3. Dependências Node.js
# -----------------------------------------------------------------------------
Info "Instalando dependências Node.js..."
if (-not (Test-Path "$DEST\package.json")) {
    Erro "package.json não encontrado em $DEST. Verifique se os arquivos do repositório estão na pasta correta."
}
Push-Location $DEST
npm install --silent 2>$null
Pop-Location
Ok "Dependências instaladas"

# -----------------------------------------------------------------------------
# 4. clientes.csv — cria modelo se não existir
# -----------------------------------------------------------------------------
if (-not (Test-Path "$DEST\clientes.csv")) {
    Info "Criando modelo de clientes.csv..."
    @"
cliente;whatsapp;dia_vencimento;chave_pix;ativo
Nome do Cliente;5551999999999;10;00.000.000/0001-00;sim
"@ | Set-Content -Path "$DEST\clientes.csv" -Encoding UTF8
    Ok "Modelo clientes.csv criado — preencha com os dados reais"
} else {
    Ok "clientes.csv já existe"
}

# -----------------------------------------------------------------------------
# 5. Atalho no Desktop
# -----------------------------------------------------------------------------
Info "Criando atalho no Desktop..."
$WshShell = New-Object -ComObject WScript.Shell
$shortcutPath = "$env:USERPROFILE\Desktop\Forster Lembretes.lnk"
$shortcut = $WshShell.CreateShortcut($shortcutPath)

$npmPath = (Get-Command npm -ErrorAction SilentlyContinue).Source
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
$electronBin = "$DEST\node_modules\.bin\electron.cmd"

$shortcut.TargetPath = $electronBin
$shortcut.Arguments = "."
$shortcut.WorkingDirectory = $DEST
$shortcut.Description = "Forster Lembretes — Lembretes de pagamento via WhatsApp"
if (Test-Path "$DEST\assets\icon.ico") {
    $shortcut.IconLocation = "$DEST\assets\icon.ico"
}
$shortcut.Save()
Ok "Atalho criado no Desktop"

# -----------------------------------------------------------------------------
# 6. Atalho no Menu Iniciar
# -----------------------------------------------------------------------------
Info "Criando atalho no Menu Iniciar..."
$startMenuPath = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Forster Lembretes.lnk"
$shortcut2 = $WshShell.CreateShortcut($startMenuPath)
$shortcut2.TargetPath = $electronBin
$shortcut2.Arguments = "."
$shortcut2.WorkingDirectory = $DEST
$shortcut2.Description = "Forster Lembretes — Lembretes de pagamento via WhatsApp"
if (Test-Path "$DEST\assets\icon.ico") {
    $shortcut2.IconLocation = "$DEST\assets\icon.ico"
}
$shortcut2.Save()
Ok "Atalho criado no Menu Iniciar"

# -----------------------------------------------------------------------------
# 7. Tarefa agendada — abre o app automaticamente no login
# -----------------------------------------------------------------------------
Info "Configurando inicialização automática no login..."

# Remove tarefa anterior se existir
schtasks /delete /tn "ForsterLembretes" /f 2>$null

# Cria nova tarefa que roda no logon do usuário
$taskAction = "cmd /c `"cd /d `"$DEST`" && `"$electronBin`" .`""
schtasks /create /tn "ForsterLembretes" /tr $taskAction /sc onlogon /rl limited /f | Out-Null

Ok "Inicialização automática configurada"

# -----------------------------------------------------------------------------
# Conclusão
# -----------------------------------------------------------------------------
Write-Host ""
Write-Host "==========================================="
Ok "Instalação concluída!"
Write-Host ""
Write-Host "  Próximo passo obrigatório:"
Write-Host "  Abra o app pelo atalho no Desktop e escaneie o QR code"
Write-Host "  com o WhatsApp do seu celular (Aparelhos conectados)."
Write-Host ""
Write-Host "  Após escanear, o sistema está pronto."
Write-Host "  Lembretes serão enviados automaticamente no horário configurado."
Write-Host ""
