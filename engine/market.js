// ============================================================================
// market.js — Mercato. Una carta-offerta per turno (la UI la tiene ferma finché
// non la si compra), più acquisto/vendita di cubi materia con scorte per Mercato.
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

  // Pianeti della fazione dove si possono ancora assegnare 'qta' carri (guarnigione < max)
  G.prototype.planetsWithGarrisonRoom = function (pid, qta) {
    return this.planetsOf(pid).filter((c) => c.garrison + qta <= C().MAX_CARRI_PIANETA);
  };

  // Posti liberi per i carri sulle navi della flotta al mercato
  G.prototype.carriRoomAtMarket = function (f) { return f ? Math.max(0, this.fleetCarriCapacity(f) - f.carri) : 0; };

  // Acquista l'unità proposta dalla carta. La flotta deve trovarsi sul Mercato.
  // I carri si comprano solo se le navi al mercato hanno posto per tutti (Torpediniera 2,
  // Nave Colonia 3): non si possono mandare su un pianeta.
  G.prototype.marketBuy = function (fleetId, card) {
    const f = this.fleetById(fleetId);
    if (!f) return { ok: false, msg: "Flotta inesistente." };
    if (this.cell(f.q, f.r).type !== "market") return { ok: false, msg: "La flotta non è su un Mercato." };
    const p = this.player(f.owner);
    if (p.money < card.prezzo) return { ok: false, msg: "Ndri insufficienti." };

    if (card.unita === "carri") {
      if (this.countUnits(p.id, "carri") + card.qta > C().LIMITS.carri) return { ok: false, msg: "Limite carri di fazione." };
      const cap = this.carriRoomAtMarket(f);
      if (cap < card.qta) return { ok: false, msg: "Non c'è posto a bordo: servono " + card.qta + " posti, ne hai " + cap + " (Torpediniera 2, Nave Colonia 3)." };
      p.money -= card.prezzo; f.carri += card.qta;
      this.say(p.name + " acquista al Mercato " + card.qta + " Carri (caricati sulla flotta).");
      return { ok: true, dest: "fleet" };
    }

    // Navi
    if (this.countUnits(p.id, card.unita) + card.qta > C().LIMITS[card.unita]) return { ok: false, msg: "Limite di fazione raggiunto." };
    p.money -= card.prezzo; f.ships[card.unita] += card.qta;
    this.say(p.name + " acquista al Mercato " + card.qta + " " + C().SHIP_NAMES[card.unita] + " per " + card.prezzo + " Ndri.");
    return { ok: true, dest: "fleet" };
  };

  // Scorta di materie prime del Mercato in (q, r): ogni Mercato parte vuoto e si riempie solo con
  // quello che i giocatori ci vendono; non si rinnova mai da sola. Comprare la consuma.
  G.prototype.stockAt = function (q, r) {
    if (!this.marketStock) this.marketStock = [];
    let ms = this.marketStock.find((x) => x.q === q && x.r === r);
    if (!ms) { ms = { q: q, r: r, carburante: 0, metallo: 0, pietra: 0 }; this.marketStock.push(ms); }
    return ms;
  };

  // Compra o vende materie al Mercato dove sta la flotta (q, r). Senza q: nessuna scorta (vecchie chiamate).
  G.prototype.marketTradeCube = function (pid, materia, qty, sell, q, r) {
    const p = this.player(pid);
    const ms = q != null && q >= 0 ? this.stockAt(q, r) : null;
    if (sell) {
      if (p.res[materia] < qty) return { ok: false, msg: "Materia insufficiente." };
      p.res[materia] -= qty; p.money += qty * C().PREZZO_VENDITA_CUBO;
      if (ms) ms[materia] += qty;
      this.say(p.name + " vende " + qty + " " + materia + " per " + qty * C().PREZZO_VENDITA_CUBO + " Ndri.");
    } else {
      const cost = qty * C().PREZZO_ACQUISTO_CUBO;
      if (this.planetsOf(pid).length === 0) return { ok: false, msg: "Serve almeno un pianeta per comprare materie prime: non hai dove portarle." };
      if (ms && ms[materia] < qty) return { ok: false, msg: "Il mercato non ha abbastanza " + materia + ": si compra solo quello che altri ci hanno venduto." };
      if (p.money < cost) return { ok: false, msg: "Ndri insufficienti." };
      p.money -= cost; p.res[materia] += qty;
      if (ms) ms[materia] -= qty;
      this.say(p.name + " compra " + qty + " " + materia + " per " + cost + " Ndri.");
    }
    return { ok: true };
  };
})(typeof window !== "undefined" ? window : globalThis);
