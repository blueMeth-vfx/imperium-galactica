// ============================================================================
// regole.js — Controlli delle regole del motore web (gli stessi del banco di prova
// C# in csharp/Test/Program.cs). Avvio:  node test/regole.js [seed] [turniMax]
// Esce con codice 0 e "SANITY OK" se tutto torna.
// ============================================================================
require("../data/gamedata.js");
require("../engine/config.js");
require("../engine/hex.js");
require("../engine/game.js");
require("../engine/diplomacy.js");
require("../engine/combat.js");
require("../engine/casino.js");
require("../engine/market.js");
require("../engine/ai.js");

const IG = globalThis.IG, C = IG.CONFIG, Game = IG.Game;
const seed = parseInt(process.argv[2] || "42", 10), maxTurns = parseInt(process.argv[3] || "60", 10);
const P = (defs, s) => new Game({ seed: s, players: defs });
const planet = (i) => ({ data: Object.assign({}, IG.DATA.planets[i]) });
const results = [];
function check(name, ok, detail) { results.push(ok); console.log(name + ": " + (ok ? "OK" : "FALLITO " + (detail || ""))); }

// --- partita tutta IA ---
const g = P([{ name: "Rosso", isAI: true, difficulty: "medio" }, { name: "Blu", isAI: true, difficulty: "difficile" },
  { name: "Verde", isAI: true, difficulty: "facile" }, { name: "Giallo", isAI: true, difficulty: "medio" }], seed);
let safety = 0;
while (g.winner == null && g.turnNumber <= maxTurns && safety++ < 4000) IG.runAITurn(g);
const explored = Object.values(g.board).filter((c) => c.explored).length;
const conq = g.log.filter((l) => l.includes("conquista")).length, colon = g.log.filter((l) => l.includes("colonizza")).length;
console.log("Partita IA (seed " + seed + "): turno " + g.turnNumber + ", esplorate " + explored + "/77, " + conq + " conquiste, " + colon + " colonizzazioni, vincitore " +
  (g.winner == null ? "-" : g.player(g.winner).name));
check("Partita evolve", explored >= 20 && conq + colon >= 1 && g.turnNumber >= 2);

// --- salva/carica (stato JSON) e la partita riprende ---
{
  const g2 = P([{ name: "A", isAI: true }, { name: "B", isAI: true }], 123);
  for (let i = 0; i < 5; i++) IG.runAITurn(g2);
  const g3 = Game.fromState(JSON.parse(JSON.stringify(g2.toState())));
  let ok = g3.turnNumber === g2.turnNumber && g3.currentPlayer === g2.currentPlayer && g3.fleets.length === g2.fleets.length &&
    g3.players[0].race === g2.players[0].race;
  try { for (let i = 0; i < 3; i++) if (g3.winner == null) IG.runAITurn(g3); } catch (e) { ok = false; console.error(e); }
  check("Salva/carica", ok);
}

// --- pianeta affine: +1 a ogni materia alla razza giusta ---
{
  const g4 = P([{ name: "P", isAI: true, race: "pagoedonti" }, { name: "A", isAI: true, race: "antrophosi" }], 7);
  const ghiaccio = IG.DATA.planets.findIndex((x) => x.tipo === "Ghiaccio");
  for (let i = 0; i < 2; i++) { const pc = g4.cell(4 + i, 3); pc.explored = true; pc.type = "planet"; pc.planet = planet(ghiaccio); pc.owner = i; }
  const gains = {};
  for (let k = 0; k < 40 && Object.keys(gains).length < 2; k++) { g4.advancePhase(); const r = g4.lastRiscossione; if (r && r.planets > 0) gains[r.playerId] = r.res; }
  const m = IG.DATA.planets[ghiaccio].moltMaterie;
  check("Pianeta affine", gains[0] && gains[1] && gains[0].carburante === m.carburante + 1 && gains[0].pietra === m.pietra + 1 &&
    gains[1].carburante === m.carburante && gains[1].metallo === m.metallo && C.raceAffinity("lithauxi", "Roccia") && !C.raceAffinity("antrophosi", "Fuoco"));
}

