// ============================================================================
// simulate.js — Partita simulata (tutti IA) per validare il motore senza UI.
// Avvio:  node test/simulate.js [turniMax] [seed]
// ============================================================================
require("../data/gamedata.js");
require("../engine/config.js");
require("../engine/hex.js");
require("../engine/game.js");
require("../engine/combat.js");
require("../engine/casino.js");
require("../engine/market.js");
require("../engine/ai.js");

const IG = globalThis.IG;
const turniMax = parseInt(process.argv[2] || "60", 10);
const seed = parseInt(process.argv[3] || "7", 10);

const game = new IG.Game({
  seed,
  players: [
    { name: "IA Rosso", isAI: true },
    { name: "IA Blu", isAI: true },
    { name: "IA Verde", isAI: true },
    { name: "IA Giallo", isAI: true },
  ],
});

console.log("== Partita simulata (seed " + seed + ", max " + turniMax + " turni) ==\n");

let safety = 0;
while (!game.winner && game.turnNumber <= turniMax && safety++ < 5000) {
  try {
    IG.runAITurn(game);
  } catch (e) {
    console.error("ERRORE al turno " + game.turnNumber + " (" + game.player(game.currentPlayer).colorName + "):");
    console.error(e);
    process.exit(1);
  }
}

// --- Riepilogo finale ---
console.log("\n--- Ultimi eventi ---");
console.log(game.log.slice(-25).join("\n"));

console.log("\n--- Stato finale (turno " + game.turnNumber + ") ---");
let explored = 0, total = 0;
for (const k in game.board) { total++; if (game.board[k].explored) explored++; }
console.log("Celle esplorate: " + explored + "/" + total);
for (const p of game.players) {
  const planets = game.planetsOf(p.id).length;
  const fleets = game.fleetsOf(p.id).length;
  const ships = game.fleetsOf(p.id).reduce((a, f) => a + game.fleetShipCount(f), 0);
  console.log(
    (p.eliminated ? "☠ " : "  ") + p.colorName.padEnd(7) +
    " | pianeti: " + planets + " | flotte: " + fleets + " | navi: " + ships +
    " | Ndri: " + p.money + " | C" + p.res.carburante + " M" + p.res.metallo + " P" + p.res.pietra);
}
console.log("\nVincitore: " + (game.winner == null ? "(nessuno entro il limite)" : game.winner === -1 ? "pareggio" : game.player(game.winner).colorName));
