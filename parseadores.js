const { CARDAPIO, ADICIONAIS, CANONICO_ADICIONAL } = require("./cardapio");

function normalizar(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function querVoltar(texto) {
  return false;
}

function identificarCombo(texto) {
  const t = (texto || "").trim();
  const num = parseInt(t, 10);
  if (t === String(num) && num >= 1 && num <= CARDAPIO.length) {
    return CARDAPIO[num - 1];
  }
  const n = normalizar(texto);
  if (!n || n.length < 2) return null;
  for (const combo of CARDAPIO) {
    for (const p of combo.palavras) {
      if (n.includes(normalizar(p)) || normalizar(p).includes(n)) return combo;
    }
  }
  try {
    const fuzzball = require("fuzzball");
    const opcoes = CARDAPIO.flatMap((c) => c.palavras);
    const resultados = fuzzball.extract(n, opcoes, {
      processor: (x) => normalizar(x),
      scorer: fuzzball.token_set_ratio,
    });
    const primeiro = resultados[0];
    if (primeiro && primeiro[1] >= 70) {
      const match = primeiro[0];
      return CARDAPIO.find((c) =>
        c.palavras.some((p) => normalizar(p) === normalizar(match)),
      );
    }
  } catch (_) {}
  return null;
}

function extrairSoTamanho(texto) {
  const t = normalizar(texto);
  const match = t.match(/^(300|500|700)(\s*ml)?$|^1(\s*l)?$|^1l$/i);
  if (!match) return null;
  let raw = match[0].replace(/\s/g, "").toLowerCase();
  if (/^\d+$/.test(raw)) {
    if (raw === "1") raw = "1l";
    else raw = raw + "ml";
  }
  const tamanho = raw === "1l" ? "1L" : raw;
  const ml = raw === "1l" ? "1000" : raw.replace("ml", "");
  return { tamanho, ml };
}

function tamanhosDoCombo(combo) {
  return Object.keys(combo.tamanhos);
}

function extrairTamanhoNoTexto(texto) {
  const n = normalizar(texto);
  const m300 = n.match(/\b300\b/);
  const m500 = n.match(/\b500\b/);
  const m700 = n.match(/\b700\b/);
  const m1 = n.match(/\b1\b/);
  if (m300) return { ml: "300", tamanho: "300ml" };
  if (m500) return { ml: "500", tamanho: "500ml" };
  if (m700) return { ml: "700", tamanho: "700ml" };
  if (m1) return { ml: "1000", tamanho: "1L" };
  const soTamanho = extrairSoTamanho(texto);
  return soTamanho ? { ml: soTamanho.ml, tamanho: soTamanho.tamanho } : null;
}

function identificarComboETamanho(texto) {
  const combo = identificarCombo(texto);
  if (!combo) return null;
  const tamanhos = tamanhosDoCombo(combo);
  const tam = extrairTamanhoNoTexto(texto);
  if (tam && tamanhos.includes(tam.ml)) {
    const tamanhoStr =
      tam.ml === "300" ? "300ml" : tam.ml === "1000" ? "1L" : tam.ml === "700" ? "700ml" : "500ml";
    return { combo, tamanho: tamanhoStr, ml: tam.ml };
  }
  return { combo, tamanho: null, ml: null };
}

function parsearPedidoCompleto(texto) {
  const combo = identificarCombo(texto);
  if (!combo) return null;
  const tamanhos = tamanhosDoCombo(combo);
  const tam = extrairTamanhoNoTexto(texto);
  let tamanho = null;
  let ml = null;
  if (tam && tamanhos.includes(tam.ml)) {
    tamanho = tam.ml === "300" ? "300ml" : tam.ml === "1000" ? "1L" : tam.ml === "700" ? "700ml" : "500ml";
    ml = tam.ml;
  } else if (tamanhos.length === 1) {
    ml = tamanhos[0];
    tamanho = ml === "300" ? "300ml" : ml === "1000" ? "1L" : "500ml";
  }
  const { itensComPreco } = parsearAdicionaisComQuantidade(texto);
  return { combo, tamanho, ml, itensComPreco };
}

function parsearPedidoMultiplosItens(texto) {
  const n = normalizar(texto);
  const matchQty = n.match(/^(?:quero\s+)?(\d+)\s+(.+)$/);
  if (!matchQty) return null;
  const qty = parseInt(matchQty[1], 10);
  if (qty < 2 || qty > 10) return null;
  const resto = (matchQty[2] || "").trim();
  const partes = resto.split(/\s+no\s+(?:primeiro|segundo|terceiro|quarto|quinto|1º|2º|3º|4º|5º|1o|2o|3o|4o|5o|um|dois|três|quatro|cinco|primeira|segunda|terceira)\s+/i);
  const primeiroBloco = (partes[0] || "").trim();
  const combo = identificarCombo(primeiroBloco);
  if (!combo) return null;
  const tam = extrairTamanhoNoTexto(primeiroBloco);
  const tamanhos = tamanhosDoCombo(combo);
  let ml = tam?.ml;
  let tamanho = null;
  if (tam && tamanhos.includes(tam.ml)) {
    ml = tam.ml;
    tamanho = tam.ml === "300" ? "300ml" : tam.ml === "1000" ? "1L" : tam.ml === "700" ? "700ml" : "500ml";
  } else if (tamanhos.length === 1) {
    ml = tamanhos[0];
    tamanho = ml === "300" ? "300ml" : ml === "1000" ? "1L" : "500ml";
  }
  if (!ml || !tamanho) return null;
  const valorBase = combo.tamanhos[ml] || 0;
  const adicionaisPrimeiro = partes.length === 1 ? parsearAdicionaisComQuantidade(primeiroBloco).itensComPreco : [];
  const itens = [];
  for (let i = 0; i < qty; i++) {
    let itensComPreco = [];
    if (partes.length > 1) {
      const seg = (partes[i + 1] || "").trim();
      const segNorm = normalizar(seg);
      if (seg && !/^sem\s+adicional|^sem\s+adicionais|^nenhum|^nada\b/i.test(segNorm)) {
        const parsed = parsearAdicionaisComQuantidade(seg);
        itensComPreco = parsed.itensComPreco || [];
      }
    } else {
      if (i === 0) itensComPreco = [...adicionaisPrimeiro];
    }
    const valorAdic = itensComPreco.reduce((s, x) => s + x.preco, 0);
    const porNomeDesc = {};
    for (const x of itensComPreco) {
      porNomeDesc[x.nome] = (porNomeDesc[x.nome] || 0) + 1;
    }
    const adicDesc = Object.entries(porNomeDesc)
      .map(([nm, q]) => (q > 1 ? `${nm} (${q}x)` : nm))
      .join(", ");
    itens.push({
      comboId: combo.id,
      nome: combo.nome,
      tamanho,
      ml,
      valorCombo: valorBase,
      valorAdic,
      itensComPreco,
      descricao: combo.nome + " " + tamanho + (adicDesc ? " + " + adicDesc : ""),
    });
  }
  return { combo, tamanho, ml, itens };
}

function acharAdicionalPorTexto(trecho) {
  const t = normalizar((trecho || "").trim());
  if (!t) return null;
  for (const key of Object.keys(ADICIONAIS)) {
    const keyNorm = normalizar(key);
    if (t === keyNorm || keyNorm.includes(t) || (t.length >= 2 && keyNorm.includes(t))) {
      const nomeExibir = CANONICO_ADICIONAL[keyNorm] || key;
      return { nome: nomeExibir, preco: ADICIONAIS[key] };
    }
  }
  const stop = new Set(["de", "do", "da", "dos", "das", "e", "com", "por", "pra", "para", "no", "na"]);
  const palavras = t
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !stop.has(w));
  for (const p of palavras) {
    for (const key of Object.keys(ADICIONAIS)) {
      const keyNorm = normalizar(key);
      if (p === keyNorm || (p.length >= 3 && keyNorm.includes(p))) {
        const nomeExibir = CANONICO_ADICIONAL[keyNorm] || key;
        return { nome: nomeExibir, preco: ADICIONAIS[key] };
      }
    }
  }
  return null;
}