// --- ritirata: solo a scambio pari e prima di tirare ---
{
  const g5 = P([{ name: "A", isAI: true }, { name: "B", isAI: true }], 11);
  const fa = g5.fleetsOf(0)[0], fb = g5.fleetsOf(1)[0];
  fa.ships.caccia = 6; fb.ships.caccia = 6;
  const aq = fa.q, ar = fa.r;
  const ua = g5._shipUnits(fa), ub = g5._shipUnits(fb);
  const cs = g5.makeCombatSession(ua, ub, false);
  cs.startRound();
  const r0 = cs.canRetreat(); cs.rollAll(cs.round.att); const r0b = cs.canRetreat();
  cs.rollAll(cs.round.def); let rr = cs.resolve();
  let r1 = true, r2 = false;
  if (!rr.finished) {
    cs.startRound(); r1 = cs.canRetreat(); cs.rollAll(cs.round.att); cs.rollAll(cs.round.def); rr = cs.resolve();
    if (!rr.finished) { cs.startRound(); r2 = cs.canRetreat(); } else r2 = true;
  }
  g5.applyFleetCombatResult(fa, fb, ua, ub, "retreat");
  const fa2 = g5.fleetById(fa.id);
  check("Ritirata", r0 && !r0b && !r1 && r2 && (!fa2 || (fa2.q === aq && fa2.r === ar && fa2.stepsLeft === 0)), [r0, r0b, r1, r2].join());
}

// --- scontro a inizio movimento e moltiplicatori nuovi ---
{
  const g6 = P([{ name: "A", isAI: true }, { name: "B", isAI: true }], 5);
  const cp = g6.currentPlayer, mine = g6.fleetsOf(cp)[0], foe = g6.fleetsOf(1 - cp)[0];
  foe.q = mine.q; foe.r = mine.r;
  const before = g6.pendingClash(cp) == null;
  while (g6.phase !== "movimento") g6.advancePhase();
  const cl = g6.pendingClash(cp);
  check("Scontro a inizio movimento", before && cl && cl.event === "combat" && cl.attacker === mine.id && cl.defender === foe.id &&
    C.SHIPS.colonia.att === 0.5 && C.SHIPS.colonia.def === 2 && C.SHIPS.torpediniera.att === 2 && C.SHIPS.torpediniera.def === 2);
}

// --- scorta del mercato: parte vuota, vendere riempie, comprare consuma; materie solo con un pianeta ---
{
  const g7 = P([{ name: "A", isAI: true }, { name: "B", isAI: true }], 9);
  g7.player(0).money = 100000; g7.player(0).res.metallo = 3;
  const noPlanetBuy = !g7.marketTradeCube(0, "carburante", 1, false, 4, 4).ok;
  { const hp = g7.cell(1, 1); hp.explored = true; hp.type = "planet"; hp.planet = planet(0); hp.owner = 0; }
  const ms = g7.stockAt(4, 4);
  const empty0 = ms.carburante === 0 && ms.metallo === 0 && ms.pietra === 0;
  const emptyBuy = !g7.marketTradeCube(0, "carburante", 1, false, 4, 4).ok;
  g7.marketTradeCube(0, "metallo", 2, true, 4, 4);
  const sold = g7.player(0).money === 100000 + 2 * 500;
  const refill = g7.stockAt(4, 4).metallo === 2 && g7.marketTradeCube(0, "metallo", 1, false, 4, 4).ok && g7.stockAt(4, 4).metallo === 1;
  const saved = Game.fromState(JSON.parse(JSON.stringify(g7.toState()))).stockAt(4, 4).metallo === 1;
  check("Scorta del mercato", noPlanetBuy && empty0 && emptyBuy && sold && refill && saved, [noPlanetBuy, empty0, emptyBuy, sold, refill, saved].join());
}

// --- 32 pianeti, mazzo tessere, carri al mercato solo con posto a bordo ---
{
  const pl = IG.DATA.planets;
  check("Pianeti", pl.length === 32 && ["Terra", "Fuoco", "Ghiaccio", "Roccia"].every((t) => pl.filter((x) => x.tipo === t).length === 8) &&
    new Set(pl.map((x) => x.nome)).size === 32 && C.TILE_DECK.planet === 32 && C.TILE_DECK.space === 45);
  const g8 = P([{ name: "A" }, { name: "B", isAI: true }], 11);
  const mk = g8.cell(5, 3); mk.explored = true; mk.type = "market";
  const f8 = g8.fleetsOf(0)[0]; f8.q = 5; f8.r = 3; f8.ships = { caccia: 2, torpediniera: 0, colonia: 0 }; f8.carri = 0;
  g8.player(0).money = 500000;
  const noRoom = !g8.marketBuy(f8.id, { unita: "carri", qta: 2, prezzo: 1000 }).ok;
  f8.ships.torpediniera = 1;
  const room = g8.marketBuy(f8.id, { unita: "carri", qta: 2, prezzo: 1000 }).ok && f8.carri === 2;
  const full = !g8.marketBuy(f8.id, { unita: "carri", qta: 1, prezzo: 1000 }).ok;
  check("Carri al mercato", noRoom && room && full);
}

