const fs = require("fs");
const path = require("path");
const inputPath = path.join(__dirname, "..", "chatbot.full.js");
const outPath = path.join(__dirname, "..", "messageHandler.js");

if (!fs.existsSync(inputPath)) {
  console.error("Crie o arquivo chatbot.full.js com o conteúdo completo do chatbot (restaure do Histórico Local do Cursor).");
  process.exit(1);
}

const full = fs.readFileSync(inputPath, "utf8");
const lines = full.split("\n");
let start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('client.on("message"') || lines[i].includes("client.on('message'")) {
    start = i;
    break;
  }
}
if (start < 0) {
  console.error("Não encontrou client.on('message') em chatbot.full.js");
  process.exit(1);
}

let depth = 0;
const startLine = lines[start];
depth += (startLine.match(/\{/g) || []).length - (startLine.match(/\}/g) || []).length;
let end = -1;
for (let i = start + 1; i < lines.length; i++) {
  const line = lines[i];
  const open = (line.match(/\{/g) || []).length;
  const close = (line.match(/\}/g) || []).length;
  depth += open - close;
  if (depth === 0) {
    end = i;
    break;
  }
}
if (end < 0) {
  console.error("Não encontrou o fechamento do handler.");
  process.exit(1);
}

const body = lines.slice(start + 1, end).join("\n");

const header = `const { MessageMedia } = require('whatsapp-web.js');
const config = require('./config');
const { CARDAPIO } = require('./cardapio');
const parseadores = require('./parseadores');
const mensagens = require('./mensagens');
const pedidos = require('./pedidos');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const { fs, VOLTAR_TEXTO, CAMINHO_LOGO, CAMINHO_IMAGEM_CARDAPIO, CAMINHO_QR_PIX, TEMPO_ENTREGA, TIMEOUT_INATIVIDADE_MIN, WHATSAPP_ADMIN_ID, HORARIO_TEXTO, ENDERECO_TEXTO, foraDoHorario, getUltimoEndereco } = config;
const { querVoltar, normalizar, identificarCombo, identificarComboETamanho, tamanhosDoCombo, extrairSoTamanho, parsearAdicionais, parsearPedidoCompleto, parsearPedidoMultiplosItens, parsearEnderecoEPagamento, parsearFormaPagamento } = parseadores;
const { textoAdicionaisMultilinha, formatarLinhaAdicionais, montarResumoPedido, textoResumoParaAdmin } = mensagens;
const { salvarPedido, atualizarStatusPedido } = pedidos;

function registerMessageHandler(client, pedidoPorCliente) {
  client.on('message', async (msg) => {
`;

const footer = `
  });
}
module.exports = { registerMessageHandler };
`;

fs.writeFileSync(outPath, header + body + footer, "utf8");
console.log("messageHandler.js gerado com sucesso.");
