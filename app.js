'use strict';
/* Blocos 3 — o app: galeria de construções, o palco de montar (canvas), o painel de tarefas e calendário, e os eventos. */

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fmtData = (s, o) => parse(s).toLocaleDateString('pt-BR', o || { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDia = s => { const t = today(); return s === t ? 'Hoje' : s === addDays(t, 1) ? 'Amanhã' : s === addDays(t, -1) ? 'Ontem' : fmtData(s, { weekday: 'short', day: 'numeric', month: 'short' }); };
const plural = (n, um, varios) => n + ' ' + (n === 1 ? um : varios);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const pecasDe = id => S.pecas.filter(p => p.obra === id);
const tarefasDe = id => S.pecas.filter(p => p.obra === id && p.titulo);
const atrasada = p => !p.feito && !!p.prazo && p.prazo < today();
const ordTarefa = (a, b) => (a.prazo || '9').localeCompare(b.prazo || '9') || b.prio - a.prio || (a.slot < 0 ? 1e6 : a.slot) - (b.slot < 0 ? 1e6 : b.slot) || a.criado - b.criado;
// peça sem título é só construção; com título é tarefa: cinza enquanto pendente, colorida quando concluída
const modoDe = p => p.titulo && !p.feito ? 'pend' : 'ok';
const livresDaPlanta = o => { const us = new Set(pecasDe(o.id).map(p => p.slot)); return planta(o.planta).map((p, i) => Object.assign({ slot: i, id: 'f' + i }, p)).filter(f => !us.has(f.slot)); };
// altura onde uma peça pousa, olhando só a lista de peças (sem precisar da cena montada)
const pousoEm = (ps, x, y, w, d) => ps.reduce((h, p) => p.x < x + w && p.x + p.w > x && p.y < y + d && p.y + p.d > y ? Math.max(h, p.z + p.h) : h, 0);

const U = { v: 'obras', obra: '', sel: '', ferr: 'ver', forma: [2, 4], placa: false, cor: PALETA[0], giro: false, semPlanta: false, mes: today().slice(0, 7), dia: '', arq: false, verFeitas: false };
let CAM = {}; try { CAM = JSON.parse(localStorage.getItem('blocos3-cam') || '{}'); } catch (e) {}
let cv = null, ctx = null, cena = null, cam = null, sobre = null, W = 0, H = 0, dpr = 1, pintando = false, inst = null, toastT = null;
const anim = new Map(), desfaz = [];

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
async function copiar(txt, ok) { try { if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text: txt }); else { await navigator.clipboard.writeText(txt); toast(ok || 'Copiado.'); } } catch (e) { if (e && e.name !== 'AbortError') toast('Não consegui copiar.'); } }
const escuro = () => S.set.tema === 'escuro' || (S.set.tema !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches);
const coresChao = () => escuro() ? { fundo: '#17231F', linha: 'rgba(255,255,255,.07)', pino: 'rgba(255,255,255,.045)' } : { fundo: '#CFE4CB', linha: 'rgba(0,0,0,.09)', pino: 'rgba(0,0,0,.055)' };

/* ---------- regras ---------- */
// "Comprar tinta amanhã !!" ou "Entregar 25/12": tira prazo e prioridade do texto
function interpreta(txt) {
  const r = { prazo: '', prio: 0 }, t = today();
  txt = (' ' + txt + ' ').replace(/\s(!{1,3})(?=\s)/, (m, x) => { r.prio = x.length; return ' '; })
    .replace(/\s(\d{1,2})\/(\d{1,2})(?=\s)/, (m, d, mo) => { if (+d < 1 || +d > 31 || +mo < 1 || +mo > 12) return m; let s = `${t.slice(0, 4)}-${pad(+mo)}-${pad(+d)}`; if (s < t) s = `${+t.slice(0, 4) + 1}${s.slice(4)}`; r.prazo = s; return ' '; })
    .replace(/\s(hoje|amanh[aã])(?=\s)/i, (m, w) => { if (!r.prazo) r.prazo = /^h/i.test(w) ? t : addDays(t, 1); return ' '; });
  r.titulo = txt.replace(/\s+/g, ' ').trim().slice(0, 200);
  return r;
}
// uma tarefa nova ocupa a próxima peça da planta; se a planta acabou, vira um tijolo numa pilha ao lado
function novaTarefa(obraId, txt, quiet) {
  const o = byId(S.obras, obraId), r = interpreta(txt); if (!o || !r.titulo) return null;
  const livre = livresDaPlanta(o)[0], ps = pecasDe(obraId), base = { obra: obraId, titulo: r.titulo, prazo: r.prazo, prio: r.prio, criado: Date.now() };
  let p;
  if (livre) p = Object.assign({}, livre, base, { id: '' });
  else {
    const bp = planta(o.planta), bx = (bp.length ? Math.max(...bp.map(q => q.x + q.w)) : -2) + 3;
    for (let j = 0; ; j++) { const z = pousoEm(ps, bx, j * 3, 4, 2); if (z < 18) { p = Object.assign({ x: bx, y: j * 3, z, w: 4, d: 2, h: 3, cor: PALETA[ps.length % 9], slot: -1 }, base); break; } }
  }
  delete p.id; p = Data.put('pecas', p, true); anim.set(p.id, performance.now());
  if (!quiet) { DB.changed(); FX.clique(); }
  return p;
}
function concluir(id, v) {
  const p = byId(S.pecas, id); if (!p) return;
  p.feito = v ? Date.now() : 0; Data.put('pecas', p); anim.set(id, performance.now());
  if (!v) return;
  const ts = tarefasDe(p.obra);
  if (ts.length > 1 && ts.every(x => x.feito)) { FX.confete(); FX.win(); toast(`Construção concluída: ${byId(S.obras, p.obra).nome}.`); } else FX.feito();
}
function remover(id) { const p = byId(S.pecas, id); if (!p) return; desfaz.push({ t: 'del', rec: JSON.parse(JSON.stringify(p)) }); Data.del('pecas', id); if (U.sel === id) U.sel = ''; FX.tira(); }
function desfazer() {
  const op = desfaz.pop(); if (!op) return toast('Nada para desfazer.');
  if (op.t === 'add') { Data.del('pecas', op.id); if (U.sel === op.id) U.sel = ''; }
  else if (op.t === 'del') { Data.put('pecas', op.rec); anim.set(op.rec.id, performance.now()); }
  else if (op.t === 'cor') { const p = byId(S.pecas, op.id); if (p) { p.cor = op.antes; Data.put('pecas', p); } }
  refaz(); drawPainel();
}

