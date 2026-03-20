require("dotenv").config();
const config = require("./config");
const { createCloudApp } = require("./cloudWebhook");

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_CLOUD_PORT,
} = config;

if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_VERIFY_TOKEN) {
  console.error(
    "Defina no .env: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN",
  );
  process.exit(1);
}

const pedidoPorCliente = new Map();
const app = createCloudApp(pedidoPorCliente, config);

app.listen(WHATSAPP_CLOUD_PORT, () => {
  console.log(`Webhook Cloud API em http://0.0.0.0:${WHATSAPP_CLOUD_PORT}/webhook`);
});
