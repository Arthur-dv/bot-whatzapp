const { MessageMedia } = require("whatsapp-web.js");
const config = require("./config");
const { CARDAPIO } = require("./cardapio");
const parseadores = require("./parseadores");
const mensagens = require("./mensagens");
const pedidos = require("./pedidos");

const {
  fs,
  CAMINHO_LOGO,
  CAMINHO_IMAGEM_CARDAPIO,
  CAMINHO_QR_PIX,
  TEMPO_ENTREGA,
  TIMEOUT_INATIVIDADE_MIN,
  WHATSAPP_ADMIN_ID,
  HORARIO_TEXTO,
  ENDERECO_TEXTO,
  foraDoHorario,
  getUltimoEndereco,
} = config;

const {
  normalizar,
  identificarCombo,
  identificarComboETamanho,
  tamanhosDoCombo,
  extrairSoTamanho,
  parsearAdicionais,
  parsearPedidoCompleto,
  parsearEnderecoEPagamento,
  parsearFormaPagamento,
} = parseadores;

const {
  textoAdicionaisMultilinha,
  montarResumoPedido,
  textoResumoParaAdmin,
  formatarLinhaAdicionais,
} = mensagens;

const { salvarPedido, atualizarStatusPedido } = pedidos;
const {
  interpretarPedidoComGemini,
  interpretarIntencaoEPedidoComGemini,
  ehSaudacaoOuQuerFalar,
} = require("./gemini");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

function formatarWhatsAppId(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  if (/@c\.us$|@s\.whatsapp\.net$/i.test(v)) return v;
  const digits = v.replace(/\D/g, "");
  if (!digits) return "";
  return digits + "@c.us";
}

function menuTexto(saudacao, nome) {
  return (
    `${saudacao}, ${nome}! \n\n` +
    "Sou assistente de pedidos.\n\n" +
    "Digite o número da opção:\n\n" +
    "1️⃣ Ver *cardápio*\n" +
    "2️⃣ *Endereço* e como chegar\n" +
    "3️⃣ *Horário* de funcionamento\n" +
    "4️⃣ Fazer *pedido* / delivery\n\n" +
    "Ou digite *menu* ou *oi* a qualquer momento."
  );
}

async function enviarMenu(client, chatId, chat, nome) {
  const hora = new Date().getHours();
  let saudacao = "Olá";
  if (hora >= 5 && hora < 12) saudacao = "Bom dia";
  else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
  else saudacao = "Boa noite";

  const msgMenu = menuTexto(saudacao, nome);
  if (fs.existsSync(CAMINHO_LOGO)) {
    try {
      const media = MessageMedia.fromFilePath(CAMINHO_LOGO);
      await client.sendMessage(chatId, media, { caption: msgMenu });
      return;
    } catch (_) {}
  }
  await client.sendMessage(chatId, msgMenu);
}

