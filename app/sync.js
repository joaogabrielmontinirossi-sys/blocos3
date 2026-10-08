'use strict';
/* Blocos 3 — sincronização.
   1) Pasta (só no programa de Windows): grava blocos3-sync.json numa pasta do Google Drive para computador.
   2) Conta Google (Windows, site e celular): guarda o mesmo arquivo na área do app no Google Drive.
   Nos dois casos a mescla é por registro: vale a versão mais recente, e as exclusões são propagadas. */

const GAPI = 'https://www.googleapis.com/';
const PORT = 47895;
const Sync = {
  avail: false, on: false, folder: null, detected: null, drives: [], busy: false, again: false, last: 0, error: '',
  g: { token: '', exp: 0, last: 0, error: '', file: null },

  api: (path, opt = {}) => fetch('/api/' + path, Object.assign({}, opt, { headers: Object.assign({ 'X-Blocos3': '1' }, opt.headers) })),
  async init() {
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) try { const r = await Sync.api('sync/info'); if (r.ok && (r.headers.get('content-type') || '').includes('json')) { Sync.avail = true; Sync.info(await r.json()); } } catch (e) {}
    try { const t = JSON.parse(localStorage.getItem('blocos3-g') || 'null'); if (t && t.exp > Date.now() + 60000) { Sync.g.token = t.token; Sync.g.exp = t.exp; } } catch (e) {}
    DB.onChange = () => Sync.soon();
    await Sync.run();
    setInterval(() => { if (!document.hidden) Sync.run(); }, 30000);
    addEventListener('focus', () => Sync.run());
    addEventListener('online', () => Sync.run());
  },
  info(i) { Sync.on = !!i.enabled; Sync.folder = i.folder; Sync.detected = i.detected; Sync.drives = i.drives || []; },
  soon: debounce(() => Sync.run(), 1500),
  gOn: () => !!(S.set.gClient && Sync.g.token && Sync.g.exp > Date.now()),
  any: () => Sync.on || Sync.gOn(),
  status() {
    if (!Sync.any()) return S.set.gClient && S.set.gWas ? 'Reconectar Google' : 'Só neste aparelho';
    const err = Sync.error || Sync.g.error, last = Math.max(Sync.last, Sync.g.last);
    return err ? 'Falha na sincronização' : last ? 'Sincronizado ' + new Date(last).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'Sincronizando…';
  },

  payload() {
    const stores = {};
    DB.SYNCED.forEach(s => stores[s] = S[s].map(r => { if (!r.seed) return r; const c = Object.assign({}, r); delete c.seed; return c; }));
    return { app: 'blocos3', v: 1, at: Date.now(), stores, tomb: DB.tomb() };
  },
  // impressão digital do conteúdo, para só regravar quando há diferença
  print(p) { return DB.SYNCED.map(s => { const l = p.stores[s] || []; return l.length + ':' + l.reduce((n, r) => n + (r.mod || 0) % 1e9, 0); }).join('|') + '|' + Object.keys(p.tomb || {}).length; },
  merge(r) {
    if (!r || r.app !== 'blocos3' || !r.stores) return false;
    let changed = false;
    const tomb = DB.tomb(), rt = (r.tomb && typeof r.tomb === 'object') ? r.tomb : {};
    // a outra ponta já tem peças: o exemplo deste aparelho sai de cena
    if ((r.stores.pecas || []).length) for (const s of DB.SYNCED) for (const rec of S[s].slice()) if (rec.seed) { Data.rawDel(s, rec.id); changed = true; }
    for (const s of DB.SYNCED) for (const rec of Array.isArray(r.stores[s]) ? r.stores[s] : []) {
      if (!rec || typeof rec !== 'object' || !rec.id) continue;
      if (tomb[s + ':' + rec.id] && tomb[s + ':' + rec.id] >= (rec.mod || 0)) continue;
      const loc = byId(S[s], String(rec.id));
      if (loc && (Number(rec.mod) || 0) <= (loc.mod || 0)) continue;
      const n = norm(s, rec); delete n.seed;
      Data.raw(s, n); changed = true;
    }
    for (const [k, v] of Object.entries(rt)) {
      const ts = Number(v) || 0;
      if ((tomb[k] || 0) < ts) { tomb[k] = ts; changed = true; }
      const i = k.indexOf(':'), s = k.slice(0, i), id = k.slice(i + 1), loc = DB.SYNCED.includes(s) && byId(S[s], id);
      if (loc && (loc.mod || 0) <= ts) { Data.rawDel(s, id); changed = true; }
    }
    if (changed) DB.persist();
    return changed;
  },

  async run() {
    if (Sync.busy) { Sync.again = true; return; }
    if (!Sync.any()) return;
    Sync.busy = true;
    let changed = false;
    if (Sync.on) { try { changed = await Sync.folderSync() || changed; Sync.error = ''; Sync.last = Date.now(); } catch (e) { console.warn(e); Sync.error = 'A pasta de sincronização não está acessível.'; } }
    if (Sync.gOn() && navigator.onLine !== false) {
      try { changed = await Sync.driveSync() || changed; Sync.g.error = ''; Sync.g.last = Date.now(); } catch (e) { console.warn(e); Sync.g.error = e.message || 'Falha ao falar com o Google.'; }
    }
    Sync.busy = false;
    App.synced(changed);
    if (Sync.again) { Sync.again = false; Sync.soon(); }
  },

  /* ---------- 1) Pasta ---------- */
  async folderSync() {
    const r = await Sync.api('sync');
    if (r.status === 409) { Sync.on = false; return false; }
    const remote = r.status === 200 ? await r.json().catch(() => null) : null;
    const changed = remote ? Sync.merge(remote) : false, local = Sync.payload();
    if (!remote || Sync.print(remote) !== Sync.print(local)) { const w = await Sync.api('sync', { method: 'POST', body: JSON.stringify(local) }); if (!w.ok) throw new Error('gravação'); }
    return changed;
  },
  async config(v) { const r = await Sync.api(v === 'choose' ? 'sync/choose' : 'sync/config', { method: 'POST', body: v === 'choose' ? '' : v }); Sync.info(await r.json()); Sync.error = ''; Sync.last = 0; await Sync.run(); },

  /* ---------- 2) Conta Google (área de dados do app no Drive) ---------- */
  gis: () => Sync._gis || (Sync._gis = new Promise((res, rej) => { if (window.google && google.accounts) return res(); const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.onload = res; s.onerror = () => { Sync._gis = null; rej(new Error('Sem acesso ao Google. Verifique a internet.')); }; document.head.appendChild(s); })),
  // Abre a janela do Google. Precisa partir de um clique do usuário (os navegadores bloqueiam janelas espontâneas).
  async connect() {
    if (!S.set.gClient) throw new Error('Informe o ID do cliente OAuth.');
    await Sync.gis();
    const tok = await new Promise((res, rej) => {
      const c = google.accounts.oauth2.initTokenClient({ client_id: S.set.gClient.trim(), scope: 'https://www.googleapis.com/auth/drive.appdata', callback: r => r.error ? rej(new Error(r.error_description || r.error)) : res(r), error_callback: e => rej(new Error(e.type === 'popup_closed' ? 'A janela do Google foi fechada.' : e.type === 'popup_failed_to_open' ? 'O navegador bloqueou a janela do Google.' : (e.message || 'Falha na autorização.'))) });
      c.requestAccessToken({ prompt: S.set.gWas ? '' : 'consent' });
    });
    Sync.g.token = tok.access_token; Sync.g.exp = Date.now() + (tok.expires_in - 90) * 1000; Sync.g.error = ''; Sync.g.file = null;
    localStorage.setItem('blocos3-g', JSON.stringify({ token: Sync.g.token, exp: Sync.g.exp }));
    S.set.gWas = true; DB.saveSet();
    await Sync.run();
  },
  disconnect() {
    try { if (window.google && Sync.g.token) google.accounts.oauth2.revoke(Sync.g.token, () => {}); } catch (e) {}
    Sync.g.token = ''; Sync.g.exp = 0; localStorage.removeItem('blocos3-g'); S.set.gWas = false; DB.saveSet();
  },
  async gfetch(path, opt = {}) {
    const r = await fetch(GAPI + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + Sync.g.token }, opt.headers) }));
    if (r.status === 401) { Sync.g.token = ''; localStorage.removeItem('blocos3-g'); throw new Error('A sessão do Google expirou. Clique em “Reconectar”.'); }
    if (!r.ok && r.status !== 404) { let msg = 'Google respondeu ' + r.status; try { msg = (await r.json()).error.message || msg; } catch (e) {} throw new Error(msg); }
    return r;
  },
  async driveSync() {
    const NAME = 'blocos3-sync.json';
    if (!Sync.g.file) { const j = await (await Sync.gfetch(`drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${NAME}'`)}&fields=files(id)`)).json(); Sync.g.file = (j.files && j.files[0] && j.files[0].id) || null; }
    let remote = null;
    if (Sync.g.file) { const r = await Sync.gfetch(`drive/v3/files/${Sync.g.file}?alt=media`); if (r.ok) remote = await r.json().catch(() => null); else Sync.g.file = null; }
    const changed = remote ? Sync.merge(remote) : false, local = Sync.payload();
    if (remote && Sync.print(remote) === Sync.print(local)) return changed;
    const body = JSON.stringify(local);
    if (Sync.g.file) await Sync.gfetch(`upload/drive/v3/files/${Sync.g.file}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body });
    else {
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify({ name: NAME, parents: ['appDataFolder'] })], { type: 'application/json' }));
      form.append('file', new Blob([body], { type: 'application/json' }));
      Sync.g.file = (await (await Sync.gfetch('upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', body: form })).json()).id;
    }
    return changed;
  },
};
