'use strict';
/* Blocos 3 — sons e confete. */

const FX = {
  ctx: null,
  on: () => S.set.anim !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches,
  tone(freqs, dur, type) {
    if (!S.set.som) return;
    try {
      const ctx = FX.ctx || (FX.ctx = new (window.AudioContext || window.webkitAudioContext)());
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * dur;
        o.type = type || 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
      });
    } catch (e) {}
  },
  vib(p) { if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} },
  clique() { FX.tone([170, 540], 0.06, 'square'); FX.vib(12); },    // peça assentando
  feito() { FX.tone([523, 784], 0.09); FX.vib(20); },               // tarefa concluída
  tira() { FX.tone([320, 220], 0.05, 'square'); },                  // peça removida
  no() { FX.tone([140], 0.14, 'sawtooth'); },
  win() { FX.tone([523, 659, 784, 1047], 0.13); FX.vib([40, 60, 40, 60, 120]); },
  confete() {
    if (!FX.on()) return;
    const box = document.createElement('div'); box.className = 'confete';
    for (let i = 0; i < 80; i++) {
      const p = document.createElement('i');
      p.style.cssText = `left:${Math.random() * 100}%;width:${12 + Math.random() * 26}px;background:${PALETA[i % 9]};animation-delay:${Math.random() * 0.7}s;animation-duration:${1.6 + Math.random() * 1.4}s;--r:${(Math.random() * 720 - 360) | 0}deg`;
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3800);
  },
};
