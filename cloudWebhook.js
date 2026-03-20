const crypto = require("crypto");
const express = require("express");
const { createCloudTransport, chatIdFromWaId } = require("./whatsappTransport");
const { processInboundMessage } = require("./messageHandler");

function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !rawBody) return true;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch (_) {
    return false;
  }
}

function createCloudApp(pedidoPorCliente, config) {
  const {
    WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_VERIFY_TOKEN,
    WHATSAPP_APP_SECRET,
  } = config;
  const transport = createCloudTransport({
    accessToken: WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
  });
  const app = express();
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  app.post("/webhook", async (req, res) => {
    if (WHATSAPP_APP_SECRET) {
      const sig = req.get("x-hub-signature-256") || "";
      if (!verifyMetaSignature(req.rawBody, sig, WHATSAPP_APP_SECRET)) {
        return res.sendStatus(403);
      }
    }
    res.sendStatus(200);
    try {
      const entry = req.body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      if (!value?.messages?.length) return;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (phoneNumberId && String(phoneNumberId) !== String(WHATSAPP_PHONE_NUMBER_ID)) return;
      for (const m of value.messages) {
        if (m.type !== "text" || !m.text?.body) continue;
        const waFrom = m.from;
        const chatId = chatIdFromWaId(waFrom);
        if (!chatId) continue;
        const profile = value.contacts?.find((c) => c.wa_id === waFrom);
        const pushname = profile?.profile?.name || "";
        const msg = {
          from: chatId,
          body: m.text.body,
          hasMedia: false,
          fromMe: false,
          isStatus: false,
          getChat: async () => ({
            isGroup: false,
            sendStateTyping: async () => {},
          }),
          getContact: async () => ({ pushname: pushname || "Cliente" }),
        };
        await processInboundMessage(transport, pedidoPorCliente, msg);
      }
    } catch (e) {
      console.error("Webhook Cloud:", e?.message || e);
    }
  });

  return app;
}

module.exports = { createCloudApp };
