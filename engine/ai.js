// ============================================================================
// ai.js — IA avversaria (stessa logica del gioco per PC/Mac, csharp/Engine/Ai.cs):
// produce (anche Navi Colonia per espandersi), esplora, colonizza, imbarca i carri
// e conquista, caccia le flotte rimaste, va al Mercato e al Casinò, spende gli Ndri
// in edifici, risponde alle proposte di patto.
// aiTurnGen è un GENERATORE: si ferma (yield) quando attacca un giocatore UMANO,
// così l'interfaccia lo fa difendere coi suoi dadi; poi si riprende.
// runAITurn esegue tutto il turno risolvendo da sola ogni scontro.
// ============================================================================
(function (g) {
  g.IG = g.IG || {};
  const C = () => g.IG.CONFIG;
  const Hex = () => g.IG.Hex;

  // Punteggio grezzo di forza di una flotta (per decidere se attaccare)
  function power(game, f) {
    const S = C().SHIPS;
    return f.ships.caccia * S.caccia.att * 2 + f.ships.torpediniera * S.torpediniera.att;
  }
  function fleetDefense(game, f) {
    const S = C().SHIPS;
    return f.ships.caccia * S.caccia.def + f.ships.torpediniera * S.torpediniera.def + f.ships.colonia * S.colonia.def;
  }
  const isHumanOwner = (game, owner) => owner != null && owner >= 0 && !game.player(owner).isAI;
  const dist = (a, b) => Hex().distance(a, b);
  const cells = (game) => Object.values(game.board);

  // ---- Espansione e conquista ----
  // La casella più vicina (entro maxD passi) che soddisfa la condizione
  function nearest(game, f, ok, maxD) {
    let best = null, bd = maxD + 1;
    for (const c of cells(game)) { if (!ok(c)) continue; const d = dist(f, c); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  // Il passo verso la meta (la meta stessa si può raggiungere anche se ostile; il resto del percorso no)
  function stepToward(game, f, pid, goal) {
    const cur = dist(f, goal); let bd = cur, step = null;
    for (const n of Hex().neighbors(f.q, f.r)) {
      const c = game.cell(n.q, n.r);
      const isGoal = n.q === goal.q && n.r === goal.r;
      if (!isGoal && (!c.explored || game.fleets.some((o) => o.q === n.q && o.r === n.r && !game.friendly(o.owner, pid)) ||
        (c.type === "planet" && c.owner != null && !game.friendly(c.owner, pid)))) continue;
      const d = dist(n, goal);
      if (d < bd) { bd = d; step = n; }
    }
    return bd < cur ? step : null;
  }
  // Il pianeta si può prendere: ci sono carri (o Torpediniere su un pianeta senza difese a terra),
  // più carri di quelli che lo difendono, e la flotta batte Cannoni e navi in orbita
  function canTake(game, f, c, bold) {
    const groundDef = c.garrison > 0 || c.buildings.torretta > 0;
    if (f.carri === 0 && (groundDef || f.ships.torpediniera === 0)) return false;
    if (f.carri > 0 && f.carri < c.garrison + c.buildings.torretta * 2) return false;
    let def = c.buildings.cannone * C().DEFENSE_MULT * 2;
    for (const o of game.fleets) if (o.q === c.q && o.r === c.r && o.owner === c.owner) def += fleetDefense(game, o);
    return def === 0 ? power(game, f) > 0 : power(game, f) > def * bold;
  }
  // Carri che restano a terra a difendere: 2, uno solo per chi ha tanti pianeti
  const carriKeep = (game, pid) => (game.planetsOf(pid).length >= 6 ? 1 : 2);
  // Su un proprio pianeta con carri di guarnigione: si imbarcano (ne restano alcuni a difesa)
  function loadForInvasion(game, f) {
    const c = game.cell(f.q, f.r);
    if (!c || c.type !== "planet" || c.owner !== f.owner) return;
    const room = game.fleetCarriCapacity(f) - f.carri, spare = c.garrison - carriKeep(game, f.owner);
    if (room > 0 && spare > 0) game.loadTanks(f.id, Math.min(room, spare));
  }

  // ---- Mercato e Casinò ----
  const unitCost = (unita) => (unita === "carri" ? C().CARRO.costo : C().SHIPS[unita].costo);
  // Dove andare a commerciare o a giocare (null = da nessuna parte)
  function pickShop(game, f, me, diff) {
    const hasPlanet = game.planetsOf(me.id).length > 0;
    const needMat = hasPlanet && (me.res.carburante < 3 || me.res.metallo < 3);
    const surplus = me.res.carburante + me.res.metallo + me.res.pietra > 24;
    const market = me.money > 60000 || needMat || surplus;
    const casinoChance = diff.aggressive ? 0.15 : diff.attackFactor > 2 ? 0.45 : 0.28;
    const casino = me.money > 90000 && game.rng() < casinoChance;
    if (!market && !casino) return null;
    let best = null, bd = needMat || surplus ? 5 : 3;          // solo per spendere: deve essere vicino
    for (const c of cells(game)) {
      if (!c.explored || !((market && c.type === "market") || (casino && c.type === "casino"))) continue;
      const d = dist(f, c);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  // una volta per flotta e per turno
  const usedShop = new WeakMap();
  function useOnce(game, key) {
    let s = usedShop.get(game); if (!s) { s = new Set(); usedShop.set(game, s); }
    if (s.has(key)) return false; s.add(key); return true;
  }
  // Una flotta su un Mercato o un Casinò: lo usa. true se c'era qualcosa da usare.
  function useShop(game, f, me, diff) {
    const c = game.cell(f.q, f.r);
    if (!c) return false;
    if (c.type === "market") {
      if (!useOnce(game, game.turnNumber + ":" + f.id + ":m")) return true;
      // vendere rende poco: una sola materia per visita, la più abbondante, solo se è tanta (o se mancano Ndri)
      const most = ["carburante", "metallo", "pietra"].sort((a, b) => me.res[b] - me.res[a])[0];
      const haveM = me.res[most];
      const sell = haveM > 15 ? haveM - 10 : (me.money < 15000 && haveM > 6 ? haveM - 6 : 0);
      if (sell > 0) game.marketTradeCube(me.id, most, sell, true, c.q, c.r);
      if (game.planetsOf(me.id).length > 0)
        for (const m of ["carburante", "metallo"]) {
          const want = Math.max(0, 4 - me.res[m]);
          const avail = game.stockAt(c.q, c.r)[m];
          const n = Math.min(want, avail, Math.floor((me.money - 30000) / C().PREZZO_ACQUISTO_CUBO));
          if (n > 0) game.marketTradeCube(me.id, m, n, false, c.q, c.r);
        }
      // l'offerta: si compra se conviene e restano soldi per il resto
      const card = game.marketDraw();
      const baseCost = unitCost(card.unita) * card.qta;
      const limit = diff.aggressive ? 1.15 : diff.attackFactor > 2 ? 0.85 : 1.0;
      if (card.prezzo <= baseCost * limit && me.money - card.prezzo >= 20000) game.marketBuy(f.id, card);
      return true;
    }
    if (c.type === "casino") {
      if (!useOnce(game, game.turnNumber + ":" + f.id + ":c")) return true;
      if (me.money < 40000) return true;
      const bet = Math.max(C().CASINO_PUNTATA_MIN, Math.floor(Math.min(20000, me.money / 10) / 1000) * 1000);
      const s = game._casinoSession(me.id);
      if (s.banco <= 0 && !game.casinoBet(me.id, bet).ok) return true;
      for (let k = 0; k < 8; k++) {                                // si tira finché non si vince o si perde
        const r = game.casinoRoll(me.id);
        if (!r.ok || r.outcome !== "push") break;
      }
      return true;
    }
    return false;
  }

  // Forza di un giocatore (pianeti, navi, carri, denaro): serve a decidere sui patti
  function strength(game, pid) {
    let s = game.planetsOf(pid).length * 4;
    for (const f of game.fleetsOf(pid)) s += f.ships.caccia + f.ships.torpediniera * 3 + f.ships.colonia + f.carri * 0.5;
    return s + game.player(pid).money / 25000;
  }
  // L'IA risponde a una proposta: la non belligeranza la accetta da chi è forte almeno quanto lei
  // (o se è breve); l'alleanza se chi la propone non è troppo più forte e c'è un terzo giocatore più
  // forte di entrambi (un nemico comune), oppure se lei è la più debole.
  function considerPact(game, ai, from, kind, turns) {
    const me = strength(game, ai), them = strength(game, from);
    const others = game.players.filter((p) => !p.eliminated && p.id !== ai && p.id !== from).map((p) => strength(game, p.id));
    const top = others.length ? Math.max.apply(null, others) : 0;
    if (kind === "tregua") return them >= me * 0.7 || turns <= 3;
    const weakest = others.every((o) => o >= me) && them >= me;
    return (them <= me * 1.6 && top > Math.max(me, them)) || weakest;
  }

  // Uno scontro chiesto dall'IA: con un umano lo risolve l'interfaccia (yield), se no si risolve qui.
  // Dopo una battaglia tra flotte vinta sopra un pianeta nemico si attacca subito il pianeta; sopra
  // un pianeta libero, con una Nave Colonia, lo si colonizza.
  function* fight(game, f, ev, mustFight) {
    if (ev.event === "combat") {
      const def = game.fleetById(ev.defender);
      if (!def) return;
      const humanSide = isHumanOwner(game, def.owner) || game.alliedDefenders(def.q, def.r, def.owner, f.owner).some((a) => isHumanOwner(game, a.owner));
      if (humanSide) yield { type: "fleetCombat", attacker: ev.attacker, defender: ev.defender, q: ev.q, r: ev.r };
      else if (mustFight || power(game, f) > fleetDefense(game, def)) game.resolveFleetCombat(ev.attacker, ev.defender);
      else return;
      if (game.winner != null) return;
      const wf = game.fleetById(ev.attacker);
      const wc = wf ? game.cell(wf.q, wf.r) : null;
      if (!wc || wc.type !== "planet" || wf.q !== ev.q || wf.r !== ev.r) return;
      if (wc.owner == null && wf.ships.colonia > 0) game.colonize(wf.id);
      else if (wc.owner != null && !game.friendly(wc.owner, wf.owner) && !game.enemyFleetHere(wf))
        yield* fight(game, wf, { ok: true, event: "planetCombat", attacker: wf.id, q: wc.q, r: wc.r }, true);
    } else if (ev.event === "planetCombat") {
      const pc = game.cell(ev.q, ev.r);
      if (isHumanOwner(game, pc.owner)) yield { type: "planetCombat", attacker: ev.attacker, q: ev.q, r: ev.r, land: f.carri };
      else game.resolvePlanetCombat(ev.attacker, ev.q, ev.r, { land: f.carri });
    }
  }

  function* aiTurnGen(game) {
    const pid = game.currentPlayer;
    const me = game.player(pid);
    const cfg = C();
    const diff = cfg.DIFFICULTY[me.difficulty] || cfg.DIFFICULTY[cfg.DEFAULT_DIFFICULTY];

    // --- Fase 2: Produzione ---
    // ricca = ha Ndri fermi da spendere: produce al massimo delle fabbriche
    const rich = me.money > (diff.buildLevel === 0 ? 200000 : 120000);
    let hasShips = game.fleetsOf(pid).some((o) => game.fleetShipCount(o) > 0);
    let colonie = game.countUnits(pid, "colonia");
    const nPlanets = game.planetsOf(pid).length;
    // c'è ancora da espandersi: pianeti liberi già visti, o caselle da scoprire
    const freeKnown = cells(game).some((c) => c.type === "planet" && c.explored && c.owner == null);
    const roomToGrow = nPlanets < 7 && (freeKnown || cells(game).filter((c) => !c.explored).length > 4);
    const wantCol = roomToGrow ? (rich ? 2 : 1) : 0;
    for (const cell of game.planetsOf(pid)) {
      if (cell.buildings.fabbricaNavale > 0) {
        const full = cell.buildings.fabbricaNavale * cell.planet.data.produttivita;
        let cap = rich || !hasShips ? full : Math.max(1, Math.round(full * diff.prodPortion));
        // un nemico molto più forte in orbita: le navi nuove morirebbero una alla volta. Si risparmia.
        const foe = game.fleets.find((o) => o.q === cell.q && o.r === cell.r && !game.friendly(o.owner, pid) && game.fleetShipCount(o) > 0);
        if (foe && fleetDefense(game, foe) > full * cfg.SHIPS.torpediniera.att * 1.5) cap = 0;
        // senza navi: prima un Caccia per ripartire; poi una Nave Colonia se c'è da espandersi
        if (cap > 0 && hasShips && colonie < wantCol && me.money >= cfg.SHIPS.colonia.costo + 10000 &&
          game.produceShip(cell.q, cell.r, "colonia", 1).ok) { colonie++; cap--; }
        for (let i = 0; i < cap; i++) {
          const torp = (diff.produceTorped || rich) && me.money > 60000 && me.res.carburante >= 3 && me.res.metallo >= 3;
          const first = torp ? "torpediniera" : "caccia", second = torp ? "caccia" : "torpediniera";
          if (game.produceShip(cell.q, cell.r, first, 1).ok) { hasShips = true; continue; }
          if ((rich || first === "torpediniera") && game.produceShip(cell.q, cell.r, second, 1).ok) { hasShips = true; continue; }   // limite di fazione: l'altro tipo
          break;
        }
      }
      if (cell.buildings.fabbricaCarri > 0) {
        const cap = Math.max(1, Math.round(cell.buildings.fabbricaCarri * cell.planet.data.produttivita * diff.prodPortion));
        for (let i = 0; i < cap; i++) if (!game.produceCarri(cell.q, cell.r, 1).ok) break;
      }
    }
    game.advancePhase(); // -> Movimento (assegna i passi)

    // Flotte nemiche nella stessa casella (navi appena prodotte sotto una flotta nemica): si combatte subito
    for (let k = 0; k < 8; k++) {
      const clash = game.pendingClash(pid);
      if (!clash || game.winner != null) break;
      const cf = game.fleetById(clash.attacker);
      yield* fight(game, cf, clash, true);
      if (cf && game.fleetById(cf.id)) cf.stepsLeft = 0;
    }

    // --- Fase 3: Movimento / esplorazione / attacco / colonizzazione ---
    // una flotta per turno può puntare a un Mercato o a un Casinò
    let shopTaken = false;
    // chi domina la partita (molto più forte di tutti) va a chiuderla, anche se è un'IA prudente
    const myStr = strength(game, pid);
    const dominant = game.players.filter((o) => !o.eliminated && o.id !== pid).every((o) => myStr > strength(game, o.id) * 2.5);
    const bold = dominant ? 1.0 : Math.max(1.0, diff.attackFactor);
    // nessun pianeta libero da colonizzare: le flotte con Navi Colonia fanno come le altre
    const colonyGoal = cells(game).some((c) => c.type === "planet" && c.explored && c.owner == null);
    for (const f of game.fleetsOf(pid).slice()) {
      let guard = 0;
      const shop = shopTaken || dominant ? null : pickShop(game, f, me, diff);   // chi domina pensa a chiudere la partita
      if (shop) shopTaken = true;
      loadForInvasion(game, f);
      if (game.fleetById(f.id)) useShop(game, f, me, diff);                     // già su un Mercato o un Casinò: si usa
      while (game.fleetById(f.id) && f.stepsLeft > 0 && guard++ < 8) {
        const here = game.cell(f.q, f.r);
        if (here.type === "planet" && here.owner == null && f.ships.colonia > 0) {
          game.colonize(f.id);
          if (!game.fleetById(f.id)) break;
        }
        const nbs = Hex().neighbors(f.q, f.r);
        let target = null, mode = null;
        // Cerca un bersaglio d'attacco adiacente
        const findAttack = () => {
          for (const n of nbs) {
            const c = game.cell(n.q, n.r);
            const ef = game.fleets.find((o) => o.q === n.q && o.r === n.r && !game.friendly(o.owner, pid));
            if (ef && power(game, f) > fleetDefense(game, ef) * diff.attackFactor) return { n, m: "attack" };
            if (c.type === "planet" && c.owner != null && !game.friendly(c.owner, pid) && (diff.attackFactor <= 1.2 || dominant) && canTake(game, f, c, bold))
              return { n, m: "attackPlanet" };
          }
          return null;
        };
        // 0) verso il Mercato o il Casinò scelto (se non c'è niente di meglio da attaccare accanto)
        if (shop && !(f.q === shop.q && f.r === shop.r)) {
          const att0 = diff.aggressive ? findAttack() : null;
          if (!att0) {
            let best = null, bd = Infinity;
            for (const n of nbs) {
              const c = game.cell(n.q, n.r);
              if (!c.explored || game.fleets.some((o) => o.q === n.q && o.r === n.r && !game.friendly(o.owner, pid)) ||
                (c.type === "planet" && c.owner != null && !game.friendly(c.owner, pid))) continue;
              const d = dist(n, shop);
              if (d < bd) { bd = d; best = n; }
            }
            if (best && bd < dist(f, shop)) { target = best; mode = "shop"; }
          }
        }
        // 1) pianeta libero adiacente (se ho colonia) -> colonizzare
        if (!target && f.ships.colonia > 0) {
          const n = nbs.find((x) => { const c = game.cell(x.q, x.r); return c.explored && c.type === "planet" && c.owner == null; });
          if (n) { target = n; mode = "colonize"; }
        }
        // Difficile: attacca PRIMA di esplorare
        if (!target && diff.aggressive) { const a = findAttack(); if (a) { target = a.n; mode = a.m; } }
        // Nave Colonia: verso il pianeta libero più vicino già scoperto
        if (!target && f.ships.colonia > 0) {
          const fp = nearest(game, f, (c) => c.type === "planet" && c.explored && c.owner == null, 10);
          const st = fp ? stepToward(game, f, pid, fp) : null;
          if (st) { target = st; mode = "colonize"; }
        }
        // con i carri a bordo (o Torpediniere): verso il pianeta nemico più vicino che si può prendere
        if (!target && (f.ships.colonia === 0 || !colonyGoal) && (f.carri > 0 || f.ships.torpediniera > 0)) {
          const ep = nearest(game, f, (c) => c.type === "planet" && c.owner != null && !game.friendly(c.owner, pid) && canTake(game, f, c, bold), 12);
          const st = ep ? stepToward(game, f, pid, ep) : null;
          if (st) { target = st; mode = "invade"; }
        }
        // posto libero per i carri: si torna a un proprio pianeta che ne ha di guarnigione
        if (!target && (f.ships.colonia === 0 || !colonyGoal) && game.fleetCarriCapacity(f) - f.carri >= 4) {
          const hp = nearest(game, f, (c) => c.type === "planet" && c.owner === pid && c.garrison > carriKeep(game, pid) + 1 && !(c.q === f.q && c.r === f.r), 10);
          const st = hp ? stepToward(game, f, pid, hp) : null;
          if (st) { target = st; mode = "reload"; }
        }
        // flotte nemiche più deboli: si va a cercarle (così chi non ha più pianeti non resta in giro per sempre)
        if (!target && (f.ships.colonia === 0 || !colonyGoal) && power(game, f) > 0) {
          const ef = game.fleets.filter((o) => !game.friendly(o.owner, pid) && game.fleetShipCount(o) > 0 &&
            game.cell(o.q, o.r).type !== "casino" && game.cell(o.q, o.r).type !== "market" && power(game, f) > fleetDefense(game, o) * bold)
            .sort((a, b) => dist(f, a) - dist(f, b))[0];
          const st = ef ? stepToward(game, f, pid, game.cell(ef.q, ef.r)) : null;
          if (st) { target = st; mode = "hunt"; }
        }
        // 2) cella inesplorata -> esplora
        if (!target) {
          const unexp = nbs.filter((n) => !game.cell(n.q, n.r).explored);
          if (unexp.length) { target = unexp[Math.floor(game.rng() * unexp.length)]; mode = "explore"; }
        }
        // 3) bersaglio nemico -> attacca
        if (!target) { const a = findAttack(); if (a) { target = a.n; mode = a.m; } }
        // 4) vagabonda su spazio esplorato libero
        if (!target) {
          const free = nbs.filter((n) => { const c = game.cell(n.q, n.r); return c.explored && !game.fleets.some((o) => o.q === n.q && o.r === n.r && !game.friendly(o.owner, pid)); });
          if (free.length) { target = free[Math.floor(game.rng() * free.length)]; mode = "wander"; }
        }
        if (!target) break;

        const ev = game.stepFleet(f.id, target.q, target.r);
        if (!ev.ok) break;
        if (ev.event === "combat" || ev.event === "planetCombat") {
          const def = ev.event === "combat" ? game.fleetById(ev.defender) : null;
          if (ev.event === "combat" && (!def || (!isHumanOwner(game, def.owner) && power(game, f) <= fleetDefense(game, def)))) break;
          yield* fight(game, f, ev, false);
          if (game.winner != null) break;
        } else if (ev.event === "destroyed") break;
        else if (ev.event === "moved" && ev.canColonize && f.ships.colonia > 0) game.colonize(f.id);
        if (game.fleetById(f.id) && useShop(game, f, me, diff) && mode === "shop") break;     // arrivata: si ferma a commerciare
        if (game.fleetById(f.id) && mode === "reload") loadForInvasion(game, f);
      }
    }
    game.advancePhase(); // -> Costruzione

    // --- Fase 4: Costruzione ---
    // senza nessuna Fabbrica Navale si costruisce appena bastano i soldi (se no non si riparte più);
    // con gli Ndri fermi (ricca) si continua: più fabbriche, tesorerie e difese
    let noYard = !game.planetsOf(pid).some((c) => c.buildings.fabbricaNavale > 0);
    for (const cell of game.planetsOf(pid)) {
      const richNow = me.money > (diff.buildLevel === 0 ? 200000 : 100000);
      if (diff.buildLevel === 0 && !richNow && !noYard) break;
      if (me.money < (noYard ? cfg.BUILDINGS.fabbricaNavale.ndri : 40000)) break;
      const b = cell.buildings;
      if (b.fabbricaNavale + b.fabbricaCarri + b.tesoreria + b.cannone + b.torretta >= cfg.PLANET_SLOTS) continue;
      let type = null;
      if (b.fabbricaNavale === 0) type = "fabbricaNavale";
      else if (diff.buildLevel >= 2 && b.cannone === 0) type = "cannone";
      else if (b.tesoreria === 0 && me.money > 60000) type = "tesoreria";
      else if (diff.buildLevel >= 1 && b.cannone === 0) type = "cannone";
      else if (diff.buildLevel >= 2 && b.fabbricaCarri === 0) type = "fabbricaCarri";
      else if (richNow) {
        if (b.fabbricaCarri === 0) type = "fabbricaCarri";
        else if (b.fabbricaNavale < 3) type = "fabbricaNavale";
        else if (b.tesoreria < 2) type = "tesoreria";
        else if (b.torretta === 0) type = "torretta";
        else if (b.cannone < 2) type = "cannone";
      }
      if (type && game.buildBuilding(cell.q, cell.r, type).ok && type === "fabbricaNavale") noYard = false;
    }
    game.advancePhase(); // -> fine turno
  }

  // Driver che esegue tutto il turno IA risolvendo automaticamente ogni combattimento
  // (usato dalla simulazione e dall'host online per i bot).
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
  g.IG.considerPact = considerPact;
  g.IG.aiStrength = strength;
})(typeof window !== "undefined" ? window : globalThis);