function registerMessageHandler(client, pedidoPorCliente) {
  client.on("message", async (msg) => {
    const chatId = msg.from;
    try {
      if (msg.fromMe) return;
      if (msg.isStatus) return;
      if (!chatId || chatId.endsWith("@g.us")) return;

      const chat = await msg.getChat();
      if (chat.isGroup) return;

      const texto = (msg.body || "").trim();
      const textoLower = texto.toLowerCase();
      if (!texto && (msg.hasMedia || !(msg.body || "").trim())) {
        await client.sendMessage(
          chatId,
          "Não consegui entender. Evite enviar áudios ou arquivos – por favor, *digite* sua mensagem.\n\nSe quiser fazer um pedido ou ver opções, digite *menu* ou *oi*.",
        );
        return;
      }
      if (!texto) return;

      const typing = async () => {
        await delay(1000);
        await chat.sendStateTyping();
        await delay(0);
      };

      const textoNorm = (textoLower || "").trim();
      const textoNormSemAcento = textoNorm
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/\s+/g, " ")
        .trim();
      const listaSaudacao =
        /^(menu|oi|0i|ola|bom dia|boa tarde|boa noite|opa|oie|oii|e ai|eae|fala|falai|fala ai|salve|blz|beleza|tudo bem\??|tudo bom\??)$/.test(
          textoNormSemAcento
        );
      const isSaudacaoOuMenu =
        listaSaudacao || (textoNorm.length <= 80 && (await ehSaudacaoOuQuerFalar(textoNorm)));

      if (isSaudacaoOuMenu) {
        if (foraDoHorario()) {
          await typing();
          await client.sendMessage(
            chatId,
            "🕐 No momento estamos *fechados*.\n\n*Horário de funcionamento:*\n\n" +
              HORARIO_TEXTO,
          );
          return;
        }
        pedidoPorCliente.delete(chatId);
        let nome = "cliente";
        try {
          const contact = await msg.getContact();
          if (contact?.pushname) nome = contact.pushname.split(" ")[0] || nome;
        } catch (_) {}
        await typing();
        await enviarMenu(client, chatId, chat, nome);
        return;
      }

      let estado = pedidoPorCliente.get(chatId);
      if (estado?.etapa) {
        const ultima = estado.ultimaAtividade;
        if (
          ultima &&
          Date.now() - ultima > TIMEOUT_INATIVIDADE_MIN * 60 * 1000
        ) {
          pedidoPorCliente.delete(chatId);
          await client.sendMessage(
            chatId,
            "⏱️ Seu pedido expirou por inatividade. Digite *menu* ou *oi* para começar novamente.",
          );
          return;
        }
        estado.ultimaAtividade = Date.now();
        pedidoPorCliente.set(chatId, estado);
      }

      if (estado?.etapa === "aguardando_comprovante_pix") {
        const ehComprovante =
          msg.hasMedia ||
          /^(pago|paguei|enviado|pronto|feito|transferido|ok)$/i.test(textoLower);
        if (ehComprovante) {
          atualizarStatusPedido(chatId, "comprovante_enviado");
          pedidoPorCliente.delete(chatId);
          await typing();
          await client.sendMessage(
            chatId,
            "✅ *Comprovante recebido!*\n\nSeu pedido está sendo preparado.",
          );
          return;
        }
        await client.sendMessage(
          chatId,
          "Envie o *comprovante* do Pix (foto ou documento) ou digite *pago*.",
        );
        return;
      }

      if (estado?.etapa === "aguardando_confirmar_endereco") {
        if (/^1$|^sim$/i.test(texto.trim())) {
          pedidoPorCliente.set(chatId, {
            ...estado,
            etapa: "aguardando_forma_pagamento",
            endereco: estado.ultimoEndereco,
            ultimaAtividade: Date.now(),
          });
          await typing();
          await client.sendMessage(
            chatId,
            "Qual a *forma de pagamento*? (Pix, Dinheiro ou Cartão)",
          );
          return;
        }
        if (/^2$|outro|informar outro/i.test(texto.trim())) {
          pedidoPorCliente.set(chatId, {
            ...estado,
            etapa: "aguardando_novo_endereco",
            ultimaAtividade: Date.now(),
          });
          await typing();
          await client.sendMessage(chatId, "Envie o *endereço de entrega*.");
          return;
        }
        await client.sendMessage(
          chatId,
          "Digite 1️⃣ para usar o endereço salvo ou 2️⃣ para informar outro.",
        );
        return;
      }

      if (estado?.etapa === "aguardando_novo_endereco") {
        const endereco = texto.trim();
        if (!endereco) {
          await client.sendMessage(chatId, "Envie o endereço completo.");
          return;
        }
        pedidoPorCliente.set(chatId, {
          ...estado,
          etapa: "aguardando_forma_pagamento",
          endereco,
          ultimaAtividade: Date.now(),
        });
        await typing();
        await client.sendMessage(
          chatId,
          "Qual a *forma de pagamento*? (Pix, Dinheiro ou Cartão)",
        );
        return;
      }

      if (estado?.etapa === "aguardando_endereco") {
        const endereco = texto.trim();
        if (!endereco) {
          await client.sendMessage(chatId, "Envie o endereço completo.");
          return;
        }
        pedidoPorCliente.set(chatId, {
          ...estado,
          etapa: "aguardando_forma_pagamento",
          endereco,
          ultimaAtividade: Date.now(),
        });
        await typing();
        await client.sendMessage(
          chatId,
          "Qual a *forma de pagamento*? (Pix, Dinheiro ou Cartão)",
        );
        return;
      }

      if (estado?.etapa === "aguardando_forma_pagamento") {
        const forma = parsearFormaPagamento(texto) || texto.trim();
        const itensDoPedido = estado.itensDoPedido || [];
        const valorTotal = itensDoPedido.reduce(
          (s, i) => s + (i.valorCombo || 0) + (i.valorAdic || 0),
          0,
        );
        pedidoPorCliente.set(chatId, {
          etapa: "aguardando_confirmacao",
          pedido: {
            nome: estado.nome || "Cliente",
            descricao: estado.descricao || "",
            valor: valorTotal,
            valorCombo: itensDoPedido.reduce((s, i) => s + (i.valorCombo || 0), 0),
            valorAdic: itensDoPedido.reduce((s, i) => s + (i.valorAdic || 0), 0),
            endereco: estado.endereco,
            formaPagamento: forma || "Pix",
            itensDoPedido,
          },
          ultimaAtividade: Date.now(),
        });
        await typing();
        const resumo = montarResumoPedido(
          estado.nome || "Cliente",
          itensDoPedido,
          estado.endereco,
          forma || "Pix",
          TEMPO_ENTREGA,
        );
        await client.sendMessage(chatId, resumo);
        await client.sendMessage(chatId, "Está tudo correto?\n\n1️⃣ Confirmar\n2️⃣ Alterar");
        return;
      }

      if (estado?.etapa === "aguardando_confirmacao") {
        const n = normalizar(texto);
        const confirmar = texto.trim() === "1" || /^(sim|confirmar|confirmo)$/i.test(n);
        const alterar = texto.trim() === "2" || /^(alterar|mudar)$/i.test(n);
        if (confirmar) {
          const pedido = estado.pedido;
          await typing();
          salvarPedido(pedido, chatId);
          if (WHATSAPP_ADMIN_ID) {
            const idAdmin = formatarWhatsAppId(WHATSAPP_ADMIN_ID);
            try {
              if (idAdmin) await client.sendMessage(idAdmin, textoResumoParaAdmin(pedido));
            } catch (err) {
              console.error("Falha ao enviar pedido para WHATSAPP_ADMIN_ID:", err?.message || err);
            }
          }
          const formaNorm = normalizar(pedido.formaPagamento || "");
          const ehPix = formaNorm.includes("pix");
          if (ehPix && fs.existsSync(CAMINHO_QR_PIX)) {
            try {
              const media = MessageMedia.fromFilePath(CAMINHO_QR_PIX);
              await client.sendMessage(chatId, media, {
                caption:
                  "✅ *Pedido confirmado!*\n\nPague no Pix e envie o comprovante aqui.",
              });
            } catch (_) {
              await client.sendMessage(
                chatId,
                "✅ *Pedido confirmado!* Pague no Pix e envie o comprovante aqui.",
              );
            }
            pedidoPorCliente.set(chatId, {
              etapa: "aguardando_comprovante_pix",
              pedido,
              ultimaAtividade: Date.now(),
            });
            return;
          }
          await client.sendMessage(chatId, "✅ *Pedido confirmado!*");
          pedidoPorCliente.delete(chatId);
          return;
        }
        if (alterar) {
          pedidoPorCliente.delete(chatId);
          await client.sendMessage(chatId, "Ok! Digite *menu* para recomeçar o pedido.");
          return;
        }
        await client.sendMessage(chatId, "Digite 1️⃣ para confirmar ou 2️⃣ para alterar.");
        return;
      }

      if (!estado?.etapa && texto === "1") {
        await typing();
        if (CAMINHO_IMAGEM_CARDAPIO && fs.existsSync(CAMINHO_IMAGEM_CARDAPIO)) {
          try {
            const media = MessageMedia.fromFilePath(CAMINHO_IMAGEM_CARDAPIO);
            await client.sendMessage(chatId, media, {
              caption: "🍇 *Cardápio* – Confira nossas opções!",
            });
          } catch (_) {}
        }
        await client.sendMessage(chatId, "Digite 4️⃣ para fazer seu pedido.");
        return;
      }

      if (!estado?.etapa && texto === "2") {
        await typing();
        await client.sendMessage(chatId, "📍 *ENDEREÇO*\n\n" + ENDERECO_TEXTO);
        return;
      }

      if (!estado?.etapa && texto === "3") {
        await typing();
        await client.sendMessage(chatId, "🕐 *HORÁRIO*\n\n" + HORARIO_TEXTO);
        return;
      }

      if (!estado?.etapa && texto === "4") {
        pedidoPorCliente.set(chatId, { etapa: "aguardando_pedido", ultimaAtividade: Date.now() });
        await typing();
        await client.sendMessage(
          chatId,
          "🛒 *FAZER PEDIDO*\n\nDigite o *número* ou *nome do item*:\n\n" +
            CARDAPIO.map((c, i) => `${i + 1}️⃣ ${c.nome}`).join("\n"),
        );
        return;
      }

      if (estado?.etapa === "aguardando_pedido") {
        const aiIntent = await interpretarIntencaoEPedidoComGemini(texto);
        if (aiIntent?.intent === "saudacao") {
          let nome = "cliente";
          try {
            const contact = await msg.getContact();
            if (contact?.pushname) nome = contact.pushname.split(" ")[0] || nome;
          } catch (_) {}
          await typing();
          await enviarMenu(client, chatId, chat, nome);
          return;
        }
        if (aiIntent?.intent === "pedido" && Array.isArray(aiIntent.itens) && aiIntent.itens.length >= 1) {
          let nomeCliente = "Cliente";
          try {
            const contact = await msg.getContact();
            if (contact?.pushname) nomeCliente = contact.pushname;
          } catch (_) {}
          const itens = aiIntent.itens.map((i) => ({
            ...i,
            descricao: `${i.nome} ${i.tamanho}${i.itensComPreco?.length ? " + " + formatarLinhaAdicionais(i.itensComPreco) : ""}`,
          }));
          const ultimo = getUltimoEndereco(chatId);
          if (ultimo) {
            pedidoPorCliente.set(chatId, {
              etapa: "aguardando_confirmar_endereco",
              nome: nomeCliente,
              itensDoPedido: itens,
              ultimoEndereco: ultimo,
              ultimaAtividade: Date.now(),
            });
            await client.sendMessage(
              chatId,
              "Já conheço você de atendimentos anteriores. 🙂\n\nSeu endereço: " +
                ultimo +
                "\n\nDeseja usar esse? 1️⃣ Sim / 2️⃣ Informar outro",
            );
            return;
          }
          pedidoPorCliente.set(chatId, {
            etapa: "aguardando_endereco",
            nome: nomeCliente,
            itensDoPedido: itens,
            ultimaAtividade: Date.now(),
          });
          await client.sendMessage(chatId, "Envie seu *endereço de entrega*.");
          return;
        }
        let parsed = parsearPedidoCompleto(texto);
        let combo = parsed?.combo || identificarCombo(texto);
        if (!combo) {
          const geminiResult = await interpretarPedidoComGemini(texto);
          if (geminiResult) {
            parsed = geminiResult;
            combo = geminiResult.combo;
          }
        }
        if (!combo) {
          if (aiIntent?.intent === "outro") {
            await client.sendMessage(
              chatId,
              "Não identifiquei um pedido. Você pode:\n\n" +
                "• Digite *menu* para ver opções (cardápio, endereço, horário)\n" +
                `• Ou digite o *número* (1️⃣ a ${CARDAPIO.length}️⃣) ou *nome do item* para fazer seu pedido`,
            );
          } else {
            await client.sendMessage(chatId, "Não entendi. Digite o *número* (ex: 1️⃣, 2️⃣...) ou o nome do item.");
          }
          return;
        }
        const tamanhos = tamanhosDoCombo(combo);
        const ml = parsed?.ml;
        const tamanho = parsed?.tamanho;
        if (ml && tamanho) {
          const itensComPreco = parsed?.itensComPreco || [];
          const valorCombo = combo.tamanhos[ml] || 0;
          const valorAdic = itensComPreco.reduce((s, x) => s + x.preco, 0);
          const descricao = `${combo.nome} ${tamanho}${itensComPreco.length ? " + " + formatarLinhaAdicionais(itensComPreco) : ""}`;
          const item = { comboId: combo.id, nome: combo.nome, tamanho, ml, valorCombo, valorAdic, itensComPreco, descricao };
          let nomeCliente = "Cliente";
          try {
            const contact = await msg.getContact();
            if (contact?.pushname) nomeCliente = contact.pushname;
          } catch (_) {}

          const ultimo = getUltimoEndereco(chatId);
          if (ultimo) {
            pedidoPorCliente.set(chatId, {
              etapa: "aguardando_confirmar_endereco",
              nome: nomeCliente,
              itensDoPedido: [item],
              ultimoEndereco: ultimo,
              ultimaAtividade: Date.now(),
            });
            await client.sendMessage(
              chatId,
              "Já conheço você de atendimentos anteriores. 🙂\n\nSeu endereço: " +
                ultimo +
                "\n\nDeseja usar esse? 1️⃣ Sim / 2️⃣ Informar outro",
            );
            return;
          }

          pedidoPorCliente.set(chatId, {
            etapa: "aguardando_endereco",
            nome: nomeCliente,
            itensDoPedido: [item],
            ultimaAtividade: Date.now(),
          });
          await client.sendMessage(chatId, "Envie seu *endereço de entrega*.");
          return;
        }
        if (tamanhos.length === 1) {
          const unico = tamanhos[0];
          pedidoPorCliente.set(chatId, {
            etapa: "aguardando_adicionais",
            comboId: combo.id,
            tamanho: unico === "300" ? "300ml" : unico === "1000" ? "1L" : "500ml",
            ml: unico,
            adicionaisAcumulados: [],
            ultimaAtividade: Date.now(),
          });
          await typing();
          await client.sendMessage(
            chatId,
            `*${combo.nome}* anotado.\n\nDeseja algum *adicional*?\n${textoAdicionaisMultilinha()}\n\nDigite os nomes ou *nenhum*.`,
          );
          return;
        }
        pedidoPorCliente.set(chatId, {
          etapa: "aguardando_tamanho",
          comboId: combo.id,
          ultimaAtividade: Date.now(),
        });
        await typing();
        if (tamanhos.length === 2) {
          await client.sendMessage(
            chatId,
            `*${combo.nome}* – Qual tamanho?\n\n1️⃣ ${tamanhos[0]}ml\n2️⃣ ${tamanhos[1]}ml\n\nResponda com 1 ou 2.`,
          );
        } else {
          await client.sendMessage(
            chatId,
            `*${combo.nome}* – Qual tamanho? ${tamanhos.map((m) => m + "ml").join(" ou ")}`,
          );
        }
        return;
      }

      if (estado?.etapa === "aguardando_tamanho") {
        const combo = CARDAPIO.find((c) => c.id === estado.comboId);
        if (!combo) {
          pedidoPorCliente.set(chatId, { etapa: "aguardando_pedido", ultimaAtividade: Date.now() });
          await client.sendMessage(chatId, "Digite o item novamente.");
          return;
        }
        const tamanhos = tamanhosDoCombo(combo);
        const escolhaIdx =
          tamanhos.length === 2 && (texto.trim() === "1" || texto.trim() === "2")
            ? parseInt(texto.trim(), 10) - 1
            : null;
        if (escolhaIdx != null && tamanhos[escolhaIdx]) {
          const mlEscolhido = tamanhos[escolhaIdx];
          const tamanhoStr =
            mlEscolhido === "300"
              ? "300ml"
              : mlEscolhido === "1000"
                ? "1L"
                : mlEscolhido === "700"
                  ? "700ml"
                  : mlEscolhido + "ml";
          pedidoPorCliente.set(chatId, {
            etapa: "aguardando_adicionais",
            comboId: combo.id,
            tamanho: tamanhoStr,
            ml: mlEscolhido,
            adicionaisAcumulados: [],
            ultimaAtividade: Date.now(),
          });
          await typing();
          await client.sendMessage(
            chatId,
            `*${combo.nome}* ${tamanhoStr} anotado.\n\nDeseja algum *adicional*?\n${textoAdicionaisMultilinha()}\n\nDigite os nomes ou *nenhum*.`,
          );
          return;
        }
        const soTamanho = extrairSoTamanho(texto);
        const ml = soTamanho?.ml;
        if (ml && tamanhos.includes(ml)) {
          pedidoPorCliente.set(chatId, {
            etapa: "aguardando_adicionais",
            comboId: combo.id,
            tamanho: soTamanho.tamanho,
            ml,
            adicionaisAcumulados: [],
            ultimaAtividade: Date.now(),
          });
          await typing();
          await client.sendMessage(
            chatId,
            `*${combo.nome}* ${soTamanho.tamanho} anotado.\n\nDeseja algum *adicional*?\n${textoAdicionaisMultilinha()}\n\nDigite os nomes ou *nenhum*.`,
          );
          return;
        }
        if (tamanhos.length === 2) {
          await client.sendMessage(
            chatId,
            `Escolha o tamanho:\n\n1️⃣ ${tamanhos[0]}ml\n2️⃣ ${tamanhos[1]}ml\n\nResponda com 1 ou 2.`,
          );
        } else {
          await client.sendMessage(
            chatId,
            `Escolha o tamanho: ${tamanhos.map((m) => m + "ml").join(" ou ")}`,
          );
        }
        return;
      }

      if (estado?.etapa === "aguardando_adicionais") {
        const combo = CARDAPIO.find((c) => c.id === estado.comboId);
        if (!combo) {
          pedidoPorCliente.set(chatId, { etapa: "aguardando_pedido", ultimaAtividade: Date.now() });
          await client.sendMessage(chatId, "Digite o item novamente.");
          return;
        }
        const acumulados = estado.adicionaisAcumulados || [];
        if (/^(nenhum|nenhuma|sem|nao|não|n)$/i.test(textoLower)) {
          const itensComPreco = acumulados;
          const valorAdic = itensComPreco.reduce((s, x) => s + x.preco, 0);
          const valorCombo = combo.tamanhos[estado.ml] || 0;
          const descricao = `${combo.nome} ${estado.tamanho}${itensComPreco.length ? " + " + formatarLinhaAdicionais(itensComPreco) : ""}`;
          const item = {
            comboId: combo.id,
            nome: combo.nome,
            tamanho: estado.tamanho,
            ml: estado.ml,
            valorCombo,
            valorAdic,
            itensComPreco,
            descricao,
          };
          let nomeCliente = "Cliente";
          try {
            const contact = await msg.getContact();
            if (contact?.pushname) nomeCliente = contact.pushname;
          } catch (_) {}

          const ultimo = getUltimoEndereco(chatId);
          if (ultimo) {
            pedidoPorCliente.set(chatId, {
              etapa: "aguardando_confirmar_endereco",
              nome: nomeCliente,
              itensDoPedido: [item],
              ultimoEndereco: ultimo,
              ultimaAtividade: Date.now(),
            });
            await client.sendMessage(
              chatId,
              "Já conheço você de atendimentos anteriores. 🙂\n\nSeu endereço: " +
                ultimo +
                "\n\nDeseja usar esse? 1️⃣ Sim / 2️⃣ Informar outro",
            );
            return;
          }

          pedidoPorCliente.set(chatId, {
            etapa: "aguardando_endereco",
            nome: nomeCliente,
            itensDoPedido: [item],
            ultimaAtividade: Date.now(),
          });
          await client.sendMessage(chatId, "Envie seu *endereço de entrega*.");
          return;
        }

        const { itensComPreco: novos } = parsearAdicionais(texto);
        if (!novos || novos.length === 0) {
          await client.sendMessage(chatId, "Não entendi. Digite os *nomes* dos adicionais ou *nenhum*.");
          return;
        }
        pedidoPorCliente.set(chatId, { ...estado, adicionaisAcumulados: [...acumulados, ...novos], ultimaAtividade: Date.now() });
        await client.sendMessage(chatId, "Anotado. Quer mais algum adicional? (ou *nenhum*)");
        return;
      }

      await client.sendMessage(chatId, "Não entendi. Digite *menu* ou *oi*.");
    } catch (error) {
      console.error("❌ Erro no processamento da mensagem:", error);
      try {
        await client.sendMessage(
          chatId,
          "Algo deu errado no momento. Tente novamente ou digite *menu* para recomeçar.",
        );
      } catch (_) {}
    }
  });
}

module.exports = { registerMessageHandler };
