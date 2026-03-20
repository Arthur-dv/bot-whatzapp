# Bot WhatsApp

Bot de atendimento e pedidos por WhatsApp para loja de açaí. O cliente faz o pedido pelo chat, informa endereço e pagamento, e a loja recebe o resumo e pode solicitar comprovante Pix.

## Modo Web (QR Code) vs API oficial (Cloud)

| | `npm start` (`chatbot.js`) | `npm run start:cloud` (`chatbot-cloud.js`) |
|--|-----------------------------|---------------------------------------------|
| Conexão | Escaneia **QR Code** no terminal (WhatsApp Web) | **Sem QR**: número da loja na Meta + token + webhook |
| Biblioteca | `whatsapp-web.js` + Puppeteer | HTTPS + Graph API (fetch) |
| Uso | Bom para testes e MVPs | Melhor para produção e conformidade |

**API oficial (Cloud):** no [Meta for Developers](https://developers.facebook.com/) crie um app com WhatsApp, obtenha **Phone number ID**, **Access token** (permanente ou de sistema), defina **Verify token** (uma string sua) e configure o webhook público `https://SEU_DOMINIO/webhook` com os mesmos dados. O servidor precisa ser acessível na internet (túnel tipo ngrok ou VPS).

Variáveis no `.env` para Cloud:

| Variável | Descrição |
|----------|-----------|
| `WHATSAPP_ACCESS_TOKEN` | Token Bearer da Graph API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número na Cloud API |
| `WHATSAPP_VERIFY_TOKEN` | Mesmo valor cadastrado no webhook na Meta |
| `WHATSAPP_APP_SECRET` | (Opcional) para validar assinatura `X-Hub-Signature-256` |
| `WHATSAPP_CLOUD_PORT` | Porta local do servidor webhook (padrão 3000) |

**Limitação atual no Cloud:** o webhook só processa mensagens de **texto**. Mídia (foto do comprovante Pix) pode ser adicionada depois.

Requer **Node 18+** (uso de `fetch` / `Blob` no envio de imagens).

## Como rodar

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Crie o arquivo de configuração:
   ```bash
   cp .env.example .env
   ```
   Edite o `.env` e preencha com os dados da sua loja (endereço, horário, número do admin etc.).

3. Inicie o bot:
   ```bash
   npm start
   ```

4. Escaneie o **QR Code** que aparecer no terminal com o WhatsApp (Dispositivos conectados > Conectar dispositivo). Depois disso o bot fica online.

## Variáveis do `.env`

| Variável | Descrição |
|----------|-----------|
| `TEMPO_ENTREGA` | Tempo de entrega em minutos (ex.: 20) |
| `ENDERECO_TEXTO` | Endereço da loja (use `\n` para quebra de linha) |
| `HORARIO_TEXTO` | Horário de funcionamento (texto livre, use `\n` para quebras) |
| `WHATSAPP_ADMIN_ID` | Número do WhatsApp que recebe os pedidos (ex.: 5511999999999) |
| `TIMEOUT_INATIVIDADE_MIN` | Minutos sem resposta para expirar o pedido (ex.: 30) |
| `PASTA_PEDIDOS` | Pasta onde os pedidos em JSON são salvos (ex.: pedidos) |

### Horário de funcionamento (aberto/fechado)

O bot só aceita **novo pedido** quando a loja está “aberta”. O horário padrão é:

- **Segunda a sexta:** 10h às 22h  
- **Sábado:** 10h às 23h  
- **Domingo:** 11h às 21h  

Para mudar, use no `.env` (dia 0 = domingo, 6 = sábado):

- `HORARIO_0=11-21` (domingo: abre 11h, fecha 21h)
- `HORARIO_1=10-22` (segunda)
- …
- `HORARIO_6=10-23` (sábado)

Formato: `HORARIO_X=abre-fecha` em hora (0–23).

## Arquivos importantes

- **`chatbot.js`** – Ponto de entrada Web: QR Code + `whatsapp-web.js`
- **`chatbot-cloud.js`** – Ponto de entrada API oficial: servidor webhook na porta configurada
- **`cloudWebhook.js`** – Rotas GET/POST `/webhook` da Cloud API
- **`whatsappCloudApi.js`** – Chamadas Graph API (texto e imagem local)
- **`webJsTransport.js`** – Envio de mensagens via `whatsapp-web.js`
- **`config.js`** – Variáveis de ambiente, caminhos (logo, cardápio, QR Pix), horário, endereço salvo
- **`cardapio.js`** – Dados do cardápio e adicionais
- **`parseadores.js`** – Funções que interpretam texto (combo, tamanho, adicionais, endereço, pagamento)
- **`mensagens.js`** – Formatação de resumos e listas (montarResumoPedido, textoAdicionaisMultilinha, etc.)
- **`pedidos.js`** – Salvar pedido em JSON e atualizar status (comprovante)
- **`messageHandler.js`** – Toda a lógica do fluxo de mensagens (menu, pedido, confirmação, alterar, etc.)
- **`cardapio.jpeg`** (ou .jpg/.png) – Imagem do cardápio enviada na opção 1
- **`logo.png`** – Logo enviada no menu inicial
- **`qrpix.jpeg`** (ou .jpg/.png) – QR Code do Pix enviado após confirmar pedido
- **`pedidos/`** – Pasta onde ficam os JSON dos pedidos confirmados

## Fluxo do cliente

1. Cliente manda *menu* ou *oi* e vê as opções (cardápio, endereço, horário, pedido).
2. Opção 4: fazer pedido. Pode digitar número do item (1–7), nome do item ou pedido completo (ex.: *açaí tradicional 500 com banana e 2 granola*).
3. Endereço e forma de pagamento em uma mensagem (ex.: *Rua X, 100. Pix*).
4. Resumo e confirmação (1 = confirmar, 2 = alterar).
5. Se for Pix, o bot envia o QR Code e pede o comprovante; ao receber, o pedido é marcado e a loja pode acompanhar na pasta `pedidos/`.

Pedidos salvos em `pedidos/` têm `status`: `confirmado` ou `comprovante_enviado` (após envio do comprovante).
