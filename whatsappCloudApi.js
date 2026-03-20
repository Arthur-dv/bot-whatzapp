const fs = require("fs");
const path = require("path");

async function graphPost(url, token, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `HTTP ${r.status}`);
  return j;
}

function normalizeToPhone(to) {
  return String(to || "")
    .replace(/@c\.us$/i, "")
    .replace(/\D/g, "");
}

async function uploadMediaFile({ accessToken, phoneNumberId, filePath }) {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png"
      ? "image/png"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : "image/jpeg";
  const buf = fs.readFileSync(filePath);
  const blob = new Blob([buf], { type: mime });
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", blob, path.basename(filePath));
  form.append("type", mime);
  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/media`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `upload HTTP ${r.status}`);
  return j.id;
}

async function sendTextMessage({ accessToken, phoneNumberId, to, text }) {
  const id = normalizeToPhone(to);
  return graphPost(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    accessToken,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: id,
      type: "text",
      text: { preview_url: false, body: text },
    },
  );
}

async function sendImageMessage({ accessToken, phoneNumberId, to, filePath, caption }) {
  const id = normalizeToPhone(to);
  const mediaId = await uploadMediaFile({ accessToken, phoneNumberId, filePath });
  return graphPost(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    accessToken,
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: id,
      type: "image",
      image: { id: mediaId, caption: caption || "" },
    },
  );
}

module.exports = {
  sendTextMessage,
  sendImageMessage,
  normalizeToPhone,
};
