/**
 * disparar.js — Forster Filmes
 * Envia um lembrete de pagamento via WhatsApp Web.
 *
 * Uso: node disparar.js "Nome Cliente" "5551999999999" "10/04" "chave-pix"
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const [, , nome, whatsapp, data, chavePix] = process.argv;

if (!nome || !whatsapp || !data || !chavePix) {
    console.error('Uso: node disparar.js "Nome" "5551999999999" "DD/MM" "chave-pix"');
    process.exit(1);
}

// Monta o mês por extenso em português a partir de "DD/MM"
const [, mes] = data.split('/');
const meses = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];
const nomeMes = meses[parseInt(mes, 10) - 1];
const ano = new Date().getFullYear();

const mensagem =
    `Olá, ${nome}! Lembrete automático da Forster Filmes: ` +
    `o pagamento de ${nomeMes}/${ano} vence dia ${data}. ` +
    `Chave PIX: ${chavePix}. ` +
    `Em caso de dúvidas, estamos à disposição!`;

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, 'sessao')
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Primeira vez: exibe QR code para escanear
client.on('qr', (qr) => {
    console.log('\nEscaneie o QR code abaixo com o WhatsApp do seu celular:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nAguardando leitura...\n');
});

client.on('authenticated', () => {
    console.log('Sessão autenticada. Não será necessário escanear novamente.');
});

client.on('ready', async () => {
    // Aguarda a sessão terminar de sincronizar antes de enviar
    await new Promise(resolve => setTimeout(resolve, 4000));

    const numero = whatsapp.replace(/\D/g, '');

    try {
        // Busca o chat já existente pelo sufixo do número
        // (evita o bug de resolução de LID do getNumberId)
        const suffix = numero.slice(-8);
        const chats = await client.getChats();
        const chat = chats.find(c => !c.isGroup && c.id.user.endsWith(suffix));

        if (!chat) {
            console.error(`✗ Chat com ${whatsapp} não encontrado. Verifique se há uma conversa aberta com este número.`);
            await client.destroy();
            process.exit(1);
        }

        await chat.sendMessage(mensagem);

        // Aguarda a mensagem ser transmitida ao servidor antes de encerrar
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log(`✓ Lembrete enviado para ${nome} (${whatsapp})`);
        await client.destroy();
        process.exit(0);
    } catch (err) {
        console.error(`✗ Erro ao enviar para ${nome}: ${err.message}`);
        await client.destroy();
        process.exit(1);
    }
});

client.on('auth_failure', () => {
    console.error('Falha na autenticação. Delete a pasta "sessao" e rode novamente para refazer o QR code.');
    process.exit(1);
});

client.on('disconnected', (reason) => {
    console.error(`WhatsApp desconectado: ${reason}`);
    process.exit(1);
});

client.initialize();
