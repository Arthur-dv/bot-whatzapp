require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { CARDAPIO, ADICIONAIS } = require("./cardapio");
const { acharAdicionalPorTexto } = require("./parseadores");

const CACHES = {
  pedido: new Map(),
  intencao: new Map(),
  saudacao: new Map(),
};
let genAIInstance = null;
let modelInstance = null;

function envBool(name, fallback) {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (!v) return fallback;
  return v === "1" || v === "true" || v === "yes" || v === "sim" || v === "on";
}

function envInt(name, fallback) {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const CFG = {
  model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
  timeoutMs: envInt("IA_TIMEOUT_MS", 6000),
  retryCount: envInt("IA_RETRY_COUNT", 1),
  cacheTtlMs: envInt("IA_CACHE_TTL_MS", 45000),
  cacheSweepMs: envInt("IA_CACHE_SWEEP_MS", 30000),
  cacheMaxItems: envInt("IA_CACHE_MAX_ITEMS", 1000),
  cacheMaxPedido: envInt("IA_CACHE_MAX_PEDIDO", 400),
  cacheMaxIntencao: envInt("IA_CACHE_MAX_INTENCAO", 400),
  cacheMaxSaudacao: envInt("IA_CACHE_MAX_SAUDACAO", 200),
  logs: envBool("IA_LOGS", false),
  habilitaIntencao: envBool("IA_INTENCAO", true),
  habilitaMultiItem: envBool("IA_MULTI_ITEM", true),
  habilitaSaudacaoAssistida: envBool("IA_SAUDACAO_ASSISTIDA", true),
};

function logIa(evento, extra) {
  if (!CFG.logs) return;
  const payload = { evento, ...extra, at: new Date().toISOString() };
  try {
    console.log("[ia]", JSON.stringify(payload));
  } catch (_) {}
}

function cacheInfoByKey(chave) {
  const tipo = String(chave || "").split(":")[0];
  if (tipo === "pedido") return { tipo, map: CACHES.pedido, max: CFG.cacheMaxPedido };
  if (tipo === "intencao") return { tipo, map: CACHES.intencao, max: CFG.cacheMaxIntencao };
  if (tipo === "saudacao") return { tipo, map: CACHES.saudacao, max: CFG.cacheMaxSaudacao };
  return { tipo: "pedido", map: CACHES.pedido, max: CFG.cacheMaxPedido };
}

function cacheGet(chave) {
  const info = cacheInfoByKey(chave);
  const ent = info.map.get(chave);
  if (!ent) return null;
  if (ent.expiraEm < Date.now()) {
    info.map.delete(chave);
    return null;
  }
  return ent.valor;
}

function cacheSet(chave, valor) {
  const info = cacheInfoByKey(chave);
  if (info.map.size >= info.max) {
    const agora = Date.now();
    for (const [k, v] of info.map) {
      if (!v || v.expiraEm < agora) info.map.delete(k);
    }
    if (info.map.size >= info.max) {
      const primeiro = info.map.keys().next().value;
      if (primeiro) info.map.delete(primeiro);
    }
  }
  const total =
    CACHES.pedido.size + CACHES.intencao.size + CACHES.saudacao.size;
  if (total >= CFG.cacheMaxItems) {
    const ordem = ["saudacao", "intencao", "pedido"];
    for (const tipo of ordem) {
      const mapa = CACHES[tipo];
      const primeiro = mapa.keys().next().value;
      if (primeiro) {
        mapa.delete(primeiro);
        break;
      }
    }
  }
  info.map.set(chave, { valor, expiraEm: Date.now() + CFG.cacheTtlMs });
}

function sweepCache() {
  const agora = Date.now();
  let removidos = 0;
  for (const tipo of ["pedido", "intencao", "saudacao"]) {
    const mapa = CACHES[tipo];
    for (const [k, v] of mapa) {
      if (!v || v.expiraEm < agora) {
        mapa.delete(k);
        removidos += 1;
      }
    }
  }
  if (removidos > 0) {
    logIa("cache_sweep", {
      removidos,
      pedido: CACHES.pedido.size,
      intencao: CACHES.intencao.size,
      saudacao: CACHES.saudacao.size,
    });
  }
}

if (CFG.cacheSweepMs > 0) {
  const timer = setInterval(sweepCache, CFG.cacheSweepMs);
  if (typeof timer.unref === "function") timer.unref();
}

function textoCacheKey(prefixo, texto) {
  return `${prefixo}:${(texto || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function extractFirstJsonObject(raw) {
  if (!raw) return null;
  const t = String(raw).trim();
  if (t === "null") return null;
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s < 0 || e < 0 || e <= s) return null;
  return t.slice(s, e + 1).trim();
}

function getModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAIInstance) genAIInstance = new GoogleGenerativeAI(apiKey);
  if (!modelInstance) modelInstance = genAIInstance.getGenerativeModel({ model: CFG.model });
  return modelInstance;
}

async function comTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("ia_timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callGeminiWithRetry(prompt, tipo) {
  const model = getModel();
  if (!model) return null;
  let tentativa = 0;
  while (tentativa <= CFG.retryCount) {
    try {
      const result = await comTimeout(model.generateContent(prompt), CFG.timeoutMs);
      const raw = result?.response?.text?.() || "";
      logIa("ok", { tipo, tentativa, chars: raw.length });
      return raw;
    } catch (err) {
      logIa("erro", { tipo, tentativa, erro: err?.message || "erro_desconhecido" });
      tentativa += 1;
      if (tentativa > CFG.retryCount) return null;
    }
  }
  return null;
}

function buildCardapioContext() {
  const linhas = CARDAPIO.map(
    (c, i) =>
      `${i + 1}. id="${c.id}", nome="${c.nome}", tamanhos: ${Object.keys(c.tamanhos).map((m) => m + "ml").join(", ")}`
  );
  const adicLista = [...new Set(Object.keys(ADICIONAIS).filter((k) => k !== "pacoca"))];
  return (
    "CARDÁPIO (use o campo 'id' na resposta):\n" +
    linhas.join("\n") +
    "\n\nAdicionais disponíveis (use o nome exato ou equivalente): " +
    adicLista.join(", ")
  );
}

const CARDAPIO_CTX = buildCardapioContext();

const PROMPT = `Você é um assistente que interpreta pedidos de um delivery de açaí. Responda APENAS com um JSON válido, sem markdown e sem texto antes ou depois.

Regras:
- Se a mensagem do cliente for um PEDIDO de item do cardápio, retorne um único objeto JSON no formato:
  {"comboId": "id do item", "ml": "300" ou "500" ou "700" ou "1000", "adicionais": [{"nome": "nome do adicional", "quantidade": 1}]}
- "comboId" deve ser exatamente um dos "id" listados no cardápio.
- "ml" deve ser um dos tamanhos disponíveis para esse item (300, 500, 700 ou 1000).
- "adicionais" é um array; cada item tem "nome" (nome do adicional) e "quantidade" (número). Se não houver adicionais, use [].
- Se a mensagem NÃO for um pedido (saudação, dúvida, outro assunto), retorne exatamente: null

Cardápio e adicionais:
${CARDAPIO_CTX}

Mensagem do cliente: `;

const PROMPT_INTENCAO_PEDIDO = `Você classifica a intenção e extrai pedidos para um bot de delivery de açaí.
Responda APENAS um JSON válido, sem markdown.

Formato exato:
{"intent":"saudacao"|"pedido"|"outro","itens":[{"comboId":"id","ml":"300|500|700|1000","adicionais":[{"nome":"texto","quantidade":1}]}]}

Regras:
- Use "saudacao" para cumprimentos, início de conversa e frases como "quero falar", "tem alguém?".
- Use "pedido" quando houver pedido de compra.
- Use "outro" para qualquer outro caso.
- Em "pedido", inclua todos os itens detectados no array "itens". Se não detectar itens válidos, use [].
- Nunca invente ids. Use somente ids existentes.

Cardápio e adicionais:
${CARDAPIO_CTX}

Mensagem do cliente: `;

function mlToTamanho(ml) {
  if (ml === "300") return "300ml";
  if (ml === "700") return "700ml";
  if (ml === "1000") return "1L";
  return "500ml";
}

function normalizarItem(data) {
  if (!data || typeof data.comboId !== "string") return null;
  const combo = CARDAPIO.find((c) => c.id === data.comboId);
  if (!combo) return null;
  const tamanhos = Object.keys(combo.tamanhos);
  const mlRaw = String(data.ml || "").replace(/ml|l/gi, "").trim();
  const ml = tamanhos.includes(mlRaw) ? mlRaw : tamanhos[0];
  if (!ml) return null;
  const itensComPreco = [];
  const adicionais = Array.isArray(data.adicionais) ? data.adicionais : [];
  for (const a of adicionais) {
    const nome = (a.nome || "").trim();
    const qtd = Math.max(1, parseInt(a.quantidade, 10) || 1);
    const adic = acharAdicionalPorTexto(nome);
    if (!adic) continue;
    for (let i = 0; i < qtd; i++) {
      itensComPreco.push({ nome: adic.nome, preco: adic.preco });
    }
  }
  const valorCombo = combo.tamanhos[ml] || 0;
  const valorAdic = itensComPreco.reduce((s, x) => s + x.preco, 0);
  return {
    combo,
    tamanho: mlToTamanho(ml),
    ml,
    itensComPreco,
    valorCombo,
    valorAdic,
  };
}

async function interpretarPedidoComGemini(textoCliente) {
  if (!textoCliente || !textoCliente.trim()) return null;
  try {
    const chave = textoCacheKey("pedido", textoCliente);
    const cached = cacheGet(chave);
    if (cached !== null) return cached;
    const raw = await callGeminiWithRetry(PROMPT + textoCliente.trim(), "pedido");
    const jsonStr = extractFirstJsonObject(raw);
    if (!jsonStr || jsonStr === "null") return null;
    const data = JSON.parse(jsonStr);
    const item = normalizarItem(data);
    if (!item) return null;
    const out = {
      combo: item.combo,
      tamanho: item.tamanho,
      ml: item.ml,
      itensComPreco: item.itensComPreco,
      valorCombo: item.valorCombo,
      valorAdic: item.valorAdic,
    };
    cacheSet(chave, out);
    return out;
  } catch (_) {
    return null;
  }
}

async function interpretarIntencaoEPedidoComGemini(textoCliente) {
  if (!CFG.habilitaIntencao || !CFG.habilitaMultiItem) return null;
  if (!textoCliente || !textoCliente.trim()) return null;
  try {
    const chave = textoCacheKey("intencao", textoCliente);
    const cached = cacheGet(chave);
    if (cached !== null) return cached;
    const raw = await callGeminiWithRetry(PROMPT_INTENCAO_PEDIDO + textoCliente.trim(), "intencao_pedido");
    const jsonStr = extractFirstJsonObject(raw);
    if (!jsonStr) return null;
    const data = JSON.parse(jsonStr);
    const intent = (data?.intent || "").toLowerCase();
    if (!["saudacao", "pedido", "outro"].includes(intent)) return null;
    const itensInput = Array.isArray(data?.itens) ? data.itens : [];
    const itens = [];
    for (const entry of itensInput) {
      const n = normalizarItem(entry);
      if (!n) continue;
      itens.push({
        comboId: n.combo.id,
        nome: n.combo.nome,
        tamanho: n.tamanho,
        ml: n.ml,
        valorCombo: n.valorCombo,
        valorAdic: n.valorAdic,
        itensComPreco: n.itensComPreco,
      });
    }
    const out = { intent, itens };
    cacheSet(chave, out);
    return out;
  } catch (_) {
    return null;
  }
}

const PROMPT_SAUDACAO = `O usuário enviou a seguinte mensagem para um bot de WhatsApp de uma loja: "{texto}"

Esta mensagem é uma saudação, cumprimento, ou indica que a pessoa quer iniciar conversa / falar com a loja? (ex: oi, opa, e aí, alô, bom dia, qualquer cumprimento ou "quero falar")
Responda APENAS: SIM ou NAO`;

async function ehSaudacaoOuQuerFalar(texto) {
  if (!CFG.habilitaSaudacaoAssistida) return false;
  if (!texto || typeof texto !== "string") return false;
  const t = texto.trim();
  if (t.length > 80) return false;
  try {
    const chave = textoCacheKey("saudacao", t);
    const cached = cacheGet(chave);
    if (cached !== null) return cached;
    const raw = await callGeminiWithRetry(PROMPT_SAUDACAO.replace("{texto}", t.slice(0, 200)), "saudacao");
    const ok = /^\s*SIM\s*$/i.test((raw || "").trim()) || (raw || "").toUpperCase().includes("SIM");
    cacheSet(chave, ok);
    return ok;
  } catch (_) {
    return false;
  }
}

module.exports = {
  interpretarPedidoComGemini,
  interpretarIntencaoEPedidoComGemini,
  ehSaudacaoOuQuerFalar,
};