// --- i carri della Nave Colonia sbarcano sul pianeta colonizzato ---
{
  const g9 = P([{ name: "A" }, { name: "B", isAI: true }], 12);
  const f9 = g9.fleetsOf(0)[0]; f9.ships = { caccia: 1, torpediniera: 0, colonia: 1 }; f9.carri = 3;
  const c9 = g9.cell(f9.q, f9.r); c9.type = "planet"; c9.planet = planet(3); c9.owner = null; c9.garrison = 0;
  g9.colonize(f9.id);
  check("Carri della colonia", c9.owner === 0 && c9.garrison === 3 && f9.carri === 0);
}

// --- niente battaglia sopra un pianeta se nessuno può combattere; coi Cannoni sì ---
{
  const g10 = P([{ name: "A" }, { name: "B" }], 13);
  g10.currentPlayer = 0;
  while (g10.phase !== "movimento") g10.advancePhase();
  g10.currentPlayer = 0;
  const a = g10.fleetsOf(0)[0]; a.ships = { caccia: 2, torpediniera: 0, colonia: 0 }; a.carri = 0; a.stepsLeft = 2;
  for (const o of g10.fleetsOf(1)) { o.q = 9; o.r = 5; }
  const n = IG.Hex.neighbors(a.q, a.r)[0];
  const p = g10.cell(n.q, n.r); p.explored = true; p.type = "planet"; p.planet = planet(5); p.owner = 1; p.garrison = 0;
  const r1 = g10.stepFleet(a.id, n.q, n.r);
  const pass = r1.ok && r1.planetPass && r1.event !== "planetCombat" && p.owner === 1;
  p.buildings.cannone = 1; a.q = 0; a.r = 0; a.stepsLeft = 2;
  const r2 = g10.stepFleet(a.id, n.q, n.r);
  check("Battaglie a vuoto", pass && r2.ok && r2.event === "planetCombat");
}

// --- pianeta indifeso: si prende senza combattere (con una Torpediniera) ---
{
  const gu = P([{ name: "A" }, { name: "B" }], 15);
  const a = gu.fleetsOf(0)[0]; a.ships = { caccia: 0, torpediniera: 1, colonia: 0 }; a.carri = 0;
  for (const o of gu.fleetsOf(1)) { o.q = 9; o.r = 5; }
  const c = gu.cell(a.q, a.r); c.type = "planet"; c.planet = planet(9); c.owner = 1; c.garrison = 0;
  const und = gu.planetUndefended(c);
  const r = gu.captureUndefended(a.id, c.q, c.r);
  check("Pianeta indifeso", und && r.ok && r.outcome === "captured" && c.owner === 0);
}

// --- bottino a chi elimina ---
{
  const g11 = P([{ name: "A" }, { name: "B" }, { name: "C", isAI: true }], 14);
  g11.player(1).money = 40000; g11.player(1).res.metallo = 5;
  const m0 = g11.player(0).money;
  const h = g11.cell(2, 2); h.explored = true; h.type = "planet"; h.planet = planet(7); h.owner = 1;
  g11.fleets = g11.fleets.filter((f) => f.owner !== 1);
  g11.capturePlanet(g11.fleetsOf(0)[0].id, 2, 2, 0);
  g11._checkElimination();
  check("Bottino", g11.player(1).eliminated && g11.player(0).money === m0 + 40000 && g11.player(0).res.metallo >= 5 && g11.player(1).money === 0);
}

// --- diplomazia ---
{
  const gd = P([{ name: "A" }, { name: "B" }, { name: "C", isAI: true }], 21);
  gd.currentPlayer = 0;
  const offerOk = gd.proposePact(0, 1, "alleanza").ok && gd.offersTo(1).length === 1;
  gd.currentPlayer = 1; gd.answerPact(gd.offersTo(1)[0].id, true);
  const allied = gd.allied(0, 1) && gd.friendly(1, 0);
  const da = gd.fleetsOf(0)[0], db = gd.fleetsOf(1)[0];
  db.q = da.q; db.r = da.r;
  const noClash = !gd.enemyFleetHere(da);
  gd.currentPlayer = 0; gd.player(0).money = 50000;
  const gift = gd.giveToAlly(0, 1, "soldi", 10000).ok && gd.player(1).money >= 10000;
  const savedPact = Game.fromState(JSON.parse(JSON.stringify(gd.toState()))).allied(0, 1);
  const broke = gd.breakAlliance(0, 1).ok && !gd.friendly(0, 1) && !!gd.enemyFleetHere(da);
  gd.proposePact(0, 1, "tregua", 2); gd.currentPlayer = 1; gd.answerPact(gd.offersTo(1)[0].id, true);
  const truce = gd.friendly(0, 1) && !gd.allied(0, 1);
  gd.turnNumber += 2;
  const expired = !gd.friendly(0, 1);
  gd.currentPlayer = 0; gd.turnNumber = 1; gd.pacts = [];
  const rAi = gd.proposePact(0, 2, "tregua", 2);
  const aiAnswers = rAi.ok && (rAi.event === "pactAccepted" || rAi.event === "pactRefused") && gd.offersTo(2).length === 0;
  check("Diplomazia", offerOk && allied && noClash && gift && savedPact && broke && truce && expired && aiAnswers,
    [offerOk, allied, noClash, gift, savedPact, broke, truce, expired, aiAnswers].join());
}

