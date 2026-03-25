# 💸 Forster Lembretes

Sistema de lembretes automáticos de pagamento via WhatsApp para agências e produtoras. Roda no seu próprio Mac, usa o seu próprio número — sem mensalidade, sem aplicativo terceiro.

---

## Como funciona

Todo dia às 9h o sistema verifica quais clientes têm vencimento em 5 dias e envia uma mensagem automática pelo seu WhatsApp:

> *Olá, Vanessa! Lembrete automático da Forster Filmes: o pagamento de março/2026 vence dia 10/03. Chave PIX: 35.935.852/0001-55. Em caso de dúvidas, estamos à disposição!*

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
Instala automaticamente: Homebrew, Node.js, Python 3 e todas as dependências.

**3. Configure seus clientes**
```bash
cp ~/Documents/forster-lembretes/clientes.csv.exemplo ~/Documents/forster-lembretes/clientes.csv
```
Edite o `clientes.csv` com os dados reais.

**4. Autentique o WhatsApp (uma única vez)**
```bash
node ~/Documents/forster-lembretes/disparar.js "Teste" "SEU_NUMERO" "01/01" "sua-chave-pix"
```
Escaneie o QR code em **WhatsApp → Configurações → Aparelhos conectados → Adicionar aparelho**.

---

## Estrutura do clientes.csv

| Campo | Descrição | Exemplo |
|---|---|---|
| `cliente` | Nome do cliente | Vanessa Mainardi |
| `whatsapp` | Número com DDI+DDD | 5551984058878 |
| `dia_vencimento` | Dia do mês | 10 |
| `chave_pix` | CNPJ, CPF ou e-mail PIX | 35.935.852/0001-55 |
| `ativo` | `sim` ou `não` | sim |

---

## Uso via terminal

```bash
# Testar sem enviar (modo seco)
python3 ~/Documents/forster-lembretes/verificar.py --teste

# Enviar mensagem manual
node ~/Documents/forster-lembretes/disparar.js "Nome" "5551999999999" "10/04" "chave-pix"

# Ver histórico de envios
cat ~/Documents/forster-lembretes/logs/historico.log
```

---

## Requisitos

- macOS 12 ou superior
- Node.js 18+ (instalado automaticamente)
- Python 3.9+ (instalado automaticamente)
- WhatsApp no celular

---

## Licença

MIT — use, adapte e distribua livremente.

---

Feito com ☕ por [Forster Filmes](https://github.com/forsterfilmes)
