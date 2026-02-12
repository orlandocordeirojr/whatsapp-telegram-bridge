import express from "express";
import axios from "axios";
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WHATSAPP_NUMBER = "5598987913348@s.whatsapp.net";

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("Variáveis TELEGRAM_TOKEN ou TELEGRAM_CHAT_ID não definidas");
    process.exit(1);
}

let sock;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState("auth");

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ["DOTCOM Bot", "Chrome", "1.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("Escaneie o QR Code:");
            const qrImage = await QRCode.toDataURL(qr);
            console.log(qrImage);
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            console.log("Conexão fechada. Reconectar?", shouldReconnect);

            if (shouldReconnect) {
                startWhatsApp();
            }
        }

        if (connection === "open") {
            console.log("✅ WhatsApp conectado com sucesso");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.fromMe) return;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                msg.message.buttonsResponseMessage?.selectedButtonId ||
                msg.message.listResponseMessage?.title;

            if (!text) return;

            await axios.post(
                `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
                {
                    chat_id: TELEGRAM_CHAT_ID,
                    text: `📩 WhatsApp:\n\n${text}`
                }
            );

        } catch (error) {
            console.error("Erro ao enviar para Telegram:", error.message);
        }
    });
}

app.post("/telegram-webhook", async (req, res) => {
    try {
        const message = req.body.message;
        if (!message) return res.sendStatus(200);

        const text = message.text;

        if (text && sock) {
            await sock.sendMessage(
                WHATSAPP_NUMBER,
                { text }
            );
        }

        res.sendStatus(200);

    } catch (error) {
        console.error("Erro webhook Telegram:", error.message);
        res.sendStatus(500);
    }
});

app.get("/", (req, res) => {
    res.send("Servidor ativo");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
    await startWhatsApp();
});
