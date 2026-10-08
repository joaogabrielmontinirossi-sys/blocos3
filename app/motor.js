'use strict';
/* Blocos 3 — o motor de desenho. Perspectiva isométrica em canvas 2D, sem bibliotecas.
   Cada peça é quebrada em cubinhos de 1 pino × 1 pino × 1 placa; os cubinhos são desenhados de baixo para cima
   e de trás para frente, e só as faces à mostra entram na cena. Com cubinhos iguais essa ordem nunca erra. */

const TW = 36;    // largura de um pino na tela
const PH = 7.2;   // altura de uma placa (um tijolo tem 3)
// girar a vista em passos de 90°: célula do mundo → célula da vista, e a volta
const rcel = (x, y, r) => r === 0 ? [x, y] : r === 1 ? [y, -x - 1] : r === 2 ? [-x - 1, -y - 1] : [-y - 1, x];
const wcel = (u, v, r) => rcel(u, v, (4 - r) % 4);
const PX = (u, v, z) => [(u - v) * TW / 2, (u + v) * TW / 4 - z * PH];

const _tons = {};
const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mist = (a, b, t) => 'rgb(' + a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',') + ')';
// [topo, face esquerda, face direita, pino] para cada cor e estado (ok = cor cheia, pend = quase cinza, fant = planta)
function tons(cor, modo) {
  const k = cor + modo; if (_tons[k]) return _tons[k];
  let c = rgb(cor); if (modo === 'pend') c = c.map((x, i) => Math.round(x + ([228, 231, 236][i] - x) * 0.86));
  const t = [mist(c, [255, 255, 255], 0.16), mist(c, [0, 0, 0], 0.06), mist(c, [0, 0, 0], 0.24), mist(c, [255, 255, 255], 0.3)];
  return _tons[k] = modo === 'fant' ? t.map(x => x.replace('rgb(', 'rgba(').replace(')', ',0.10)')) : t;
}

