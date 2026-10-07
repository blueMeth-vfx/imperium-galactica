// ============================================================================
// diplomacy.js — Alleanze e patti di non belligeranza (come nel gioco per PC/Mac).
//  - Un giocatore, nel suo turno, propone a un altro un'alleanza oppure una non
//    belligeranza per N turni. L'IA risponde subito; un umano risponde all'inizio
//    del suo turno (così online lo stato lo cambia sempre chi ha il turno).
//  - Fra alleati, e fra chi ha una non belligeranza in corso, non ci si attacca:
//    le flotte stanno nella stessa casella senza combattere e si passa sopra i
//    pianeti dell'altro senza battaglia.
//  - Gli alleati con flotte nella stessa casella (o una flotta sopra un pianeta
//    dell'altro) possono scambiarsi Ndri e materie prime.
//  - L'alleanza si può rompere nel proprio turno; la non belligeranza no: finisce
//    da sola quando scadono i suoi turni.
// ============================================================================
(function (g) {
  g.IG = g.IG || {};
  const G = g.IG.Game;
  const C = () => g.IG.CONFIG;

  // pact = { a, b, kind: "alleanza" | "tregua", until: turno in cui finisce (-1 = alleanza) }
  G.prototype.pactOf = function (a, b) {
    if (a === b || !this.pacts) return null;
    return this.pacts.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a)) || null;
  };
  G.prototype.allied = function (a, b) { const p = this.pactOf(a, b); return !!p && p.kind === "alleanza"; };

  // Amici: lo stesso giocatore, alleati, o con una non belligeranza ancora in corso
  G.prototype.friendly = function (a, b) {
    if (a === b) return true;
    if (a == null || b == null || a < 0 || b < 0) return false;
    const p = this.pactOf(a, b);
    return !!p && (p.kind === "alleanza" || this.turnNumber < p.until);
  };

  G.pactName = function (kind) { return kind === "alleanza" ? "alleanza" : "non belligeranza"; };

  G.prototype.proposePact = function (from, to, kind, turns) {
    turns = turns | 0;
    if (from !== this.currentPlayer) return { ok: false, msg: "Si propone un patto nel proprio turno." };
    if (to === from || to < 0 || to >= this.players.length) return { ok: false, msg: "Giocatore non valido." };
    if (this.player(to).eliminated || this.player(from).eliminated) return { ok: false, msg: "Quel giocatore è fuori dalla partita." };
    if (kind !== "alleanza" && kind !== "tregua") return { ok: false, msg: "Patto non valido." };
    if (this.allied(from, to)) return { ok: false, msg: "Siete già alleati." };
    if (kind === "tregua") {
      if (turns < C().TREGUA_MIN || turns > C().TREGUA_MAX) return { ok: false, msg: "La non belligeranza dura da " + C().TREGUA_MIN + " a " + C().TREGUA_MAX + " turni." };
      if (this.friendly(from, to)) return { ok: false, msg: "Avete già una non belligeranza in corso." };
    }
    if (this.pactOffers.some((o) => (o.from === from && o.to === to) || (o.from === to && o.to === from)))
      return { ok: false, msg: "C'è già una proposta in attesa fra voi due." };
    const offer = { id: ++this.pactSeq, from: from, to: to, kind: kind, turns: kind === "tregua" ? turns : 0 };
    this.say("🤝 " + this.player(from).name + " propone a " + this.player(to).name + (kind === "alleanza" ? " un'alleanza." : " una non belligeranza per " + turns + " turni."));
    if (this.player(to).isAI) {
      const acc = g.IG.considerPact(this, to, from, kind, turns);
      this._answerPactInternal(offer, acc);
      return { ok: true, event: acc ? "pactAccepted" : "pactRefused" };
    }
    this.pactOffers.push(offer);
    return { ok: true };
  };

  // Le proposte che aspettano la risposta di pid
  G.prototype.offersTo = function (pid) { return (this.pactOffers || []).filter((o) => o.to === pid); };

  G.prototype.answerPact = function (offerId, accept) {
    const o = this.pactOffers.find((x) => x.id === offerId);
    if (!o) return { ok: false, msg: "Proposta non più valida." };
    if (o.to !== this.currentPlayer) return { ok: false, msg: "Si risponde nel proprio turno." };
    this.pactOffers = this.pactOffers.filter((x) => x !== o);
    if (this.player(o.from).eliminated) return { ok: false, msg: "Chi l'ha proposta è fuori dalla partita." };
    this._answerPactInternal(o, accept);
    return { ok: true };
  };

  G.prototype._answerPactInternal = function (o, accept) {
    const a = this.player(o.from).name, b = this.player(o.to).name;
    if (!accept) { this.say("✋ " + b + (o.kind === "alleanza" ? " rifiuta l'alleanza" : " rifiuta la non belligeranza") + " proposta da " + a + "."); return; }
    this.pacts = this.pacts.filter((p) => !((p.a === o.from && p.b === o.to) || (p.a === o.to && p.b === o.from)));
    if (o.kind === "alleanza") {
      this.pacts.push({ a: o.from, b: o.to, kind: "alleanza", until: -1 });
      this.say("🤝 " + a + " e " + b + " sono alleati.");
    } else {
      this.pacts.push({ a: o.from, b: o.to, kind: "tregua", until: this.turnNumber + o.turns });
      this.say("🕊 " + a + " e " + b + ": non belligeranza fino al turno " + (this.turnNumber + o.turns) + ".");
    }
  };

  G.prototype.breakAlliance = function (pid, other) {
    if (pid !== this.currentPlayer) return { ok: false, msg: "Si rompe un'alleanza nel proprio turno." };
    const p = this.pactOf(pid, other);
    if (!p || p.kind !== "alleanza") return { ok: false, msg: "Non siete alleati." };
    this.pacts = this.pacts.filter((x) => x !== p);
    this.say("⚔ " + this.player(pid).name + " rompe l'alleanza con " + this.player(other).name + ".");
    return { ok: true };
  };

  // A ogni nuovo giro: le non belligeranze scadute finiscono
  G.prototype._expirePacts = function () {
    if (!this.pacts) return;
    for (const p of this.pacts.filter((x) => x.kind === "tregua" && this.turnNumber >= x.until)) {
      this.pacts = this.pacts.filter((x) => x !== p);
      this.say("⌛ Finisce la non belligeranza fra " + this.player(p.a).name + " e " + this.player(p.b).name + ".");
    }
  };

  // Chi è fuori dalla partita non ha patti né proposte
  G.prototype._forgetPacts = function (pid) {
    this.pacts = (this.pacts || []).filter((p) => p.a !== pid && p.b !== pid);
    this.pactOffers = (this.pactOffers || []).filter((o) => o.from !== pid && o.to !== pid);
  };

  // Gli alleati si incontrano: flotte nella stessa casella, o una flotta sopra un pianeta dell'altro
  G.prototype.canTradeWith = function (pid, other) {
    if (!this.allied(pid, other)) return false;
    for (const f of this.fleetsOf(pid)) {
      if (this.fleets.some((o) => o.owner === other && o.q === f.q && o.r === f.r)) return true;
      const c = this.cell(f.q, f.r); if (c && c.owner === other) return true;
    }
    for (const f of this.fleetsOf(other)) { const c = this.cell(f.q, f.r); if (c && c.owner === pid) return true; }
    return false;
  };

  // Dono all'alleato (lo scambio è fatto di doni nei due sensi): Ndri o una materia
  G.prototype.giveToAlly = function (pid, other, what, qty) {
    if (pid !== this.currentPlayer) return { ok: false, msg: "Si scambia nel proprio turno." };
    if (!(qty > 0)) return { ok: false, msg: "Quantità non valida." };
    if (!this.canTradeWith(pid, other)) return { ok: false, msg: "Per scambiare servono un'alleanza e flotte nella stessa casella." };
    const p = this.player(pid), o = this.player(other);
    if (what === "soldi") {
      if (p.money < qty) return { ok: false, msg: "Ndri insufficienti." };
      p.money -= qty; o.money += qty;
      this.say("🎁 " + p.name + " dà " + qty + " Ndri a " + o.name + ".");
    } else {
      if (what !== "carburante" && what !== "metallo" && what !== "pietra") return { ok: false, msg: "Materia non valida." };
      if (p.res[what] < qty) return { ok: false, msg: "Materia insufficiente." };
      p.res[what] -= qty; o.res[what] += qty;
      this.say("🎁 " + p.name + " dà " + qty + " " + what + " a " + o.name + ".");
    }
    return { ok: true };
  };
})(typeof window !== "undefined" ? window : globalThis);