function parsearAdicionaisComQuantidade(texto) {
  const n = normalizar(texto);
  if (/^(nenhum|nenhuma|sem|nao|não|n)$/i.test(n))
    return { itens: [], itensComPreco: [], valor: 0 };
  const itens = [];
  const itensComPreco = [];
  let valor = 0;
  const parteCom = (n.match(/\s+com\s+(.+)$/) || [])[1];
  const textoAdic = parteCom ? parteCom.trim() : n;
  const segmentos = textoAdic.split(/\s+e\s+|\s*,\s*/).map((s) => s.trim()).filter((s) => s.length > 0);
  for (const seg of segmentos) {
    const match = seg.match(/^(\d+)\s+(.+)$/);
    const qty = match ? Math.min(parseInt(match[1], 10), 99) : 1;
    const nomeParte = match ? match[2].trim() : seg;
    const adic = acharAdicionalPorTexto(nomeParte);
    if (adic && qty >= 1) {
      for (let i = 0; i < qty; i++) {
        itens.push(adic.nome);
        itensComPreco.push({ nome: adic.nome, preco: adic.preco });
        valor += adic.preco;
      }
    }
  }
  if (itensComPreco.length === 0) {
    const partes = n.split(/[\s,]+/).filter((x) => x.length > 0);
    for (const key of Object.keys(ADICIONAIS)) {
      const keyNorm = normalizar(key);
      for (const p of partes) {
        if (p === keyNorm || keyNorm.includes(p) || (p.length >= 2 && keyNorm.includes(p))) {
          const nomeExibir = CANONICO_ADICIONAL[keyNorm] || key;
          const preco = ADICIONAIS[key];
          itens.push(nomeExibir);
          itensComPreco.push({ nome: nomeExibir, preco });
          valor += preco;
          break;
        }
      }
    }
  }
  return { itens, itensComPreco, valor };
}

function parsearAdicionais(texto) {
  return parsearAdicionaisComQuantidade(texto);
}

function parsearEnderecoEPagamento(texto) {
  const t = (texto || "").trim();
  const n = normalizar(t);
  let forma = "Pix";
  if (/\bpix\b/i.test(n)) forma = "Pix";
  else if (/\bdinheiro\b/i.test(n)) forma = "Dinheiro";
  else if (/\bcart[aã]o\b/i.test(n)) forma = "Cartão";
  let endereco = t
    .replace(/\b(pix|dinheiro|cartão|cartao)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!endereco) endereco = t;
  return { endereco, forma };
}

function parsearFormaPagamento(texto) {
  const n = normalizar((texto || "").trim());
  if (/\bpix\b/i.test(n)) return "Pix";
  if (/\bdinheiro\b/i.test(n)) return "Dinheiro";
  if (/\bcart[aã]o\b/i.test(n)) return "Cartão";
  return null;
}

module.exports = {
  normalizar,
  querVoltar,
  identificarCombo,
  extrairSoTamanho,
  tamanhosDoCombo,
  extrairTamanhoNoTexto,
  identificarComboETamanho,
  parsearPedidoCompleto,
  parsearPedidoMultiplosItens,
  acharAdicionalPorTexto,
  parsearAdicionaisComQuantidade,
  parsearAdicionais,
  parsearEnderecoEPagamento,
  parsearFormaPagamento,
};
