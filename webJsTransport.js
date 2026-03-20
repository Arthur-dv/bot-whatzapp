const { MessageMedia } = require("whatsapp-web.js");

function createWebJsTransport(client) {
  return {
    async send(to, payload) {
      if (typeof payload === "string") {
        await client.sendMessage(to, payload);
        return;
      }
      const media = MessageMedia.fromFilePath(payload.imagePath);
      await client.sendMessage(to, media, { caption: payload.caption || "" });
    },
  };
}

module.exports = { createWebJsTransport };