/* ---------- o palco ---------- */
const camPx = () => ({ x: cam.x * dpr, y: cam.y * dpr, zoom: cam.zoom * dpr });
const naCena = (x, y) => [(x - cam.x) / cam.zoom, (y - cam.y) / cam.zoom];
const dims = () => U.giro ? [U.forma[1], U.forma[0]] : U.forma;
const giraPt = (x, y, r) => r === 0 ? [x, y] : r === 1 ? [y, -x] : r === 2 ? [-x, -y] : [-y, x];
function refaz() {
  if (!cv) return;
  const o = byId(S.obras, U.obra); if (!o) return;
  cena = Motor.monta(pecasDe(o.id).map(p => Object.assign({ modo: modoDe(p) }, p)), U.semPlanta ? [] : livresDaPlanta(o), cam.rot);
  pinta();
}
function pinta() {
  if (pintando || !cv) return;
  pintando = true;
  requestAnimationFrame(() => {
    pintando = false; if (!cv || !cv.isConnected || !cena) return;
    const agora = performance.now(), a = new Map();
    if (FX.on()) anim.forEach((t0, id) => { const p = (agora - t0) / 420; if (p >= 1) anim.delete(id); else a.set(id, (1 - p) * (1 - p) * 80); }); else anim.clear();
    Motor.chao(ctx, W, H, camPx(), coresChao());
    Motor.desenha(ctx, W, H, camPx(), cena, { sel: U.sel, anim: a.size ? a : null, sobre });
    if (anim.size) pinta();
  });
}
function ajusta() {
  if (!cv) return;
  const r = cv.parentElement.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = W = Math.max(50, Math.round(r.width * dpr)); cv.height = H = Math.max(50, Math.round(r.height * dpr));
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; pinta();
}
const salvaCam = debounce(() => { CAM[U.obra] = cam; try { localStorage.setItem('blocos3-cam', JSON.stringify(CAM)); } catch (e) {} }, 400);
function enquadrar() { const c = Motor.enquadra(cena, W / dpr, H / dpr, 50, 1.25); cam.x = c.x; cam.y = c.y; cam.zoom = c.zoom; salvaCam(); pinta(); }
function zoomEm(x, y, f) { const z = clamp(cam.zoom * f, 0.12, 3.2), k = z / cam.zoom; cam.x = x - (x - cam.x) * k; cam.y = y - (y - cam.y) * k; cam.zoom = z; sobre = null; salvaCam(); pinta(); }
// gira a vista mantendo no lugar o ponto do chão que está no meio da tela
function girarVista(n) {
  const cx = W / dpr / 2, cy = H / dpr / 2, [sx, sy] = naCena(cx, cy), u = sx / TW + 2 * sy / TW, v = 2 * sy / TW - sx / TW, r2 = (cam.rot + n + 4) % 4;
  const [wx, wy] = giraPt(u, v, (4 - cam.rot) % 4), [u2, v2] = giraPt(wx, wy, r2), p = PX(u2, v2, 0);
  cam.rot = r2; cam.x = cx - p[0] * cam.zoom; cam.y = cy - p[1] * cam.zoom; sobre = null; salvaCam(); refaz();
}
function centrarEm(p) { const [u, v] = rcel(p.x, p.y, cam.rot), c = PX(u + 0.5, v + 0.5, p.z + p.h); cam.x = W / dpr / 2 - c[0] * cam.zoom; cam.y = H / dpr / 2 - c[1] * cam.zoom; salvaCam(); pinta(); }
function pairar(x, y) {
  if (U.ferr !== 'construir') { if (sobre) { sobre = null; pinta(); } return; }
  const [sx, sy] = naCena(x, y), f = Motor.pega(cena, sx, sy);
  let p;
  if (f && f.fant) p = Object.assign({}, f.p, { id: '~', modo: 'ok' });
  else { const [wx, wy] = Motor.alvo(cena, sx, sy), [w, d] = dims(); p = { id: '~', x: wx, y: wy, z: Motor.pouso(cena, wx, wy, w, d), w, d, h: U.placa ? 1 : 3, cor: U.cor, modo: 'ok' }; }
  sobre = Motor.monta([p], [], cam.rot); pinta();
}
function clicar(x, y) {
  const [sx, sy] = naCena(x, y), o = byId(S.obras, U.obra), solida = Motor.pega(cena, sx, sy, g => !g.fant), topo = Motor.pega(cena, sx, sy);
  if (U.ferr === 'ver') {
    U.sel = solida ? solida.p.id : '';
    if (U.sel) document.body.classList.add('painel'); else if (topo && topo.fant) toast('Espaço da planta. Adicione uma tarefa para pôr a próxima peça.');
    drawPainel(); pinta(); return;
  }
  if (U.ferr === 'construir') {
    let p;
    if (topo && topo.fant) { const f = topo.p; p = Data.put('pecas', { obra: o.id, x: f.x, y: f.y, z: f.z, w: f.w, d: f.d, h: f.h, cor: f.cor, slot: f.slot, criado: Date.now() }); }
    else { const [wx, wy] = Motor.alvo(cena, sx, sy), [w, d] = dims(); p = Data.put('pecas', { obra: o.id, x: wx, y: wy, z: Motor.pouso(cena, wx, wy, w, d), w, d, h: U.placa ? 1 : 3, cor: U.cor, slot: -1, criado: Date.now() }); }
    desfaz.push({ t: 'add', id: p.id }); anim.set(p.id, performance.now()); FX.clique(); sobre = null; refaz(); drawPainel(); return;
  }
  if (!solida) return;
  const p = byId(S.pecas, solida.p.id);
  if (U.ferr === 'pintar') { if (p.cor === U.cor) return; desfaz.push({ t: 'cor', id: p.id, antes: p.cor }); p.cor = U.cor; Data.put('pecas', p); FX.clique(); }
  else if (U.ferr === 'apagar') { if (p.titulo && !confirm(`Esta peça é a tarefa “${p.titulo}”. Remover?`)) return; remover(p.id); }
  refaz(); drawPainel();
}
function ligaPalco() {
  const pts = new Map(); let down = null, moveu = false, pinca = null;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    pts.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pts.size === 1) { down = [e.offsetX, e.offsetY, cam.x, cam.y]; moveu = false; }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinca = { d: dist(a, b) || 1, zoom: cam.zoom, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, x: cam.x, y: cam.y }; moveu = true; sobre = null; }
  });
  cv.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.offsetX, e.offsetY]);
    if (pts.size === 2 && pinca) { // pinça: aproxima e arrasta ao mesmo tempo
      const [a, b] = [...pts.values()], z = clamp(pinca.zoom * dist(a, b) / pinca.d, 0.12, 3.2), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
      cam.zoom = z; cam.x = cx - (pinca.cx - pinca.x) * z / pinca.zoom; cam.y = cy - (pinca.cy - pinca.y) * z / pinca.zoom; pinta(); return;
    }
    if (down && pts.size === 1) {
      const dx = e.offsetX - down[0], dy = e.offsetY - down[1];
      if (!moveu && Math.hypot(dx, dy) > 6) moveu = true;
      if (moveu) { cam.x = down[2] + dx; cam.y = down[3] + dy; sobre = null; pinta(); }
      return;
    }
    if (!down && e.pointerType === 'mouse') pairar(e.offsetX, e.offsetY);
  });
  const solta = e => {
    const era = pts.size; pts.delete(e.pointerId); if (pts.size < 2) pinca = null;
    if (down && !moveu && era === 1 && e.type === 'pointerup') clicar(e.offsetX, e.offsetY);
    if (!pts.size) { down = null; salvaCam(); }
  };
  cv.addEventListener('pointerup', solta); cv.addEventListener('pointercancel', solta);
  cv.addEventListener('pointerleave', () => { if (sobre) { sobre = null; pinta(); } });
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomEm(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  new ResizeObserver(ajusta).observe(cv.parentElement);
}
// miniaturas: construções na galeria e modelos na folha de nova construção
function miniaturas() {
  document.querySelectorAll('canvas[data-thumb], canvas[data-modelo]').forEach(c => {
    const o = c.dataset.thumb && byId(S.obras, c.dataset.thumb), d = Math.min(2, devicePixelRatio || 1), w = c.clientWidth * d, h = c.clientHeight * d;
    if (!w || !h) return;
    c.width = w; c.height = h;
    const sc = o ? Motor.monta(pecasDe(o.id).map(p => Object.assign({ modo: modoDe(p) }, p)), livresDaPlanta(o), 0) : Motor.monta(planta(c.dataset.modelo).map((p, i) => Object.assign({ id: 'm' + i, modo: 'ok' }, p)), [], 0);
    const k = Motor.enquadra(sc, w, h, 12 * d, 1.1 * d), x = c.getContext('2d');
    Motor.chao(x, w, h, k, coresChao()); Motor.desenha(x, w, h, k, sc);
  });
}