// --- alleati in difesa ---
{
  const ga = P([{ name: "A", isAI: true }, { name: "B", isAI: true }, { name: "C", isAI: true }], 44);
  ga.pacts.push({ a: 1, b: 2, kind: "alleanza", until: -1 });
  const atk = ga.fleetsOf(0)[0], dB = ga.fleetsOf(1)[0], dC = ga.fleetsOf(2)[0];
  dC.q = dB.q; dC.r = dB.r; atk.ships.caccia = 6; dB.ships.caccia = 1; dC.ships.caccia = 2;
  const side = ga.defenderShipUnits(dB, 0).length;
  ga.resolveFleetCombat(atk.id, dB.id);
  check("Alleati in difesa", side === 5 && ga.log.some((l) => l.includes("combattono insieme")), "lato " + side);
}

// --- rinomina ---
{
  const gr = P([{ name: "A" }, { name: "B" }], 33);
  gr.currentPlayer = 0;
  const fr = gr.fleetsOf(0)[0], cr = gr.cell(fr.q, fr.r);
  cr.explored = true; cr.type = "planet"; cr.planet = planet(3); cr.owner = null; fr.ships.colonia = 1;
  gr.colonize(fr.id);
  const ok = gr.renamePlanet(0, cr.q, cr.r, "Nuova Lecce").ok && cr.planet.data.nome === "Nuova Lecce" && IG.DATA.planets[3].nome !== "Nuova Lecce";
  const saved = Game.fromState(JSON.parse(JSON.stringify(gr.toState()))).cell(cr.q, cr.r).planet.data.nome === "Nuova Lecce";
  gr.currentPlayer = 1; cr.owner = 1;
  const blocked = !gr.renamePlanet(1, cr.q, cr.r, "Altro").ok;
  check("Rinomina pianeta", ok && saved && blocked);
}

// --- Casinò: 7 o 11 triplicano il banco ---
{
  const gc = P([{ name: "A" }, { name: "B" }], 1);
  let won = false;
  for (let k = 0; k < 400 && !won; k++) {
    gc.player(0).money = 10000; gc._casinoSession(0).banco = 0;
    gc.casinoBet(0, 1000);
    const r = gc.casinoRoll(0);
    if (r.outcome === "win") won = gc.player(0).money === 9000 + 3000;
    else if (r.outcome === "push") gc.casinoLeave(0);
  }
  check("Casinò ×3", won && C.PREZZO_VENDITA_CUBO === 500);
}

// --- dividere una flotta già mossa non ridà il movimento ---
{
  const gs = P([{ name: "A" }, { name: "B" }], 2);
  gs.currentPlayer = 0;
  while (gs.phase !== "movimento") gs.advancePhase();
  gs.currentPlayer = 0;
  const f = gs.fleetsOf(0)[0]; f.ships = { caccia: 2, torpediniera: 0, colonia: 1 }; f.stepsLeft = 0;
  const r = gs.splitFleet(f.id, { caccia: 2 });
  const nf = gs.fleetById(r.newFleet);
  check("Dividi flotta", nf && nf.stepsLeft === 1 && f.stepsLeft === 0, nf ? "nuova " + nf.stepsLeft + " vecchia " + f.stepsLeft : "");
}

// --- resa ---
{
  const gx = P([{ name: "A" }, { name: "B" }, { name: "C" }], 3);
  const h = gx.cell(2, 2); h.explored = true; h.type = "planet"; h.planet = planet(1); h.owner = 1;
  const r = gx.surrender(1);
  check("Resa", r.ok && gx.player(1).eliminated && h.owner == null && gx.fleetsOf(1).length === 0 && gx.winner == null);
}

// IA al Mercato e al Casinò, bilancio delle battaglie nel diario
const aiBuy = g.log.filter((l) => l.includes("acquista al Mercato")).length, aiSell = g.log.filter((l) => l.includes(" vende ")).length;
console.log("IA al Mercato/Casinò: offerte comprate " + aiBuy + ", vendite " + aiSell);
const bl = g.log.filter((l) => l.includes("Forze:") || l.includes("Perdite:")).slice(0, 2);
for (const l of bl) console.log("  diario: " + l.trim());
check("Bilancio battaglie nel diario", bl.length >= 2);

const all = results.every(Boolean);
console.log(all ? "SANITY OK: il motore web gira e le regole sono quelle del gioco per PC/Mac." : "SANITY FALLITO");
process.exit(all ? 0 : 1);