const Motor = {
  // pecas: [{id,x,y,z,w,d,h,cor,modo}]; fantasmas: idem, com `slot`; r: giro da vista (0 a 3)
  monta(pecas, fantasmas, r) {
    const occ = new Map(), occF = new Map(), alt = new Map(), vox = [], voxF = [];
    const poe = (p, lista, mapa, solido) => {
      for (let dx = 0; dx < p.w; dx++) for (let dy = 0; dy < p.d; dy++) {
        const [u, v] = rcel(p.x + dx, p.y + dy, r);
        for (let dz = 0; dz < p.h; dz++) { lista.push([u, v, p.z + dz, p]); mapa.set(u + ',' + v + ',' + (p.z + dz), p); }
        if (solido) { const k = (p.x + dx) + ',' + (p.y + dy); if ((alt.get(k) || 0) < p.z + p.h) alt.set(k, p.z + p.h); }
      }
    };
    pecas.forEach(p => poe(p, vox, occ, true)); fantasmas.forEach(p => poe(p, voxF, occF, false));
    const ord = (a, b) => a[2] - b[2] || (a[0] + a[1]) - (b[0] + b[1]);
    const faces = [];
    const gera = (lista, mapa, fant) => lista.sort(ord).forEach(([u, v, z, p]) => {
      const tem = (a, b, c) => mapa.has(a + ',' + b + ',' + c) || (fant && occ.has(a + ',' + b + ',' + c)), meu = (a, b, c) => mapa.get(a + ',' + b + ',' + c) === p;
      const T = tons(p.cor, fant ? 'fant' : p.modo || 'ok');
      const A = PX(u, v, z + 1), B = PX(u + 1, v, z + 1), C = PX(u + 1, v + 1, z + 1), D = PX(u, v + 1, z + 1), B0 = PX(u + 1, v, z), C0 = PX(u + 1, v + 1, z), D0 = PX(u, v + 1, z);
      const cima = tem(u, v, z + 1);
      if (!tem(u + 1, v, z)) { // face da direita
        const e = []; if (!meu(u, v, z - 1)) e.push(C0, B0); if (!meu(u, v - 1, z)) e.push(B, B0); if (!meu(u, v + 1, z)) e.push(C, C0); if (cima && !meu(u, v, z + 1)) e.push(B, C);
        faces.push({ t: 1, q: [C, B, B0, C0], f: T[2], e, p, u, v, z, fant });
      }
      if (!tem(u, v + 1, z)) { // face da esquerda
        const e = []; if (!meu(u, v, z - 1)) e.push(D0, C0); if (!meu(u - 1, v, z)) e.push(D, D0); if (!meu(u + 1, v, z)) e.push(C, C0); if (cima && !meu(u, v, z + 1)) e.push(D, C);
        faces.push({ t: 2, q: [D, C, C0, D0], f: T[1], e, p, u, v, z, fant });
      }
      if (!cima) { // topo, com o pino
        const e = []; if (!meu(u, v - 1, z)) e.push(A, B); if (!meu(u + 1, v, z)) e.push(B, C); if (!meu(u, v + 1, z)) e.push(C, D); if (!meu(u - 1, v, z)) e.push(D, A);
        faces.push({ t: 0, q: [A, B, C, D], f: T[0], e, p, u, v, z, fant, pino: fant ? null : [T[2], T[3]] });
      }
    });
    gera(vox, occ, false); gera(voxF, occF, true);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    faces.forEach(f => f.q.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }));
    if (!faces.length) { x0 = -TW * 4; x1 = TW * 4; y0 = -TW * 2; y1 = TW * 2; }
    return { faces, alt, r, caixa: [x0, y0, x1, y1] };
  },
  // câmera que enquadra a cena inteira num canvas de W × H
  enquadra(cena, W, H, folga = 40, max = 1.5) {
    const [x0, y0, x1, y1] = cena.caixa, zoom = Math.max(0.12, Math.min(max, (W - folga * 2) / (x1 - x0 || 1), (H - folga * 2) / (y1 - y0 || 1)));
    return { x: W / 2 - (x0 + x1) / 2 * zoom, y: H / 2 - (y0 + y1) / 2 * zoom, zoom };
  },
  // a base infinita: linhas dos pinos até onde a tela alcança
  chao(ctx, W, H, cam, cores) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = cores.fundo; ctx.fillRect(0, 0, W, H);
    const inv = (sx, sy) => { const x = (sx - cam.x) / cam.zoom, y = (sy - cam.y) / cam.zoom; return [x / TW + 2 * y / TW, 2 * y / TW - x / TW]; };
    const cs = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)], passo = cam.zoom < 0.3 ? 8 : cam.zoom < 0.6 ? 4 : cam.zoom < 0.9 ? 2 : 1;
    const u0 = Math.floor(Math.min(...cs.map(c => c[0])) / passo) * passo, u1 = Math.ceil(Math.max(...cs.map(c => c[0]))), v0 = Math.floor(Math.min(...cs.map(c => c[1])) / passo) * passo, v1 = Math.ceil(Math.max(...cs.map(c => c[1])));
    ctx.setTransform(cam.zoom, 0, 0, cam.zoom, cam.x, cam.y); ctx.lineWidth = 1 / cam.zoom; ctx.strokeStyle = cores.linha; ctx.beginPath();
    for (let u = u0; u <= u1; u += passo) { const a = PX(u, v0, 0), b = PX(u, v1, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let v = v0; v <= v1; v += passo) { const a = PX(u0, v, 0), b = PX(u1, v, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    if (passo === 1 && (u1 - u0) * (v1 - v0) < 5000) { // os pinos da base, quando se está perto
      ctx.fillStyle = cores.pino; ctx.beginPath();
      for (let u = u0; u < u1; u++) for (let v = v0; v < v1; v++) { const c = PX(u + 0.5, v + 0.5, 0); ctx.moveTo(c[0] + TW * 0.2, c[1]); ctx.ellipse(c[0], c[1], TW * 0.2, TW * 0.1, 0, 0, 6.3); }
      ctx.fill();
    }
  },
  // o: { sel: id destacado, anim: Map(id → deslocamento em px), sobre: cena extra translúcida (a peça sob o cursor) }
  desenha(ctx, W, H, cam, cena, o = {}) {
    const z = cam.zoom, vx0 = -cam.x / z - TW, vy0 = -cam.y / z - TW, vx1 = (W - cam.x) / z + TW, vy1 = (H - cam.y) / z + TW, pinos = z >= 0.45;
    ctx.setTransform(z, 0, 0, z, cam.x, cam.y); ctx.lineJoin = 'round';
    const face = (f, dy) => {
      const q = f.q; if (q[0][0] > vx1 + TW || q[1][0] < vx0 - TW || q[3][1] + dy < vy0 - TW * 2 || q[0][1] + dy > vy1 + TW * 2) return;
      ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1] + dy); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1] + dy); ctx.closePath();
      ctx.fillStyle = f.f; ctx.fill();
      if (!f.fant) { ctx.strokeStyle = f.f; ctx.lineWidth = 0.8 / z; ctx.stroke(); } // fecha a frestinha entre faces vizinhas
      if (f.e.length) { ctx.beginPath(); for (let i = 0; i < f.e.length; i += 2) { ctx.moveTo(f.e[i][0], f.e[i][1] + dy); ctx.lineTo(f.e[i + 1][0], f.e[i + 1][1] + dy); } ctx.strokeStyle = f.fant ? 'rgba(70,80,100,.30)' : 'rgba(0,0,0,.32)'; ctx.lineWidth = Math.max(0.6, 1 / z); ctx.stroke(); }
      if (f.pino && pinos) {
        const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2 + dy;
        ctx.beginPath(); ctx.ellipse(cx, cy, TW * 0.27, TW * 0.135, 0, 0, 6.3); ctx.fillStyle = f.pino[0]; ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx, cy - 2.6, TW * 0.27, TW * 0.135, 0, 0, 6.3); ctx.fillStyle = f.pino[1]; ctx.fill();
      }
    };
    const anim = o.anim, depois = [];
    for (const f of cena.faces) { if (anim && anim.has(f.p.id)) depois.push(f); else face(f, 0); }
    depois.forEach(f => face(f, -anim.get(f.p.id)));
    if (o.sobre) { ctx.globalAlpha = 0.62; o.sobre.faces.forEach(f => face(f, 0)); ctx.globalAlpha = 1; }
    if (o.sel) { // contorno da peça selecionada, por cima de tudo
      const tr = (cor, w) => { ctx.beginPath(); for (const f of cena.faces) if (f.p.id === o.sel) for (let i = 0; i < f.e.length; i += 2) { ctx.moveTo(f.e[i][0], f.e[i][1]); ctx.lineTo(f.e[i + 1][0], f.e[i + 1][1]); } ctx.strokeStyle = cor; ctx.lineWidth = w / z; ctx.stroke(); };
      tr('rgba(0,0,0,.85)', 5); tr('#fff', 2.4);
    }
  },
  // qual face está sob o ponto (em coordenadas da cena)? De frente para trás.
  pega(cena, x, y, filtro) {
    for (let i = cena.faces.length - 1; i >= 0; i--) {
      const f = cena.faces[i], q = f.q; if (filtro && !filtro(f)) continue;
      let dentro = true;
      for (let j = 0; j < 4 && dentro; j++) { const a = q[j], b = q[(j + 1) % 4]; if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) dentro = false; }
      if (dentro) return f;
    }
    return null;
  },
  // célula do mundo apontada: em cima de um topo, encostada numa face lateral, ou no chão
  alvo(cena, x, y) {
    const f = Motor.pega(cena, x, y, g => !g.fant);
    if (f) return wcel(f.t === 1 ? f.u + 1 : f.u, f.t === 2 ? f.v + 1 : f.v, cena.r);
    return wcel(Math.floor(x / TW + 2 * y / TW), Math.floor(2 * y / TW - x / TW), cena.r);
  },
  // altura (em placas) onde uma peça w × d pousa se a quina ficar em (x, y)
  pouso(cena, x, y, w, d) { let h = 0; for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < d; dy++) h = Math.max(h, cena.alt.get((x + dx) + ',' + (y + dy)) || 0); return h; },
};