/* ---------- pedaços de tela ---------- */
function linha(p, o = {}) {
  const ob = o.obra && byId(S.obras, p.obra);
  return `<div class="tl${p.feito ? ' feito' : ''}${p.id === U.sel ? ' sel' : ''}" data-act="${o.obra ? 'ir' : 'sel'}" data-id="${p.id}">
    <input type="checkbox" data-chk="${p.id}" ${p.feito ? 'checked' : ''} aria-label="Concluir">
    <i class="sw" style="background:${p.cor}"></i>
    <input class="tt" data-p="${p.id}" data-f="titulo" value="${esc(p.titulo)}" placeholder="Dê um nome para virar tarefa" aria-label="Tarefa" maxlength="200">
    ${p.prio ? `<b class="pr">${'!'.repeat(p.prio)}</b>` : ''}${ob ? `<small class="muted">${esc(ob.nome)}</small>` : ''}
    <input type="date" data-p="${p.id}" data-f="prazo" value="${p.prazo}" class="${atrasada(p) ? 'bad' : ''}" aria-label="Prazo"></div>`;
}
// calendário do mês: um quadradinho da cor da peça para cada tarefa com prazo naquele dia
function calendario(ts, o) {
  const [y, m] = U.mes.split('-').map(Number), prim = new Date(y, m - 1, 1), ini = addDays(ymd(prim), -((prim.getDay() + 6) % 7)), t = today();
  const doDia = U.dia ? ts.filter(p => p.prazo === U.dia).sort(ordTarefa) : [], sem = ts.filter(p => !p.prazo && !p.feito).length, atr = ts.filter(atrasada).length;
  return `<div class="calh"><button class="ib" data-act="mes" data-n="-1" aria-label="Mês anterior">‹</button><b>${prim.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b><button class="ib" data-act="mes" data-n="1" aria-label="Mês seguinte">›</button><button class="btn sm" data-act="mes" data-n="0">Hoje</button></div>
    <div class="cal"><div class="cw">${['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map(d => `<span>${d}</span>`).join('')}</div><div class="cg">${Array.from({ length: 42 }, (_, i) => { const d = addDays(ini, i), bs = ts.filter(p => p.prazo === d);
      return `<button class="cd${parse(d).getMonth() !== m - 1 ? ' fora' : ''}${d === t ? ' hoje' : ''}${d === U.dia ? ' on' : ''}" data-act="dia" data-d="${d}" aria-label="${fmtData(d)}: ${plural(bs.length, 'tarefa', 'tarefas')}"><span>${parse(d).getDate()}</span><div>${bs.slice(0, 6).map(p => `<i class="${p.feito ? 'ok' : ''}" style="background:${p.cor}"></i>`).join('')}</div></button>`; }).join('')}</div></div>
    <p class="muted sm">${atr ? `<span class="bad">${plural(atr, 'atrasada', 'atrasadas')}</span> · ` : ''}${plural(sem, 'tarefa aberta sem prazo', 'tarefas abertas sem prazo')}</p>
    ${U.dia ? `<h4>${fmtDia(U.dia)} <span class="muted">${fmtData(U.dia, { day: 'numeric', month: 'long' })}</span></h4>${doDia.map(p => linha(p, o)).join('') || '<p class="muted sm">Nada com prazo neste dia.</p>'}` : ''}`;
}
function progresso(id) { const ts = tarefasDe(id), f = ts.filter(p => p.feito).length; return { n: ts.length, f, pct: ts.length ? f / ts.length * 100 : 0, pecas: pecasDe(id).length }; }

