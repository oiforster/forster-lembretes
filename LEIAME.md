# Forster Lembretes

Sistema de lembretes automaticos de pagamento via WhatsApp para a Forster Filmes.

---

## O que faz

App Electron que roda em background no Mac, conectado ao WhatsApp Web via whatsapp-web.js + Puppeteer. Funcionalidades:

1. **Lembretes automaticos** — todo dia no horario configurado, verifica quais clientes tem vencimento proximo e envia mensagem pelo seu numero do WhatsApp
2. **Mensagens livres** — envio de mensagens de texto para qualquer numero ou grupo, imediatas ou agendadas
3. **Envio de midia** — envio de arquivos (PDF, imagem) com mensagem, imediato ou agendado. Usado pela automacao de NFS-e para enviar notas fiscais aos clientes

**Exemplo de lembrete enviado:**
> Ola, Vanessa! Lembrete automatico da Forster Filmes: o pagamento de abril/2026 vence dia 10/04. Chave PIX: 35.935.852/0001-55. Em caso de duvidas, estamos a disposicao!

---

## Instalacao (macOS)

### Pre-requisitos
- macOS 12 ou superior
- Node.js 18+ e npm
- WhatsApp instalado no celular

### Passo a passo

**1. Clone o repositorio**
```bash
cd ~/Documents && git clone git@github.com:oiforster/forster-lembretes.git
```

**2. Instale as dependencias**
```bash
cd ~/Documents/forster-lembretes && npm install
```

**3. Inicie o app**
```bash
cd ~/Documents/forster-lembretes && npx electron .
```

**4. Autentique o WhatsApp**
Na primeira execucao, o app exibe um QR code na janela. Escaneie com o celular (WhatsApp > Aparelhos conectados > Adicionar aparelho). A sessao fica salva em `sessao/` — nao precisa repetir.

**5. Preencha os clientes**
Edite `clientes.csv`:
```
cliente;whatsapp;dia_vencimento;chave_pix;ativo
Vanessa Mainardi;5551984058878;10;35.935.852/0001-55;sim
```

---

## Inicializacao automatica

O app e iniciado automaticamente pelo launchd ao fazer login no Mac:

```
~/Library/LaunchAgents/com.forsterfilmes.lembretes.plist
```

Roda em background com icone na barra de menu (tray). Fechar a janela nao encerra o servico — so esconde.

---

## Estrutura de arquivos

```
forster-lembretes/
├── src/
│   ├── main.js              → processo principal Electron (WhatsApp, agendamento, IPC)
│   ├── preload.js           → APIs expostas ao renderer (contextBridge)
│   └── renderer/
│       ├── index.html        → interface do app
│       └── app.js            → logica do frontend
├── assets/
│   ├── icon.png              → icone do app
│   └── tray/                 → icones da barra de menu (verde/amarelo/vermelho)
├── clientes.csv              → lista de clientes com vencimentos
├── config.json               → configuracoes (horario, dias de antecedencia, mensagem)
├── agendados.json            → fila de mensagens agendadas (texto e/ou midia)
├── enviar-livre.js           → script CLI standalone (NAO usar com app rodando)
├── sessao/                   → dados de autenticacao WhatsApp (nao apagar)
└── logs/
    ├── historico.log          → registro de todos os envios
    ├── output.log             → saida do launchd
    └── error.log              → erros do launchd
```

---

## Funcionalidades

### Lembretes automaticos

Configurados via `config.json`:
```json
{
  "horario": "09:00",
  "diasAntecedencia": 5,
  "mensagem": "Ola, {nome}! Lembrete automatico da Forster Filmes: ..."
}
```

Variaveis disponiveis no template: `{nome}`, `{mes}`, `{ano}`, `{data}`, `{pix}`.

### Mensagens agendadas (texto e midia)

O arquivo `agendados.json` e a fila de mensagens programadas. Cada item pode ser texto simples ou texto + arquivo:

