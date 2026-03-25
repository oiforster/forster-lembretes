# 💸 Forster Lembretes

Sistema de lembretes automáticos de pagamento via WhatsApp para agências e produtoras.

---

## O que faz

Todo dia às 9h, verifica quais clientes têm vencimento daqui a 5 dias e envia uma mensagem automática pelo **seu próprio número do WhatsApp** — sem aplicativos terceiros, sem mensalidade.

**Exemplo de mensagem enviada:**
> Olá, Vanessa! Lembrete automático da Forster Filmes: o pagamento de março/2026 vence dia 10/03. Chave PIX: 35.935.852/0001-55. Em caso de dúvidas, estamos à disposição!

---

## Instalação (macOS)

### Pré-requisitos
- macOS 12 ou superior
- Conexão com a internet
- WhatsApp instalado no celular

### Passo a passo

**1. Clone ou copie os arquivos para a pasta correta**
```
~/Documents/forster-lembretes/
```

**2. Abra o Terminal e execute**
```bash
bash ~/Documents/forster-lembretes/instalar.sh
```
O script verifica e instala automaticamente: Homebrew, Node.js, Python 3, dependências npm e agendamento.

**3. Autentique o WhatsApp (feito uma única vez)**
```bash
node ~/Documents/forster-lembretes/disparar.js "Teste" "SEU_NUMERO" "01/01" "sua-chave-pix"
```
- Um QR code aparecerá no Terminal
- Abra o WhatsApp no celular → **Configurações → Aparelhos conectados → Adicionar aparelho**
- Escaneie o QR code
- Pronto — a sessão fica salva e não precisa repetir

**4. Preencha os clientes**

Edite o arquivo `clientes.csv` com os dados de cada cliente:
```
cliente;whatsapp;dia_vencimento;chave_pix;ativo
Vanessa Mainardi;5551984058878;10;35.935.852/0001-55;sim
```

---

## Estrutura de arquivos

```
forster-lembretes/
├── instalar.sh          → script de instalação automática
├── verificar.py         → verifica vencimentos e aciona envios
├── disparar.js          → conecta ao WhatsApp Web e envia mensagens
├── clientes.csv         → lista de clientes (edite aqui)
├── package.json         → dependências Node.js
├── LEIAME.md            → esta documentação
├── sessao/              → dados de autenticação do WhatsApp (não apagar)
└── logs/
    ├── historico.log    → registro de todos os envios
    ├── output.log       → saída do agendamento automático
    └── error.log        → erros do agendamento automático
```

---

## Manutenção do dia a dia

### Adicionar um cliente
Abra `clientes.csv` e adicione uma linha:
```
Nome do Cliente;5551999999999;15;00.000.000/0001-00;sim
```

### Pausar um cliente temporariamente
Mude `sim` para `não` na coluna `ativo`.

### Alterar chave PIX
Edite a coluna `chave_pix` na linha do cliente.

### Testar sem enviar
```bash
python3 ~/Documents/forster-lembretes/verificar.py --teste
```

---

## Após formatar o Mac

1. Restaure a pasta `forster-lembretes` do seu backup (Synology/Time Machine)
2. Execute:
```bash
bash ~/Documents/forster-lembretes/instalar.sh
```
3. Escaneie o QR code novamente (único passo manual)

> **Atenção:** a pasta `sessao/` contém a autenticação do WhatsApp. Se ela for apagada, será necessário escanear o QR code novamente. Nada mais.

---

## O que NÃO apagar

| Arquivo/Pasta | Consequência se apagar |
|---|---|
| `sessao/` | Precisa escanear QR code de novo |
| `clientes.csv` | Perde a lista de clientes |
| `disparar.js` | Sistema para de funcionar |
| `verificar.py` | Sistema para de funcionar |

---

## Perguntas frequentes

**Precisa ter o WhatsApp aberto no Mac?**
Não. O sistema abre uma conexão invisível em background.

**Funciona se o Mac estiver dormindo às 9h?**
Se o Mac estiver completamente desligado, o script não roda. Em modo de repouso (sleep), o macOS acorda automaticamente para executar tarefas agendadas pelo launchd.

**Posso mudar o horário de envio?**
Sim. Edite o arquivo `~/Library/LaunchAgents/com.forsterfilmes.lembretes.plist` e altere o valor de `Hour`. Depois rode:
```bash
launchctl unload ~/Library/LaunchAgents/com.forsterfilmes.lembretes.plist
launchctl load ~/Library/LaunchAgents/com.forsterfilmes.lembretes.plist
```

**Como vejo o histórico de envios?**
```bash
cat ~/Documents/forster-lembretes/logs/historico.log
```

---

## Requisitos técnicos

- macOS 12+
- Node.js 18+
- Python 3.9+
- Homebrew (instalado automaticamente pelo `instalar.sh`)