/* ---------- galeria e vistas gerais ---------- */
function vObras() {
  const arq = S.obras.filter(o => o.arquivada).length, l = S.obras.filter(o => !!o.arquivada === U.arq).sort((a, b) => a.ordem - b.ordem || a.criada - b.criada);
  return `<div class="top"><div class="grow"><h2>${U.arq ? 'Construções arquivadas' : 'Construções'}</h2><p class="muted">Cada peça é uma tarefa. Toque numa construção para ver todas as tarefas dela e o calendário.</p></div>
      ${arq || U.arq ? `<button class="btn sm" data-act="verArq">${U.arq ? 'Ver ativas' : `Arquivadas (${arq})`}</button>` : ''}<button class="btn pri" data-act="novaObra">Nova construção</button></div>
    <div class="grid">${l.map(o => { const g = progresso(o.id), px = tarefasDe(o.id).filter(p => !p.feito && p.prazo).sort(ordTarefa)[0], tot = planta(o.planta).length;
      return `<article class="card" data-act="abrir" data-id="${o.id}" role="button" tabindex="0"><canvas data-thumb="${o.id}"></canvas><h3>${esc(o.nome)}</h3><div class="meter"><i style="width:${g.pct}%"></i></div>
        <p class="muted sm">${g.f} de ${plural(g.n, 'tarefa', 'tarefas')} · ${g.pecas}${tot ? ' de ' + tot : ''} peças${px ? ` · próxima: <span class="${atrasada(px) ? 'bad' : ''}">${fmtDia(px.prazo).toLowerCase()}</span>` : ''}</p></article>`; }).join('') || `<p class="empty">${U.arq ? 'Nenhuma construção arquivada.' : 'Nenhuma construção. Comece por <b>Nova construção</b> e escolha um modelo.'}</p>`}</div>`;
}
function vTarefas() {
  const obras = S.obras.filter(o => !o.arquivada), n = obras.reduce((x, o) => x + tarefasDe(o.id).filter(p => !p.feito).length, 0);
  return `<div class="top"><div class="grow"><h2>Tarefas</h2><p class="muted">${plural(n, 'tarefa aberta', 'tarefas abertas')} em todas as construções. Toque numa linha para ir até a peça.</p></div></div>
    <div class="lista">${obras.map(o => { const ts = tarefasDe(o.id).filter(p => !p.feito).sort(ordTarefa); return ts.length ? `<h4>${esc(o.nome)} <span class="muted">${ts.length}</span></h4>${ts.map(p => linha(p, { obra: 0, ir: 1 }).replace('data-act="sel"', 'data-act="ir"')).join('')}` : ''; }).join('') || '<p class="empty">Nenhuma tarefa aberta.</p>'}</div>`;
}
function vCal() {
  const ts = S.pecas.filter(p => p.titulo && (byId(S.obras, p.obra) || {}).arquivada === false);
  return `<div class="top"><div class="grow"><h2>Calendário</h2><p class="muted">Os prazos de todas as construções. Toque num dia para ver as tarefas dele.</p></div></div><div class="calg">${calendario(ts, { obra: 1 })}</div>`;
}
function vAjustes() {
  const s = S.set, gOn = Sync.gOn(), canInst = !Sync.avail && !matchMedia('(display-mode: standalone)').matches;
  const chk = (k, n) => `<label class="tog"><input type="checkbox" data-s="${k}" ${s[k] ? 'checked' : ''}><span>${n}</span></label>`;
  return `<div class="top"><div class="grow"><h2>Ajustes</h2></div></div><div class="cols">
  <section class="panel"><h3>Como funciona</h3><ol class="sm"><li>Escolha um <b>modelo</b>: ele vira a planta da construção, desenhada em contorno.</li><li>Cada <b>tarefa</b> que você adiciona põe a próxima peça da planta, ainda cinza.</li><li>Concluir a tarefa dá <b>cor</b> à peça. A construção fica pronta quando as tarefas acabam.</li><li>Com <b>Construir</b> você põe peças soltas em qualquer lugar da base, que não tem fim. Dar nome a uma peça solta faz dela uma tarefa.</li></ol>
    <h4>No palco</h4><p class="muted sm">Arraste para mover a base, role (ou faça a pinça) para aproximar. Atalhos: <code>1</code> a <code>4</code> trocam a ferramenta, <code>R</code> gira a peça, <code>Q</code> e <code>E</code> giram a vista, <code>F</code> enquadra, <code>Ctrl+Z</code> desfaz, <code>Del</code> remove a peça selecionada.</p>
    <h4>Aparência</h4><div class="chips">${[['auto', 'Automática'], ['claro', 'Clara'], ['escuro', 'Escura']].map(([v, n]) => `<button class="btn sm ${s.tema === v ? 'pri' : ''}" data-act="set" data-k="tema" data-v="${v}">${n}</button>`).join('')}</div>
    <h4>Sensações</h4><div class="chips">${chk('anim', 'Animações')}${chk('som', 'Sons')}</div>
    <h4>Backup</h4><div class="row"><button class="btn sm" data-act="exportar">Exportar backup</button><button class="btn sm" data-act="importar">Importar backup</button></div>
    ${canInst ? `<h4>Aplicativo</h4><p class="muted sm">${inst ? 'Instale o Blocos 3 para abrir em tela cheia e sem internet.' : 'No celular: menu do navegador › “Adicionar à tela inicial”. No Windows há o Blocos3.exe em <a href="https://github.com/joaogabrielmontinirossi-sys/blocos3/releases/latest" target="_blank" rel="noopener">Releases</a>.'}</p>${inst ? `<button class="btn sm" data-act="install">Instalar o aplicativo</button>` : ''}` : ''}</section>
  <section class="panel"><h3>Sincronização</h3>
    ${Sync.avail ? `<h4>Pasta do Google Drive para computador</h4>
      <p class="muted sm">${Sync.on ? `Ativa em <b>${esc(Sync.folder)}</b>${Sync.error ? ' · ' + esc(Sync.error) : ''}` : Sync.detected ? 'Desativada.' : 'Não encontrei o Google Drive neste computador; escolha uma pasta sincronizada.'}</p>
      <div class="row">${Sync.drives.filter(d => d !== Sync.folder).map(d => `<button class="btn sm" data-act="syncUse" data-path="${esc(d)}">Usar ${esc(d)}</button>`).join('')}
        <button class="btn sm" data-act="syncPick">Escolher pasta…</button>${Sync.on ? `<button class="btn sm" data-act="syncOff">Desativar</button>` : ''}</div>` : ''}
    <h4>Conta Google (Windows, site e celular)</h4>
    <p class="muted sm">${gOn ? `Conectada${Sync.g.error ? ' · ' + esc(Sync.g.error) : ''}. O arquivo blocos3-sync.json fica na área privada do app no seu Google Drive.` : 'Use o mesmo ID de cliente em todos os aparelhos para ver as mesmas construções.'}</p>
    <label class="fld">ID do cliente OAuth<input data-s="gClient" value="${esc(s.gClient)}" placeholder="0000000000-xxxxxxxx.apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>
    <div class="row"><button class="btn pri sm" data-act="gConnect">${gOn ? 'Sincronizar agora' : s.gWas ? 'Reconectar' : 'Conectar'}</button>${gOn || s.gWas ? `<button class="btn sm" data-act="gOff">Desconectar</button>` : ''}</div>
    <details><summary>Como criar o ID do cliente (uma vez só)</summary><ol class="muted sm">
      <li>Abra <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">console.cloud.google.com</a> e crie um projeto, ou use o mesmo dos seus outros aplicativos (o ID já existente serve).</li>
      <li>Em <b>APIs e serviços › Biblioteca</b>, ative a <b>Google Drive API</b>.</li>
      <li>Em <b>Tela de permissão OAuth</b>, escolha <b>Externo</b> e adicione o seu e-mail em <b>Usuários de teste</b>.</li>
      <li>Em <b>Credenciais › Criar credenciais › ID do cliente OAuth</b>, tipo <b>Aplicativo da Web</b>. Em <b>Origens JavaScript autorizadas</b>, adicione:<br><code>https://joaogabrielmontinirossi-sys.github.io</code><br><code>http://localhost:${PORT}</code></li>
      <li>Copie o ID do cliente, cole acima e clique em Conectar. Repita só a colagem nos outros aparelhos.</li></ol></details></section></div>`;
}

