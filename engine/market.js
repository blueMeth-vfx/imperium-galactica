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

  // Pianeti della fazione dove si possono ancora assegnare 'qta' carri (guarnigione < max)
  G.prototype.planetsWithGarrisonRoom = function (pid, qta) {
    return this.planetsOf(pid).filter((c) => c.garrison + qta <= C().MAX_CARRI_PIANETA);
  };

  // Acquista l'unità proposta dalla carta. La flotta deve trovarsi sul Mercato.
  // Per i CARRI: se la flotta ha capienza vanno sulle navi; altrimenti, indicando
  // targetPlanet {q,r}, vanno nella guarnigione di un pianeta colonizzato (max per pianeta).
  G.prototype.marketBuy = function (fleetId, card, targetPlanet) {
    const f = this.fleetById(fleetId);
    if (!f) return { ok: false, msg: "Flotta inesistente." };
    if (this.cell(f.q, f.r).type !== "market") return { ok: false, msg: "La flotta non è su un Mercato." };
    const p = this.player(f.owner);
    if (p.money < card.prezzo) return { ok: false, msg: "Ndri insufficienti." };

    if (card.unita === "carri") {
      if (this.countUnits(p.id, "carri") + card.qta > C().LIMITS.carri) return { ok: false, msg: "Limite carri di fazione." };
      if (targetPlanet) {
        // Assegna alla guarnigione di un pianeta colonizzato
        const cell = this.cell(targetPlanet.q, targetPlanet.r);
        if (!cell || cell.owner !== p.id || cell.type !== "planet") return { ok: false, msg: "Pianeta non valido." };
        if (cell.garrison + card.qta > C().MAX_CARRI_PIANETA) return { ok: false, msg: "Massimo " + C().MAX_CARRI_PIANETA + " carri per pianeta." };
        p.money -= card.prezzo; cell.garrison += card.qta;
        this.say(p.name + " acquista al Mercato " + card.qta + " Carri (assegnati a " + cell.planet.data.nome + ").");
        return { ok: true, dest: "planet" };
      }
      // Prova a caricarli sulle navi
      const cap = this.fleetCarriCapacity(f) - f.carri;
      if (cap >= card.qta) {
        p.money -= card.prezzo; f.carri += card.qta;
        this.say(p.name + " acquista al Mercato " + card.qta + " Carri (caricati sulla flotta).");
        return { ok: true, dest: "fleet" };
      }
      // Nessuna capienza: servono pianeti colonizzati con posto
      if (this.planetsWithGarrisonRoom(p.id, card.qta).length === 0) return { ok: false, msg: "Nessuna capienza sulle navi né pianeti disponibili (max " + C().MAX_CARRI_PIANETA + "/pianeta)." };
      return { ok: false, needPlanet: true, msg: "Nessuna capienza sulle navi: scegli un pianeta a cui assegnarli." };
    }

    // Navi
    if (this.countUnits(p.id, card.unita) + card.qta > C().LIMITS[card.unita]) return { ok: false, msg: "Limite di fazione raggiunto." };
    p.money -= card.prezzo; f.ships[card.unita] += card.qta;
    this.say(p.name + " acquista al Mercato " + card.qta + " " + C().SHIP_NAMES[card.unita] + " per " + card.prezzo + " Ndri.");
    return { ok: true, dest: "fleet" };
  };

  // Compra/vende cubi materia a prezzo fisso (house rule)
  G.prototype.marketTradeCube = function (pid, materia, qty, sell) {
    const p = this.player(pid);
    if (sell) {
      if (p.res[materia] < qty) return { ok: false, msg: "Materia insufficiente." };
      p.res[materia] -= qty; p.money += qty * C().PREZZO_VENDITA_CUBO;
      this.say(p.name + " vende " + qty + " " + materia + " per " + qty * C().PREZZO_VENDITA_CUBO + " Ndri.");
    } else {
      const cost = qty * C().PREZZO_ACQUISTO_CUBO;
      if (p.money < cost) return { ok: false, msg: "Ndri insufficienti." };
      p.money -= cost; p.res[materia] += qty;
      this.say(p.name + " compra " + qty + " " + materia + " per " + cost + " Ndri.");
    }
    return { ok: true };
  };
})(typeof window !== "undefined" ? window : globalThis);
