// ============================================================================
// market.js — Mercato (manuale sez. 12 e appendice). Una carta-deal per turno,
// più acquisto/vendita di cubi materia (house rule sui prezzi).
// ============================================================================
(function (g) {
  g.IG = g.IG || {};
  const G = g.IG.Game;
  const C = () => g.IG.CONFIG;

  // Pesca una carta dal mazzo Mercato (poi va in fondo)
  G.prototype.marketDraw = function () {
    const card = this.marketDeck.shift();
    this.marketDeck.push(card);
    return card;
  };

  // Acquista l'unità proposta dalla carta. La flotta deve trovarsi sul Mercato.
  G.prototype.marketBuy = function (fleetId, card) {
    const f = this.fleetById(fleetId);
    if (!f) return { ok: false, msg: "Flotta inesistente." };
    if (this.cell(f.q, f.r).type !== "market") return { ok: false, msg: "La flotta non è su un Mercato." };
    const p = this.player(f.owner);
    if (p.money < card.prezzo) return { ok: false, msg: "Ndri insufficienti." };

    if (card.unita === "carri") {
      const cap = this.fleetCarriCapacity(f) - f.carri;
      if (cap < card.qta) return { ok: false, msg: "Capienza carri insufficiente nella flotta." };
      if (this.countUnits(p.id, "carri") + card.qta > C().LIMITS.carri) return { ok: false, msg: "Limite carri di fazione." };
      p.money -= card.prezzo; f.carri += card.qta;
    } else {
      if (this.countUnits(p.id, card.unita) + card.qta > C().LIMITS[card.unita]) return { ok: false, msg: "Limite di fazione raggiunto." };
      p.money -= card.prezzo; f.ships[card.unita] += card.qta;
    }
    this.say(p.colorName + " acquista al Mercato " + card.qta + " " +
      (card.unita === "carri" ? "Carri" : C().SHIP_NAMES[card.unita]) + " per " + card.prezzo + " Ndri.");
    return { ok: true };
  };

  // Compra/vende cubi materia a prezzo fisso (house rule)
  G.prototype.marketTradeCube = function (pid, materia, qty, sell) {
    const p = this.player(pid);
    if (sell) {
      if (p.res[materia] < qty) return { ok: false, msg: "Materia insufficiente." };
      p.res[materia] -= qty; p.money += qty * C().PREZZO_VENDITA_CUBO;
      this.say(p.colorName + " vende " + qty + " " + materia + " per " + qty * C().PREZZO_VENDITA_CUBO + " Ndri.");
    } else {
      const cost = qty * C().PREZZO_ACQUISTO_CUBO;
      if (p.money < cost) return { ok: false, msg: "Ndri insufficienti." };
      p.money -= cost; p.res[materia] += qty;
      this.say(p.colorName + " compra " + qty + " " + materia + " per " + cost + " Ndri.");
    }
    return { ok: true };
  };
})(typeof window !== "undefined" ? window : globalThis);