/* ---------- a tela da construção ---------- */
const FERR = [['ver', 'Ver', 'Selecionar peças e tarefas'], ['construir', 'Construir', 'Pôr peças'], ['pintar', 'Pintar', 'Trocar a cor'], ['apagar', 'Apagar', 'Remover peças']];
function drawTopo() {
  const o = byId(S.obras, U.obra), g = progresso(o.id);
  $('#obtop').innerHTML = `<button class="ib" data-act="tab" data-tab="obras" aria-label="Voltar às construções">‹</button>
    <input class="title" data-o="${o.id}" data-f="nome" value="${esc(o.nome)}" aria-label="Nome da construção" maxlength="80">
    <span class="prog" title="Tarefas concluídas"><b>${g.f}/${g.n}</b><span class="meter"><i style="width:${g.pct}%"></i></span></span>
    <button class="btn sm pmob" data-act="painel">Tarefas e calendário</button>
    <details class="menu"><summary class="btn sm">Ações</summary><div>
      <button data-act="colar">Colar uma lista de tarefas</button><button data-act="copiarTarefas">Copiar as tarefas como texto</button>
      ${livresDaPlanta(o).length ? `<button data-act="encher">Montar o resto da planta sem tarefas</button>` : ''}
      <button data-act="duplicar">Duplicar a construção</button><button data-act="arquivar">${o.arquivada ? 'Desarquivar' : 'Arquivar'}</button><button class="danger" data-act="excluir">Excluir a construção</button></div></details>`;
}
function drawFerr() {
  const o = byId(S.obras, U.obra), monta = U.ferr === 'construir', cor = monta || U.ferr === 'pintar';
  $('#ferr').innerHTML = `<div class="seg">${FERR.map(([id, n, d]) => `<button data-act="ferr" data-v="${id}" class="${U.ferr === id ? 'on' : ''}" title="${d}">${n}</button>`).join('')}</div>
    ${cor ? `<div class="cores">${PALETA.map(c => `<button data-act="cor" data-v="${c}" class="${U.cor === c ? 'on' : ''}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>` : ''}
    ${monta ? `<div class="formas">${FORMAS.map(f => `<button data-act="forma" data-v="${f.join('x')}" class="${U.forma.join('x') === f.join('x') ? 'on' : ''}">${f[0]}×${f[1]}</button>`).join('')}</div>
      <div class="seg"><button data-act="placa" data-v="" class="${U.placa ? '' : 'on'}">Tijolo</button><button data-act="placa" data-v="1" class="${U.placa ? 'on' : ''}">Placa</button><button data-act="giro" title="Girar a peça (R)">Girar ${U.giro ? '↔' : '↕'}</button></div>` : ''}`;
  $('#vistac').innerHTML = `<button class="ib" data-act="girar" data-n="-1" title="Girar a vista (Q)" aria-label="Girar a vista para a esquerda">⟲</button><button class="ib" data-act="girar" data-n="1" title="Girar a vista (E)" aria-label="Girar a vista para a direita">⟳</button>
    <button class="ib" data-act="zoom" data-n="0.8" aria-label="Afastar">−</button><button class="ib" data-act="zoom" data-n="1.25" aria-label="Aproximar">＋</button><button class="ib" data-act="enquadrar" title="Enquadrar (F)" aria-label="Enquadrar a construção">⌖</button>
    <button class="ib" data-act="desfazer" title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>${planta(o.planta).length ? `<button class="btn sm" data-act="semPlanta">${U.semPlanta ? 'Mostrar a planta' : 'Esconder a planta'}</button>` : ''}`;
}
function drawPainel() {
  if (U.v !== 'obra') return;
  const o = byId(S.obras, U.obra), ts = tarefasDe(o.id), pend = ts.filter(p => !p.feito).sort(ordTarefa), fe = ts.filter(p => p.feito).sort((a, b) => b.feito - a.feito), soltas = pecasDe(o.id).filter(p => !p.titulo), sel = byId(S.pecas, U.sel), vagas = livresDaPlanta(o).length;
  const y = $('#painel').scrollTop;
  $('#painel').innerHTML = `<div class="phead"><b>Tarefas e calendário</b><button class="ib pmob" data-act="painel" aria-label="Fechar o painel">✕</button></div>
    <form data-form="tarefa" class="cap"><input name="q" placeholder="Nova tarefa (ex.: Pagar o frete amanhã !)" aria-label="Nova tarefa" autocomplete="off" maxlength="200"><button class="btn pri" aria-label="Adicionar">＋</button></form>
    <p class="muted sm">${vagas ? `A próxima tarefa ocupa a peça ${planta(o.planta).length - vagas + 1} de ${planta(o.planta).length} da planta.` : planta(o.planta).length ? 'A planta está completa: as próximas tarefas viram tijolos numa pilha ao lado.' : 'Sem planta: cada tarefa vira um tijolo numa pilha.'}</p>
    ${sel ? `<section class="cartao" style="--c:${sel.cor}"><div class="row0"><input type="checkbox" data-chk="${sel.id}" ${sel.feito ? 'checked' : ''} aria-label="Concluir" ${sel.titulo ? '' : 'disabled'}>
        <input class="tt big" data-p="${sel.id}" data-f="titulo" value="${esc(sel.titulo)}" placeholder="Dê um nome: a peça vira tarefa" aria-label="Tarefa" maxlength="200"><button class="ib sm" data-act="desel" aria-label="Fechar">✕</button></div>
      <div class="props"><label>Prazo<input type="date" data-p="${sel.id}" data-f="prazo" value="${sel.prazo}"></label><label>Prioridade<select data-p="${sel.id}" data-f="prio">${['Nenhuma', '!', '!!', '!!!'].map((n, i) => `<option value="${i}" ${sel.prio === i ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <div class="cores">${PALETA.map(c => `<button data-act="corPeca" data-v="${c}" class="${sel.cor === c ? 'on' : ''}" style="background:${c}" aria-label="Cor ${c}"></button>`).join('')}</div>
      <textarea data-p="${sel.id}" data-f="notas" rows="3" placeholder="Anotações da tarefa…" aria-label="Anotações">${esc(sel.notas)}</textarea>
      <p class="muted sm">Peça ${sel.w}×${sel.d}, ${sel.h === 1 ? 'placa' : 'tijolo'}${sel.slot >= 0 ? `, nº ${sel.slot + 1} da planta` : ', solta'}${sel.feito ? ' · concluída em ' + new Date(sel.feito).toLocaleDateString('pt-BR') : ''}</p>
      <div class="row"><button class="btn sm" data-act="centrar">Mostrar no palco</button><button class="btn sm danger" data-act="remover">Remover a peça</button></div></section>` : ''}
    <h4>Pendentes <span class="muted">${pend.length}</span></h4>${pend.map(p => linha(p)).join('') || `<p class="muted sm">${ts.length ? 'Tudo concluído.' : 'Nenhuma tarefa ainda. Escreva a primeira acima.'}</p>`}
    ${fe.length ? `<details class="feitas"${U.verFeitas ? ' open' : ''}><summary data-act="verFeitas">Concluídas (${fe.length})</summary>${fe.map(p => linha(p)).join('')}</details>` : ''}
    ${soltas.length ? `<p class="muted sm">${plural(soltas.length, 'peça sem tarefa', 'peças sem tarefa')}. Com a ferramenta <b>Ver</b>, toque numa delas e dê um nome.</p>` : ''}
    <h4>Calendário</h4>${calendario(ts)}`;
  $('#painel').scrollTop = y;
  const g = progresso(o.id), pr = $('#obtop .prog'); if (pr) pr.innerHTML = `<b>${g.f}/${g.n}</b><span class="meter"><i style="width:${g.pct}%"></i></span>`;
}

/* ---------- desenho geral ---------- */
const TABS = [['obras', 'Construções', vObras], ['tarefas', 'Tarefas', vTarefas], ['cal', 'Calendário', vCal], ['ajustes', 'Ajustes', vAjustes]];
function draw() {
  document.documentElement.dataset.theme = S.set.tema === 'claro' ? 'light' : S.set.tema === 'escuro' ? 'dark' : '';
  const o = U.v === 'obra' && byId(S.obras, U.obra);
  if (U.v === 'obra' && !o) U.v = 'obras';
  document.body.classList.toggle('naobra', !!o);
  if (o) {
    if (!cv || !cv.isConnected || cv.dataset.obra !== o.id) {
      $('#main').innerHTML = `<div class="ob"><div id="obtop"></div><div class="obmain"><div class="palco"><canvas id="cv" data-obra="${o.id}" aria-label="Palco de montagem"></canvas><div id="ferr"></div><div id="vistac"></div></div><aside id="painel"></aside></div></div>`;
      cv = $('#cv'); ctx = cv.getContext('2d'); sobre = null; desfaz.length = 0;
      const novo = !CAM[o.id]; cam = Object.assign({ x: 0, y: 0, zoom: 1, rot: 0 }, CAM[o.id]);
      ligaPalco(); ajusta(); refaz(); if (novo) enquadrar();
    } else refaz();
    drawTopo(); drawFerr(); drawPainel();
  } else {
    cv = null; document.body.classList.remove('painel');
    $('#tabs').innerHTML = TABS.map(([id, n]) => `<button data-act="tab" data-tab="${id}" class="${U.v === id ? 'on' : ''}">${n}</button>`).join('');
    $('#main').innerHTML = TABS.find(t => t[0] === U.v)[2]();
    miniaturas();
  }
  drawStatus();
}
function drawStatus() { const el = $('#sync'), err = Sync.error || Sync.g.error; el.textContent = Sync.status(); el.classList.toggle('bad', !!(Sync.any() && err)); el.title = err || ''; }
function sheet(html) { $('#sheet').innerHTML = html; document.body.classList.add('sheet'); const f = $('#sheet [autofocus]'); if (f) f.focus(); }
function closeSheet() { document.body.classList.remove('sheet'); $('#sheet').innerHTML = ''; }
function abrir(id, sel) { U.v = 'obra'; U.obra = id; U.sel = sel || ''; U.dia = ''; U.ferr = 'ver'; draw(); if (sel) { document.body.classList.add('painel'); const p = byId(S.pecas, sel); if (p) centrarEm(p); } }

function sheetObra() {
  sheet(`<form data-form="obra"><div class="shead"><b>Nova construção</b><span class="grow"></span><button type="button" class="ib" data-act="fechar" aria-label="Fechar">✕</button></div>
    <label class="fld">Nome<input name="nome" placeholder="Mudança de casa" required autofocus maxlength="80"></label>
    <div class="fld">Modelo de construção<div class="mods">${MODELOS.map((m, i) => `<label class="pick"><input type="radio" name="modelo" value="${m.id}" ${i ? '' : 'checked'}><span><canvas data-modelo="${m.id}"></canvas><b>${m.nome}</b><small>${planta(m.id).length ? plural(planta(m.id).length, 'peça', 'peças') : 'sem planta'}</small></span></label>`).join('')}</div></div>
    <label class="fld">Tarefas, uma por linha (opcional)<textarea name="t" rows="5" placeholder="Medir os cômodos&#10;Pedir orçamento amanhã&#10;Assinar o contrato 25/10 !!"></textarea></label>
    <p class="muted sm">Cada tarefa ocupa uma peça do modelo, de baixo para cima. Dá para acrescentar mais depois.</p>
    <div class="acts"><button class="btn pri">Criar construção</button></div></form>`);
  miniaturas();
}
function sheetColar() {
  sheet(`<form data-form="colar"><div class="shead"><b>Colar uma lista de tarefas</b><span class="grow"></span><button type="button" class="ib" data-act="fechar" aria-label="Fechar">✕</button></div>
    <textarea name="t" rows="9" required autofocus placeholder="Uma tarefa por linha.&#10;Pode usar hoje, amanhã, 25/12 e ! para prioridade."></textarea>
    <div class="acts"><button class="btn pri">Adicionar as tarefas</button></div></form>`);
}

const A = {
  tab(el) { U.v = el.dataset.tab; U.dia = ''; draw(); scrollTo(0, 0); },
  abrir(el) { abrir(el.dataset.id); },
  ir(el) { const p = byId(S.pecas, el.dataset.id); if (p) abrir(p.obra, p.id); },
  fechar() { closeSheet(); },
  verArq() { U.arq = !U.arq; draw(); },
  novaObra() { sheetObra(); },
  // palco
  ferr(el) { U.ferr = el.dataset.v; sobre = null; drawFerr(); pinta(); },
  cor(el) { U.cor = el.dataset.v; drawFerr(); },
  forma(el) { U.forma = el.dataset.v.split('x').map(Number); drawFerr(); },
  placa(el) { U.placa = !!el.dataset.v; drawFerr(); },
  giro() { U.giro = !U.giro; drawFerr(); },
  girar(el) { girarVista(+el.dataset.n); },
  zoom(el) { zoomEm(W / dpr / 2, H / dpr / 2, +el.dataset.n); },
  enquadrar() { enquadrar(); },
  desfazer() { desfazer(); },
  semPlanta() { U.semPlanta = !U.semPlanta; drawFerr(); refaz(); },
  painel() { document.body.classList.toggle('painel'); },
  // painel
  sel(el) { U.sel = el.dataset.id; const p = byId(S.pecas, U.sel); drawPainel(); if (p) centrarEm(p); },
  desel() { U.sel = ''; drawPainel(); pinta(); },
  centrar() { const p = byId(S.pecas, U.sel); if (p) { centrarEm(p); document.body.classList.remove('painel'); } },
  remover() { const p = byId(S.pecas, U.sel); if (p && (!p.titulo || confirm(`Remover a peça e a tarefa “${p.titulo}”?`))) { remover(p.id); refaz(); drawPainel(); } },
  corPeca(el) { const p = byId(S.pecas, U.sel); if (!p) return; desfaz.push({ t: 'cor', id: p.id, antes: p.cor }); p.cor = el.dataset.v; Data.put('pecas', p); refaz(); drawPainel(); },
  verFeitas() { U.verFeitas = !U.verFeitas; },
  mes(el) { const n = +el.dataset.n; if (!n) { U.mes = today().slice(0, 7); U.dia = today(); } else { const [y, m] = U.mes.split('-').map(Number); U.mes = ymd(new Date(y, m - 1 + n, 1)).slice(0, 7); } U.v === 'obra' ? drawPainel() : draw(); },
  dia(el) { U.dia = U.dia === el.dataset.d ? '' : el.dataset.d; U.v === 'obra' ? drawPainel() : draw(); },
  // menu da construção
  colar() { sheetColar(); },
  copiarTarefas() { const o = byId(S.obras, U.obra); copiar(`# ${o.nome}\n` + tarefasDe(o.id).sort(ordTarefa).map(p => `- [${p.feito ? 'x' : ' '}] ${p.titulo}${p.prazo ? ' (' + fmtData(p.prazo, { day: 'numeric', month: 'short' }) + ')' : ''}`).join('\n'), 'Tarefas copiadas.'); },
  encher() { const o = byId(S.obras, U.obra), l = livresDaPlanta(o); l.forEach((f, i) => { const p = Data.put('pecas', { obra: o.id, x: f.x, y: f.y, z: f.z, w: f.w, d: f.d, h: f.h, cor: f.cor, slot: f.slot, criado: Date.now() }, true); anim.set(p.id, performance.now() + i * 12); }); DB.changed(); FX.clique(); draw(); toast(`${plural(l.length, 'peça posta', 'peças postas')}. Dê nome às que forem virar tarefa.`); },
  duplicar() { const o = byId(S.obras, U.obra), n = Data.put('obras', { nome: o.nome + ' (cópia)', planta: o.planta, criada: Date.now(), ordem: o.ordem + 0.5 }, true); pecasDe(o.id).forEach(p => Data.put('pecas', Object.assign({}, p, { id: uid(), obra: n.id, feito: 0 }), true)); DB.changed(); abrir(n.id); toast('Construção duplicada, com as tarefas reabertas.'); },
  arquivar() { const o = byId(S.obras, U.obra); o.arquivada = !o.arquivada; Data.put('obras', o); U.v = 'obras'; draw(); toast(o.arquivada ? 'Construção arquivada.' : 'Construção de volta à galeria.'); },
  excluir() { const o = byId(S.obras, U.obra), n = pecasDe(o.id).length; if (!confirm(`Excluir “${o.nome}” e ${plural(n, 'peça', 'peças')}? Não dá para desfazer.`)) return; pecasDe(o.id).forEach(p => Data.del('pecas', p.id, true)); Data.del('obras', o.id); U.v = 'obras'; draw(); },
  // ajustes
  set(el) { S.set[el.dataset.k] = el.dataset.v; DB.saveSet(); draw(); },
  exportar() { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(Sync.payload())], { type: 'application/json' })); a.download = `blocos3-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); },
  importar() { $('#filepick').click(); },
  async install() { if (!inst) return; inst.prompt(); await inst.userChoice.catch(() => {}); inst = null; draw(); },
  syncUse(el) { busy(el, () => Sync.config(el.dataset.path)); },
  syncPick(el) { toast('Escolha a pasta na janela que abriu.'); busy(el, () => Sync.config('choose')); },
  syncOff(el) { busy(el, () => Sync.config('off')); },
  gConnect(el) {
    const v = $('[data-s=gClient]').value.trim();
    if (!/\.apps\.googleusercontent\.com$/.test(v)) return toast('Cole o ID do cliente OAuth (termina em .apps.googleusercontent.com).');
    S.set.gClient = v; DB.saveSet(); busy(el, () => Sync.gOn() ? Sync.run() : Sync.connect());
  },
  gOff() { Sync.disconnect(); draw(); },
};
async function busy(el, f) { el.disabled = true; try { await f(); } catch (e) { toast(e.message || 'Não deu certo.'); } draw(); }

const FORMS = {
  tarefa(f) { const p = novaTarefa(U.obra, f.q.value); if (!p) return; U.sel = ''; refaz(); drawPainel(); const i = $('#painel .cap input'); if (i) i.focus(); },
  obra(f) {
    const o = Data.put('obras', { nome: f.nome.value.trim(), planta: f.modelo.value === 'livre' ? '' : f.modelo.value, criada: Date.now(), ordem: Math.max(0, ...S.obras.map(x => x.ordem)) + 1 }, true);
    f.t.value.split('\n').forEach(l => novaTarefa(o.id, l, true)); anim.clear(); DB.changed(); closeSheet(); abrir(o.id);
  },
  colar(f) { const n = f.t.value.split('\n').filter(l => novaTarefa(U.obra, l, true)).length; DB.changed(); FX.clique(); closeSheet(); draw(); toast(`${plural(n, 'tarefa adicionada', 'tarefas adicionadas')}.`); },
};

/* ---------- eventos ---------- */
document.addEventListener('click', e => {
  if (e.target.id === 'scrim') return closeSheet();
  document.querySelectorAll('details.menu[open]').forEach(m => { if (!m.contains(e.target)) m.open = false; });
  const el = e.target.closest('[data-act]');
  if (!el || !A[el.dataset.act] || (e.target !== el && e.target.closest('input,select,textarea,a,label'))) return;
  A[el.dataset.act](el, e);
  const m = el.closest('details.menu'); if (m) m.open = false;
});
document.addEventListener('keydown', e => {
  const campo = e.target.matches('input,select,textarea');
  if (e.key === 'Escape') { if (document.body.classList.contains('sheet')) closeSheet(); else if (campo) e.target.blur(); else if (U.sel) A.desel(); else document.body.classList.remove('painel'); return; }
  if (e.key === 'Enter' && e.target.matches('[role=button]')) return e.target.click();
  if (e.key === 'Enter' && e.target.matches('input[data-p], input[data-o]')) return e.target.blur();
  if (campo || U.v !== 'obra' || document.body.classList.contains('sheet')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); return desfazer(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (k >= '1' && k <= '4') A.ferr({ dataset: { v: FERR[+k - 1][0] } });
  else if (k === 'r') A.giro();
  else if (k === 'q') girarVista(-1); else if (k === 'e') girarVista(1);
  else if (k === 'f') enquadrar();
  else if (k === '+' || k === '=') A.zoom({ dataset: { n: '1.25' } }); else if (k === '-') A.zoom({ dataset: { n: '0.8' } });
  else if (k === 'delete' && U.sel) A.remover();
});
document.addEventListener('submit', e => { e.preventDefault(); const f = e.target.dataset.form; if (FORMS[f]) FORMS[f](e.target); });
// campos editados no lugar: gravam ao sair do campo
document.addEventListener('change', e => {
  const el = e.target, d = el.dataset;
  if (d.chk) { concluir(d.chk, el.checked); if (U.v === 'obra') { refaz(); drawPainel(); } else draw(); }
  else if (d.p) {
    const p = byId(S.pecas, d.p); if (!p) return;
    p[d.f] = el.value.trim(); Data.put('pecas', p);
    if (U.v === 'obra') { refaz(); setTimeout(() => { const a = document.activeElement; if (!a || !a.matches('#painel input, #painel textarea, #painel select')) drawPainel(); }, 0); }
  }
  else if (d.o) { const o = byId(S.obras, d.o), v = el.value.trim(); if (!v) { el.value = o.nome; return; } o[d.f] = v; Data.put('obras', o); }
  else if (d.s) { S.set[d.s] = el.type === 'checkbox' ? el.checked : el.value.trim(); DB.saveSet(); if (d.s === 'som' && el.checked) FX.clique(); if (el.type === 'checkbox') draw(); }
  else if (el.id === 'filepick' && el.files[0]) {
    el.files[0].text().then(t => { const j = JSON.parse(t); if (j.app !== 'blocos3') throw 0; Sync.merge(j); DB.changed(); draw(); toast('Backup importado e mesclado.'); }).catch(() => toast('Este arquivo não é um backup do Blocos 3.'));
    el.value = '';
  }
});
addEventListener('beforeinstallprompt', e => { e.preventDefault(); inst = e; if (U.v === 'ajustes') draw(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (cv) pinta(); else miniaturas(); });

const App = {
  // a sincronização trouxe novidades: redesenha, sem atrapalhar quem está digitando
  synced(changed) { if (changed && !document.body.classList.contains('sheet') && !(document.activeElement && document.activeElement.matches('input,select,textarea'))) draw(); else drawStatus(); },
};

DB.load();
// endereço terminado em #abrir já entra na primeira construção (usado para a captura de tela do README)
if (location.hash === '#abrir' && S.obras[0]) { U.v = 'obra'; U.obra = S.obras[0].id; }
draw();
Sync.init();
try { if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}
