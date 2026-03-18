require("dotenv").config();
const path = require("path");
const fs = require("fs");

const EXTENSOES_CARDAPIO = [".jpg", ".jpeg", ".png", ".webp"];
const CAMINHO_IMAGEM_CARDAPIO =
  EXTENSOES_CARDAPIO.map((ext) => path.join(__dirname, "cardapio" + ext)).find(
    (p) => fs.existsSync(p),
  ) || path.join(__dirname, "cardapio.jpg");
const CAMINHO_QR_PIX =
  [".jpg", ".jpeg", ".png"]
    .map((ext) => path.join(__dirname, "qrpix" + ext))
    .find((p) => fs.existsSync(p)) || path.join(__dirname, "qrpix.png");
const CAMINHO_LOGO =
  [".jpg", ".jpeg", ".png", ".webp"]
    .map((ext) => path.join(__dirname, "logo" + ext))
    .find((p) => fs.existsSync(p)) || path.join(__dirname, "logo.png");

const TEMPO_ENTREGA = process.env.TEMPO_ENTREGA || "20";
const ENDERECO_TEXTO = (
  process.env.ENDERECO_TEXTO ||
  "Rua Exemplo, 123 – Bairro Centro\nCidade – Estado\n\nLink do Google Maps: https://maps.google.com"
).replace(/\\n/g, "\n");
const HORARIO_TEXTO = (
  process.env.HORARIO_TEXTO ||
  "Segunda a Sexta: 10h às 22h\nSábado: 10h às 23h\nDomingo: 11h às 21h"
).replace(/\\n/g, "\n");
const WHATSAPP_ADMIN_ID = process.env.WHATSAPP_ADMIN_ID || "";
const TIMEOUT_INATIVIDADE_MIN = parseInt(
  process.env.TIMEOUT_INATIVIDADE_MIN || "30",
  10,
);
const PASTA_PEDIDOS = process.env.PASTA_PEDIDOS || "pedidos";

const HORARIO_POR_DIA_DEFAULT = {
  0: [11, 21],
  1: [10, 22],
  2: [10, 22],
  3: [10, 22],
  4: [10, 22],
  5: [10, 22],
  6: [10, 23],
};

function parsearHorarioEnv() {
  const out = { ...HORARIO_POR_DIA_DEFAULT };
  for (let d = 0; d <= 6; d++) {
    const v =
      process.env[`HORARIO_${d}`] ||
      process.env[
        `HORARIO_${["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"][d]}`
      ];
    if (v && /^\d{1,2}-\d{1,2}$/.test(v.trim())) {
      const [a, f] = v
        .trim()
        .split("-")
        .map((x) => parseInt(x, 10));
      if (a >= 0 && a <= 23 && f >= 0 && f <= 23) out[d] = [a, f];
    }
  }
  return out;
}

const HORARIO_POR_DIA = parsearHorarioEnv();

function lojaAberta() {
  return true;
}

function foraDoHorario() {
  return false;
}

function getUltimoEndereco(chatId) {
  const dir = path.join(__dirname, PASTA_PEDIDOS);
  if (!fs.existsSync(dir)) return null;
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let ultimo = null;
  let ultimaData = "";
  for (const f of arquivos) {
    try {
      const full = path.join(dir, f);
      const data = JSON.parse(fs.readFileSync(full, "utf8"));
      if (
        data.chatIdCliente === chatId &&
        data.endereco &&
        (data.dataHora || "") > ultimaData
      ) {
        ultimaData = data.dataHora || "";
        ultimo = data.endereco;
      }
    } catch (_) {}
  }
  return ultimo;
}

const VOLTAR_TEXTO = "";

module.exports = {
  path,
  fs,
  CAMINHO_IMAGEM_CARDAPIO,
  CAMINHO_QR_PIX,
  CAMINHO_LOGO,
  TEMPO_ENTREGA,
  ENDERECO_TEXTO,
  HORARIO_TEXTO,
  WHATSAPP_ADMIN_ID,
  TIMEOUT_INATIVIDADE_MIN,
  PASTA_PEDIDOS,
  HORARIO_POR_DIA,
  VOLTAR_TEXTO,
  lojaAberta,
  foraDoHorario,
  getUltimoEndereco,
};
