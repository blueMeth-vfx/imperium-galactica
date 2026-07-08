// ============================================================================
// net.js — Client di rete per il multiplayer (WebSocket verso il Worker).
// Nessuna logica di gioco: si limita a inviare/ricevere lo stato e gli eventi.
// ============================================================================
(function () {
  const IGNet = {
    ws: null, seat: -1, isHost: false, started: false, roster: [], code: null, name: null, serverUrl: null,
    handlers: {},
    on(ev, fn) { this.handlers[ev] = fn; return this; },
    emit(ev, data) { if (this.handlers[ev]) this.handlers[ev](data); },

    connect(serverUrl, code, name) {
      this.serverUrl = serverUrl; this.code = String(code || "").toUpperCase(); this.name = name;
      // ws:// per http locale, wss:// altrove
      let base = serverUrl.trim().replace(/\/$/, "");
      if (!/^wss?:\/\//.test(base)) base = (location.protocol === "https:" ? "wss://" : "ws://") + base;
      const url = base + "/room/" + encodeURIComponent(this.code);
      try { this.ws = new WebSocket(url); } catch (e) { this.emit("error", { msg: "URL server non valido." }); return; }
      this.ws.onopen = () => { this.send({ t: "hello", name: this.name }); this.emit("open"); };
      this.ws.onclose = () => this.emit("close");
      this.ws.onerror = () => this.emit("error", { msg: "Connessione al server fallita." });
      this.ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (m.t === "welcome") { this.seat = m.seat; this.isHost = m.isHost; this.started = m.started; this.roster = m.roster || []; }
        else if (m.t === "roster") { this.roster = m.roster || []; }
        else if (m.t === "started") { this.started = true; if (m.roster) this.roster = m.roster; }
        this.emit(m.t, m);
      };
    },
    send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },
    start(state, numPlayers) { this.send({ t: "start", state: state, numPlayers: numPlayers }); },
    pushState(state) { this.send({ t: "state", state: state }); },
    sendEvent(text) { this.send({ t: "event", text: text }); },
    sendChat(text) { this.send({ t: "chat", text: text }); },
    sendCombat(obj) { this.send(Object.assign({ t: "combat" }, obj)); },
    close() { try { this.ws && this.ws.close(); } catch (e) {} },
  };
  window.IGNet = IGNet;
})();
