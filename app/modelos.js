'use strict';
/* Blocos 3 — modelos de construção (as plantas). Cada modelo é descrito em camadas de células coloridas
   e depois "legoizado": as células viram peças de verdade (2x4, 2x2, 1x4…), com as juntas desencontradas.
   A ordem das peças é a ordem de montagem: de baixo para cima. */

const K = { v: '#C91A09', a: '#0055BF', y: '#F2CD37', g: '#237841', o: '#FE8A18', w: '#F4F4F4', k: '#1B2A34', c: '#9BA19D', m: '#582A12', s: '#E4CD9E', p: '#E4ADC8', t: '#36AEBF', l: '#A5CA18', r: '#81007B' };
const PALETA = [K.v, K.o, K.y, K.l, K.g, K.t, K.a, K.r, K.p, K.w, K.c, K.k, K.m, K.s];
const FORMAS = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [2, 2], [2, 3], [2, 4], [2, 6], [4, 4]];

const ret = (x0, y0, w, d) => { const o = []; for (let y = y0; y < y0 + d; y++) for (let x = x0; x < x0 + w; x++) o.push([x, y]); return o; };
const anel = (x0, y0, w, d) => ret(x0, y0, w, d).filter(([x, y]) => x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + d - 1);
const disco = (cx, cy, r) => ret(Math.floor(cx - r), Math.floor(cy - r), Math.ceil(2 * r) + 1, Math.ceil(2 * r) + 1).filter(([x, y]) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r);
const menos = (a, b) => { const s = new Set(b.map(c => c + '')); return a.filter(c => !s.has(c + '')); };

// células → peças: em cada camada tenta encaixar a maior peça possível; a orientação alterna a cada camada
const ENCAIXES = [[4, 2], [2, 4], [3, 2], [2, 3], [2, 2], [4, 1], [1, 4], [3, 1], [1, 3], [2, 1], [1, 2], [1, 1]];
function legoiza(camadas) {
  const out = [];
  Object.keys(camadas).map(Number).sort((a, b) => a - b).forEach(z => {
    const cel = camadas[z], livre = new Set(cel.keys()), par = z % 2 === 0;
    const ordem = [...cel.keys()].map(k => k.split(',').map(Number)).sort((a, b) => par ? a[1] - b[1] || a[0] - b[0] : a[0] - b[0] || a[1] - b[1]);
    const formas = par ? ENCAIXES : ENCAIXES.map(([w, d]) => [d, w]);
    ordem.forEach(([x, y]) => {
      if (!livre.has(x + ',' + y)) return;
      const cor = cel.get(x + ',' + y);
      for (const [w, d] of formas) {
        let ok = true;
        for (let dy = 0; dy < d && ok; dy++) for (let dx = 0; dx < w && ok; dx++) { const k = (x + dx) + ',' + (y + dy); if (!livre.has(k) || cel.get(k) !== cor) ok = false; }
        if (!ok) continue;
        for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) livre.delete((x + dx) + ',' + (y + dy));
        out.push({ x, y, z: z * 3, w, d, h: 3, cor }); break;
      }
    });
  });
  return out;
}
// desenho em pontos, de pé: cada linha é uma camada de tijolos com dois pinos de fundo
function pixel(linhas, pal) {
  return add => linhas.forEach((l, i) => [...l].forEach((ch, x) => { if (ch !== '.') add(linhas.length - 1 - i, [[x, 0], [x, 1]], pal[ch] || pal['#']); }));
}