**Texto simples:**
```json
{
  "id": "identificador_unico",
  "numero": "5551999431060",
  "mensagem": "Texto da mensagem",
  "dataEnvio": "2026-04-05T09:00:00-03:00",
  "criadoEm": "2026-04-05T07:00:00-03:00"
}
```

**Texto + arquivo (PDF, imagem):**
```json
{
  "id": "nfse-33-1743858000",
  "numero": "5551984058878",
  "mensagem": "Bom dia! Segue a Nota Fiscal referente a abril/2026.",
  "media": "/caminho/completo/para/o/arquivo.pdf",
  "dataEnvio": "2026-04-05T09:00:00-03:00",
  "criadoEm": "2026-04-05T07:00:00-03:00"
}
```

O campo `media` e opcional. Se presente, o arquivo e enviado como documento do WhatsApp com a mensagem como caption.

**Hot-reload:** o app monitora `agendados.json` via polling (10s). Quando o arquivo e modificado externamente (por um script Python, por exemplo), os agendamentos sao recarregados automaticamente — sem necessidade de reiniciar o app.

Mensagens enviadas sao removidas automaticamente do `agendados.json`.

### Grupos

Envio para grupos funciona de duas formas:
- Chat ID direto: `"numero": "120363419348606047@g.us"`
- Busca por nome: `"numero": "grupo:Nome do Grupo"`

### IPC handlers disponiveis

| Handler | Parametros | Descricao |
|---|---|---|
| `mensagem:enviar-livre` | `{ numero, mensagem }` | Envio imediato de texto |
| `mensagem:enviar-media` | `{ numero, mensagem, media }` | Envio imediato de arquivo + caption |
| `mensagem:agendar` | `{ numero, mensagem, dataEnvio }` | Agenda mensagem de texto |
| `mensagem:listar-agendadas` | — | Lista agendamentos pendentes |
| `mensagem:cancelar-agendada` | `id` | Cancela um agendamento |

---

## Integracao com NFS-e

O sistema de emissao automatica de NFS-e (`~/Documents/forster-tools/notas-fiscais/`) usa o Forster Lembretes para enviar as notas fiscais em PDF aos clientes:

1. `emitir_nfs_nacional.py` emite NFS-e as 07:00 do dia 5
2. Apos emissao, chama `agendar_whatsapp_nfse.py`
3. O script cria entradas no `agendados.json` com `media` = path do PDF
4. O polling do Forster Lembretes detecta a mudanca e carrega os novos jobs
5. As 09:00, cada cliente recebe o PDF da NFS-e + mensagem de cobranca

---

## Manutencao

### Adicionar/remover cliente
Edite `clientes.csv`. Colunas: `cliente;whatsapp;dia_vencimento;chave_pix;ativo`.

### Pausar/reativar servico
Pelo icone na barra de menu, ou pela interface do app.

### Reiniciar o app
```bash
pkill -9 -f "forster-lembretes" && sleep 2 && rm -f ~/Documents/forster-lembretes/sessao/session/Singleton* && cd ~/Documents/forster-lembretes && nohup /opt/homebrew/bin/node node_modules/.bin/electron . > /dev/null 2>&1 &
```

### Ver historico de envios
```bash
tail -20 ~/Documents/forster-lembretes/logs/historico.log
```

### Ver erros
```bash
cat ~/Documents/forster-lembretes/logs/error.log
```

---

## O que NAO apagar

| Arquivo/Pasta | Consequencia |
|---|---|
| `sessao/` | Precisa escanear QR code de novo |
| `clientes.csv` | Perde a lista de clientes |
| `config.json` | Perde configuracoes (horario, mensagem) |
| `agendados.json` | Perde mensagens agendadas pendentes |

---

## Requisitos tecnicos

- macOS 12+
- Node.js 18+
- Electron (instalado via npm)
- whatsapp-web.js + Puppeteer (instalados via npm)
