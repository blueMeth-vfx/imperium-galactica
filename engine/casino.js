// ============================================================================
// casino.js — Casinò Interspaziale (manuale sez. 13). Gioco di dadi (craps).
// Nota: il manuale prevede un lancio condiviso se più giocatori sono sulla
// stessa casella; qui ogni giocatore gioca nel proprio turno con lancio
// proprio (semplificazione dichiarata nel README).
// ============================================================================
(function (g) {
  g.IG = g.IG || {};
  const G = g.IG.Game;
  const C = () => g.IG.CONFIG;

  // Esiste una flotta del giocatore sul Casinò?
  G.prototype.playerOnCasino = function (pid) {
    return this.fleets.some((f) => f.owner === pid && this.cell(f.q, f.r).type === "casino");
  };

  // Sessione corrente del giocatore (banco accumulato)
  G.prototype._casinoSession = function (pid) {
    this.casinoSessions = this.casinoSessions || {};
    if (!this.casinoSessions[pid]) this.casinoSessions[pid] = { banco: 0 };
    return this.casinoSessions[pid];
  };

  // Piazza/aggiunge una puntata. Rispetta minimo ed escalation (≥ banco attuale).
  G.prototype.casinoBet = function (pid, amount) {
    const p = this.player(pid);
    const s = this._casinoSession(pid);
    const minBet = s.banco > 0 ? Math.max(C().CASINO_PUNTATA_MIN, s.banco) : C().CASINO_PUNTATA_MIN;
    if (amount < minBet) return { ok: false, msg: "Puntata minima ora: " + minBet + " Ndri." };
    if (p.money < amount) return { ok: false, msg: "Ndri insufficienti." };
    p.money -= amount; s.banco += amount;
    this.say(p.name + " punta " + amount + " al Casinò (banco: " + s.banco + ").");
    return { ok: true, banco: s.banco };
  };

  // Lancia due dadi e risolve. Ritorna l'esito; su pareggio la sessione resta aperta.
  G.prototype.casinoRoll = function (pid) {
    const p = this.player(pid);
    const s = this._casinoSession(pid);
    if (s.banco <= 0) return { ok: false, msg: "Nessuna puntata sul banco." };
    const d1 = this.rollDie(), d2 = this.rollDie(), sum = d1 + d2;
    let outcome;
    if (sum === 7 || sum === 11) {
      const vincita = s.banco * 2;
      p.money += vincita;
      this.say("🎲 Casinò " + p.name + ": " + d1 + "+" + d2 + "=" + sum + " → VINCE! Incassa " + vincita + " Ndri.");
      s.banco = 0; outcome = "win";
    } else if (sum === 2 || sum === 3 || sum === 12) {
      this.say("🎲 Casinò " + p.name + ": " + d1 + "+" + d2 + "=" + sum + " → PERDE il banco (" + s.banco + ").");
      s.banco = 0; outcome = "lose";
    } else {
      this.say("🎲 Casinò " + p.name + ": " + d1 + "+" + d2 + "=" + sum + " → pareggio (banco resta " + s.banco + ").");
      outcome = "push";
    }
    return { ok: true, d1, d2, sum, outcome, banco: s.banco };
  };

  // Il giocatore lascia il tavolo dopo un pareggio: perde quanto già scommesso.
  G.prototype.casinoLeave = function (pid) {
    const s = this._casinoSession(pid);
    if (s.banco > 0) this.say(this.player(pid).name + " lascia il Casinò perdendo " + s.banco + " Ndri.");
    s.banco = 0;
    return { ok: true };
  };
})(typeof window !== "undefined" ? window : globalThis);
