const cloud = require("./whatsappCloudApi");

function createCloudTransport({ accessToken, phoneNumberId }) {
  return {
    async send(to, payload) {
      if (typeof payload === "string") {
        await cloud.sendTextMessage({ accessToken, phoneNumberId, to, text: payload });
        return;
      }
      await cloud.sendImageMessage({
        accessToken,
        phoneNumberId,
        to,
        filePath: payload.imagePath,
        caption: payload.caption || "",
      });
    },
  };
}

function chatIdFromWaId(waId) {
  const d = String(waId || "").replace(/\D/g, "");
  return d ? `${d}@c.us` : "";
}

module.exports = {
  createCloudTransport,
  chatIdFromWaId,
};
