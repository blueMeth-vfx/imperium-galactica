// ============================================================================
// sound.js — Effetti sonori e musica di sottofondo sintetizzati (Web Audio API).
// Nessun file audio esterno: tutto generato al volo, così resta offline-first.
// Un unico interruttore (mute) controlla effetti + musica; stato in localStorage.
// ============================================================================
(function () {
  const S = {
    ctx: null,
    master: null,
    musicGain: null,
    muted: localStorage.getItem("ig_muted") === "1",
    musicOn: false,
    musicTimer: null,
    _mi: 0,

    _ensure() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    },
    // Da richiamare al primo gesto utente (i browser bloccano l'audio finché non c'è)
    resume() {
      this._ensure();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },

    // Un tono breve con inviluppo (per gli effetti)
    _tone(freq, dur, type, gain, glideTo, delay) {
      if (!this.ctx || this.muted) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, t0);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain || 0.22, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },

    // ---- Effetti ----
    click() { if (this.muted) return; this.resume(); this._tone(430, 0.05, "triangle", 0.10); },
    turnStart() {
      if (this.muted) return; this.resume();
      // Arpeggio ascendente C-E-G-C (annuncio d'inizio turno)
      [[523, 0], [659, 0.10], [784, 0.20], [1046, 0.32]].forEach((n) => this._tone(n[0], 0.28, "triangle", 0.20, null, n[1]));
    },
    passTurn() {
      if (this.muted) return; this.resume();
      // Discesa morbida (passaggio di turno)
      this._tone(600, 0.22, "sine", 0.18, 240);
      this._tone(300, 0.26, "sine", 0.12, 150, 0.06);
    },
    chatSend() { if (this.muted) return; this.resume(); this._tone(660, 0.09, "sine", 0.16, 990); },
    chatReceive() {
      if (this.muted) return; this.resume();
      this._tone(880, 0.09, "sine", 0.17);
      this._tone(1245, 0.12, "sine", 0.15, null, 0.09);
    },
    dice() { if (this.muted) return; this.resume(); this._tone(220 + Math.random() * 120, 0.05, "square", 0.06); },

    // ---- Musica di sottofondo (pad ambient a bassa intensità) ----
    _pad(freqs, dur) {
      if (!this.ctx || !this.musicGain) return;
      const t0 = this.ctx.currentTime;
      freqs.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g); g.connect(this.musicGain);
        o.start(t0); o.stop(t0 + dur + 0.05);
      });
    },
    startMusic() {
      this._ensure();
      if (!this.ctx || this.muted || this.musicOn) return;
      this.musicOn = true;
      if (!this.musicGain) {
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.05; // volume di fondo molto contenuto
        this.musicGain.connect(this.master);
      }
      // Progressione lenta e "spaziale" (accordi minori/sospesi)
      const prog = [
        [220.0, 277.2, 329.6],  // La
        [196.0, 246.9, 293.7],  // Sol
        [246.9, 311.1, 370.0],  // Si
        [164.8, 220.0, 261.6],  // Mi
      ];
      const tick = () => {
        if (!this.musicOn || this.muted) return;
        this._pad(prog[this._mi % prog.length], 3.6);
        // ogni tanto un "luccichio" acuto
        if (this._mi % 2 === 1) this._tone(prog[this._mi % prog.length][2] * 2, 0.5, "sine", 0.02, null, 1.2);
        this._mi++;
        this.musicTimer = setTimeout(tick, 2600);
      };
      tick();
    },
    stopMusic() {
      this.musicOn = false;
      if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
    },

    // ---- Interruttore unico ----
    toggle() {
      this.muted = !this.muted;
      localStorage.setItem("ig_muted", this.muted ? "1" : "0");
      this._ensure();
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
      if (this.muted) this.stopMusic();
      else { this.resume(); this.startMusic(); }
      return this.muted;
    },
  };
  window.IGSound = S;
})();
