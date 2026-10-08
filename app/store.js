'use strict';
/* Blocos 3 — dados. Uma construção guarda peças; cada peça tem lugar na base (x, y, z) e pode ser uma tarefa.
   Tudo fica no aparelho (localStorage) em listas de registros { id, mod }; `mod` decide quem vence na sincronização. */

const KEY = 'blocos3-v1';
const byId = (l, id) => l.find(r => r.id === id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

const S = { set: { gClient: '', gWas: false, tema: 'auto', som: true, anim: true } };

// Formato de cada registro; o que vem de fora (sincronização, backup) passa por aqui antes de entrar.
const SHAPE = {
  obras: { nome: 's', planta: 's', desc: 's', criada: 'n', ordem: 'n', arquivada: 'b' },
  // slot: posição da peça na planta do modelo (-1 = peça solta, posta à mão)
  pecas: { obra: 's', x: 'i', y: 'i', z: 'i', w: 'i', d: 'i', h: 'i', cor: 'c', slot: 'i', titulo: 's', notas: 't', prazo: 'd', feito: 'n', prio: 'i', criado: 'n' },
};
function norm(store, r) {
  const o = { id: String(r.id), mod: Number(r.mod) || 0 };
  for (const [k, t] of Object.entries(SHAPE[store])) {
    const v = r[k];
    o[k] = t === 's' ? String(v == null ? '' : v).slice(0, 300)
      : t === 't' ? String(v == null ? '' : v).slice(0, 8000)
      : t === 'n' ? Number(v) || 0
      : t === 'i' ? Math.round(Number(v)) || 0
      : t === 'b' ? !!v
      : t === 'c' ? (/^#[0-9a-f]{6}$/i.test(v) ? v : '#9BA19D')
      : (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
  }
  if (store === 'pecas') {
    o.slot = r.slot == null || r.slot === '' ? -1 : o.slot;
    o.w = Math.max(1, Math.min(8, o.w || 1)); o.d = Math.max(1, Math.min(8, o.d || 1)); o.h = o.h === 1 ? 1 : 3;
    o.z = Math.max(0, o.z); o.prio = Math.max(0, Math.min(3, o.prio));
  }
  if (r.seed) o.seed = true;
  return o;
}

const DB = {
  SYNCED: Object.keys(SHAPE),
  onChange: null,
  _tomb: {},
  tomb: () => DB._tomb,

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
    DB.SYNCED.forEach(s => S[s] = (d && Array.isArray(d[s]) ? d[s] : []).filter(r => r && r.id).map(r => norm(s, r)));
    DB._tomb = (d && d.tomb && typeof d.tomb === 'object') ? d.tomb : {};
    try { Object.assign(S.set, JSON.parse(localStorage.getItem(KEY + '-set') || '{}')); } catch (e) {}
    if (!d) Data.exemplo();
    DB.persist();
  },
  persist() {
    const d = { tomb: DB._tomb };
    DB.SYNCED.forEach(s => d[s] = S[s]);
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {}
  },
  saveSet() { try { localStorage.setItem(KEY + '-set', JSON.stringify(S.set)); } catch (e) {} },
  changed() { DB.persist(); if (DB.onChange) DB.onChange(); },
};

const Data = {
  // gravações feitas por você: carimbam a data e, na primeira, adotam o exemplo como dado de verdade
  put(store, rec, quiet) {
    if (!rec.id) rec.id = uid();
    Object.assign(rec, norm(store, rec));
    rec.mod = Date.now();
    Data.adopt();
    if (!byId(S[store], rec.id)) S[store].push(rec);
    if (!quiet) DB.changed();
    return rec;
  },
  del(store, id, quiet) {
    const i = S[store].findIndex(r => r.id === id);
    if (i < 0) return;
    S[store].splice(i, 1);
    DB._tomb[store + ':' + id] = Date.now();
    if (!quiet) DB.changed();
  },
  adopt() { DB.SYNCED.forEach(s => S[s].forEach(r => { delete r.seed; })); },
  // gravações vindas da sincronização: não mexem em `mod`
  raw(store, rec) { const i = S[store].findIndex(r => r.id === rec.id); if (i < 0) S[store].push(rec); else S[store][i] = rec; },
  rawDel(store, id) { const i = S[store].findIndex(r => r.id === id); if (i >= 0) S[store].splice(i, 1); },

  // a construção de exemplo: uma casa com as primeiras peças já postas, algumas concluídas
  exemplo() {
    const now = Date.now(), o = norm('obras', { id: uid(), nome: 'Mudança de casa (exemplo)', planta: 'casa', criada: now, ordem: 1, mod: now }); o.seed = true; S.obras.push(o);
    ['Medir os cômodos', 'Pedir três orçamentos de frete', 'Separar o que vai ser doado', 'Comprar caixas e fita', 'Encaixotar os livros', 'Avisar o condomínio', 'Trocar o endereço das contas', 'Agendar a internet nova', 'Encaixotar a cozinha', 'Limpar a casa antiga']
      .forEach((t, i) => { const p = planta('casa')[i], r = norm('pecas', Object.assign({}, p, { id: uid(), obra: o.id, slot: i, titulo: t, feito: i < 4 ? now - (4 - i) * 864e5 : 0, prazo: i < 4 ? '' : new Date(now + (i - 3) * 2 * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10), criado: now, mod: now })); r.seed = true; S.pecas.push(r); });
  },
};
