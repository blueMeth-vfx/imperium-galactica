// ============================================================================
// Imperium Galactica — Server multiplayer (Cloudflare Worker + Durable Object)
//
// Modello: "turn-based a stato condiviso, client fidati".
//  - Il client HOST costruisce la partita (new IG.Game) e invia lo stato iniziale.
//  - Ogni azione del giocatore di turno invia lo stato aggiornato al server, che lo
//    valida (solo il giocatore di turno può scrivere) e lo ritrasmette agli altri.
//  - Il server NON esegue il motore: è un relay + gestione posti + guardia sul turno.
//
// Protocollo messaggi (JSON su WebSocket):
//   client -> server: {t:'hello', name} | {t:'start', state, numPlayers} | {t:'state', state} | {t:'event', text}
//   server -> client: {t:'welcome',...} | {t:'roster',...} | {t:'started', state} | {t:'state', state} | {t:'event', text} | {t:'error', msg}
// ============================================================================

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.conns = new Map();   // id -> {id, ws, seat, name}
    this.seats = [];          // seat(index) -> name  (posti assegnati)
    this.game = null;         // ultimo stato di gioco (JSON)
    this.started = false;
    this.numPlayers = 0;
    this.hostSeat = null;     // seat del creatore della stanza
    this.nextId = 1;
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    const conn = { id: this.nextId++, ws: server, seat: -1, name: null };
    this.conns.set(conn.id, conn);
    server.addEventListener("message", (ev) => this.onMessage(conn, ev.data));
    const drop = () => { this.conns.delete(conn.id); this.broadcastRoster(); };
    server.addEventListener("close", drop);
    server.addEventListener("error", drop);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(conn, obj) { try { conn.ws.send(JSON.stringify(obj)); } catch (e) {} }
  broadcast(obj, exceptId) { for (const c of this.conns.values()) if (c.id !== exceptId) this.send(c, obj); }
  all(obj) { for (const c of this.conns.values()) this.send(c, obj); }

  roster() {
    return this.seats.map((name, seat) => ({
      seat, name,
      connected: [...this.conns.values()].some((c) => c.seat === seat),
    }));
  }
  broadcastRoster() { this.all({ t: "roster", roster: this.roster(), hostSeat: this.hostSeat }); }

  onMessage(conn, data) {
    // Difesa: rifiuta messaggi enormi (abuso di risorse). Lo stato di gioco reale
    // è di pochi KB; 256KB è un tetto molto generoso.
    if (typeof data === "string" && data.length > 262144) return;
    let m;
    try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== "object" || typeof m.t !== "string") return;

    if (m.t === "hello") {
      const name = (m.name || "Giocatore").slice(0, 24);
      let seat = this.seats.indexOf(name);
      if (seat === -1) {
        if (this.started) seat = -1;                    // partita già iniziata -> spettatore
        else if (this.seats.length < 4) { seat = this.seats.length; this.seats.push(name); }
        else seat = -1;                                 // stanza piena
      }
      conn.seat = seat; conn.name = name;
      if (this.hostSeat === null && seat === 0) this.hostSeat = 0;
      this.send(conn, {
        t: "welcome", seat, isHost: seat === this.hostSeat, started: this.started,
        numPlayers: this.numPlayers, roster: this.roster(), hostSeat: this.hostSeat, state: this.game,
      });
      this.broadcastRoster();
      return;
    }

    if (m.t === "start") {
      if (conn.seat !== this.hostSeat || this.started) return;
      this.started = true;
      this.numPlayers = m.numPlayers || this.seats.length;
      // Se lo stato porta i nomi dei giocatori (bot inclusi, o partita salvata),
      // adotta quei posti così i rientri per nome combaciano (ripresa online).
      if (m.state && Array.isArray(m.state.players) && m.state.players.length) {
        this.seats = m.state.players.map((p) => p.name);
      } else {
        this.seats = this.seats.slice(0, this.numPlayers);
      }
      this.numPlayers = this.seats.length;
      this.game = m.state;
      this.all({ t: "started", state: this.game, roster: this.roster(), numPlayers: this.numPlayers, hostSeat: this.hostSeat });
      return;
    }

    if (m.t === "state") {
      if (!this.started || !m.state) return;
      // Solo il giocatore di turno può aggiornare — MA l'host può inviare i turni
      // dei bot IA (il cui posto non ha una connessione).
      if (this.game && this.game.currentPlayer !== conn.seat) {
        const cp = this.game.players && this.game.players[this.game.currentPlayer];
        const isBotTurn = cp && cp.isAI;
        if (!(isBotTurn && conn.seat === this.hostSeat)) {
          this.send(conn, { t: "error", msg: "Non è il tuo turno." });
          return;
        }
      }
      this.game = m.state;
      this.broadcast({ t: "state", state: this.game }, conn.id);
      return;
    }

    if (m.t === "event") {
      this.broadcast({ t: "event", text: (m.text || "").slice(0, 200), seat: conn.seat }, conn.id);
      return;
    }

    if (m.t === "chat") {
      const text = (m.text || "").slice(0, 300);
      if (!text) return;
      this.broadcast({ t: "chat", text: text, name: conn.name, seat: conn.seat }, conn.id);
      return;
    }

    // Combattimento interattivo online: relay dei messaggi (start / tiri di dado)
    // agli altri connessi. Così il difensore lancia i propri dadi di difesa.
    if (m.t === "combat") {
      this.broadcast(Object.assign({}, m, { fromSeat: conn.seat }), conn.id);
      return;
    }
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    // Rotta WebSocket: /room/<CODICE>
    if (parts[0] === "room" && parts[1]) {
      const id = env.ROOMS.idFromName(parts[1].toUpperCase());
      return env.ROOMS.get(id).fetch(req);
    }
    return new Response("Imperium Galactica — server multiplayer attivo.", {
      status: 200, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
};
