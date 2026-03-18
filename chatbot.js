require("dotenv").config();
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { registerMessageHandler } = require("./messageHandler");

const pedidoPorCliente = new Map();

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-first-run",
      "--no-zygote",
    ],
  },
});

client.on("qr", (qr) => {
  console.log("📲 Escaneie o QR Code abaixo:");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("✅ Tudo certo! WhatsApp conectado.");
});

client.on("disconnected", (reason) => {
  console.log("⚠️ Desconectado:", reason);
});

client.on("auth_failure", (msg) => {
  console.error("❌ Falha de autenticação do WhatsApp:", msg);
});

registerMessageHandler(client, pedidoPorCliente);

client.initialize();
