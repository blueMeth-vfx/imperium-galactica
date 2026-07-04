// ============================================================================
// game.js — Motore principale: stato, setup, fasi del turno, economia,
// produzione, movimento ed esplorazione. Logica pura (niente DOM).
// Il combattimento è in combat.js, Casinò/Mercato/IA nei rispettivi file.
// ============================================================================
(function (g) {
  g.IG = g.IG || {};
  const C = () => g.IG.CONFIG;
  const Hex = () => g.IG.Hex;

  // --- RNG deterministico (mulberry32) per partite riproducibili nei test ---
  function makeRNG(seed) {
    let a = (seed >>> 0) || 123456789;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const PHASES = ["riscossione", "produzione", "movimento", "costruzione"];
  const PHASE_NAMES = {
    riscossione: "Fase 1 – Riscossione",
    produzione: "Fase 2 – Produzione",
    movimento: "Fase 3 – Movimento",
    costruzione: "Fase 4 – Costruzione e Commercio",
  };

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.rng = makeRNG(opts.seed || Math.floor((typeof performance !== "undefined" ? performance.now() : 1) * 1000) + 1);
      this.log = [];
      this.fleetSeq = 1;
      this.winner = null;
      this._setup(opts.players || [
        { name: "Giocatore 1", isAI: false },
        { name: "Giocatore 2", isAI: false },
      ]);
    }

    // -------------------------------------------------------------- utilità
    say(msg) { this.log.push(msg); if (this.log.length > 500) this.log.shift(); }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    rollDie() { return 1 + Math.floor(this.rng() * 6); }

    // -------------------------------------------------------------- setup
    _setup(playersDef) {
      const cfg = C();
      const n = Math.max(2, Math.min(4, playersDef.length));
      // Giocatori
      this.players = [];
      for (let i = 0; i < n; i++) {
        this.players.push({
          id: i,
          name: playersDef[i].name || ("Giocatore " + (i + 1)),
          isAI: !!playersDef[i].isAI,
          difficulty: playersDef[i].difficulty || cfg.DEFAULT_DIFFICULTY,
          color: cfg.COLORS[i],
          colorName: cfg.COLOR_NAMES[i],
          money: cfg.START_MONEY,
          res: { carburante: 0, metallo: 0, pietra: 0 },
          eliminated: false,
        });
      }

      // Tabellone: tutte le celle, inizialmente non esplorate
      this.board = {};
      for (let q = 0; q < cfg.COLS; q++) {
        for (let r = 0; r < cfg.ROWS; r++) {
          this.board[Hex().key(q, r)] = {
            q, r, explored: false, type: null,
            planet: null, owner: null,
            buildings: { fabbricaNavale: 0, fabbricaCarri: 0, tesoreria: 0, cannone: 0, torretta: 0 },
            garrison: 0,        // carri a difesa del pianeta
            producedNavi: 0,    // navi prodotte qui questo turno (cap)
            producedCarri: 0,
          };
        }
      }
      // I 4 angoli partono come Spazio Interstellare già rivelato
      const starts = cfg.CORNERS;
      for (let i = 0; i < n; i++) {
        const cell = this.board[Hex().key(starts[i].q, starts[i].r)];
        cell.explored = true;
        cell.type = "space";
        cell.startOf = i;
      }

      // Mazzi
      this._buildTileDeck();
      this.planetPool = this.shuffle(g.IG.DATA.planets.slice());
      this.asteroidDeck = this.shuffle(g.IG.DATA.asteroids.slice());
      this.asteroidDiscard = [];
      this.marketDeck = this.shuffle(g.IG.DATA.market.slice());

      // Flotte iniziali
      this.fleets = [];
      for (let i = 0; i < n; i++) {
        const s = cfg.START_FLEET;
        this._newFleet(i, starts[i].q, starts[i].r,
          { caccia: s.caccia, torpediniera: s.torpediniera, colonia: s.colonia }, 0);
      }

      // Ordine di turno: dado per ciascuno, il più basso inizia; senso orario di default
      const rolls = this.players.map((p) => ({ id: p.id, roll: this.rollDie() }));
      const sorted = rolls.slice().sort((a, b) => a.roll - b.roll);
      this.startPlayer = sorted[0].id;
      this.direction = 1; // 1 orario, -1 antiorario (scelto dal primo giocatore: default orario)
      this.turnOrder = this._computeOrder(this.startPlayer, this.direction);
      // Dati per l'animazione dei dadi d'inizio (per la UI), in ordine di fazione
      this.orderRolls = rolls.map((r) => ({ id: r.id, roll: r.roll, name: this.players[r.id].name, color: this.players[r.id].color }));
      this.moveLog = []; // spostamenti recenti (per frecce e banner)
      this.say("Lanci d'ordine: " + rolls.map((x) => this.players[x.id].colorName + "=" + x.roll).join(", ") +
        ". Inizia " + this.players[this.startPlayer].colorName + ".");

      this.turnNumber = 1;
      this.orderIdx = 0;
      this.phaseIdx = 0;
      this.currentPlayer = this.turnOrder[0];
      this._beginPlayerTurn();
    }

    _computeOrder(start, dir) {
      const n = this.players.length;
      const order = [];
      for (let k = 0; k < n; k++) order.push(((start + dir * k) % n + n) % n);
      return order;
    }

    setDirection(dir) {
      this.direction = dir < 0 ? -1 : 1;
      this.turnOrder = this._computeOrder(this.startPlayer, this.direction);
      this.orderIdx = this.turnOrder.indexOf(this.currentPlayer);
    }

    _buildTileDeck() {
      const t = C().TILE_DECK;
      const deck = [];
      for (const type in t) for (let i = 0; i < t[type]; i++) deck.push(type);
      this.tileDeck = this.shuffle(deck);
    }

    _newFleet(owner, q, r, ships, carri) {
      const f = {
        id: this.fleetSeq++, owner, q, r,
        ships: { caccia: ships.caccia || 0, torpediniera: ships.torpediniera || 0, colonia: ships.colonia || 0 },
        carri: carri || 0, stepsLeft: 0,
      };
      this.fleets.push(f);
      return f;
    }

    // -------------------------------------------------------------- accessor
    cell(q, r) { return this.board[Hex().key(q, r)]; }
    player(id) { return this.players[id]; }
    fleetById(id) { return this.fleets.find((f) => f.id === id); }
    fleetsAt(q, r) { return this.fleets.filter((f) => f.q === q && f.r === r); }
    fleetOfAt(owner, q, r) { return this.fleets.find((f) => f.owner === owner && f.q === q && f.r === r); }
    fleetsOf(owner) { return this.fleets.filter((f) => f.owner === owner); }
    planetsOf(owner) {
      const out = [];
      for (const k in this.board) if (this.board[k].owner === owner && this.board[k].type === "planet") out.push(this.board[k]);
      return out;
    }
    fleetShipCount(f) { return f.ships.caccia + f.ships.torpediniera + f.ships.colonia; }
    fleetIsPureCaccia(f) { return f.ships.caccia > 0 && f.ships.torpediniera === 0 && f.ships.colonia === 0; }
    fleetSpeed(f) { return this.fleetIsPureCaccia(f) ? 2 : 1; }
    fleetCarriCapacity(f) {
      const S = C().SHIPS;
      return f.ships.caccia * S.caccia.carri + f.ships.torpediniera * S.torpediniera.carri + f.ships.colonia * S.colonia.carri;
    }
    countUnits(owner, type) {
      // Conta unità possedute (flotte + guarnigioni per i carri)
      let n = 0;
      for (const f of this.fleetsOf(owner)) {
        if (type === "carri") n += f.carri; else n += f.ships[type];
      }
      if (type === "carri") for (const p of this.planetsOf(owner)) n += p.garrison;
      return n;
    }

    // -------------------------------------------------------------- fasi
    get phase() { return PHASES[this.phaseIdx]; }
    phaseName() { return PHASE_NAMES[this.phase]; }

    _beginPlayerTurn() {
      this.phaseIdx = 0;
      this._riscossione();
    }

    // Fase 1 — Riscossione (automatica)
    _riscossione() {
      const cfg = C();
      const p = this.player(this.currentPlayer);
      let gainMoney = 0;
      const gainRes = { carburante: 0, metallo: 0, pietra: 0 };
      const planets = this.planetsOf(p.id);
      for (const cell of planets) {
        cell.producedNavi = 0; cell.producedCarri = 0; // reset cap di produzione
        cell.builtThisTurn = false;                    // reset "1 edificio per turno"
        const pl = cell.planet.data;
        gainMoney += cfg.SOLDI_BASE_PIANETA * pl.economia + cell.buildings.tesoreria * cfg.TESORERIA_BONUS;
        for (const m of ["carburante", "metallo", "pietra"]) gainRes[m] += 1 * pl.moltMaterie[m];
      }
      p.money += gainMoney;
      for (const m in gainRes) p.res[m] += gainRes[m];
      // Memorizza l'esito per mostrarlo a schermo (UI)
      this.lastRiscossione = { playerId: p.id, money: gainMoney, res: gainRes, planets: planets.length };
      if (planets.length)
        this.say(p.colorName + " riscuote " + gainMoney + " Ndri e materie (C" + gainRes.carburante + " M" + gainRes.metallo + " P" + gainRes.pietra + ").");
      this.phaseIdx = 1; // -> Produzione
    }

    advancePhase() {
      // Passa alla fase successiva; se finite, passa al giocatore successivo.
      if (this.winner) return;
      if (this.phaseIdx < PHASES.length - 1) {
        this.phaseIdx++;
        if (this.phase === "movimento") this._beginMovement();
      } else {
        this._endPlayerTurn();
      }
    }

    _beginMovement() {
      // Assegna i passi a ogni flotta del giocatore corrente
      for (const f of this.fleetsOf(this.currentPlayer)) f.stepsLeft = this.fleetSpeed(f);
    }

    _endPlayerTurn() {
      this._checkElimination();
      if (this.winner) return;
      // Casinò: i giocatori con flotte su Casinò devono giocare ogni turno (gestito a parte dalla UI/IA)
      this.orderIdx++;
      if (this.orderIdx >= this.turnOrder.length) {
        this.orderIdx = 0;
        this.turnNumber++;
        this.say("— Inizia il turno " + this.turnNumber + " —");
      }
      // Salta giocatori eliminati
      let guard = 0;
      do {
        this.currentPlayer = this.turnOrder[this.orderIdx];
        if (this.player(this.currentPlayer).eliminated) {
          this.orderIdx++;
          if (this.orderIdx >= this.turnOrder.length) { this.orderIdx = 0; this.turnNumber++; }
        } else break;
      } while (guard++ < 10);
      this._beginPlayerTurn();
    }

    // -------------------------------------------------------------- produzione
    // Produce navi su un pianeta con Fabbrica Navale (Fase 2).
    produceShip(q, r, type, qty) {
      const cell = this.cell(q, r);
      const p = this.player(this.currentPlayer);
      const S = C().SHIPS[type];
      qty = qty || 1;
      if (!cell || cell.owner !== p.id || cell.type !== "planet") return { ok: false, msg: "Pianeta non valido." };
      if (cell.buildings.fabbricaNavale < 1) return { ok: false, msg: "Serve una Fabbrica Navale." };
      const cap = cell.buildings.fabbricaNavale * cell.planet.data.produttivita; // C7: cap = fabbriche x produttività
      if (cell.producedNavi + qty > cap) return { ok: false, msg: "Limite produzione navi: " + cap + "/turno su questo pianeta." };
      if (this.countUnits(p.id, type) + qty > C().LIMITS[type]) return { ok: false, msg: "Limite di fazione raggiunto per " + C().SHIP_NAMES[type] + "." };
      const needC = S.carburante * qty, needM = S.metallo * qty, needN = S.costo * qty;
      if (p.res.carburante < needC || p.res.metallo < needM || p.money < needN) return { ok: false, msg: "Risorse insufficienti." };
      p.res.carburante -= needC; p.res.metallo -= needM; p.money -= needN;
      cell.producedNavi += qty;
      // Le navi si uniscono alla flotta sul pianeta, o ne creano una nuova
      let f = this.fleetOfAt(p.id, q, r);
      if (!f) f = this._newFleet(p.id, q, r, { caccia: 0, torpediniera: 0, colonia: 0 }, 0);
      f.ships[type] += qty;
      this.say(p.colorName + " produce " + qty + " " + C().SHIP_NAMES[type] + " su " + cell.planet.data.nome + ".");
      return { ok: true };
    }

    // Produce carri su un pianeta con Fabbrica Carri (restano come guarnigione)
    produceCarri(q, r, qty) {
      const cell = this.cell(q, r);
      const p = this.player(this.currentPlayer);
      qty = qty || 1;
      if (!cell || cell.owner !== p.id || cell.type !== "planet") return { ok: false, msg: "Pianeta non valido." };
      if (cell.buildings.fabbricaCarri < 1) return { ok: false, msg: "Serve una Fabbrica Carri Armati." };
      const cap = cell.buildings.fabbricaCarri * cell.planet.data.produttivita;
      if (cell.producedCarri + qty > cap) return { ok: false, msg: "Limite produzione carri: " + cap + "/turno." };
      if (this.countUnits(p.id, "carri") + qty > C().LIMITS.carri) return { ok: false, msg: "Limite carri di fazione." };
      const cc = C().CARRO;
      if (p.res.carburante < cc.carburante * qty || p.res.metallo < cc.metallo * qty || p.money < cc.costo * qty)
        return { ok: false, msg: "Risorse insufficienti." };
      p.res.carburante -= cc.carburante * qty; p.res.metallo -= cc.metallo * qty; p.money -= cc.costo * qty;
      cell.producedCarri += qty;
      cell.garrison += qty;
      this.say(p.colorName + " produce " + qty + " Carri su " + cell.planet.data.nome + ".");
      return { ok: true };
    }

    // Imbarca carri dalla guarnigione del pianeta su una flotta presente lì
    loadTanks(fleetId, n) {
      const f = this.fleetById(fleetId);
      if (!f) return { ok: false, msg: "Flotta inesistente." };
      const cell = this.cell(f.q, f.r);
      if (!cell || cell.owner !== f.owner || cell.type !== "planet") return { ok: false, msg: "La flotta non è su un proprio pianeta." };
      const cap = this.fleetCarriCapacity(f) - f.carri;
      n = Math.min(n, cap, cell.garrison);
      if (n <= 0) return { ok: false, msg: "Nessun carro imbarcabile (capienza o guarnigione esaurita)." };
      cell.garrison -= n; f.carri += n;
      this.say("Imbarcati " + n + " carri sulla flotta #" + f.id + ".");
      return { ok: true };
    }

    unloadTanks(fleetId, n) {
      const f = this.fleetById(fleetId);
      if (!f) return { ok: false };
      const cell = this.cell(f.q, f.r);
      if (!cell || cell.owner !== f.owner || cell.type !== "planet") return { ok: false, msg: "Non su un proprio pianeta." };
      n = Math.min(n, f.carri);
      f.carri -= n; cell.garrison += n;
      return { ok: true };
    }

    // -------------------------------------------------------------- costruzione
    buildBuilding(q, r, type) {
      const cell = this.cell(q, r);
      const p = this.player(this.currentPlayer);
      const B = C().BUILDINGS[type];
      if (!cell || cell.owner !== p.id || cell.type !== "planet") return { ok: false, msg: "Pianeta non valido." };
      if (!B) return { ok: false, msg: "Edificio sconosciuto." };
      // Un pianeta appena colonizzato non è ancora pronto: deve passare almeno un turno.
      if (cell.colonizedTurn === this.turnNumber) return { ok: false, msg: "Pianeta colonizzato in questo turno: potrai costruire dal prossimo turno." };
      const totBuildings = Object.values(cell.buildings).reduce((a, b) => a + b, 0);
      if (totBuildings >= C().PLANET_SLOTS) return { ok: false, msg: "Slot edifici esauriti (9)." };
      if (cell.builtThisTurn) return { ok: false, msg: "Max 1 edificio per pianeta per turno." };
      if (p.money < B.ndri || p.res.pietra < B.pietra) return { ok: false, msg: "Servono " + B.ndri + " Ndri e " + B.pietra + " Pietra." };
      p.money -= B.ndri; p.res.pietra -= B.pietra;
      cell.buildings[type]++;
      cell.builtThisTurn = true;
      this.say(p.colorName + " costruisce " + B.nome + " su " + cell.planet.data.nome + ".");
      return { ok: true };
    }

    // -------------------------------------------------------------- esplorazione/movimento
    _drawTile() { return this.tileDeck.length ? this.tileDeck.pop() : "space"; }

    _revealCell(cell) {
      if (cell.explored) return { newly: false };
      cell.explored = true;
      cell.type = this._drawTile();
      if (cell.type === "planet") {
        const data = this.planetPool.length ? this.planetPool.pop() : g.IG.DATA.planets[0];
        cell.planet = { data };
      }
      this.say("Esplorato (" + cell.q + "," + cell.r + "): " + this._tileLabel(cell.type) +
        (cell.planet ? " — " + cell.planet.data.nome + " (" + cell.planet.data.tipo + ")" : ""));
      return { newly: true, type: cell.type, planetName: cell.planet ? cell.planet.data.nome : null, tipo: cell.planet ? cell.planet.data.tipo : null };
    }
    _tileLabel(t) {
      return { space: "Spazio Interstellare", planet: "Pianeta", asteroids: "Fasci di Asteroidi", market: "Mercato", casino: "Casinò Interspaziale" }[t] || t;
    }

    drawAsteroidCard() {
      if (!this.asteroidDeck.length) { this.asteroidDeck = this.shuffle(this.asteroidDiscard); this.asteroidDiscard = []; }
      const card = this.asteroidDeck.pop();
      this.asteroidDiscard.push(card);
      return card;
    }

    // Applica una carta asteroidi alla flotta che attraversa. Ritorna l'effetto (per la UI).
    applyAsteroid(fleet, card) {
      const p = this.player(fleet.owner);
      if (card.tipo === "malus") {
        let toLose = card.unitaPerse;
        const order = ["carri", "caccia", "torpediniera", "colonia"];
        const lost = [];
        for (const u of order) {
          while (toLose > 0) {
            if (u === "carri" && fleet.carri > 0) { fleet.carri--; toLose--; lost.push("carro"); }
            else if (u !== "carri" && fleet.ships[u] > 0) { fleet.ships[u]--; toLose--; lost.push(C().SHIP_NAMES[u]); }
            else break;
          }
        }
        this.say("☄ Asteroidi: " + p.colorName + " perde " + (lost.length ? lost.join(", ") : "nessuna unità") + ".");
        return { tipo: "malus", lost: lost };
      } else {
        const q = card.quantita;
        if (card.risorsa === "soldi") { p.money += q * 5000; this.say("☄ Asteroidi: " + p.colorName + " guadagna " + (q * 5000) + " Ndri."); return { tipo: "bonus", risorsa: "soldi", quantita: q, valore: q * 5000 }; }
        p.res[card.risorsa] += q; this.say("☄ Asteroidi: " + p.colorName + " guadagna " + q + " " + card.risorsa + ".");
        return { tipo: "bonus", risorsa: card.risorsa, quantita: q };
      }
    }

    // Muove una flotta di UN passo verso una cella adiacente.
    // Ritorna un evento: {ok, event, ...}. Gli eventi 'combat'/'planetCombat' richiedono
    // risoluzione esterna (combat.js) prima di completare lo spostamento.
    stepFleet(fleetId, q, r) {
      const f = this.fleetById(fleetId);
      if (!f) return { ok: false, msg: "Flotta inesistente." };
      if (f.owner !== this.currentPlayer) return { ok: false, msg: "Non è la tua flotta." };
      if (this.phase !== "movimento") return { ok: false, msg: "Non è la fase di movimento." };
      if (f.stepsLeft <= 0) return { ok: false, msg: "Movimento esaurito per questa flotta." };
      const isNb = Hex().neighbors(f.q, f.r).some((n) => n.q === q && n.r === r);
      if (!isNb) return { ok: false, msg: "Cella non adiacente." };

      const cell = this.cell(q, r);
      const revealed = this._revealCell(cell);

      // Casinò: cella comune, nessuno scontro — ci si entra liberamente
      if (cell.type === "casino") return this._enterCell(f, cell, { casino: true, revealed });

      // Flotta avversaria sulla cella -> scontro spaziale
      const enemyFleet = this.fleets.find((o) => o.q === q && o.r === r && o.owner !== f.owner);
      if (enemyFleet) return { ok: true, event: "combat", attacker: f.id, defender: enemyFleet.id, q, r, revealed };

      // Pianeta nemico -> combattimento (difese spaziali, poi terra)
      if (cell.type === "planet" && cell.owner !== null && cell.owner !== f.owner) {
        return { ok: true, event: "planetCombat", attacker: f.id, q, r, revealed };
      }

      return this._enterCell(f, cell, { revealed });
    }

    // Registra uno spostamento (per frecce/banner nella UI)
    _logMove(fq, fr, tq, tr, owner) {
      if (!this.moveLog) this.moveLog = [];
      this.moveLog.push({ fromQ: fq, fromR: fr, toQ: tq, toR: tr, owner: owner });
      if (this.moveLog.length > 300) this.moveLog.shift();
    }

    // Completa l'ingresso su una cella libera/amica (dopo eventuale combattimento vinto)
    _enterCell(f, cell, info) {
      info = info || {};
      const fromQ = f.q, fromR = f.r; // partenza (per freccia e log)
      let asteroid = null;
      // Asteroidi: si pesca una carta ad ogni attraversamento
      if (cell.type === "asteroids") {
        const card = this.drawAsteroidCard();
        asteroid = this.applyAsteroid(f, card);
        if (this.fleetShipCount(f) === 0) { this._destroyFleet(f); this._logMove(fromQ, fromR, cell.q, cell.r, f.owner); return { ok: true, event: "destroyed", asteroid: asteroid, revealed: info.revealed, fromQ: fromQ, fromR: fromR }; }
      }
      // Sposta la flotta; conta il passo PRIMA dell'eventuale fusione
      const mine = this.fleetOfAt(f.owner, cell.q, cell.r);
      f.q = cell.q; f.r = cell.r;
      f.stepsLeft--;
      // Fusione: se una delle due ha già finito i passi, l'intera flotta unita non si muove più
      if (mine && mine.id !== f.id) this._mergeFleets(mine, f);
      const moved = this.fleetById(f.id) || mine;
      this._logMove(fromQ, fromR, cell.q, cell.r, f.owner);
      return { ok: true, event: info.casino ? "casino" : "moved", fleet: (moved ? moved.id : f.id), q: cell.q, r: cell.r,
        revealed: info.revealed, asteroid: asteroid, fromQ: fromQ, fromR: fromR,
        canColonize: cell.type === "planet" && cell.owner === null && (moved && moved.ships.colonia > 0) };
    }
    _afterStepDestroyed() { return { ok: true, event: "destroyed" }; }

    _mergeFleets(keep, gone) {
      keep.ships.caccia += gone.ships.caccia;
      keep.ships.torpediniera += gone.ships.torpediniera;
      keep.ships.colonia += gone.ships.colonia;
      keep.carri += gone.carri;
      // Se almeno una delle due ha finito i passi (0), la flotta unita è ferma; mai oltre la sua velocità.
      keep.stepsLeft = Math.min(keep.stepsLeft, gone.stepsLeft, this.fleetSpeed(keep));
      this.fleets = this.fleets.filter((x) => x.id !== gone.id);
    }

    _destroyFleet(f) {
      this.fleets = this.fleets.filter((x) => x.id !== f.id);
    }

    // Divide una flotta: crea una nuova flotta con le unità indicate
    splitFleet(fleetId, take) {
      const f = this.fleetById(fleetId);
      if (!f) return { ok: false };
      const nf = this._newFleet(f.owner, f.q, f.r, { caccia: 0, torpediniera: 0, colonia: 0 }, 0);
      for (const t of ["caccia", "torpediniera", "colonia"]) {
        const k = Math.min(take[t] || 0, f.ships[t]); f.ships[t] -= k; nf.ships[t] += k;
      }
      const tc = Math.min(take.carri || 0, f.carri); f.carri -= tc; nf.carri += tc;
      nf.stepsLeft = this.phase === "movimento" ? this.fleetSpeed(nf) : 0;
      f.stepsLeft = Math.min(f.stepsLeft, this.fleetSpeed(f));
      if (this.fleetShipCount(f) === 0) this._destroyFleet(f);
      if (this.fleetShipCount(nf) === 0) this._destroyFleet(nf);
      return { ok: true, newFleet: nf.id };
    }

    // -------------------------------------------------------------- colonizzazione
    colonize(fleetId) {
      const f = this.fleetById(fleetId);
      if (!f) return { ok: false, msg: "Flotta inesistente." };
      const cell = this.cell(f.q, f.r);
      if (!cell || cell.type !== "planet") return { ok: false, msg: "Non c'è un pianeta qui." };
      if (cell.owner !== null) return { ok: false, msg: "Pianeta già occupato." };
      if (f.ships.colonia < 1) return { ok: false, msg: "Serve una Nave Colonia." };
      // La Nave Colonia viene consumata
      f.ships.colonia--;
      cell.owner = f.owner;
      cell.colonizedTurn = this.turnNumber; // potrà costruire solo dal turno successivo
      this.say(this.player(f.owner).colorName + " colonizza " + cell.planet.data.nome + " (Nave Colonia consumata).");
      if (this.fleetShipCount(f) === 0) this._destroyFleet(f);
      return { ok: true };
    }

    // Conquista un pianeta nemico già "ripulito" (nessuna difesa) con almeno una Torpediniera
    // oppure dopo aver vinto il combattimento di terra.
    capturePlanet(fleetId, q, r, survivingTanks) {
      const f = this.fleetById(fleetId);
      const cell = this.cell(q, r);
      const oldOwner = cell.owner;
      cell.owner = f ? f.owner : this.currentPlayer;
      cell.garrison = survivingTanks != null ? survivingTanks : 0;
      cell.colonizedTurn = this.turnNumber; // dopo la conquista si potrà costruire solo dal turno successivo
      // Gli edifici esistenti restano al conquistatore (G19). Difese azzerate se distrutte (gestito dal combat).
      this.say(this.player(cell.owner).colorName + " conquista " + cell.planet.data.nome +
        (oldOwner != null ? " (era di " + this.player(oldOwner).colorName + ")" : "") + ".");
      return { ok: true };
    }

    // -------------------------------------------------------------- fine partita
    _checkElimination() {
      for (const p of this.players) {
        if (p.eliminated) continue;
        const noPlanets = this.planetsOf(p.id).length === 0;
        const noFleets = this.fleetsOf(p.id).length === 0;
        if (noPlanets && noFleets) {
          p.eliminated = true;
          this.say("☠ " + p.colorName + " è stato eliminato!");
        }
      }
      const alive = this.players.filter((p) => !p.eliminated);
      if (alive.length === 1) {
        this.winner = alive[0].id;
        this.say("🏆 " + alive[0].colorName + " domina la galassia! Partita conclusa.");
      } else if (alive.length === 0) {
        this.winner = -1;
        this.say("Tutte le fazioni eliminate: pareggio.");
      }
    }
  }

  // --- Serializzazione (per il multiplayer online / salvataggi) ---
  // Campi di stato "puri" (senza funzioni): tutto ciò che serve a ricostruire la partita.
  const STATE_KEYS = [
    "players", "board", "fleets", "fleetSeq", "tileDeck", "planetPool",
    "asteroidDeck", "asteroidDiscard", "marketDeck", "turnOrder", "startPlayer",
    "direction", "turnNumber", "orderIdx", "phaseIdx", "currentPlayer", "winner",
    "log", "lastRiscossione", "casinoSessions", "orderRolls",
  ];
  Game.prototype.toState = function () {
    const o = {};
    for (const k of STATE_KEYS) if (this[k] !== undefined) o[k] = this[k];
    return JSON.parse(JSON.stringify(o));
  };
  // Ricostruisce una partita da uno stato serializzato (senza rieseguire il setup).
  Game.fromState = function (state, seed) {
    const g = Object.create(Game.prototype);
    const data = JSON.parse(JSON.stringify(state));
    for (const k of STATE_KEYS) g[k] = data[k];
    if (!g.log) g.log = [];
    if (!g.casinoSessions) g.casinoSessions = {};
    // Un RNG locale qualsiasi: la casualità è "consumata" solo da chi è di turno e
    // finisce comunque nello stato condiviso, quindi non serve sincronizzarlo.
    g.rng = makeRNG((data.turnNumber || 1) * 7919 + (data.currentPlayer || 0) + 1);
    return g;
  };

  g.IG.makeRNG = makeRNG;
  g.IG.PHASES = PHASES;
  g.IG.Game = Game;
})(typeof window !== "undefined" ? window : globalThis);
