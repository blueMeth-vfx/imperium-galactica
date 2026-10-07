// ============================================================================
// combat.js — Combattimento spaziale e terrestre (manuale sez. 10–11).
// Estende Game.prototype. Risolutore unificato a "valori ordinati / coppie".
//
// Regole implementate:
//  - Fino a 3 unità per lato per turno; l'aggressore tira l'attacco, il difensore
//    la difesa; i Caccia (aggressore) tirano due volte.
//  - Valori = dado × moltiplicatore; ordinati dal più alto al più basso e
//    confrontati a coppie. Attacco > Difesa → l'unità difensore muore (max 1 per coppia).
//  - Si alternano aggressore e difensore finché un lato resta senza unità.
//  - Cannone Interstellare (spazio) e Torretta (terra) valgono 2x e cadono per ultimi.
//  - Le flotte alleate del difensore nella stessa casella combattono con lui.
//  - L'attaccante può ritirarsi solo a scambio pari (CombatSession.canRetreat).
//  - Ogni battaglia lascia nel diario forze in campo e perdite di ogni lato.
//
// Semplificazione dichiarata: la scelta di QUALI 3 unità schierare è automatica
// (le più forti per la statistica rilevante), non manuale.
// ============================================================================
(function (g) {
  g.IG = g.IG || {};
  const G = g.IG.Game;
  const C = () => g.IG.CONFIG;

  // Espande le navi di una flotta in unità di combattimento
  G.prototype._shipUnits = function (fleet) {
    const S = C().SHIPS, out = [];
    for (const t of ["caccia", "torpediniera", "colonia"]) {
      for (let i = 0; i < fleet.ships[t]; i++)
        out.push({ type: t, label: C().SHIP_NAMES[t], att: S[t].att, def: S[t].def, twice: !!S[t].doppioAttacco, lastLine: false, owner: fleet.owner, fleetId: fleet.id });
    }
    return out;
  };
  G.prototype._cannonUnits = function (cell) {
    const out = [];
    for (let i = 0; i < cell.buildings.cannone; i++)
      out.push({ type: "cannone", label: "Cannone", att: C().DEFENSE_MULT, def: C().DEFENSE_MULT, twice: false, lastLine: true });
    return out;
  };
  G.prototype._tankUnits = function (n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push({ type: "carro", label: "Carro", att: 1, def: 1, twice: false, lastLine: false });
    return out;
  };
  G.prototype._turretUnits = function (cell) {
    const out = [];
    for (let i = 0; i < cell.buildings.torretta; i++)
      out.push({ type: "torretta", label: "Torretta", att: C().DEFENSE_MULT, def: C().DEFENSE_MULT, twice: false, lastLine: true });
    return out;
  };

  // ---- Bilancio delle battaglie nel diario: forze in campo e perdite di ogni lato ----
  const UNIT_ORDER = ["torpediniera", "caccia", "colonia", "carro", "cannone", "torretta"];
  function unitName(t, n) {
    switch (t) {
      case "torpediniera": return n === 1 ? "Torpediniera" : "Torpediniere";
      case "caccia": return "Caccia";
      case "colonia": return n === 1 ? "Nave Colonia" : "Navi Colonia";
      case "carro": return n === 1 ? "Carro" : "Carri";
      case "cannone": return n === 1 ? "Cannone" : "Cannoni";
      default: return n === 1 ? "Torretta" : "Torrette";
    }
  }
  G.unitList = function (c) {
    const parts = [];
    for (const t of UNIT_ORDER) if (c[t] > 0) parts.push(c[t] + " " + unitName(t, c[t]));
    return parts.length ? parts.join(", ") : "—";
  };
  G.countUnits = function (units) { const c = {}; for (const u of units) c[u.type] = (c[u.type] || 0) + 1; return c; };
  G.diffUnits = function (before, after) {
    const d = {};
    for (const k in before) { const n = before[k] - (after[k] || 0); if (n > 0) d[k] = n; }
    return d;
  };
  G.prototype._sayForces = function (a, ca, b, cb) { this.say("  Forze: " + a + " (" + G.unitList(ca) + ") contro " + b + " (" + G.unitList(cb) + ")."); };
  G.prototype._sayLosses = function (a, la, b, lb) { this.say("  Perdite: " + a + " (" + G.unitList(la) + "), " + b + " (" + G.unitList(lb) + ")."); };

  // ---- Alleati in difesa: se nella casella del difensore ci sono flotte di suoi alleati (non amiche
  // di chi attacca), combattono con lui. Non possono tirarsi indietro.
  G.prototype.alliedDefenders = function (q, r, defOwner, attOwner) {
    return this.fleets.filter((o) => o.q === q && o.r === r && o.owner !== defOwner && o.owner !== attOwner && this.allied(o.owner, defOwner) &&
      !this.friendly(o.owner, attOwner) && this.fleetShipCount(o) > 0);
  };
  // Le navi del difensore più quelle degli alleati presenti
  G.prototype.defenderShipUnits = function (def, attOwner) {
    let l = this._shipUnits(def);
    for (const a of this.alliedDefenders(def.q, def.r, def.owner, attOwner)) l = l.concat(this._shipUnits(a));
    return l;
  };
  // Nome del lato che difende: "Blu" o "Blu e Verde"
  G.prototype.defenderSideName = function (defOwner, allies) {
    const names = [this.player(defOwner).name];
    for (const o of [...new Set(allies.map((a) => a.owner))]) names.push(this.player(o).name);
    return names.join(" e ");
  };
  // Le unità rimaste tornano a ogni flotta del lato (quelle senza flotta indicata vanno alla prima)
  G.prototype._writeSide = function (side, units) {
    side.forEach((f, i) => { if (f) this._writeShips(f, units.filter((u) => u.fleetId === f.id || (i === 0 && (u.fleetId == null || u.fleetId < 0)))); });
  };

  // Seleziona fino a 3 unità di un lato (normali prima; le lastLine entrano
  // solo a condizione, e mai prima delle normali).
  G.prototype._pickFront = function (units, stat, isGround) {
    const normals = units.filter((u) => !u.lastLine);
    const last = units.filter((u) => u.lastLine);
    let pool = normals.slice();
    if (last.length) {
      const join = isGround ? normals.length < 2 : normals.length === 0;
      if (join) pool = pool.concat(last);
    }
    pool.sort((a, b) => b[stat] - a[stat]);
    return pool.slice(0, 3);
  };

  // Rimuove `hits` unità dal lato difensore: prima le normali (difesa più bassa),
  // poi le lastLine (Cannone/Torretta cadono per ultime).
  G.prototype._removeKills = function (units, hits) {
    let toRemove = hits;
    const order = units.map((u, i) => ({ u, i }))
      .sort((a, b) => (a.u.lastLine - b.u.lastLine) || (a.u.def - b.u.def));
    const remove = new Set();
    for (const x of order) { if (toRemove <= 0) break; remove.add(x.i); toRemove--; }
    const kept = units.filter((u, i) => !remove.has(i));
    units.length = 0; units.push.apply(units, kept);
    return hits - toRemove;
  };

  // Risolutore generico. `unitsA` è l'aggressore iniziale. Mutua gli array.
  G.prototype._battle = function (unitsA, unitsB, opts) {
    opts = opts || {};
    const isGround = !!opts.ground;
    const log = [];
    const roundsData = []; // dati strutturati dei tiri (per l'animazione dei dadi nella UI)
    let aggrIsA = true, rounds = 0, lastKill = 0;
    while (unitsA.length && unitsB.length && rounds < 100) {
      rounds++;
      const agg = aggrIsA ? unitsA : unitsB;
      const def = aggrIsA ? unitsB : unitsA;
      const aggFront = this._pickFront(agg, "att", isGround);
      const defFront = this._pickFront(def, "def", isGround);

      // Tiri di attacco (Caccia aggressore: due volte)
      const attVals = [];
      const attDetail = [];
      const attRolls = []; // {type,die,mult,val}
      for (const u of aggFront) {
        const n = u.twice ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const d = this.rollDie(); const v = d * u.att;
          attVals.push(v); attDetail.push(u.label + "(" + d + "×" + u.att + "=" + v + ")");
          attRolls.push({ type: u.type, die: d, mult: u.att, val: v });
        }
      }
      // Tiri di difesa (una volta ciascuno)
      const defVals = [];
      const defDetail = [];
      const defRolls = [];
      for (const u of defFront) {
        const d = this.rollDie(); const v = d * u.def;
        defVals.push(v); defDetail.push(u.label + "(" + d + "×" + u.def + "=" + v + ")");
        defRolls.push({ type: u.type, die: d, mult: u.def, val: v });
      }
      attVals.sort((a, b) => b - a);
      defVals.sort((a, b) => b - a);
      let hits = 0;
      const pairs = Math.min(attVals.length, defVals.length);
      for (let i = 0; i < pairs; i++) if (attVals[i] > defVals[i]) hits++;
      const killed = this._removeKills(def, hits);
      if (killed > 0) lastKill = rounds;
      log.push((aggrIsA ? "▶A" : "◀B") + " att[" + attDetail.join(",") + "] vs dif[" + defDetail.join(",") + "] → " + killed + " distrutte");
      roundsData.push({ aggressorIsAttacker: aggrIsA, ground: isGround, att: attRolls, def: defRolls, killed: killed });
      aggrIsA = !aggrIsA;
      if (rounds - lastKill > 4) break; // stallo: nessuno riesce a colpire
    }
    let winner = "draw";
    if (unitsB.length === 0 && unitsA.length > 0) winner = "A";
    else if (unitsA.length === 0 && unitsB.length > 0) winner = "B";
    else if (unitsA.length === 0 && unitsB.length === 0) winner = "mutual";
    return { winner, log, rounds, roundsData };
  };

  // ----------------------------------------------------------------------------
  // Sessione di combattimento INTERATTIVA: la UI tira i dadi un round alla volta.
  // unitsA = aggressore iniziale (di solito l'attaccante umano).
  // ----------------------------------------------------------------------------
  G.prototype.makeCombatSession = function (unitsA, unitsB, ground) {
    const game = this;
    return {
      A: unitsA, B: unitsB, ground: !!ground,
      aggressorIsA: true, finished: false, winner: null, roundIndex: 0, round: null,
      // Prepara il round corrente: crea gli slot-dado (vuoti) per aggressore e difensore
      startRound() {
        const aggUnits = this.aggressorIsA ? this.A : this.B;
        const defUnits = this.aggressorIsA ? this.B : this.A;
        const aggFront = game._pickFront(aggUnits, "att", this.ground);
        const defFront = game._pickFront(defUnits, "def", this.ground);
        const att = [], def = [];
        for (const u of aggFront) { const n = u.twice ? 2 : 1; for (let k = 0; k < n; k++) att.push({ type: u.type, label: u.label, mult: u.att, die: null, owner: u.owner }); }
        for (const u of defFront) def.push({ type: u.type, label: u.label, mult: u.def, die: null, owner: u.owner });
        this.round = { aggressorIsA: this.aggressorIsA, att: att, def: def, killed: null };
        return this.round;
      },
      // Ritirata dell'attaccante: solo a scambio pari (i due lati hanno attaccato lo stesso numero di
      // volte, quindi chi ha appena colpito deve prima subire il contrattacco) e prima di aver tirato
      // i propri dadi del round.
      canRetreat() {
        if (this.finished || !this.round || this.roundIndex % 2 !== 0) return false;
        const mine = this.round.aggressorIsA ? this.round.att : this.round.def;
        return mine.every((s) => s.die == null);
      },
      rollSlot(slot) { if (slot.die == null) slot.die = game.rollDie(); return slot.die; },
      rollAll(list) { for (const s of list) if (s.die == null) s.die = game.rollDie(); },
      allRolled() { return this.round.att.concat(this.round.def).every((s) => s.die != null); },
      // Risolve il round: confronta i valori ordinati e rimuove le unità colpite
      resolve() {
        const attVals = this.round.att.map((s) => s.die * s.mult).sort((a, b) => b - a);
        const defVals = this.round.def.map((s) => s.die * s.mult).sort((a, b) => b - a);
        let hits = 0; const pairs = Math.min(attVals.length, defVals.length);
        for (let i = 0; i < pairs; i++) if (attVals[i] > defVals[i]) hits++;
        const defenderUnits = this.aggressorIsA ? this.B : this.A;
        const killed = game._removeKills(defenderUnits, hits);
        this.round.killed = killed; this.roundIndex++;
        if (this.A.length === 0 || this.B.length === 0) {
          this.finished = true;
          this.winner = (this.B.length === 0 && this.A.length > 0) ? "A" : (this.A.length === 0 && this.B.length > 0) ? "B" : "mutual";
        } else this.aggressorIsA = !this.aggressorIsA;
        return { killed: killed, finished: this.finished, winner: this.winner };
      },
    };
  };

  // --- Applicazione esiti per il combattimento interattivo (chiamati dalla UI) ---
  // Le unità del difensore di uno scontro tra flotte (con gli alleati presenti): da usare per la sessione
  G.prototype.fleetCombatSetup = function (att, def) {
    return { uA: this._shipUnits(att), uB: this.defenderShipUnits(def, att.owner), allies: this.alliedDefenders(def.q, def.r, def.owner, att.owner) };
  };
  G.prototype.applyFleetCombatResult = function (att, def, uA, uB, winner) {
    const q = def.q, r = def.r;
    this.noteFoes(att.owner, def.owner);
    const allies = this.alliedDefenders(q, r, def.owner, att.owner);
    for (const al of allies) this.noteFoes(att.owner, al.owner);
    const bName = this.defenderSideName(def.owner, allies);
    this.say("⚔ Scontro spaziale a (" + q + "," + r + "): " + this.player(att.owner).name + " attacca " + bName + ".");
    const fa0 = G.countUnits(this._shipUnits(att)), fb0 = G.countUnits(this.defenderShipUnits(def, att.owner));
    this._sayForces(this.player(att.owner).name, fa0, bName, fb0);
    this._sayLosses(this.player(att.owner).name, G.diffUnits(fa0, G.countUnits(uA)), bName, G.diffUnits(fb0, G.countUnits(uB)));
    this._writeShips(att, uA);
    this._writeSide([def].concat(allies), uB);
    for (const al of allies) if (this.fleetShipCount(al) === 0) this._destroyFleet(al);
    if (this.fleetShipCount(def) === 0) this._destroyFleet(def);
    if (this.fleetShipCount(att) === 0) this._destroyFleet(att);
    let advanced = false;
    if (winner === "A") { this.say("  " + this.player(att.owner).name + " vince lo scontro."); this._enterCell(att, this.cell(q, r), {}); advanced = true; }
    else if (winner === "retreat") this.say("  " + this.player(att.owner).name + " si ritira.");
    else if (winner === "B") this.say("  " + this.player(def.owner).name + " respinge l'attacco.");
    else this.say("  Scontro inconcludente.");
    if (att && this.fleetById(att.id)) att.stepsLeft = 0;
    this._checkElimination();
    return { advanced: advanced };
  };
  G.prototype.planetCombatSetup = function (att, cell) {
    const defFleet = this.fleets.find((o) => o.q === cell.q && o.r === cell.r && o.owner === cell.owner);
    const uA = this._shipUnits(att);
    let uB = defFleet ? this._shipUnits(defFleet) : [];
    for (const al of this.alliedDefenders(cell.q, cell.r, cell.owner, att.owner)) uB = uB.concat(this._shipUnits(al));
    const can = this._cannonUnits(cell); for (const u of can) u.owner = cell.owner;
    uB = uB.concat(can);
    return { defFleet: defFleet, uA: uA, uB: uB };
  };
  G.prototype.applyPlanetSpaceResult = function (att, cell, defFleet, uA, uB, winner) {
    this.noteFoes(att.owner, cell.owner);
    this.say("⚔ Attacco al pianeta " + cell.planet.data.nome + " (" + this.player(cell.owner).name + ").");
    const pa0 = G.countUnits(this._shipUnits(att));
    const pAllies = this.alliedDefenders(cell.q, cell.r, cell.owner, att.owner);
    for (const al of pAllies) this.noteFoes(att.owner, al.owner);
    let pbUnits = defFleet ? this._shipUnits(defFleet) : [];
    for (const al of pAllies) pbUnits = pbUnits.concat(this._shipUnits(al));
    const pb0 = G.countUnits(pbUnits);
    if (cell.buildings.cannone > 0) pb0.cannone = cell.buildings.cannone;
    const pbName = this.defenderSideName(cell.owner, pAllies);
    this._sayForces(this.player(att.owner).name, pa0, pbName, pb0);
    this._sayLosses(this.player(att.owner).name, G.diffUnits(pa0, G.countUnits(uA)), pbName, G.diffUnits(pb0, G.countUnits(uB)));
    this._writeShips(att, uA);
    if (defFleet) this._writeShips(defFleet, uB.filter((u) => u.type !== "cannone" && (u.fleetId === defFleet.id || u.fleetId == null)));
    for (const al of pAllies) { this._writeShips(al, uB.filter((u) => u.fleetId === al.id)); if (this.fleetShipCount(al) === 0) this._destroyFleet(al); }
    cell.buildings.cannone = uB.filter((u) => u.type === "cannone").length;
    if (this.fleetShipCount(att) === 0) { this._destroyFleet(att); this.say("  Flotta attaccante distrutta."); this._checkElimination(); return { outcome: "attackerDestroyed" }; }
    if (defFleet && this.fleetShipCount(defFleet) === 0) this._destroyFleet(defFleet);
    if (winner === "retreat") { att.stepsLeft = 0; this.say("  " + this.player(att.owner).name + " si ritira: attacco interrotto."); return { outcome: "retreat" }; }
    if (winner !== "A") { att.stepsLeft = 0; this.say("  Difese spaziali non superate: attacco interrotto."); return { outcome: "spaceFailed" }; }
    this.say("  Difese spaziali distrutte.");
    return { outcome: "spaceWon", groundDef: cell.garrison > 0 || cell.buildings.torretta > 0 };
  };
  G.prototype.applyPlanetNoGround = function (att, cell, landN) {
    landN = Math.min(att.carri, landN != null ? landN : att.carri);
    if (att.ships.torpediniera > 0 || landN > 0) {
      att.carri -= landN;
      this.capturePlanet(att.id, cell.q, cell.r, landN);
      this._enterCell(att, cell, {});
      this._checkElimination();
      return { outcome: "captured" };
    }
    this._enterCell(att, cell, {});
    this.say("  Pianeta indifeso ma senza Torpediniera né carri: non conquistato.");
    return { outcome: "spaceWonNoCapture" };
  };
  G.prototype.planetGroundSetup = function (cell, landN) {
    return { tA: this._tankUnits(landN), tB: this._tankUnits(cell.garrison).concat(this._turretUnits(cell)) };
  };
  G.prototype.applyPlanetSkipGround = function (att, cell) {
    this._enterCell(att, cell, {});
    att.stepsLeft = 0;
    this.say("  Difese a terra presenti ma nessuno sbarco: pianeta non conquistato.");
    return { outcome: "spaceWonNoLand" };
  };
  G.prototype.applyPlanetGroundResult = function (att, cell, landN, tA, tB, winner) {
    const ga0 = { carro: landN }, gb0 = { carro: cell.garrison, torretta: cell.buildings.torretta };
    this.say("  Lotta di terra su " + cell.planet.data.nome + ":");
    this._sayForces(this.player(att.owner).name, ga0, this.player(cell.owner).name, gb0);
    this._sayLosses(this.player(att.owner).name, G.diffUnits(ga0, G.countUnits(tA)), this.player(cell.owner).name, G.diffUnits(gb0, G.countUnits(tB)));
    att.carri -= landN;
    const survAtt = tA.length;
    cell.buildings.torretta = tB.filter((u) => u.type === "torretta").length;
    cell.garrison = tB.filter((u) => u.type === "carro").length;
    if (winner === "A") {
      this.capturePlanet(att.id, cell.q, cell.r, survAtt);
      this._enterCell(att, cell, {});
      this._checkElimination();
      return { outcome: "captured", survivors: survAtt };
    }
    if (winner === "retreat") {                      // i carri rimasti risalgono a bordo
      att.carri += survAtt;
      this.say("  " + this.player(att.owner).name + " si ritira: " + survAtt + " carri reimbarcati.");
      this._enterCell(att, cell, {});
      att.stepsLeft = 0;
      this._checkElimination();
      return { outcome: "retreat", survivors: survAtt };
    }
    this.say("  Sbarco respinto: pianeta non conquistato.");
    this._enterCell(att, cell, {});
    att.stepsLeft = 0;
    this._checkElimination();
    return { outcome: "groundFailed" };
  };

  // Pianeta senza difese: si prende senza tirare i dadi (con una Torpediniera o dei carri)
  G.prototype.captureUndefended = function (attId, q, r) {
    const att = this.fleetById(attId), cell = this.cell(q, r);
    if (!att || !this.planetUndefended(cell)) return { ok: false };
    this.noteFoes(att.owner, cell.owner);
    this.say("⚔ " + this.player(att.owner).name + " arriva su " + cell.planet.data.nome + ": nessuna difesa.");
    return Object.assign({ ok: true }, this.applyPlanetNoGround(att, cell, att.carri));
  };

  G.prototype._writeShips = function (fleet, units) {
    fleet.ships.caccia = units.filter((u) => u.type === "caccia").length;
    fleet.ships.torpediniera = units.filter((u) => u.type === "torpediniera").length;
    fleet.ships.colonia = units.filter((u) => u.type === "colonia").length;
  };

  // -------------------------------------------------- Combattimento flotta vs flotta
  G.prototype.resolveFleetCombat = function (attId, defId) {
    const att = this.fleetById(attId), def = this.fleetById(defId);
    if (!att || !def) return { ok: false };
    const q = def.q, r = def.r;
    this.say("⚔ Scontro spaziale a (" + q + "," + r + "): " +
      this.player(att.owner).name + " attacca " + this.player(def.owner).name + ".");
    this.noteFoes(att.owner, def.owner);
    const allies = this.alliedDefenders(q, r, def.owner, att.owner);
    for (const al of allies) this.noteFoes(att.owner, al.owner);
    if (allies.length) this.say("  " + this.defenderSideName(def.owner, allies) + " combattono insieme.");
    const uA = this._shipUnits(att), uB = this.defenderShipUnits(def, att.owner);
    const fa0 = G.countUnits(uA), fb0 = G.countUnits(uB), bName = this.defenderSideName(def.owner, allies);
    this._sayForces(this.player(att.owner).name, fa0, bName, fb0);
    const res = this._battle(uA, uB, { ground: false });
    this._sayLosses(this.player(att.owner).name, G.diffUnits(fa0, G.countUnits(uA)), bName, G.diffUnits(fb0, G.countUnits(uB)));
    this._writeShips(att, uA);
    this._writeSide([def].concat(allies), uB);
    for (const al of allies) if (this.fleetShipCount(al) === 0) this._destroyFleet(al);

    let advanced = false;
    if (this.fleetShipCount(def) === 0) { this._destroyFleet(def); }
    if (this.fleetShipCount(att) === 0) { this._destroyFleet(att); }

    if (res.winner === "A") {
      this.say("  " + this.player(att.owner).name + " vince lo scontro.");
      const cell = this.cell(q, r);
      this._enterCell(att, cell, {}); advanced = true;
    } else if (res.winner === "B") {
      this.say("  " + this.player(def.owner).name + " respinge l'attacco.");
    } else {
      this.say("  Scontro inconcludente: l'attaccante si ferma.");
    }
    if (att && this.fleetById(att.id)) att.stepsLeft = 0;
    this._checkElimination();
    return { ok: true, winner: res.winner, advanced, log: res.log, rounds: res.roundsData };
  };

  // -------------------------------------------------- Combattimento su pianeta
  // opts.land = numero di carri da sbarcare (default: tutti) se serve la lotta di terra.
  G.prototype.resolvePlanetCombat = function (attId, q, r, opts) {
    opts = opts || {};
    const att = this.fleetById(attId);
    const cell = this.cell(q, r);
    if (!att || !cell) return { ok: false };
    const defFleet = this.fleets.find((o) => o.q === q && o.r === r && o.owner === cell.owner);
    this.say("⚔ Attacco al pianeta " + cell.planet.data.nome + " (" + this.player(cell.owner).name + ").");
    this.noteFoes(att.owner, cell.owner);

    // --- Fase spaziale: navi difensori (e alleati presenti) + Cannoni (lastLine) ---
    const pAllies = this.alliedDefenders(q, r, cell.owner, att.owner);
    for (const al of pAllies) this.noteFoes(att.owner, al.owner);
    const uA = this._shipUnits(att);
    let uB = defFleet ? this._shipUnits(defFleet) : [];
    for (const al of pAllies) uB = uB.concat(this._shipUnits(al));
    uB = uB.concat(this._cannonUnits(cell));
    const pa0 = G.countUnits(uA), pb0 = G.countUnits(uB), pbName = this.defenderSideName(cell.owner, pAllies);
    this._sayForces(this.player(att.owner).name, pa0, pbName, pb0);
    const res = this._battle(uA, uB, { ground: false });
    this._sayLosses(this.player(att.owner).name, G.diffUnits(pa0, G.countUnits(uA)), pbName, G.diffUnits(pb0, G.countUnits(uB)));
    this._writeShips(att, uA);
    if (defFleet) this._writeShips(defFleet, uB.filter((u) => u.type !== "cannone" && (u.fleetId === defFleet.id || u.fleetId == null)));
    for (const al of pAllies) { this._writeShips(al, uB.filter((u) => u.fleetId === al.id)); if (this.fleetShipCount(al) === 0) this._destroyFleet(al); }
    const cannoniRimasti = uB.filter((u) => u.type === "cannone").length;
    cell.buildings.cannone = cannoniRimasti;

    if (this.fleetShipCount(att) === 0) { this._destroyFleet(att); this.say("  Flotta attaccante distrutta."); this._checkElimination(); return { ok: true, outcome: "attackerDestroyed", spaceRounds: res.roundsData }; }
    if (defFleet && this.fleetShipCount(defFleet) === 0) this._destroyFleet(defFleet);

    if (res.winner !== "A") {
      this.say("  Difese spaziali non superate: attacco interrotto, non si scende a terra.");
      att.stepsLeft = 0;
      return { ok: true, outcome: "spaceFailed", spaceRounds: res.roundsData };
    }
    this.say("  Difese spaziali distrutte.");

    // --- Difese di terra? ---
    const groundDef = cell.garrison > 0 || cell.buildings.torretta > 0;
    if (!groundDef) {
      // Conquista automatica con almeno una Torpediniera (manuale), oppure sbarcando carri
      const landN = Math.min(att.carri, opts.land != null ? opts.land : att.carri);
      if (att.ships.torpediniera > 0 || landN > 0) {
        att.carri -= landN;
        this.capturePlanet(att.id, q, r, landN);
        this._enterCell(att, cell, {});
        this._checkElimination();
        return { ok: true, outcome: "captured", spaceRounds: res.roundsData };
      }
      // Nessuna Torpediniera né carri: occupa lo spazio ma non conquista
      this._enterCell(att, cell, {});
      this.say("  Pianeta indifeso ma senza Torpediniera né carri: non conquistato.");
      return { ok: true, outcome: "spaceWonNoCapture", spaceRounds: res.roundsData };
    }

    // --- Combattimento di terra (opzionale) ---
    const wantLand = opts.land == null ? att.carri : opts.land;
    const landN = Math.min(att.carri, wantLand);
    if (landN <= 0) {
      this._enterCell(att, cell, {});
      this.say("  Difese a terra presenti ma nessuno sbarco: pianeta non conquistato.");
      att.stepsLeft = 0;
      return { ok: true, outcome: "spaceWonNoLand", spaceRounds: res.roundsData };
    }
    this.say("  Sbarco di " + landN + " carri. Lotta di terra!");
    const tA = this._tankUnits(landN);
    const tB = this._tankUnits(cell.garrison).concat(this._turretUnits(cell));
    const ga0 = G.countUnits(tA), gb0 = G.countUnits(tB);
    this._sayForces(this.player(att.owner).name, ga0, this.player(cell.owner).name, gb0);
    const gres = this._battle(tA, tB, { ground: true });
    this._sayLosses(this.player(att.owner).name, G.diffUnits(ga0, G.countUnits(tA)), this.player(cell.owner).name, G.diffUnits(gb0, G.countUnits(tB)));
    att.carri -= landN; // i carri sbarcati lasciano le navi
    const survAtt = tA.length;
    const survDefTanks = tB.filter((u) => u.type === "carro").length;
    const survTurrets = tB.filter((u) => u.type === "torretta").length;
    cell.buildings.torretta = survTurrets;
    cell.garrison = survDefTanks;

    if (gres.winner === "A") {
      this.capturePlanet(att.id, q, r, survAtt);
      this._enterCell(att, cell, {});
      this._checkElimination();
      return { ok: true, outcome: "captured", survivors: survAtt, spaceRounds: res.roundsData, groundRounds: gres.roundsData };
    } else {
      this.say("  Sbarco respinto: pianeta non conquistato.");
      this._enterCell(att, cell, {}); // la flotta resta sopra la cella
      att.stepsLeft = 0;
      this._checkElimination();
      return { ok: true, outcome: "groundFailed", spaceRounds: res.roundsData, groundRounds: gres.roundsData };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
