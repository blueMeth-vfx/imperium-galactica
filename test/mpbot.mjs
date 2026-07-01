// Client di test multiplayer (giocatore 2 "bot"): entra, e quando è il suo turno
// termina il turno e rimanda lo stato. Serve solo per collaudare la sincronizzazione.
await import("../data/gamedata.js"); await import("../engine/config.js"); await import("../engine/hex.js");
await import("../engine/game.js"); await import("../engine/combat.js"); await import("../engine/casino.js");
await import("../engine/market.js"); await import("../engine/ai.js");
const IG = globalThis.IG;
const ROOM = process.argv[2] || "MPTEST";
const ws = new WebSocket("ws://127.0.0.1:8787/room/" + ROOM);
let seat = -1;
const log = (...a) => console.log("[bot]", ...a);
ws.onopen = () => { ws.send(JSON.stringify({ t: "hello", name: "BotP2" })); log("connesso"); };
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.t === "welcome") { seat = m.seat; log("welcome seat", seat, "host", m.isHost); }
  else if (m.t === "roster") { log("roster:", m.roster.map((r) => r.seat + ":" + r.name).join(", ")); }
  else if (m.t === "started" || m.t === "state") {
    const g = IG.Game.fromState(m.state);
    log(m.t, "turno", g.turnNumber, "currentPlayer", g.currentPlayer, "(io=seat " + seat + ")");
    if (g.currentPlayer === seat && g.winner == null) {
      log("  → mio turno: gioco e passo");
      g.advancePhase(); g.advancePhase(); g.advancePhase();
      ws.send(JSON.stringify({ t: "state", state: g.toState() }));
      log("  → inviato, ora currentPlayer", g.currentPlayer);
    }
  } else if (m.t === "error") { log("ERRORE:", m.msg); }
};
ws.onclose = () => log("chiuso");
