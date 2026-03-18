const config = require("./config");

function textoAdicionaisMultilinha() {
  return (
    "• Banana R$3\n" +
    "• Manga R$3,50\n" +
    "• Morango R$4,50\n" +
    "• Kiwi R$5\n" +
    "• Granola R$3\n" +
    "• Paçoca R$3\n" +
    "• Castanha R$4\n" +
    "• Leite em pó R$3\n" +
    "• Leite condensado R$3"
  );
}

function formatarLinhaAdicionais(itensComPreco) {
  if (!itensComPreco || itensComPreco.length === 0) return "Nenhum";
  const porNome = {};
  for (const x of itensComPreco) {
    if (!porNome[x.nome]) porNome[x.nome] = { qty: 0, preco: x.preco };
    porNome[x.nome].qty += 1;
  }
  return Object.entries(porNome)
    .map(([nome, o]) =>
      o.qty > 1
        ? `${nome} (${o.qty}x) R$${(o.preco * o.qty).toFixed(2).replace(".", ",")}`
        : `${nome} R$${o.preco.toFixed(2).replace(".", ",")}`,
    )
    .join(" + ");
}

function montarResumoPedido(
  nome,
  itensDoPedido,
  endereco,
  formaPagamento,
  tempo,
) {
  const itens =
    Array.isArray(itensDoPedido) && itensDoPedido.length > 0
      ? itensDoPedido
      : null;
  if (!itens || itens.length === 0) return null;
  const totalGeral = itens.reduce(
    (s, i) => s + (i.valorCombo || 0) + (i.valorAdic || 0),
    0,
  );
  const vt = totalGeral.toFixed(2).replace(".", ",");
  const base = `\nTempo: ${tempo} min\nEndereço: ${endereco}\nPagamento: ${formaPagamento}\n\nEstá tudo correto? Digite 1️⃣ para confirmar ou 2️⃣ para alterar.${config.VOLTAR_TEXTO}`;
  if (itens.length === 1) {
    const i = itens[0];
    const vc = (i.valorCombo || 0).toFixed(2).replace(".", ",");
    const linhaAdic = formatarLinhaAdicionais(i.itensComPreco || []);
    return `*Resumo do pedido*\n\nNome: ${nome}\nAçaí: R$ ${vc}\nAdicionais: ${linhaAdic}\n*Total: R$ ${vt}*${base}`;
  }
  const linhas = itens.map((i, idx) => {
    const valorItem = (i.valorCombo || 0) + (i.valorAdic || 0);
    const vItem = valorItem.toFixed(2).replace(".", ",");
    const adic = formatarLinhaAdicionais(i.itensComPreco || []);
    const linhaAdic = adic !== "Nenhum" ? `\n  Adicionais: ${adic}` : "";
    return `${idx + 1}. ${i.nome} ${i.tamanho} — R$ ${vItem}${linhaAdic}`;
  });
  return `*Resumo do pedido*\n\nNome: ${nome}\n\n${linhas.join("\n\n")}\n\n*Total: R$ ${vt}*${base}`;
}

function textoResumoParaAdmin(pedido) {
  const itens = pedido.itensDoPedido || [];
  if (itens.length === 0) {
    return `*Novo pedido*\n\nCliente: ${pedido.nome}\n${pedido.descricao || ""}\nTotal: R$ ${(pedido.valor || 0).toFixed(2).replace(".", ",")}\nEndereço: ${pedido.endereco}\nPagamento: ${pedido.formaPagamento}`;
  }
  const linhas = itens.map((i, idx) => {
    const vItem = (i.valorCombo || 0) + (i.valorAdic || 0);
    const adic = formatarLinhaAdicionais(i.itensComPreco || []);
    const linhaAdic = adic !== "Nenhum" ? ` | Adic: ${adic}` : "";
    return `${idx + 1}. ${i.nome} ${i.tamanho} — R$ ${vItem.toFixed(2).replace(".", ",")}${linhaAdic}`;
  });
  return `*Novo pedido*\n\nCliente: ${pedido.nome}\n\n${linhas.join("\n")}\n\n*Total: R$ ${(pedido.valor || 0).toFixed(2).replace(".", ",")}*\nEndereço: ${pedido.endereco}\nPagamento: ${pedido.formaPagamento}`;
}

module.exports = {
  textoAdicionaisMultilinha,
  formatarLinhaAdicionais,
  montarResumoPedido,
  textoResumoParaAdmin,
};
