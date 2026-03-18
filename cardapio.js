const CARDAPIO = [
  {
    id: "raiz",
    nome: "Açaí Raiz (puro)",
    palavras: ["raiz", "puro", "acai raiz", "açaí raiz"],
    tamanhos: { 300: 18, 500: 20 },
    complementos: [],
  },
  {
    id: "tradicional",
    nome: "Açaí Tradicional",
    palavras: ["tradicional", "acai tradicional", "açaí tradicional"],
    tamanhos: { 300: 16, 500: 18 },
    complementos: ["banana", "leite em pó", "leite condensado", "granola"],
  },
  {
    id: "morango",
    nome: "Açaí com Morango",
    palavras: ["morango", "acai morango", "açaí morango", "com morango"],
    tamanhos: { 300: 18, 500: 20 },
    complementos: ["morango", "leite em pó", "leite condensado", "granola"],
  },
  {
    id: "especial",
    nome: "Especial Amor, Alegria & Frutas",
    palavras: ["especial", "acai especial", "açaí especial", "amor alegria"],
    tamanhos: { 500: 29 },
    complementos: [
      "banana",
      "manga",
      "morango",
      "kiwi",
      "leite em pó",
      "leite condensado",
      "chantilly",
      "castanha de caju",
    ],
  },
  {
    id: "vitamina_laranja",
    nome: "Vitamina de Açaí com Laranja",
    palavras: ["vitamina laranja", "laranja", "acai laranja"],
    tamanhos: { 300: 12, 500: 14 },
    complementos: [],
  },
  {
    id: "vitamina_leite",
    nome: "Vitamina de Açaí com Leite",
    palavras: ["vitamina leite", "vitamina de leite", "acai leite"],
    tamanhos: { 300: 14, 500: 16 },
    complementos: ["leite em pó", "leite condensado"],
  },
  {
    id: "salada",
    nome: "Salada de Frutas",
    palavras: ["salada", "salada de frutas", "frutas"],
    tamanhos: { 300: 16 },
    complementos: [
      "banana",
      "maçã",
      "uva",
      "mamão",
      "abacaxi",
      "manga",
      "morango",
      "kiwi",
      "suco de laranja",
    ],
  },
];

const ADICIONAIS = {
  banana: 3,
  manga: 3.5,
  morango: 4.5,
  kiwi: 5,
  granola: 3,
  paçoca: 3,
  pacoca: 3,
  castanha: 4,
  "castanha de caju": 4,
  "leite em pó": 3,
  "leite em po": 3,
  "leite condensado": 3,
  chantilly: 3,
};

const CANONICO_ADICIONAL = {
  "leite em po": "leite em pó",
  pacoca: "paçoca",
};

module.exports = { CARDAPIO, ADICIONAIS, CANONICO_ADICIONAL };
