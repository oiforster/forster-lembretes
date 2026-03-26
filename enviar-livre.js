/**
 * enviar-livre.js — Forster Filmes
 * Envia uma mensagem livre (texto customizado) via WhatsApp Web.
 *
 * Uso: node enviar-livre.js "5551999999999" "Texto da mensagem aqui"
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const [, , whatsapp, mensagem] = process.argv;

if (!whatsapp || !mensagem) {
    console.error('Uso: node enviar-livre.js "5551999999999" "Texto da mensagem"');
    process.exit(1);
}

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: path.join(__dirname, 'sessao')
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('\nEscaneie o QR code abaixo:\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    await new Promise(resolve => setTimeout(resolve, 4000));

    const numero = whatsapp.replace(/\D/g, '');
    const suffix = numero.slice(-8);

    try {
        const chats = await client.getChats();
        const chat = chats.find(c => !c.isGroup && c.id.user.endsWith(suffix));

        if (!chat) {
            console.error(`✗ Chat com ${whatsapp} não encontrado.`);
            await client.destroy();
            process.exit(1);
        }

        await chat.sendMessage(mensagem);
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log(`✓ Mensagem enviada para ${whatsapp}`);
        await client.destroy();
        process.exit(0);
    } catch (err) {
        console.error(`✗ Erro: ${err.message}`);
        await client.destroy();
        process.exit(1);
    }
});

client.on('auth_failure', () => {
    console.error('Falha na autenticação.');
    process.exit(1);
});

client.on('disconnected', (reason) => {
    console.error(`Desconectado: ${reason}`);
    process.exit(1);
});

client.initialize();
