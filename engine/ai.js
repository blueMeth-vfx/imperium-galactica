// ============================================================================
// ai.js — IA avversaria basilare: riscuote (auto), produce, esplora, colonizza,
// attacca solo con vantaggio, costruisce edifici se può permetterselo.
// Pensata per essere "ragionevole", non ottimale.
// ============================================================================
(function (g) {
  g.IG = g.IG || {};
  const C = () => g.IG.CONFIG;

  // Punteggio grezzo di forza di una flotta (per decidere se attaccare)
  function power(game, f) {
    const S = C().SHIPS;
    return f.ships.caccia * S.caccia.att * 2 + f.ships.torpediniera * S.torpediniera.att + f.ships.colonia * 0;
  }
  function fleetDefense(game, f) {
    const S = C().SHIPS;
    return f.ships.caccia * S.caccia.def + f.ships.torpediniera * S.torpediniera.def + f.ships.colonia * S.colonia.def;
  }

  const isHumanOwner = (game, owner) => owner != null && !game.player(owner).isAI;

  // Turno IA come GENERATORE: si mette in pausa (yield) quando attacca un UMANO,
  // così l'interfaccia può far difendere il giocatore tirando i propri dadi.
  function* aiTurnGen(game) {
    const pid = game.currentPlayer;
    const me = game.player(pid);
    const cfg = C();
    const diff = cfg.DIFFICULTY[me.difficulty] || cfg.DIFFICULTY[cfg.DEFAULT_DIFFICULTY];

    // --- Fase 2: Produzione ---
    for (const cell of game.planetsOf(pid)) {
      if (cell.buildings.fabbricaNavale > 0) {
        const cap = Math.max(1, Math.round(cell.buildings.fabbricaNavale * cell.planet.data.produttivita * diff.prodPortion));
        for (let i = 0; i < cap; i++) {
          const type = diff.produceTorped && me.money > 60000 && me.res.carburante >= 3 && me.res.metallo >= 3 ? "torpediniera" : "caccia";
          if (!game.produceShip(cell.q, cell.r, type, 1).ok) break;
        }
      }
      if (cell.buildings.fabbricaCarri > 0) {
        const cap = Math.max(1, Math.round(cell.buildings.fabbricaCarri * cell.planet.data.produttivita * diff.prodPortion));
        for (let i = 0; i < cap; i++) if (!game.produceCarri(cell.q, cell.r, 1).ok) break;
      }
    }
    game.advancePhase(); // -> Movimento (assegna i passi)

    // --- Fase 3: Movimento / esplorazione / attacco / colonizzazione ---
    const Hex = g.IG.Hex;
    for (const f of game.fleetsOf(pid).slice()) {
      let guard = 0;
      while (game.fleetById(f.id) && f.stepsLeft > 0 && guard++ < 8) {
        // Colonizza se sei su un pianeta libero e hai una Nave Colonia
        const here = game.cell(f.q, f.r);
        if (here.type === "planet" && here.owner === null && f.ships.colonia > 0) {
          game.colonize(f.id);
          if (!game.fleetById(f.id)) break;
        }
        const nbs = Hex.neighbors(f.q, f.r);
        let target = null, mode = null;
        // Cerca un bersaglio d'attacco adiacente secondo la difficoltà
        const findAttack = () => {
          for (const n of nbs) {
            const c = game.cell(n.q, n.r);
            const ef = game.fleets.find((o) => o.q === n.q && o.r === n.r && o.owner !== pid);
            if (ef && power(game, f) > fleetDefense(game, ef) * diff.attackFactor) return { n, m: "attack" };
            if (c.type === "planet" && c.owner !== null && c.owner !== pid && c.buildings.cannone === 0 && power(game, f) > 1 && diff.attackFactor <= 1.2) return { n, m: "attackPlanet" };
          }
          return null;
        };
        // 1) pianeta libero adiacente (se ho colonia) -> vai a colonizzare
        if (f.ships.colonia > 0) {
          target = nbs.find((n) => { const c = game.cell(n.q, n.r); return c.explored && c.type === "planet" && c.owner === null; });
          if (target) mode = "colonize";
        }
        // Difficile: attacca PRIMA di esplorare
        if (!target && diff.aggressive) { const a = findAttack(); if (a) { target = a.n; mode = a.m; } }
        // 2) cella inesplorata -> esplora
        if (!target) {
          const unexp = nbs.filter((n) => !game.cell(n.q, n.r).explored);
          if (unexp.length) { target = unexp[Math.floor(game.rng() * unexp.length)]; mode = "explore"; }
        }
        // 3) bersaglio nemico -> attacca (per Medio/Facile, dopo l'esplorazione)
        if (!target) { const a = findAttack(); if (a) { target = a.n; mode = a.m; } }
        // 4) altrimenti vagabonda su spazio esplorato libero
        if (!target) {
          const free = nbs.filter((n) => { const c = game.cell(n.q, n.r); return c.explored && !game.fleets.some((o) => o.q === n.q && o.r === n.r && o.owner !== pid); });
          if (free.length) { target = free[Math.floor(game.rng() * free.length)]; mode = "wander"; }
        }
        if (!target) break;

        const ev = game.stepFleet(f.id, target.q, target.r);
        if (!ev.ok) break;
        if (ev.event === "combat") {
          const def = game.fleetById(ev.defender);
          if (def && isHumanOwner(game, def.owner)) {
            // Attacco a un giocatore umano: metti in pausa, lo difenderà lui
            yield { type: "fleetCombat", attacker: ev.attacker, defender: ev.defender, q: ev.q, r: ev.r };
          } else if (power(game, f) > fleetDefense(game, def)) {
            game.resolveFleetCombat(ev.attacker, ev.defender);
          } else break; // rinuncia
        } else if (ev.event === "planetCombat") {
          const cell = game.cell(ev.q, ev.r);
          if (isHumanOwner(game, cell.owner)) {
            yield { type: "planetCombat", attacker: ev.attacker, q: ev.q, r: ev.r, land: f.carri };
          } else {
            game.resolvePlanetCombat(ev.attacker, ev.q, ev.r, { land: f.carri });
          }
        } else if (ev.event === "destroyed") {
          break;
        } else if (ev.event === "moved" && ev.canColonize && f.ships.colonia > 0) {
          game.colonize(f.id);
        }
      }
    }
    game.advancePhase(); // -> Costruzione

    // --- Fase 4: Costruzione (secondo la difficoltà) ---
    if (diff.buildLevel >= 1) {
      for (const cell of game.planetsOf(pid)) {
        if (me.money < 40000) break;
        let type = null;
        if (cell.buildings.fabbricaNavale === 0) type = "fabbricaNavale";
        else if (diff.buildLevel >= 2 && cell.buildings.cannone === 0) type = "cannone"; // difficile: si difende
        else if (cell.buildings.tesoreria === 0 && me.money > 60000) type = "tesoreria";
        else if (cell.buildings.cannone === 0) type = "cannone";
        else if (diff.buildLevel >= 2 && cell.buildings.fabbricaCarri === 0) type = "fabbricaCarri";
        if (type) game.buildBuilding(cell.q, cell.r, type);
      }
    }
    game.advancePhase(); // -> fine turno
  }

  // Driver che esegue tutto il turno IA risolvendo automaticamente ogni combattimento
  // (usato dalla simulazione e quando non c'è interfaccia che gestisce la difesa umana).
  function runAITurn(game) {
    const gen = aiTurnGen(game);
    let res = gen.next();
    while (!res.done) {
      const c = res.value;
      if (c.type === "fleetCombat") game.resolveFleetCombat(c.attacker, c.defender);
      else if (c.type === "planetCombat") game.resolvePlanetCombat(c.attacker, c.q, c.r, { land: c.land });
      res = gen.next();
    }
  }

  g.IG.aiTurnGen = aiTurnGen;
  g.IG.runAITurn = runAITurn;
})(typeof window !== "undefined" ? window : globalThis);