const MODELOS = [
  { id: 'casa', nome: 'Casa', desc: 'Paredes, porta, janela e telhado de duas águas.', f: add => {
    const porta = [[3, 5], [4, 5]], jan = [[7, 2], [7, 3]];
    for (let z = 0; z < 4; z++) { add(z, menos(anel(0, 0, 8, 6), (z < 2 ? porta : []).concat(z === 1 || z === 2 ? jan : [])), z ? K.w : K.a); if (z < 2) add(z, porta, K.m); if (z === 1 || z === 2) add(z, jan, K.t); }
    for (let i = 0; i < 4; i++) add(4 + i, ret(-1, i - 1, 10, 8 - 2 * i), K.v);
  } },
  { id: 'torre', nome: 'Torre', desc: 'Oito andares, mirante com ameias e bandeira.', f: add => {
    for (let z = 0; z < 8; z++) add(z, anel(0, 0, 4, 4), z % 2 ? K.w : K.c);
    add(8, ret(-1, -1, 6, 6), K.c); add(9, anel(-1, -1, 6, 6).filter(([x, y]) => (x + y) % 2 === 0), K.c);
    for (let z = 9; z < 12; z++) add(z, [[1, 1]], K.k); add(11, [[2, 1]], K.v);
  } },
  { id: 'piramide', nome: 'Pirâmide', desc: 'Cinco degraus de areia com a ponta dourada.', f: add => { for (let i = 0; i < 5; i++) add(i, ret(i, i, 10 - 2 * i, 10 - 2 * i), i === 4 ? K.y : K.s); } },
  { id: 'castelo', nome: 'Castelo', desc: 'Quatro torres, muralhas e portão.', f: add => {
    const cantos = [[0, 0], [10, 0], [0, 10], [10, 10]];
    for (let z = 0; z < 6; z++) cantos.forEach(([x, y]) => add(z, anel(x, y, 4, 4), K.c));
    cantos.forEach(([x, y]) => add(6, anel(x, y, 4, 4).filter(([a, b]) => (a + b) % 2 === 0), K.k));
    const portao = [[6, 12], [7, 12], [6, 11], [7, 11]];
    for (let z = 0; z < 4; z++) { add(z, menos(ret(4, 1, 6, 2).concat(ret(4, 11, 6, 2), ret(1, 4, 2, 6), ret(11, 4, 2, 6)), z < 3 ? portao : []), K.s); if (z < 3) add(z, portao.slice(2), K.m); }
    add(4, ret(4, 12, 6, 1).concat(ret(12, 4, 1, 6), ret(4, 1, 6, 1), ret(1, 4, 1, 6)).filter(([x, y]) => (x + y) % 2 === 0), K.s);
  } },
  { id: 'ponte', nome: 'Ponte', desc: 'Dois pilares, tabuleiro e guarda-corpos.', f: add => {
    for (let z = 0; z < 4; z++) add(z, ret(0, 0, 2, 4).concat(ret(12, 0, 2, 4)), K.c);
    add(3, ret(2, 0, 2, 4).concat(ret(10, 0, 2, 4)), K.c); add(4, ret(-2, 0, 18, 4), K.k); add(5, ret(-2, 0, 18, 1).concat(ret(-2, 3, 18, 1)), K.v);
  } },
  { id: 'foguete', nome: 'Foguete', desc: 'Corpo branco, faixa, escotilha, aletas e ponta.', f: add => {
    const corpo = disco(2, 2, 2.2), esc = [[3, 1], [3, 2]];
    add(0, [[-1, 1], [-1, 2], [4, 1], [4, 2], [1, -1], [2, -1], [1, 4], [2, 4]], K.v); add(1, [[-1, 1], [-1, 2], [4, 1], [4, 2], [1, -1], [2, -1], [1, 4], [2, 4]], K.v);
    for (let z = 0; z < 8; z++) { add(z, z === 5 ? menos(corpo, esc) : corpo, z === 3 ? K.v : K.w); if (z === 5) add(z, esc, K.t); }
    add(8, ret(1, 1, 2, 2), K.v); add(9, ret(1, 1, 2, 2), K.v); add(10, [[1, 1]], K.y);
  } },
  { id: 'arvore', nome: 'Árvore', desc: 'Tronco, copa em três andares e duas maçãs.', f: add => {
    const copa = menos(ret(0, 0, 6, 6), [[0, 0], [5, 0], [0, 5], [5, 5]]), frutas = [[5, 2], [2, 5]];
    for (let z = 0; z < 3; z++) add(z, ret(2, 2, 2, 2), K.m);
    add(3, menos(copa, frutas), K.g); add(3, frutas, K.v); add(4, copa, K.g); add(5, ret(1, 1, 4, 4), K.l); add(6, ret(2, 2, 2, 2), K.g);
  } },
  { id: 'farol', nome: 'Farol', desc: 'Faixas vermelhas e brancas, plataforma e lanterna.', f: add => {
    for (let z = 0; z < 10; z++) add(z, disco(2, 2, 2.2), z % 2 ? K.w : K.v);
    add(10, disco(2, 2, 3.2), K.k); add(11, ret(1, 1, 2, 2), K.y); add(12, disco(2, 2, 2.2), K.v); add(13, ret(1, 1, 2, 2), K.v);
  } },
  { id: 'escada', nome: 'Escada', desc: 'Seis degraus: cada tarefa sobe um pouco.', f: add => { for (let i = 0; i < 6; i++) for (let z = 0; z <= i; z++) add(z, ret(i * 2, 0, 2, 4), z === i ? K.w : K.c); } },
  { id: 'carro', nome: 'Carro', desc: 'Rodas, carroceria, faróis e cabine.', f: add => {
    add(0, ret(1, 0, 2, 1).concat(ret(6, 0, 2, 1), ret(1, 3, 2, 1), ret(6, 3, 2, 1)), K.k); add(0, ret(1, 1, 2, 2).concat(ret(6, 1, 2, 2)), K.c);
    add(1, ret(0, 0, 9, 4), K.v); add(2, menos(ret(0, 0, 9, 4), [[8, 0], [8, 3]]), K.v); add(2, [[8, 0], [8, 3]], K.y); add(3, ret(2, 0, 5, 4), K.t); add(4, ret(2, 0, 5, 4), K.v);
  } },
  { id: 'barco', nome: 'Veleiro', desc: 'Casco, convés, mastro e vela.', f: add => {
    add(0, ret(2, 0, 8, 4), K.v); add(1, ret(1, 0, 10, 4).concat([[11, 1], [11, 2]]), K.w); add(2, ret(1, 0, 10, 4), K.s);
    for (let z = 3; z < 9; z++) add(z, [[5, 1], [5, 2]], K.m);
    for (let z = 4; z < 8; z++) add(z, ret(6, 1, 8 - z, 1), K.w); add(9, [[5, 1]], K.v);
  } },
  { id: 'muro', nome: 'Muro', desc: 'Tijolos em fiadas desencontradas, de cinco cores.', pecas: () => {
    const o = [], cs = [K.v, K.o, K.y, K.g, K.a];
    for (let z = 0; z < 6; z++) (z % 2 ? [[0, 2], [2, 4], [6, 4], [10, 4], [14, 2]] : [[0, 4], [4, 4], [8, 4], [12, 4]]).forEach(([x, w], i) => o.push({ x, y: 0, z: z * 3, w, d: 2, h: 3, cor: cs[(i + z) % cs.length] }));
    return o;
  } },
  { id: 'coracao', nome: 'Coração', desc: 'Um coração de pé, feito ponto a ponto.', f: pixel(['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'], { '#': K.v }) },
  { id: 'estrela', nome: 'Estrela', desc: 'Uma estrela dourada de cinco pontas.', f: pixel(['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..#####..', '.###.###.', '.#.....#.'], { '#': K.y }) },
  { id: 'trofeu', nome: 'Troféu', desc: 'Taça dourada com base preta.', f: pixel(['y.yyyyy.y', 'yyyyyyyyy', 'y.yyyyy.y', '..yyyyy..', '...yyy...', '....y....', '....y....', '...kkk...', '..kkkkk..'], { y: K.y, k: K.k }) },
  { id: 'cogumelo', nome: 'Cogumelo', desc: 'Chapéu vermelho de pintas brancas.', f: pixel(['..vvvvv..', '.vwvvvwv.', 'vvvvwvvvv', 'vvwvvvwvv', 'vvvvvvvvv', '...sss...', '...sss...', '..sssss..'], { v: K.v, w: K.w, s: K.s }) },
  { id: 'robo', nome: 'Robô', desc: 'Cabeça, olhos, tronco, braços e pernas.', f: pixel(['..ccccc..', '..ctctc..', '..ccccc..', '...ccc...', '.aaaaaaa.', 'c.aayaa.c', 'c.aaaaa.c', '..aaaaa..', '..kk.kk..', '..kk.kk..'], { c: K.c, t: K.t, a: K.a, y: K.y, k: K.k }) },
  { id: 'livre', nome: 'Base livre', desc: 'Sem planta: a base infinita é toda sua.', pecas: () => [] },
];

const _plantas = {};
// as peças de um modelo, em ordem de montagem (calculadas uma vez)
function planta(id) {
  if (_plantas[id]) return _plantas[id];
  const m = MODELOS.find(x => x.id === id); if (!m) return _plantas[id] = [];
  if (m.pecas) return _plantas[id] = m.pecas();
  const cam = {};
  m.f((z, cels, cor) => { const c = cam[z] || (cam[z] = new Map()); cels.forEach(([x, y]) => c.set(x + ',' + y, cor)); });
  return _plantas[id] = legoiza(cam);
}
