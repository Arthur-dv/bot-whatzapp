const path = require("path");
const fs = require("fs");
const config = require("./config");

function salvarPedido(pedido, chatIdCliente) {
  const dir = path.join(__dirname, config.PASTA_PEDIDOS);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = new Date();
  const nomeArquivo = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}_${String(data.getHours()).padStart(2, "0")}-${String(data.getMinutes()).padStart(2, "0")}-${String(data.getSeconds()).padStart(2, "0")}_${(chatIdCliente || "cliente").replace(/[^a-z0-9]/gi, "_")}.json`;
  const caminho = path.join(dir, nomeArquivo);
  const payload = {
    dataHora: data.toISOString(),
    chatIdCliente,
    nome: pedido.nome,
    descricao: pedido.descricao,
    valor: pedido.valor,
    endereco: pedido.endereco,
    formaPagamento: pedido.formaPagamento,
    itensDoPedido: pedido.itensDoPedido || [],
    status: "confirmado",
  };
  try {
    fs.writeFileSync(caminho, JSON.stringify(payload, null, 2), "utf8");
    return caminho;
  } catch (e) {
    console.error("Erro ao salvar pedido:", e);
    return null;
  }
}

function atualizarStatusPedido(chatIdCliente, novoStatus) {
  const dir = path.join(__dirname, config.PASTA_PEDIDOS);
  if (!fs.existsSync(dir)) return;
  const sufixo = (chatIdCliente || "").replace(/[^a-z0-9]/gi, "_");
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && f.includes(sufixo));
  if (arquivos.length === 0) return;
  arquivos.sort();
  const ultimo = path.join(dir, arquivos[arquivos.length - 1]);
  try {
    const data = JSON.parse(fs.readFileSync(ultimo, "utf8"));
    data.status = novoStatus;
    data.comprovanteEm = new Date().toISOString();
    fs.writeFileSync(ultimo, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

module.exports = { salvarPedido, atualizarStatusPedido };
