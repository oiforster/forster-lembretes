# 💸 Forster Lembretes

Sistema de lembretes automáticos de pagamento via WhatsApp para agências e produtoras. Interface gráfica nativa para macOS. Roda no seu próprio Mac, usa o seu próprio número — sem mensalidade, sem aplicativo terceiro.

---

## Como funciona

O app roda em background e todo dia no horário configurado verifica quais clientes têm vencimento em X dias. A mensagem é enviada automaticamente pelo seu próprio WhatsApp:

> *Olá, Vanessa! Lembrete automático da Forster Filmes: o pagamento de março/2026 vence dia 10/03. Chave PIX: 35.935.852/0001-55. Em caso de dúvidas, estamos à disposição!*

Um ícone 💸 na barra de menu indica o status do sistema em tempo real. Ao fechar a janela, o app sai do Dock e vive apenas na barra superior — sem ocupar espaço.

---

## Instalação (macOS)

**1. Clone o repositório**
```bash
git clone https://github.com/forsterfilmes/forster-lembretes.git ~/Documents/forster-lembretes
```

**2. Execute o instalador**
```bash
bash ~/Documents/forster-lembretes/instalar.sh
```
Verifica e instala automaticamente: Homebrew, Node.js e todas as dependências.

**3. Abra o app**
```bash
cd ~/Documents/forster-lembretes && npm start
```
Na primeira abertura, um wizard guia a configuração completa:
- Nome da agência
- Conexão com WhatsApp (escaneie o QR code em Configurações → Aparelhos conectados → Adicionar aparelho)
- Configuração de horário e dias de antecedência

A partir daí o sistema roda automaticamente no login do Mac.

---

## Interface

| Tela | Função |
|---|---|
| Dashboard | Resumo: clientes ativos, próximos vencimentos, status do WhatsApp |
| Clientes | Adicionar, editar, pausar e remover clientes |
| Configurações | Horário de envio, dias de antecedência, mensagem personalizada |
| Histórico | Log de todos os envios com status ✓ ou ✗ |

---

## Ícone de status na barra de menu

| Ícone | Significado |
|---|---|
| 💸 colorido | Conectado e rodando |
| 💸 apagado | Pausado pelo usuário |
| 💸 cinza | WhatsApp desconectado ou erro |

Clique com o botão direito no ícone para abrir o app, pausar o serviço ou encerrar.

---

## Estrutura do clientes.csv

Gerenciado pela interface. Para editar manualmente:

| Campo | Descrição | Exemplo |
|---|---|---|
| `cliente` | Nome do cliente | Vanessa Mainardi |
| `whatsapp` | Número com DDI+DDD | 5551984058878 |
| `dia_vencimento` | Dia do mês | 10 |
| `chave_pix` | CNPJ, CPF ou e-mail PIX | 35.935.852/0001-55 |
| `ativo` | `sim` ou `não` | sim |

---

## O que não apagar após formatar o Mac

| Item | Importância |
|---|---|
| `clientes.csv` | Dados dos clientes |
| `config.json` | Configurações salvas |
| Pasta `sessao/` | Sessão do WhatsApp — evita novo QR code |

Após formatar: clone o repositório, rode `instalar.sh` e restaure esses três itens.

---

## Comandos úteis

```bash
# Iniciar o app
cd ~/Documents/forster-lembretes && npm start

# Testar verificação sem enviar mensagens
python3 ~/Documents/forster-lembretes/verificar.py --teste

# Ver histórico de envios
cat ~/Documents/forster-lembretes/logs/historico.log
```

---

## Requisitos

- macOS 12 ou superior (Apple Silicon ou Intel)
- Node.js 18+ (instalado automaticamente)
- WhatsApp instalado no celular

---

## Licença

MIT — use, adapte e distribua livremente.

---

Feito com ☕ por [Forster Filmes](https://github.com/forsterfilmes)
