// ============================================================================
// ui.js — Interfaccia grafica (DOM/SVG). Nessuna logica di regole: chiama solo
// l'API del motore (IG.Game). Hot-seat + turni IA.
// ============================================================================
(function () {
  const IG = window.IG;
  const CFG = IG.CONFIG;
  const Hex = IG.Hex;
  const Snd = window.IGSound || { resume() {}, click() {}, turnStart() {}, passTurn() {}, chatSend() {}, chatReceive() {}, dice() {}, move() {}, laser() {}, boom() {}, startMusic() {}, stopMusic() {}, toggleSfx() { return true; }, toggleMusic() { return true; }, sfxMuted: false, musicMuted: false };
  const SVGNS = "http://www.w3.org/2000/svg";
  const HEX_SIZE = 40;
  const MARGIN = HEX_SIZE + 52; // spazio extra per gli inventari agli angoli (sopra/sotto)
  const SHIP_SCALE = 1.15;      // navi più piccole degli esagoni

  let game = null;
  let sel = { fleetId: null, cellKey: null };
  let moveAnim = null; // {fleetId, fromX, fromY} per animare lo spostamento
  let startDiceShown = false; // dadi d'inizio già mostrati per questa partita

  // --- Stato multiplayer online ---
  let onlineMode = false;    // partita online (via server) vs locale hot-seat
  let myPlayerId = -1;       // il mio seat/fazione online
  let applyingRemote = false; // true mentre applico uno stato ricevuto (evita loop di sync)
  let lastLogLen = 0;        // per mostrare come banner i nuovi eventi ricevuti
  let lastMoveLen = 0;       // per mostrare le frecce dei nuovi spostamenti ricevuti
  let lastTurnKey = null;    // per suonare l'inizio di ogni nuovo turno una sola volta
  function isMyTurn() { return !onlineMode || (game && game.currentPlayer === myPlayerId && game.winner == null); }
  // Puoi comandare ora? (online: solo nel tuo turno; locale: se il giocatore non è IA)
  function canControl() {
    if (!game || game.winner != null) return false;
    if (onlineMode) return game.currentPlayer === myPlayerId;
    return !game.player(game.currentPlayer).isAI;
  }
  function syncNet() { if (onlineMode && !applyingRemote && window.IGNet) { IGNet.pushState(game.toState()); lastLogLen = game.log.length; lastMoveLen = (game.moveLog || []).length; } }

  // ---------------------------------------------------------------- helpers DOM
  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, text) {
    const e = document.createElementNS(typeof attrs === "object" && attrs && attrs._svg ? SVGNS : null, tag);
    return e;
  }
  function svgEl(tag, attrs) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function htmlEl(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Rende `elem` trascinabile afferrando `handle`. Se non c'è trascinamento
  // (solo un clic), esegue `onClick`. Salva la posizione in localStorage(`key`).
  function makeDraggable(elem, handle, onClick, key) {
    let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
    handle.style.touchAction = "none";
    const down = (e) => {
      dragging = true; moved = false;
      const p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      const rect = elem.getBoundingClientRect();
      ox = rect.left; oy = rect.top;
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    };
    const move = (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      let nl = Math.max(4, Math.min(window.innerWidth - 60, ox + dx));
      let nt = Math.max(4, Math.min(window.innerHeight - 30, oy + dy));
      elem.style.left = nl + "px"; elem.style.top = nt + "px";
      elem.style.right = "auto"; elem.style.bottom = "auto";
    };
    const up = () => {
      dragging = false;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (!moved) { if (onClick) onClick(); }
      else if (key) { const r = elem.getBoundingClientRect(); try { localStorage.setItem(key, JSON.stringify({ left: r.left, top: r.top })); } catch (e) {} }
    };
    handle.addEventListener("pointerdown", down);
  }

  function toast(msg) {
    let t = $("toast");
    if (!t) { t = htmlEl("div"); t.id = "toast"; t.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#22304e;border:1px solid #3f5b94;padding:9px 16px;border-radius:8px;z-index:99;font-size:14px;box-shadow:0 6px 20px rgba(0,0,0,.5)"; document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = "1";
    clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = "0"; }, 2200);
  }

  // ---------------------------------------------------------------- SETUP
  function buildPlayerRows() {
    const n = parseInt($("numPlayers").value, 10);
    const wrap = $("playerRows"); wrap.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const row = htmlEl("div", "player-row");
      const sw = htmlEl("span", "swatch"); sw.style.background = CFG.COLORS[i];
      const name = htmlEl("input"); name.type = "text"; name.value = "Giocatore " + (i + 1); name.dataset.idx = i;
      const aiLabel = htmlEl("label"); aiLabel.style.cssText = "display:flex;align-items:center;gap:4px;margin:0;font-size:13px;white-space:nowrap";
      const ai = htmlEl("input"); ai.type = "checkbox"; ai.dataset.idx = i; ai.className = "ai-check";
      aiLabel.appendChild(ai); aiLabel.appendChild(document.createTextNode("IA"));
      // Difficoltà (visibile solo se IA)
      const diff = htmlEl("select", "ai-diff"); diff.style.display = "none";
      for (const key in CFG.DIFFICULTY) { const o = htmlEl("option"); o.value = key; o.textContent = CFG.DIFFICULTY[key].label; diff.appendChild(o); }
      diff.value = CFG.DEFAULT_DIFFICULTY;
      ai.addEventListener("change", () => { diff.style.display = ai.checked ? "" : "none"; });
      row.appendChild(sw); row.appendChild(name); row.appendChild(aiLabel); row.appendChild(diff);
      wrap.appendChild(row);
    }
  }

  function startGame() {
    const rows = document.querySelectorAll("#playerRows .player-row");
    const players = [];
    rows.forEach((row, i) => {
      players.push({
        name: row.querySelector('input[type=text]').value || ("Giocatore " + (i + 1)),
        isAI: row.querySelector('.ai-check').checked,
        difficulty: row.querySelector('.ai-diff').value,
      });
    });
    const seedVal = $("seed").value;
    const opts = { players };
    if (seedVal) opts.seed = parseInt(seedVal, 10);
    game = new IG.Game(opts);
    onlineMode = false; myPlayerId = -1; startDiceShown = false; lastTurnKey = null;
    $("setup").classList.add("hidden");
    $("game").classList.remove("hidden");
    sel = { fleetId: null, cellKey: null };
    Snd.resume(); Snd.startMusic();
    render();
    centerBoard();
    startDiceShown = true;
    showStartDice(() => checkTurn()); // lancio dei dadi d'inizio, poi via
  }

  // ==================== ONLINE / LOBBY ====================
  function initOnlineUI() {
    $("tabLocal").onclick = () => { $("tabLocal").classList.add("active"); $("tabOnline").classList.remove("active"); $("localSetup").classList.remove("hidden"); $("onlineSetup").classList.add("hidden"); };
    $("tabOnline").onclick = () => { $("tabOnline").classList.add("active"); $("tabLocal").classList.remove("active"); $("onlineSetup").classList.remove("hidden"); $("localSetup").classList.add("hidden"); prefillOnline(); };
    $("onGen").onclick = () => { $("onCode").value = randomCode(); };
    $("onConnect").onclick = connectOnline;
  }
  function randomCode() { const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
  const DEFAULT_SERVER = "wss://imperium-mp.matteocongedo-vfx.workers.dev"; // server multiplayer già pronto
  function prefillOnline() {
    let saved = localStorage.getItem("ig_server");
    if (!saved || /tuosub|tuo-?sottodominio/.test(saved)) saved = DEFAULT_SERVER; // ignora vecchi segnaposto
    if (!$("onServer").value) $("onServer").value = saved;
    if (!$("onName").value) $("onName").value = localStorage.getItem("ig_name") || "";
    if (!$("onCode").value) $("onCode").value = randomCode();
  }
  function connectOnline() {
    const name = ($("onName").value || "").trim() || "Giocatore";
    const code = ($("onCode").value || "").trim().toUpperCase();
    const server = ($("onServer").value || "").trim();
    if (!code) { $("onStatus").textContent = "Inserisci un codice stanza."; return; }
    if (!server) { $("onStatus").textContent = "Inserisci l'indirizzo del server."; return; }
    localStorage.setItem("ig_server", server); localStorage.setItem("ig_name", name);
    $("onStatus").textContent = "Connessione…";
    const N = window.IGNet;
    N.on("open", () => { $("onStatus").textContent = "Connesso."; });
    N.on("error", (d) => { $("onStatus").textContent = "⚠ " + ((d && d.msg) || "Errore di connessione."); });
    N.on("close", () => { if (!onlineMode) $("onStatus").textContent = "Connessione chiusa."; else toast("Disconnesso dal server."); });
    N.on("welcome", (m) => { if (m.seat < 0) toast("Stanza piena / partita già iniziata: sei spettatore."); enterLobby(); initChat(); if (m.started && m.state) applyRemoteState(m.state); });
    N.on("roster", () => renderLobby());
    N.on("started", (m) => applyRemoteState(m.state));
    N.on("state", (m) => applyRemoteState(m.state));
    N.on("chat", (m) => addChatMessage(m.name, m.seat, m.text, false));
    N.on("combat", (m) => onNetCombat(m));
    N.connect(server, code, name);
  }

  // ---------------------------------------------------------------- CHAT ONLINE
  function initChat() {
    if ($("chatWidget")) { $("chatWidget").classList.remove("hidden"); return; }
    const w = htmlEl("div"); w.id = "chatWidget"; w.className = "collapsed";
    w.innerHTML =
      '<div id="chatHeader">💬 Chat <span id="chatBadge"></span><span id="chatToggle">▸</span></div>' +
      '<div id="chatBody">' +
      '<div id="chatMessages"></div>' +
      '<div id="chatInputRow"><input id="chatInput" type="text" placeholder="Scrivi un messaggio…" maxlength="300" /><button id="chatSend" class="primary small">Invia</button></div>' +
      "</div>";
    document.body.appendChild(w);
    // Posizione salvata (il widget è trascinabile dall'intestazione)
    try {
      const pos = JSON.parse(localStorage.getItem("ig_chatpos") || "null");
      if (pos && typeof pos.left === "number") { w.style.left = pos.left + "px"; w.style.top = pos.top + "px"; w.style.right = "auto"; w.style.bottom = "auto"; }
    } catch (e) {}
    const toggleChat = () => {
      w.classList.toggle("collapsed");
      $("chatToggle").textContent = w.classList.contains("collapsed") ? "▸" : "▾";
      if (!w.classList.contains("collapsed")) { $("chatBadge").textContent = ""; chatUnread = 0; $("chatInput").focus(); }
    };
    makeDraggable(w, $("chatHeader"), toggleChat, "ig_chatpos");
    $("chatSend").onclick = sendChatMessage;
    $("chatInput").onkeydown = (e) => { if (e.key === "Enter") sendChatMessage(); };
  }
  let chatUnread = 0;
  function sendChatMessage() {
    const inp = $("chatInput"); if (!inp) return;
    const text = inp.value.trim(); if (!text) return;
    window.IGNet.sendChat(text);
    Snd.chatSend();
    addChatMessage(window.IGNet.name, window.IGNet.seat, text, true);
    inp.value = "";
  }
  function addChatMessage(name, seat, text, mine) {
    initChat();
    const box = $("chatMessages"); if (!box) return;
    const color = (seat != null && seat >= 0) ? CFG.COLORS[seat] : "#8593b5";
    const msg = htmlEl("div", "chat-msg" + (mine ? " mine" : ""));
    msg.innerHTML = '<span class="cm-name" style="color:' + color + '">' + esc(name || "?") + "</span> " + esc(text);
    box.appendChild(msg);
    box.scrollTop = box.scrollHeight;
    if (!mine) Snd.chatReceive();
    const w = $("chatWidget");
    if (!mine && w && w.classList.contains("collapsed")) { chatUnread++; $("chatBadge").textContent = chatUnread; }
  }
  function enterLobby() {
    $("setup").classList.add("hidden");
    $("lobby").classList.remove("hidden");
    $("lobbyCode").textContent = window.IGNet.code;
    renderLobby();
  }
  function renderLobby() {
    const N = window.IGNet;
    const box = $("lobbyRoster"); box.innerHTML = "";
    (N.roster || []).forEach((pl) => {
      const row = htmlEl("div", "lobby-player");
      row.innerHTML = '<span class="dot" style="background:' + CFG.COLORS[pl.seat] + '"></span> <b>' + esc(pl.name) + "</b>" +
        (pl.seat === N.seat ? ' <span class="tag">tu</span>' : "") + (pl.seat === 0 ? ' <span class="tag">host</span>' : "") +
        (pl.connected ? "" : ' <span class="muted">(offline)</span>');
      box.appendChild(row);
    });
    const acts = $("lobbyActions"); acts.innerHTML = "";
    if (N.isHost) {
      const n = (N.roster || []).length;
      const b = htmlEl("button", "primary", "Avvia partita (" + n + " giocatori)");
      b.disabled = n < 2; b.onclick = hostStart; acts.appendChild(b);
      $("lobbyHint").textContent = n < 2 ? "Servono almeno 2 giocatori (aspetta che entrino con il codice)." : "Sei l'host: avvia quando siete tutti dentro.";
    } else {
      $("lobbyHint").textContent = "In attesa che l'host avvii la partita…";
    }
  }
  function hostStart() {
    const N = window.IGNet;
    const players = (N.roster || []).map((pl) => ({ name: pl.name, isAI: false }));
    const g = new IG.Game({ players: players });
    N.start(g.toState(), players.length); // lo stato torna a tutti via 'started'
  }
  function applyRemoteState(state) {
    if (!state) return;
    applyingRemote = true;
    game = IG.Game.fromState(state);
    onlineMode = true;
    myPlayerId = window.IGNet.seat;
    $("setup").classList.add("hidden"); $("lobby").classList.add("hidden"); $("game").classList.remove("hidden");
    sel = { fleetId: null, cellKey: null };
    const newLines = game.log.slice(lastLogLen);
    lastLogLen = game.log.length;
    // Spostamenti nuovi (esclusi i miei, già visti localmente) → frecce sul tabellone
    const allMoves = game.moveLog || [];
    const newMoves = allMoves.slice(lastMoveLen).filter((m) => m.owner !== myPlayerId).slice(-6);
    lastMoveLen = allMoves.length;
    Snd.startMusic();
    render(); centerBoard();
    applyingRemote = false;
    // Dadi d'inizio (una sola volta, alla prima ricezione dello stato)
    if (!startDiceShown) { startDiceShown = true; showStartDice(() => {}); }
    showRemoteMoves(newMoves);
    showRemoteEvents(newLines);
    maybeTurnSound();
    if (game.winner != null) showWin();
    else if (!isMyTurn()) toast("Turno di " + game.player(game.currentPlayer).name);
    else toast("È il tuo turno!");
  }
  // Riproduce sul tabellone le frecce degli spostamenti altrui (online)
  function showRemoteMoves(moves) {
    if (!moves || !moves.length) return;
    let i = 0;
    (function next() {
      if (i >= moves.length) return;
      const m = moves[i++];
      const pl = game.player(m.owner) || { color: "#fff", name: "?" };
      showMoveArrow(m.fromQ, m.fromR, m.toQ, m.toR, pl.color);
      Snd.move();
      bottomInfo('<b style="color:' + pl.color + '">' + esc(pl.name) + "</b> muove → (" + m.toQ + "," + m.toR + ")", pl.color);
      setTimeout(next, 650);
    })();
  }
  // Suona l'inizio di un turno una sola volta (quando cambia il turno/giocatore)
  function maybeTurnSound() {
    if (!game || game.winner != null) return;
    const key = game.turnNumber + ":" + game.currentPlayer;
    if (key !== lastTurnKey) { lastTurnKey = key; Snd.turnStart(); }
  }
  function showRemoteEvents(lines) {
    const events = [];
    for (const l of lines) {
      if (/conquista/.test(l)) events.push(["malus", "⚔️", "🚩", l]);
      else if (/colonizza/.test(l)) events.push(["discovery", "🛰️", "🪐", l]);
      else if (/riscuote/.test(l)) events.push(["bonus", "💰", "💰", l]);
      else if (/produce/.test(l)) events.push(["discovery", "🏭", "🏭", l]);
      else if (/costruisce/.test(l)) events.push(["discovery", "🏗️", "🏗️", l]);
      else if (/eliminato/.test(l)) events.push(["malus", "☠️", "☠️", l]);
    }
    events.slice(0, 6).forEach((e) => flashBanner(e[0], e[1], e[2], e[3], ""));
  }
  // ---------------------------------------------------------------- VISTA DINAMICA (zoom/pan FLUIDI)
  // La vista non salta mai: scivola sempre verso un obiettivo (interpolazione rAF).
  let boardView = { zoom: 1, cx: null, cy: null }; // vista corrente (renderizzata)
  let viewTarget = null;                            // obiettivo verso cui la vista scivola
  let viewRAF = null;
  let boardPan = null, justPanned = false;
  function centerBoard() { initBoardControls(); viewTarget = null; boardView = { zoom: 1, cx: null, cy: null }; applyBoardView(); updateZoomLabel(); }

  function clampView(v) {
    const svg = $("board"); if (!svg || !svg._full) return v;
    const f = svg._full;
    const z = Math.max(1, Math.min(4.5, v.zoom));
    const w = f.w / z, h = f.h / z;
    let cx = v.cx == null ? f.w / 2 : v.cx, cy = v.cy == null ? f.h / 2 : v.cy;
    cx = Math.max(w / 2, Math.min(f.w - w / 2, cx));
    cy = Math.max(h / 2, Math.min(f.h - h / 2, cy));
    return { zoom: z, cx: cx, cy: cy };
  }
  function applyBoardView() {
    const svg = $("board"); if (!svg || !svg._full) return;
    boardView = clampView(boardView);
    const f = svg._full, w = f.w / boardView.zoom, h = f.h / boardView.zoom;
    svg.setAttribute("viewBox", (boardView.cx - w / 2).toFixed(2) + " " + (boardView.cy - h / 2).toFixed(2) + " " + w.toFixed(2) + " " + h.toFixed(2));
  }
  function setViewTarget(t) {
    viewTarget = clampView(Object.assign({}, clampView(boardView), t));
    if (!viewRAF) viewStep();
  }
  function viewStep() {
    viewRAF = requestAnimationFrame(() => {
      if (!viewTarget) { viewRAF = null; return; }
      const k = 0.16; // fattore di inseguimento: più basso = più morbido
      boardView = clampView(boardView);
      boardView.zoom += (viewTarget.zoom - boardView.zoom) * k;
      boardView.cx += (viewTarget.cx - boardView.cx) * k;
      boardView.cy += (viewTarget.cy - boardView.cy) * k;
      const done = Math.abs(viewTarget.zoom - boardView.zoom) < 0.003 &&
                   Math.abs(viewTarget.cx - boardView.cx) < 0.4 && Math.abs(viewTarget.cy - boardView.cy) < 0.4;
      if (done) { boardView = Object.assign({}, viewTarget); viewTarget = null; }
      applyBoardView(); updateZoomLabel();
      if (viewTarget) viewStep(); else viewRAF = null;
    });
  }
  function zoomBy(factor, clientX, clientY) {
    const svg = $("board"); if (!svg || !svg._full) return;
    const f = svg._full;
    const cur = viewTarget || clampView(boardView);
    const nz = Math.max(1, Math.min(4.5, cur.zoom * factor));
    const t = { zoom: nz, cx: cur.cx, cy: cur.cy };
    if (clientX != null) {
      // zoom ancorato al cursore: il punto sotto il mouse resta fermo
      const vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect();
      const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
      const offX = (rect.width - vb.width * scale) / 2, offY = (rect.height - vb.height * scale) / 2;
      const relx = (clientX - rect.left - offX) / (vb.width * scale);
      const rely = (clientY - rect.top - offY) / (vb.height * scale);
      const bx = vb.x + relx * vb.width, by = vb.y + rely * vb.height;
      const nw = f.w / nz, nh = f.h / nz;
      t.cx = bx - (relx - 0.5) * nw; t.cy = by - (rely - 0.5) * nh;
    }
    setViewTarget(t);
  }
  function focusCell(q, r) { // segue la flotta se la vista è zoomata
    if (boardView.zoom <= 1.02 && !viewTarget) return;
    const c = hexCenter(q, r); setViewTarget({ cx: c.x, cy: c.y });
  }
  // Vola dolcemente su una cella (usato dalle carte-pianeta)
  function flyToCell(q, r, zoom) {
    const c = hexCenter(q, r);
    setViewTarget({ zoom: zoom || Math.max(2.2, boardView.zoom), cx: c.x, cy: c.y });
  }
  function onBoardWheel(e) { if (!$("board") || !$("board")._full) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }
  function onBoardPointerDown(e) {
    if (boardView.zoom <= 1 && !viewTarget) return;
    const svg = $("board"); if (!svg) return; const vb = svg.viewBox.baseVal, rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / vb.width, rect.height / vb.height);
    viewTarget = null; // il trascinamento prende il controllo diretto della vista
    boardPan = { x: e.clientX, y: e.clientY, cx: boardView.cx, cy: boardView.cy, scale: scale, moved: false };
    window.addEventListener("pointermove", onBoardPointerMove);
    window.addEventListener("pointerup", onBoardPointerUp);
  }
  function onBoardPointerMove(e) {
    if (!boardPan) return;
    const dx = e.clientX - boardPan.x, dy = e.clientY - boardPan.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) boardPan.moved = true;
    boardView.cx = boardPan.cx - dx / boardPan.scale; boardView.cy = boardPan.cy - dy / boardPan.scale;
    applyBoardView();
  }
  function onBoardPointerUp() {
    if (boardPan && boardPan.moved) { justPanned = true; setTimeout(() => { justPanned = false; }, 60); }
    boardPan = null;
    window.removeEventListener("pointermove", onBoardPointerMove);
    window.removeEventListener("pointerup", onBoardPointerUp);
  }
  function updateZoomLabel() { const l = $("zoomLabel"); if (l) l.textContent = Math.round(boardView.zoom * 100) + "%"; }

  // ---------------------------------------------------------------- STELLE CADENTI
  // Ogni 4-10 secondi una cometa attraversa un tratto casuale del tabellone.
  let shootingTimer = null;
  function startShootingStars() {
    if (shootingTimer) return;
    const schedule = () => { shootingTimer = setTimeout(() => { spawnShootingStar(); schedule(); }, 4000 + Math.random() * 6000); };
    schedule();
  }
  function spawnShootingStar() {
    const svg = $("board");
    if (!svg || !svg._full || $("game").classList.contains("hidden")) return;
    const f = svg._full;
    // punto di partenza e direzione casuali (traiettoria diagonale)
    const x0 = Math.random() * f.w, y0 = Math.random() * f.h * 0.7;
    const ang = (20 + Math.random() * 50) * (Math.PI / 180) * (Math.random() < 0.5 ? 1 : -1);
    const len = 120 + Math.random() * 180;
    const dx = Math.cos(ang) * len, dy = Math.abs(Math.sin(ang)) * len * 0.6;
    const g = svgEl("g", { class: "shooting-star" });
    // scia (dietro la testa, direzione opposta al moto)
    const tail = svgEl("line", { x1: 0, y1: 0, x2: -dx * 0.22, y2: -dy * 0.22, stroke: "#dff0ff", "stroke-width": 1.6, "stroke-linecap": "round", opacity: 0.85 });
    const head = svgEl("circle", { cx: 0, cy: 0, r: 1.7, fill: "#ffffff" });
    g.appendChild(tail); g.appendChild(head);
    const dur = (0.9 + Math.random() * 0.7).toFixed(2);
    const at = svgEl("animateTransform", { attributeName: "transform", type: "translate", from: x0 + " " + y0, to: (x0 + dx) + " " + (y0 + dy), dur: dur + "s", begin: "0s", fill: "freeze" });
    const fade = svgEl("animate", { attributeName: "opacity", values: "0;1;1;0", keyTimes: "0;0.15;0.7;1", dur: dur + "s", begin: "0s", fill: "freeze" });
    g.appendChild(at); g.appendChild(fade);
    svg.appendChild(g);
    setTimeout(() => { try { g.remove(); } catch (e) {} }, dur * 1000 + 150);
  }
  function initBoardControls() {
    const wrap = $("boardWrap"); if (!wrap) return;
    startShootingStars();
    if (!wrap._zoomInit) {
      wrap.addEventListener("wheel", onBoardWheel, { passive: false });
      wrap.addEventListener("pointerdown", onBoardPointerDown);
      wrap._zoomInit = true;
    }
    if ($("boardZoom")) return;
    const z = htmlEl("div"); z.id = "boardZoom";
    z.innerHTML = '<button id="zoomIn" title="Ingrandisci">＋</button><span id="zoomLabel">100%</span><button id="zoomOut" title="Riduci">－</button><button id="zoomReset" title="Adatta alla finestra">⤢</button>';
    wrap.appendChild(z);
    $("zoomIn").onclick = () => zoomBy(1.35);
    $("zoomOut").onclick = () => zoomBy(1 / 1.35);
    $("zoomReset").onclick = () => setViewTarget({ zoom: 1, cx: null, cy: null });
  }

  // ---------------------------------------------------------------- RENDER
  function render() {
    renderBoard();
    renderTop();
    renderPlayerPanel();
    renderSelection();
    renderLog();
    updatePlanetPin();
    renderPlanetHand();
  }

  // ---------------------------------------------------------------- MANO DELLE CARTE-PIANETA
  // I tuoi pianeti come carte "in mano" (ventaglio in basso): passa il mouse per
  // vedere la carta completa con l'illustrazione animata; clic → la vista vola lì.
  function handOwner() {
    if (onlineMode) return myPlayerId >= 0 ? myPlayerId : null;
    const p = game.player(game.currentPlayer);
    if (!p.isAI) return p.id;
    const h = game.players.find((x) => !x.isAI && x.alive !== false);
    return h ? h.id : null;
  }
  function renderPlanetHand() {
    let hand = $("planetHand");
    if (!hand) { hand = htmlEl("div"); hand.id = "planetHand"; document.body.appendChild(hand); }
    hand.innerHTML = "";
    if (!game || $("game").classList.contains("hidden")) return;
    const pid = handOwner();
    if (pid == null) return;
    const planets = game.planetsOf(pid);
    const n = planets.length;
    if (!n) return;
    const pl = game.player(pid);
    planets.forEach((cell, i) => {
      const mid = (n - 1) / 2;
      const card = htmlEl("div", "pcard");
      card.style.setProperty("--rot", ((i - mid) * 5) + "deg");
      card.style.setProperty("--lift", (Math.abs(i - mid) * 8) + "px");
      card.style.setProperty("--fc", pl.color);
      // .pcin è la parte visiva che si alza; .pcard resta FERMO come zona
      // sensibile al mouse → niente flickering quando la carta si solleva
      card.innerHTML = '<div class="pcin">' + pcardHTML(cell) + "</div>";
      card.onclick = () => { sel.cellKey = Hex.key(cell.q, cell.r); sel.fleetId = null; flyToCell(cell.q, cell.r); render(); };
      card.onmouseenter = () => pulseCell(cell.q, cell.r); // evidenzia il pianeta sul tabellone
      hand.appendChild(card);
    });
  }
  // Illustrazione CSS del pianeta (sfera con superficie in rotazione)
  function planetArtHTML(tipo, q, r) {
    const dur = (9 + hash(q, r, 5) * 8).toFixed(1);
    return '<div class="planet-art pa-' + tipo + '" style="--dur:' + dur + 's"><div class="surf"></div><div class="hl"></div></div>';
  }
  function pcardHTML(cell) {
    const d = cell.planet.data, b = cell.buildings;
    const bIcons = [["🚀", b.fabbricaNavale], ["🏭", b.fabbricaCarri], ["🏛", b.tesoreria], ["🛰", b.cannone], ["🗼", b.torretta]]
      .filter((x) => x[1] > 0).map((x) => '<span class="pcd-tag">' + x[0] + x[1] + "</span>").join("");
    return '<div class="pcd-band"></div>' +
      planetArtHTML(d.tipo, cell.q, cell.r) +
      '<div class="pcd-name">' + esc(d.nome) + '</div>' +
      '<div class="pcd-type">' + (PLANET_EMOJI[d.tipo] || "") + " " + d.tipo + "</div>" +
      '<div class="pcd"><div class="pcd-stats">' +
      "<span>⚙️×" + d.produttivita + "</span><span>💰×" + d.economia + "</span>" +
      "<span>⛽×" + d.moltMaterie.carburante + "</span><span>🔩×" + d.moltMaterie.metallo + "</span><span>🪨×" + d.moltMaterie.pietra + "</span></div>" +
      '<div class="pcd-row">🏗 ' + (bIcons || '<span class="pcd-none">nessun edificio</span>') + "</div>" +
      '<div class="pcd-row">🛡 🪖' + cell.garrison + (b.cannone ? " 🛰" + b.cannone : "") + (b.torretta ? " 🗼" + b.torretta : "") + "</div></div>";
  }

  const PHASE_LABELS = ["Riscossione", "Produzione", "Movimento", "Costruzione"];
  function renderTop() {
    const p = game.player(game.currentPlayer);
    $("turnInfo").innerHTML =
      '<span class="turn-num">Turno ' + game.turnNumber + '</span>' +
      '<span class="active-faction" style="--fc:' + p.color + '"><span class="fdot"></span>' + esc(p.name) + (p.isAI ? ' <span class="ai-pill">IA</span>' : '') + '</span>';
    // Stepper delle fasi
    let steps = '<div class="stepper">';
    for (let i = 0; i < PHASE_LABELS.length; i++) {
      const st = i < game.phaseIdx ? "done" : i === game.phaseIdx ? "active" : "todo";
      steps += '<div class="step ' + st + '"><span class="step-n">' + (i + 1) + '</span><span class="step-label">' + PHASE_LABELS[i] + '</span></div>';
      if (i < PHASE_LABELS.length - 1) steps += '<span class="step-sep"></span>';
    }
    steps += '</div>';
    $("phaseInfo").innerHTML = steps;
    $("advanceBtn").disabled = !canControl();
    $("advanceBtn").textContent = game.phaseIdx >= IG.PHASES.length - 1 ? "Fine turno ▸" : "Avanza fase ▸";
    if (onlineMode && !isMyTurn() && game.winner == null) $("phaseInfo").innerHTML = '<span class="waiting">⏳ Turno di ' + esc(game.player(game.currentPlayer).name) + '…</span>';
  }

  function renderPlayerPanel() {
    const p = game.player(game.currentPlayer);
    const box = $("playerPanel");
    box.innerHTML = "";
    box.appendChild(htmlEl("h3", null, "Fazione attiva"));
    const name = htmlEl("div", "pname"); name.innerHTML = '<span class="dot" style="background:' + p.color + ';color:' + p.color + '"></span>' + esc(p.name) + (p.isAI ? ' <span class="ai-pill">IA</span>' : '');
    box.appendChild(name);
    const res = htmlEl("div", "res");
    res.innerHTML =
      '<div class="pill money"><span class="ic">💰</span><b>' + p.money.toLocaleString() + '</b> Ndri</div>' +
      '<div class="pill"><span class="ic">⛽</span><b>' + p.res.carburante + '</b> Carb.</div>' +
      '<div class="pill"><span class="ic">🔩</span><b>' + p.res.metallo + '</b> Met.</div>' +
      '<div class="pill"><span class="ic">🪨</span><b>' + p.res.pietra + '</b> Pietra</div>' +
      '<div class="pill"><span class="ic">🪐</span><b>' + game.planetsOf(p.id).length + '</b> pianeti</div>' +
      '<div class="pill"><span class="ic">🚀</span><b>' + game.fleetsOf(p.id).length + '</b> flotte</div>';
    box.appendChild(res);
    // Legenda dei segnalini navi
    const leg = htmlEl("div", "ship-legend");
    leg.innerHTML =
      '<span class="lg">' + legendSwatch("caccia") + "Caccia</span>" +
      '<span class="lg">' + legendSwatch("torpediniera") + "Torpediniera</span>" +
      '<span class="lg">' + legendSwatch("colonia") + "Colonia</span>" +
      '<span class="lg">' + legendSwatch("carri") + "Carri</span>";
    box.appendChild(leg);
  }
  // Mini-silhouette della nave (per la legenda e i pulsanti)
  function legendSwatch(type) {
    return '<svg width="22" height="22" viewBox="0 0 22 22"><g transform="translate(11 11)"><path d="' + shipHullPath(type) + '" fill="#dfe8f7" stroke="#7c8bb3" stroke-width="0.7"/></g></svg>';
  }

  const COLOR_NAMES = CFG.COLOR_NAMES || ["Rosso", "Blu", "Verde", "Giallo"];
  function renderLog() {
    const box = $("logBody"); box.innerHTML = "";
    for (const line of game.log.slice(-140)) {
      // Divisori di turno
      if (/^—\s*Inizia il turno/.test(line)) { box.appendChild(htmlEl("div", "log-turn", line.replace(/—/g, "").trim())); continue; }
      // Righe di dettaglio (indentate o con simboli di round)
      const sub = /^\s{2,}|^\s*[▶◀]/.test(line);
      // A quale fazione si riferisce la riga? (prima occorrenza di un nome-colore)
      let idx = -1, pos = Infinity;
      COLOR_NAMES.forEach((cn, i) => { const p = line.indexOf(cn); if (p >= 0 && p < pos) { pos = p; idx = i; } });
      const div = htmlEl("div", "log-entry" + (sub ? " sub" : "") + (idx < 0 ? " neutral" : ""));
      if (idx >= 0) div.style.borderLeftColor = CFG.COLORS[idx];
      let html = esc(line);
      COLOR_NAMES.forEach((cn, i) => { html = html.replace(new RegExp("\\b" + cn + "\\b", "g"), '<b class="lg-fac" style="color:' + CFG.COLORS[i] + '">' + cn + "</b>"); });
      div.innerHTML = html;
      box.appendChild(div);
    }
    box.scrollTop = box.scrollHeight;
  }

  function hexCenter(q, r) {
    const px = Hex.toPixel(q, r, HEX_SIZE);
    return { x: px.x + MARGIN, y: px.y + MARGIN };
  }
  function hexPoints(cx, cy, s) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 180) * (60 * i);
      pts.push((cx + s * Math.cos(a)).toFixed(1) + "," + (cy + s * Math.sin(a)).toFixed(1));
    }
    return pts.join(" ");
  }
  function hexVerts(cx, cy, s) {
    const v = [];
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * (60 * i); v.push({ x: cx + s * Math.cos(a), y: cy + s * Math.sin(a) }); }
    return v;
  }
  const HEX_DEPTH = 14; // spessore 3D delle tessere

  function reachableSet() {
    // Celle raggiungibili in 1 passo dalla flotta selezionata (fase movimento)
    const set = new Set();
    if (game.phase !== "movimento" || !sel.fleetId) return set;
    const f = game.fleetById(sel.fleetId);
    if (!f || f.owner !== game.currentPlayer || f.stepsLeft <= 0) return set;
    for (const n of Hex.neighbors(f.q, f.r)) set.add(Hex.key(n.q, n.r));
    return set;
  }

  // Colori dei pianeti per tipologia (manuale: Fuoco rosso/arancio, Ghiaccio azzurro, Terra verde, Roccia marrone/grigio)
  const PLANET_COLORS = { Fuoco: "#ff7a45", Ghiaccio: "#5fc8ff", Terra: "#4fd17a", Roccia: "#c9a36a" };
  const PLANET_EMOJI = { Fuoco: "🔥", Ghiaccio: "❄️", Terra: "🌍", Roccia: "🪨" };
  const TILE_INFO = {
    space: { icon: "✦", label: "Spazio Interstellare" },
    planet: { icon: "🪐", label: "Pianeta" },
    asteroids: { icon: "☄️", label: "Fasci di Asteroidi" },
    market: { icon: "🛰️", label: "Mercato" },
    casino: { icon: "🎲", label: "Casinò Interspaziale" },
  };
  const UNIT_ICON = { caccia: "🚀", torpediniera: "🛸", colonia: "🪐", carri: "🪖", cannone: "🛰️", torretta: "🗼" };
  const HEX_FILL = { space: "url(#g-space)", asteroids: "url(#g-asteroids)", market: "url(#g-market)", casino: "url(#g-casino)", planet: "url(#g-planetcell)" };

  // Pseudo-casuale deterministico da (q,r) per posizionare stelle/rocce in modo stabile
  function hash(q, r, i) {
    let x = (q * 73856093) ^ (r * 19349663) ^ (i * 83492791);
    x = (x ^ (x >>> 13)) >>> 0;
    return (x % 1000) / 1000;
  }

  function boardDefs() {
    let pg = "";
    for (const t in PLANET_COLORS) {
      const c = PLANET_COLORS[t];
      pg += '<radialGradient id="planet-' + t + '" cx="38%" cy="34%" r="72%">' +
        '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>' +
        '<stop offset="28%" stop-color="' + c + '"/>' +
        '<stop offset="100%" stop-color="#000000" stop-opacity="0.85"/></radialGradient>';
    }
    return '<defs>' +
      '<radialGradient id="g-space" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#17223e"/><stop offset="100%" stop-color="#0a1124"/></radialGradient>' +
      '<radialGradient id="g-planetcell" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#16243a"/><stop offset="100%" stop-color="#0a1322"/></radialGradient>' +
      '<radialGradient id="g-asteroids" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#33291a"/><stop offset="100%" stop-color="#16110a"/></radialGradient>' +
      '<radialGradient id="g-market" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#11324c"/><stop offset="100%" stop-color="#091826"/></radialGradient>' +
      '<radialGradient id="g-casino" cx="50%" cy="45%" r="75%"><stop offset="0%" stop-color="#341a42"/><stop offset="100%" stop-color="#190c22"/></radialGradient>' +
      '<radialGradient id="g-unexplored" cx="50%" cy="38%" r="80%"><stop offset="0%" stop-color="#3a3f4d"/><stop offset="55%" stop-color="#22252e"/><stop offset="100%" stop-color="#0a0b10"/></radialGradient>' +
      '<linearGradient id="g-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#3a5894"/><stop offset="35%" stop-color="#1c2c4e"/><stop offset="100%" stop-color="#04060e"/></linearGradient>' +
      pg + shipGrads() +
      // Nebulose (grandi macchie di colore alla deriva dietro i tasselli)
      '<radialGradient id="neb-violet" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.30"/><stop offset="100%" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="neb-cyan" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#22d3ee" stop-opacity="0.22"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="neb-rose" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fb7185" stop-opacity="0.20"/><stop offset="100%" stop-color="#fb7185" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="neb-amber" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fbbf24" stop-opacity="0.16"/><stop offset="100%" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>' +
      // Ombreggiatura sferica: luce in alto a sinistra, terminatore scuro sul bordo
      '<radialGradient id="p-shade" cx="36%" cy="30%" r="78%">' +
      '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.18"/><stop offset="34%" stop-color="#000000" stop-opacity="0"/>' +
      '<stop offset="72%" stop-color="#000000" stop-opacity="0.28"/><stop offset="100%" stop-color="#000000" stop-opacity="0.82"/></radialGradient>' +
      '<filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<filter id="softsh" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.8" flood-color="#000" flood-opacity="0.6"/></filter>' +
      '<filter id="pcsh" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#000" flood-opacity="0.55"/></filter>' +
      '</defs>';
  }
  // Gradienti verticali "illuminati" per le pedine di ogni fazione
  function shipGrads() {
    let s = "";
    for (const pl of game.players) {
      s += '<linearGradient id="ship-' + pl.id + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + shade(pl.color, 0.5) + '"/>' +
        '<stop offset="50%" stop-color="' + pl.color + '"/>' +
        '<stop offset="100%" stop-color="' + shade(pl.color, -0.5) + '"/></linearGradient>';
    }
    return s;
  }
  // Schiarisce/scurisce un colore esadecimale (pct: -1..1)
  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = pct < 0 ? 0 : 255, p = Math.abs(pct);
    r = Math.round((t - r) * p) + r; g = Math.round((t - g) * p) + g; b = Math.round((t - b) * p) + b;
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // Profilo (scafo) dell'astronave per tipo, in coordinate locali (naso in alto, centro 0,0)
  function shipHullPath(type) {
    if (type === "caccia") return "M0,-11 C2.5,-8 3,-3 2.2,1 L2.6,4 1.4,8.5 0.8,7 -0.8,7 -1.4,8.5 -2.6,4 -2.2,1 C-3,-3 -2.5,-8 0,-11 Z";
    if (type === "torpediniera") return "M0,-11 C4,-8 4.2,-2 3.6,2 L3.4,6 2,9 -2,9 -3.4,6 -3.6,2 C-4.2,-2 -4,-8 0,-11 Z";
    if (type === "colonia") return "M0,-9 C6,-8 7,-2 6.2,3 L5,7 2,9.5 -2,9.5 -5,7 -6.2,3 C-7,-2 -6,-8 0,-9 Z";
    return "M-6,-4 H6 Q8,-4 8,-2 V5 Q8,7 6,7 H-6 Q-8,7 -8,5 V-2 Q-8,-4 -6,-4 Z"; // carro (vista dall'alto)
  }
  const SHIP_ENGINES = {
    caccia: [[-1.3, 8.2], [1.3, 8.2]],
    torpediniera: [[-2, 8.6], [0, 9.6], [2, 8.6]],
    colonia: [[-3.6, 8], [-1.2, 9.6], [1.2, 9.6], [3.6, 8]],
    carri: [],
  };

  // Disegna i dettagli dell'astronave nel gruppo locale `g` (già traslato/scalato)
  function shipParts(g, type, ownerId, color) {
    const dk = shade(color, -0.5), lt = shade(color, 0.55);
    const path = (d, fill, stroke, sw) => { const a = { d: d, fill: fill }; if (stroke) { a.stroke = stroke; a["stroke-width"] = sw || 0.6; } return svgEl("path", a); };
    const rect = (x, y, w, h, fill) => svgEl("rect", { x: x, y: y, width: w, height: h, rx: 0.8, fill: fill });
    // Elementi dietro lo scafo (ali / pod / cingoli) in tinta scura
    if (type === "caccia") { g.appendChild(path("M-2,-3 L-9,3 L-8,4.7 L-2.4,2 Z", dk)); g.appendChild(path("M2,-3 L9,3 L8,4.7 L2.4,2 Z", dk)); }
    else if (type === "torpediniera") { g.appendChild(path("M-3.4,-1 L-6.7,0 L-6.7,4.5 L-3.6,4 Z", dk)); g.appendChild(path("M3.4,-1 L6.7,0 L6.7,4.5 L3.6,4 Z", dk)); }
    else if (type === "carri") { g.appendChild(rect(-8.6, -2.5, 2.4, 8, dk)); g.appendChild(rect(6.2, -2.5, 2.4, 8, dk)); }
    // Scafo principale
    g.appendChild(path(shipHullPath(type), "url(#ship-" + ownerId + ")", dk, 0.8));
    // Luce superiore (riflesso metallico)
    g.appendChild(svgEl("ellipse", { cx: 0, cy: type === "colonia" ? -3 : -4, rx: type === "colonia" ? 3.2 : 1.6, ry: type === "colonia" ? 3 : 4, fill: "#ffffff", opacity: 0.22 }));
    // Dettagli per tipo
    if (type === "colonia") { g.appendChild(svgEl("ellipse", { cx: 0, cy: 1, rx: 5, ry: 4, fill: "none", stroke: lt, "stroke-width": 0.6, opacity: 0.55 })); g.appendChild(svgEl("circle", { cx: 0, cy: -1, r: 2.4, fill: lt, opacity: 0.55 })); }
    if (type === "carri") { g.appendChild(svgEl("circle", { cx: 0, cy: 1.5, r: 3, fill: "url(#ship-" + ownerId + ")", stroke: dk, "stroke-width": 0.7 })); g.appendChild(rect(-0.8, -8, 1.6, 6, dk)); }
    // Abitacolo
    if (type !== "carri") g.appendChild(svgEl("ellipse", { cx: 0, cy: type === "colonia" ? -1 : -5, rx: 1.1, ry: 2, fill: "#dff2ff", opacity: 0.95 }));
    // Reattori luminosi: scia + alone pulsante + nucleo brillante
    const engines = SHIP_ENGINES[type] || [];
    engines.forEach((e, i) => {
      const trail = svgEl("ellipse", { cx: e[0], cy: e[1] + 2.6, rx: 0.9, ry: 2.6, fill: "#7fe8ff", opacity: 0.3, class: "eng-trail" });
      trail.setAttribute("style", "animation-delay:" + (i * 0.22) + "s");
      g.appendChild(trail);
      const glow = svgEl("circle", { cx: e[0], cy: e[1], r: 2, fill: "#7fe8ff", opacity: 0.35, class: "eng-glow" });
      glow.setAttribute("style", "animation-delay:" + (i * 0.3) + "s");
      g.appendChild(glow);
      g.appendChild(svgEl("circle", { cx: e[0], cy: e[1], r: 1, fill: "#e8ffff" }));
    });
  }

  // Disegna un'astronave ORIZZONTALE "fluttuante": ombra staccata + alone + scafo rialzato
  function drawShip(parent, type, cx, cy, ownerId, color, count, delay) {
    const s = SHIP_SCALE;
    parent.appendChild(svgEl("ellipse", { cx: cx, cy: cy + 13, rx: 13, ry: 3, fill: "#000000", opacity: 0.4 })); // ombra (larga, nave orizzontale)
    const fl = svgEl("g", { class: "ship-float" }); fl.setAttribute("style", "animation-delay:" + delay + "s");
    fl.appendChild(svgEl("ellipse", { cx: cx, cy: cy, rx: 15, ry: 11, fill: color, opacity: 0.12 })); // alone fazione (senza blur)
    // rotate(90) rende la nave orizzontale (naso a destra)
    const g = svgEl("g"); g.setAttribute("transform", "translate(" + cx + " " + cy + ") scale(" + s + ") rotate(90)");
    shipParts(g, type, ownerId, color);
    fl.appendChild(g);
    parent.appendChild(fl);
    if (count > 1) {
      parent.appendChild(svgEl("circle", { cx: cx + 12, cy: cy - 9, r: 7, fill: "#0a0e18", stroke: color, "stroke-width": 1.7 }));
      const t = svgEl("text", { x: cx + 12, y: cy - 5.5, class: "pawn-count" }); t.textContent = count; parent.appendChild(t);
    }
  }

  // Cubetto 3D isometrico (materia prima)
  function isoCube(svg, x, y, s, base) {
    const top = shade(base, 0.4), left = base, right = shade(base, -0.4);
    svg.appendChild(svgEl("polygon", { points: x + "," + (y - s) + " " + (x + s) + "," + (y - s / 2) + " " + x + "," + y + " " + (x - s) + "," + (y - s / 2), fill: top, stroke: "#05070d", "stroke-width": 0.4 }));
    svg.appendChild(svgEl("polygon", { points: (x - s) + "," + (y - s / 2) + " " + x + "," + y + " " + x + "," + (y + s) + " " + (x - s) + "," + (y + s / 2), fill: left, stroke: "#05070d", "stroke-width": 0.4 }));
    svg.appendChild(svgEl("polygon", { points: (x + s) + "," + (y - s / 2) + " " + x + "," + y + " " + x + "," + (y + s) + " " + (x + s) + "," + (y + s / 2), fill: right, stroke: "#05070d", "stroke-width": 0.4 }));
  }
  // Inventario di una fazione mostrato all'angolo di partenza (soldi + cubetti 3D)
  function drawInventory(svg, pid, cx, cy) {
    const p = game.player(pid);
    const items = [["#3a3f4a", p.res.carburante], ["#d9b44a", p.res.metallo], ["#e8e8ec", p.res.pietra]];
    const W = 78, H = 30, x0 = cx - W / 2, y0 = cy - H / 2;
    svg.appendChild(svgEl("rect", { x: x0, y: y0, width: W, height: H, rx: 7, fill: "rgba(7,11,22,0.82)", stroke: p.color, "stroke-width": 1.4 }));
    svg.appendChild(svgEl("rect", { x: x0, y: y0, width: W, height: 11, rx: 7, fill: p.color, opacity: 0.22 }));
    const mt = svgEl("text", { x: cx, y: y0 + 8.5, class: "inv-money" }); mt.textContent = "💰 " + (p.money / 1000) + "k Ndri"; svg.appendChild(mt);
    items.forEach((it, i) => {
      const bx = x0 + 14 + i * 22, by = y0 + 22;
      isoCube(svg, bx, by, 5, it[0]);
      const t = svgEl("text", { x: bx + 8, y: by + 4, class: "inv-count" }); t.textContent = it[1]; svg.appendChild(t);
    });
  }

  // Token-flotta: piccolo squadrone di astronavi (una per tipo di nave presente)
  function renderFleetToken(svg, f, cx, cy, isSel) {
    const owner = game.player(f.owner);
    const groups = [];
    for (const t of ["caccia", "torpediniera", "colonia"]) if (f.ships[t] > 0) groups.push([t, f.ships[t]]);
    if (f.carri > 0) groups.push(["carri", f.carri]);
    if (!groups.length) return;
    const n = groups.length, spacing = 24;
    const startX = cx - (n - 1) * spacing / 2;
    if (isSel) svg.appendChild(svgEl("ellipse", { cx: cx, cy: cy + 18, rx: n * 12 + 7, ry: 10, fill: "none", stroke: "#ffffff", "stroke-width": 2, opacity: 0.9, filter: "url(#glow)" }));
    const g = svgEl("g", { class: "fleet-badge" });
    g.addEventListener("click", (e) => { if (e && e.stopPropagation) e.stopPropagation(); sel.fleetId = f.id; sel.cellKey = Hex.key(f.q, f.r); render(); });
    groups.forEach((grp, i) => drawShip(g, grp[0], startX + i * spacing, cy, f.owner, owner.color, grp[1], i * 0.35));
    svg.appendChild(g);
    // Animazione di spostamento: scivola dalla cella di partenza
    if (moveAnim && moveAnim.fleetId === f.id) {
      const dx = (moveAnim.fromX - cx).toFixed(1), dy = (moveAnim.fromY - cy).toFixed(1);
      const at = svgEl("animateTransform", { attributeName: "transform", attributeType: "XML", type: "translate", from: dx + " " + dy, to: "0 0", dur: "0.45s", begin: "indefinite", fill: "freeze", calcMode: "spline", keySplines: "0.2 0.7 0.3 1", keyTimes: "0;1" });
      g.insertBefore(at, g.firstChild);
      setTimeout(() => { try { at.beginElement(); } catch (e) {} }, 0);
      moveAnim = null;
    }
  }

  // Colori dei "continenti"/dettagli di superficie per tipo di pianeta [scuro, chiaro]
  const SURF_COLORS = {
    Fuoco: ["#7a1602", "#ffd678"],
    Ghiaccio: ["#bfe6ff", "#ffffff"],
    Terra: ["#1e7a45", "#e8f4ff"],
    Roccia: ["#463a26", "#8c7a55"],
  };
  // Pianeta "3D": sfera con superficie in lenta rotazione (loop senza giunture),
  // alone atmosferico, calotte polari (ghiaccio) e ombreggiatura sferica.
  function drawPlanet3D(svg, q, r, c, d) {
    const col = PLANET_COLORS[d.tipo] || "#8ab";
    const R = 15, py = c.y - 4;
    // alone atmosferico pulsante
    const halo = svgEl("circle", { cx: c.x, cy: py, r: R + 4.5, fill: col, class: "planet-halo" });
    svg.appendChild(halo);
    // clip circolare: tutto ciò che ruota resta dentro la sfera
    const clipId = "pclip-" + q + "-" + r;
    const cp = svgEl("clipPath", { id: clipId });
    cp.appendChild(svgEl("circle", { cx: c.x, cy: py, r: R }));
    svg.appendChild(cp);
    const g = svgEl("g", { "clip-path": "url(#" + clipId + ")", class: "planet-body" });
    g.appendChild(svgEl("circle", { cx: c.x, cy: py, r: R, fill: "url(#planet-" + d.tipo + ")" }));
    // superficie in rotazione: blob duplicati a ±periodo → il loop è invisibile
    const W = 2 * R;
    const surf = svgEl("g", { opacity: 0.55 });
    const cols = SURF_COLORS[d.tipo] || ["#333", "#ccc"];
    for (let i = 0; i < 4; i++) {
      const bx = c.x - R + hash(q, r, i + 30) * W;
      const by = py - R * 0.7 + hash(q, r, i + 60) * R * 1.4;
      const rx = 3.5 + hash(q, r, i + 90) * 5, ry = 2 + hash(q, r, i + 120) * 3;
      const fill = cols[i % 2];
      for (const off of [-W, 0, W]) surf.appendChild(svgEl("ellipse", { cx: (bx + off).toFixed(1), cy: by.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1), fill: fill }));
    }
    const dur = (10 + hash(q, r, 7) * 9).toFixed(1);
    const at = svgEl("animateTransform", { attributeName: "transform", type: "translate", from: "0 0", to: W + " 0", dur: dur + "s", repeatCount: "indefinite" });
    surf.appendChild(at);
    g.appendChild(surf);
    // calotte polari per i pianeti di ghiaccio
    if (d.tipo === "Ghiaccio") {
      g.appendChild(svgEl("ellipse", { cx: c.x, cy: py - R + 2.2, rx: 8.5, ry: 3.6, fill: "#f2faff", opacity: 0.92 }));
      g.appendChild(svgEl("ellipse", { cx: c.x, cy: py + R - 2, rx: 7.5, ry: 3.2, fill: "#f2faff", opacity: 0.85 }));
    }
    // crepe di lava incandescenti per i pianeti di fuoco
    if (d.tipo === "Fuoco") {
      const lv = svgEl("path", { d: "M" + (c.x - 9) + " " + (py + 3) + " q4 -3 8 0 t8 -1", fill: "none", stroke: "#ffe9a8", "stroke-width": 1.1, opacity: 0.8, class: "lava-glow" });
      g.appendChild(lv);
    }
    // ombreggiatura sferica (luce da in alto a sinistra) — è questa a dare il volume
    g.appendChild(svgEl("circle", { cx: c.x, cy: py, r: R, fill: "url(#p-shade)" }));
    svg.appendChild(g);
    // riflesso speculare
    svg.appendChild(svgEl("ellipse", { cx: c.x - 5, cy: py - 6, rx: 4.5, ry: 2.6, fill: "#ffffff", opacity: 0.28, class: "planet-body" }));
  }

  function renderBoard() {
    const svg = $("board");
    hidePlanetCard();
    const w = Hex.toPixel(CFG.COLS - 1, 0, HEX_SIZE).x + 2 * MARGIN;
    const h = Hex.toPixel(0, CFG.ROWS - 1, HEX_SIZE).y + 2 * MARGIN + HEX_SIZE;
    // Dimensioni piene del tabellone; il viewBox effettivo dipende da zoom/pan (vista dinamica)
    svg._full = { w: w, h: h };
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.removeAttribute("width"); svg.removeAttribute("height");
    applyBoardView();
    svg.innerHTML = boardDefs();

    // Nebulose alla deriva dietro i tasselli (posizioni stabili, moto lentissimo)
    const NEBS = [
      ["neb-violet", 0.16, 0.22, 170, 110, 46, 0],
      ["neb-cyan", 0.78, 0.30, 150, 95, 58, 8],
      ["neb-rose", 0.30, 0.80, 160, 100, 52, 4],
      ["neb-amber", 0.86, 0.78, 130, 85, 64, 12],
    ];
    for (const nb of NEBS) {
      const ne = svgEl("ellipse", { cx: (w * nb[1]).toFixed(0), cy: (h * nb[2]).toFixed(0), rx: nb[3], ry: nb[4], fill: "url(#" + nb[0] + ")", class: "nebula" });
      const drift = svgEl("animateTransform", { attributeName: "transform", type: "translate", values: "0 0; " + (20 - nb[5]) + " " + (12 - nb[5] / 2) + "; 0 0", dur: (38 + nb[5] * 2) + "s", begin: "-" + nb[5] + "s", repeatCount: "indefinite" });
      ne.appendChild(drift);
      svg.appendChild(ne);
    }

    const reach = reachableSet();
    const S = HEX_SIZE - 2;

    for (let q = 0; q < CFG.COLS; q++) {
      for (let r = 0; r < CFG.ROWS; r++) {
        const cell = game.cell(q, r);
        const c = hexCenter(q, r);
        const key = Hex.key(q, r);
        let cls = "hex";
        if (reach.has(key)) cls += " hex-reachable";
        if (sel.cellKey === key) cls += " hex-selected";
        if (!cell.explored) cls += " hex-unexplored";
        const fill = cell.explored ? (HEX_FILL[cell.type] || "url(#g-space)") : "url(#g-unexplored)";
        // Pareti laterali (spessore 3D): le 3 facce inferiori della tessera
        const v = hexVerts(c.x, c.y, S);
        for (const e of [[0, 1], [1, 2], [2, 3]]) {
          const i = e[0], j = e[1];
          svg.appendChild(svgEl("polygon", { points: v[i].x.toFixed(1) + "," + v[i].y.toFixed(1) + " " + v[j].x.toFixed(1) + "," + v[j].y.toFixed(1) + " " + v[j].x.toFixed(1) + "," + (v[j].y + HEX_DEPTH).toFixed(1) + " " + v[i].x.toFixed(1) + "," + (v[i].y + HEX_DEPTH).toFixed(1), fill: "url(#g-side)", class: "hex-wall" }));
        }
        // Faccia superiore (cliccabile)
        const poly = svgEl("polygon", { points: hexPoints(c.x, c.y, S), class: cls, fill: fill });
        poly.addEventListener("click", () => onCellClick(q, r));
        if (cell.type === "planet" && cell.explored) {
          poly.addEventListener("mouseenter", (e) => showPlanetCard(q, r, e));
          poly.addEventListener("mousemove", movePlanetCard);
          poly.addEventListener("mouseleave", hidePlanetCard);
        }
        svg.appendChild(poly);
        // Bordo luminoso superiore (luce dall'alto)
        svg.appendChild(svgEl("polyline", { points: v[3].x.toFixed(1) + "," + v[3].y.toFixed(1) + " " + v[4].x.toFixed(1) + "," + v[4].y.toFixed(1) + " " + v[5].x.toFixed(1) + "," + v[5].y.toFixed(1) + " " + v[0].x.toFixed(1) + "," + v[0].y.toFixed(1), class: "hex-rim" }));

        if (!cell.explored) {
          // nebbia viva: banchi scuri che respirano + "?" che brilla debolmente
          for (let i = 0; i < 2; i++) {
            const fx = c.x + (hash(q, r, i + 70) - 0.5) * S * 0.8;
            const fy = c.y + (hash(q, r, i + 80) - 0.5) * S * 0.8;
            // solo il banco chiaro respira: quello scuro è statico (metà animazioni)
            const fb = svgEl("ellipse", { cx: fx.toFixed(1), cy: fy.toFixed(1), rx: (10 + hash(q, r, i + 85) * 8).toFixed(1), ry: (6 + hash(q, r, i + 95) * 5).toFixed(1), fill: i ? "#0a0d16" : "#232838", opacity: i ? 0.45 : 0.5, class: i ? "" : "fog-blob" });
            if (!i) fb.setAttribute("style", "animation-delay:" + (hash(q, r, i + 17) * 6).toFixed(1) + "s;animation-duration:" + (5 + hash(q, r, i + 19) * 4).toFixed(1) + "s");
            svg.appendChild(fb);
          }
          const qm = svgEl("text", { x: c.x, y: c.y + 6, class: "fog" }); qm.textContent = "?";
          qm.setAttribute("style", "animation-delay:" + (hash(q, r, 23) * 5).toFixed(1) + "s");
          svg.appendChild(qm);
          continue;
        }
        // bagliore territoriale: la cella di un pianeta conquistato respira del colore della fazione
        if (cell.type === "planet" && cell.owner != null) {
          const tg = svgEl("ellipse", { cx: c.x, cy: c.y, rx: S * 0.92, ry: S * 0.8, fill: game.player(cell.owner).color, class: "territory-glow" });
          svg.appendChild(tg);
        }

        // Stelle di sfondo nelle celle "vuote" — brillano con ritmi sfalsati
        if (cell.type === "space" || cell.type === "market" || cell.type === "casino") {
          for (let i = 0; i < 5; i++) {
            const sx = c.x + (hash(q, r, i) - 0.5) * S * 1.3;
            const sy = c.y + (hash(q, r, i + 50) - 0.5) * S * 1.3;
            const st = svgEl("circle", { cx: sx.toFixed(1), cy: sy.toFixed(1), r: (0.5 + hash(q, r, i + 9) * 1.1).toFixed(1), fill: "#cfe0ff", opacity: (0.25 + hash(q, r, i + 3) * 0.5).toFixed(2), class: i < 3 ? "star-tw" : "" });
            if (i < 3) st.setAttribute("style", "animation-delay:" + (hash(q, r, i + 11) * 4).toFixed(1) + "s;animation-duration:" + (2.2 + hash(q, r, i + 13) * 3).toFixed(1) + "s");
            svg.appendChild(st);
          }
        }

        if (cell.type === "planet") {
          const d = cell.planet.data;
          const owner = cell.owner != null ? game.player(cell.owner) : null;
          // ombra portata (profondità)
          svg.appendChild(svgEl("ellipse", { cx: c.x, cy: c.y + 13, rx: 13, ry: 4, fill: "#000000", opacity: 0.45 }));
          // anello del proprietario
          if (owner) svg.appendChild(svgEl("circle", { cx: c.x, cy: c.y - 4, r: 19, fill: "none", stroke: owner.color, "stroke-width": 3, opacity: 0.95 }));
          // pianeta 3D con superficie in rotazione
          drawPlanet3D(svg, q, r, c, d);
          // nome (emoji di tipo integrata)
          const nm = svgEl("text", { x: c.x, y: c.y + 19, class: "planet-name" }); nm.textContent = (PLANET_EMOJI[d.tipo] || "") + " " + d.nome; svg.appendChild(nm);
          const tinfo = svgEl("text", { x: c.x, y: c.y + 29, class: "cell-label" });
          tinfo.textContent = "▲" + d.produttivita + "  $" + d.economia; svg.appendChild(tinfo);
          if (owner) {
            const totB = Object.values(cell.buildings).reduce((a, b) => a + b, 0);
            if (totB > 0) { const bt = svgEl("text", { x: c.x - 12, y: c.y - 18, class: "badge-mini" }); bt.textContent = "🏭" + totB; svg.appendChild(bt); }
            if (cell.garrison > 0) { const gt = svgEl("text", { x: c.x + 12, y: c.y - 18, class: "badge-mini" }); gt.textContent = "🛡" + cell.garrison; svg.appendChild(gt); }
          }
        } else if (cell.type === "asteroids") {
          // rocce che fluttuano lentamente su e giù (ognuna col suo ritmo)
          for (let i = 0; i < 6; i++) {
            const ax = c.x + (hash(q, r, i) - 0.5) * S * 1.2;
            const ay = c.y + (hash(q, r, i + 20) - 0.5) * S * 1.1;
            const rock = svgEl("circle", { cx: ax.toFixed(1), cy: ay.toFixed(1), r: (2 + hash(q, r, i + 7) * 3).toFixed(1), fill: "#8c7a55", stroke: "#5e4f33", "stroke-width": 0.8, opacity: 0.92, class: "ast-bob" });
            rock.setAttribute("style", "animation-delay:" + (hash(q, r, i + 33) * 5).toFixed(1) + "s;animation-duration:" + (3.5 + hash(q, r, i + 44) * 4).toFixed(1) + "s");
            svg.appendChild(rock);
          }
          const lbl = svgEl("text", { x: c.x, y: c.y + 28, class: "cell-label" }); lbl.textContent = "Asteroidi"; svg.appendChild(lbl);
        } else if (cell.type === "market") {
          const ic = svgEl("text", { x: c.x, y: c.y + 4, class: "tile-icon" }); ic.textContent = "🛰"; svg.appendChild(ic);
          // satellite che orbita attorno al mercato
          const orb = svgEl("g");
          orb.appendChild(svgEl("ellipse", { cx: c.x, cy: c.y - 2, rx: 20, ry: 8, fill: "none", stroke: "#5fd6ff", "stroke-width": 0.6, opacity: 0.35 }));
          const sat = svgEl("circle", { cx: c.x + 20, cy: c.y - 2, r: 1.8, fill: "#aee8ff", class: "mk-sat" });
          const oa = svgEl("animateTransform", { attributeName: "transform", type: "rotate", from: "0 " + c.x + " " + (c.y - 2), to: "360 " + c.x + " " + (c.y - 2), dur: "9s", repeatCount: "indefinite" });
          sat.appendChild(oa); orb.appendChild(sat); svg.appendChild(orb);
          const lbl = svgEl("text", { x: c.x, y: c.y + 28, class: "cell-label" }); lbl.textContent = "Mercato"; svg.appendChild(lbl);
        } else if (cell.type === "casino") {
          const cg = svgEl("circle", { cx: c.x, cy: c.y - 3, r: 15, fill: "#c05fff", class: "casino-glow" }); svg.appendChild(cg);
          const ic = svgEl("text", { x: c.x, y: c.y + 4, class: "tile-icon casino-dice" }); ic.textContent = "🎲"; svg.appendChild(ic);
          const lbl = svgEl("text", { x: c.x, y: c.y + 28, class: "cell-label" }); lbl.textContent = "Casinò"; svg.appendChild(lbl);
        }
        if (cell.startOf != null) {
          const above = r < CFG.ROWS / 2;
          drawInventory(svg, cell.startOf, c.x, above ? c.y - 62 : c.y + 44);
        }

        // Flotte sulla cella: token con segnalini per tipo di nave
        const fleets = game.fleetsAt(q, r);
        fleets.forEach((f, idx) => {
          renderFleetToken(svg, f, c.x, c.y + 13 + idx * 24, f.id === sel.fleetId);
        });
      }
    }
  }

  // -------- Plancia del pianeta (edifici, difese, statistiche)
  // Si mostra al passaggio del mouse E resta "fissata" quando selezioni/conquisti un
  // pianeta (in alto a sinistra del tabellone), perché la nave sopra il pianeta
  // impedirebbe l'hover.
  let pinnedPlanet = null; // cellKey del pianeta selezionato
  function planetCardEl() { let c = $("planetCard"); if (!c) { c = htmlEl("div"); c.id = "planetCard"; document.body.appendChild(c); } return c; }
  function planetHTML(cell) {
    const d = cell.planet.data;
    const owner = cell.owner != null ? game.player(cell.owner) : null;
    const b = cell.buildings;
    const bList = [["🚀 Fab. Navale", b.fabbricaNavale], ["🏭 Fab. Carri", b.fabbricaCarri], ["🏛 Tesoreria", b.tesoreria], ["🛰 Cannone", b.cannone], ["🗼 Torretta", b.torretta]].filter((x) => x[1] > 0);
    const totB = Object.values(b).reduce((a, c) => a + c, 0);
    let html =
      '<div class="pc-h" style="--pc:' + (PLANET_COLORS[d.tipo] || "#8ab") + '"><span class="pc-emoji">' + (PLANET_EMOJI[d.tipo] || "🪐") + "</span>" +
      '<div><div class="pc-name">' + esc(d.nome) + '</div><div class="pc-type">Pianeta ' + d.tipo + "</div></div></div>" +
      (owner
        ? '<div class="pc-owner"><span class="dot" style="background:' + owner.color + '"></span>' + esc(owner.name) + "</div>"
        : '<div class="pc-owner free">Libero — colonizzabile</div>') +
      '<div class="pc-stats">' +
      "<span>⚙️ Prod ×" + d.produttivita + "</span><span>💰 Eco ×" + d.economia + "</span>" +
      "<span>⛽×" + d.moltMaterie.carburante + "</span><span>🔩×" + d.moltMaterie.metallo + "</span><span>🪨×" + d.moltMaterie.pietra + "</span>" +
      "<span>💵 " + (CFG.SOLDI_BASE_PIANETA * d.economia).toLocaleString() + "/t</span></div>";
    if (owner) {
      html += '<div class="pc-sec"><div class="pc-sec-t">🏗 Edifici (' + totB + "/9)</div>" +
        (bList.length ? bList.map((x) => '<span class="pc-tag">' + x[0] + " ×" + x[1] + "</span>").join("") : '<span class="pc-none">nessuno</span>') + "</div>";
      html += '<div class="pc-sec"><div class="pc-sec-t">🛡 Difese</div>' +
        '<span class="pc-tag">🪖 Guarnigione ' + cell.garrison + "</span>" +
        (b.cannone ? '<span class="pc-tag">🛰 Cannone ×' + b.cannone + "</span>" : "") +
        (b.torretta ? '<span class="pc-tag">🗼 Torretta ×' + b.torretta + "</span>" : "") +
        (!cell.garrison && !b.cannone && !b.torretta ? '<span class="pc-none">indifeso</span>' : "") + "</div>";
    }
    return html;
  }
  // Hover: mostra la scheda vicino al cursore
  function showPlanetCard(q, r, e) {
    const cell = game.cell(q, r);
    if (!cell || cell.type !== "planet" || !cell.explored) return;
    const card = planetCardEl();
    card.innerHTML = planetHTML(cell);
    card.dataset.mode = "hover";
    card.classList.add("show");
    movePlanetCard(e);
  }
  function movePlanetCard(e) {
    const card = $("planetCard");
    if (!card || !card.classList.contains("show") || card.dataset.mode !== "hover" || !e) return;
    const pad = 16, w = card.offsetWidth || 244, h = card.offsetHeight || 200;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = Math.max(8, window.innerHeight - h - 8);
    card.style.left = x + "px"; card.style.top = y + "px";
  }
  // Fine hover: se un pianeta è selezionato, torna alla scheda fissata
  function hidePlanetCard(force) {
    const card = $("planetCard"); if (!card) return;
    if (!force && pinnedPlanet) { const [q, r] = pinnedPlanet.split(",").map(Number); pinPlanetCard(q, r); return; }
    if (card.dataset.mode === "hover" || force) card.classList.remove("show");
  }
  // Scheda "fissata" in alto a sinistra del tabellone (pianeta selezionato/conquistato)
  function pinPlanetCard(q, r) {
    const cell = game.cell(q, r);
    if (!cell || cell.type !== "planet" || !cell.explored) { unpinPlanetCard(); return; }
    pinnedPlanet = Hex.key(q, r);
    const card = planetCardEl();
    card.innerHTML = planetHTML(cell);
    card.dataset.mode = "pin";
    card.classList.add("show");
    const wrap = $("boardWrap"); const rc = wrap ? wrap.getBoundingClientRect() : { left: 12, top: 70 };
    card.style.left = (rc.left + 12) + "px"; card.style.top = (rc.top + 12) + "px";
  }
  function unpinPlanetCard() { pinnedPlanet = null; const card = $("planetCard"); if (card && card.dataset.mode === "pin") card.classList.remove("show"); }
  // Allinea la scheda fissata alla selezione corrente (chiamata a fine render)
  function updatePlanetPin() {
    if (!sel.cellKey) { unpinPlanetCard(); return; }
    const [q, r] = sel.cellKey.split(",").map(Number);
    const cell = game.cell(q, r);
    if (cell && cell.type === "planet" && cell.explored) pinPlanetCard(q, r);
    else unpinPlanetCard();
  }

  // ---------------------------------------------------------------- INTERAZIONE
  function onCellClick(q, r) {
    if (game.winner) return;
    if (justPanned) return; // era un trascinamento della vista, non un clic sulla cella
    const p = game.player(game.currentPlayer);
    const key = Hex.key(q, r);

    // Movimento: se ho una flotta selezionata e clicco una cella adiacente -> passo (solo se posso comandare)
    if (canControl() && game.phase === "movimento" && sel.fleetId) {
      const f = game.fleetById(sel.fleetId);
      if (f && f.owner === p.id && f.stepsLeft > 0 && reachableSet().has(key)) {
        return doStep(f.id, q, r);
      }
    }

    // Altrimenti seleziona ciò che c'è sulla cella
    sel.cellKey = key;
    const ownFleet = game.fleetOfAt(p.id, q, r);
    sel.fleetId = ownFleet ? ownFleet.id : null;
    render();
  }

  function doStep(fleetId, q, r) {
    const fBefore = game.fleetById(fleetId);
    const fromC = fBefore ? hexCenter(fBefore.q, fBefore.r) : null;
    const ev = game.stepFleet(fleetId, q, r);
    if (!ev.ok) { toast(ev.msg); return; }
    const newly = ev.revealed && ev.revealed.newly;

    // Combattimenti: il pannello del combattimento è già visivo
    if (ev.event === "combat") { render(); if (newly) pulseCell(q, r); return promptFleetCombat(ev); }
    if (ev.event === "planetCombat") { render(); if (newly) pulseCell(q, r); return promptPlanetCombat(ev); }

    if (ev.event === "destroyed") { sel.fleetId = null; render(); if (newly) pulseCell(q, r); }
    else {
      sel.fleetId = ev.fleet || fleetId;
      sel.cellKey = Hex.key(q, r);
      if (fromC) moveAnim = { fleetId: ev.fleet || fleetId, fromX: fromC.x, fromY: fromC.y };
      render(); // rende con l'animazione di scivolamento
      if (newly) pulseCell(q, r);
    }
    // Freccia a scomparsa dello spostamento + whoosh del razzo
    if (ev.fromQ !== undefined && (ev.fromQ !== q || ev.fromR !== r)) {
      showMoveArrow(ev.fromQ, ev.fromR, q, r, game.player(game.currentPlayer).color);
      Snd.move();
    }
    focusCell(q, r); // se la vista è zoomata, segue la flotta



    // Eventi visivi (banner) e finestre
    if (ev.asteroid) showAsteroidCard(ev.asteroid, ev.event === "destroyed");
    else if (newly && ev.revealed.type !== "space") showDiscoveryCard(ev.revealed);
    syncNet(); // sincronizza lo spostamento agli altri giocatori online
    if (ev.event === "casino") openCasino(ev.fleet || fleetId);
    else if (ev.canColonize) promptColonize(ev.fleet || fleetId);
  }

  // Evidenzia con un impulso la cella appena rivelata
  function pulseCell(q, r) {
    const c = hexCenter(q, r);
    const svg = $("board");
    const ring = svgEl("polygon", { points: hexPoints(c.x, c.y, HEX_SIZE - 3), class: "pulse-ring" });
    svg.appendChild(ring);
    setTimeout(() => { try { ring.remove(); } catch (e) {} }, 900);
  }

  // Carta di scoperta (banner in alto, non bloccante, auto-dismiss)
  function showDiscoveryCard(rev) {
    const info = TILE_INFO[rev.type] || { icon: "❔", label: rev.type };
    let icon = info.icon, title = info.label, sub = "";
    if (rev.type === "planet") { icon = PLANET_EMOJI[rev.tipo] || "🪐"; title = rev.planetName; sub = "Pianeta " + rev.tipo + " — colonizzabile con una Nave Colonia"; }
    else if (rev.type === "market") sub = "Puoi commerciare qui";
    else if (rev.type === "casino") sub = "Tenta la sorte ai dadi";
    else if (rev.type === "asteroids") sub = "Zona pericolosa";
    flashBanner("discovery", "🔭 Scoperta", icon, title, sub);
  }

  // Carta effetto asteroidi (visiva)
  function showAsteroidCard(ast, fleetLost) {
    if (ast.tipo === "malus") {
      const lost = (ast.lost && ast.lost.length) ? ast.lost.join(", ") : "nessuna unità";
      flashBanner("malus", "☄️ Campo di asteroidi", "💥", "Perdi: " + lost, fleetLost ? "La flotta è andata distrutta!" : "");
    } else {
      const what = ast.risorsa === "soldi" ? (ast.valore.toLocaleString() + " Ndri") : (ast.quantita + " " + ast.risorsa);
      flashBanner("bonus", "☄️ Campo di asteroidi", "✨", "Trovi: " + what, "");
    }
  }

  // Banner degli eventi: mostrati UNO ALLA VOLTA (coda), in basso, senza sovrapporsi.
  // Con "conferma eventi" attiva, ogni banner richiede un clic su "Ho letto ✓".
  let confirmEvents = localStorage.getItem("ig_confirmEvents") === "1";
  const bannerQueue = [];
  let bannerBusy = false;
  function flashBanner(kind, eyebrow, icon, title, sub) {
    bannerQueue.push({ kind, eyebrow, icon, title, sub });
    pumpBanner();
  }
  function pumpBanner() {
    if (bannerBusy || !bannerQueue.length) return;
    bannerBusy = true;
    const data = bannerQueue.shift();
    let host = $("bannerHost");
    if (!host) { host = htmlEl("div"); host.id = "bannerHost"; document.body.appendChild(host); }
    const b = htmlEl("div", "flash-banner " + data.kind + (confirmEvents ? " confirm" : ""));
    b.innerHTML =
      '<div class="fb-icon">' + data.icon + '</div>' +
      '<div class="fb-text"><div class="fb-eyebrow">' + esc(data.eyebrow) + '</div>' +
      '<div class="fb-title">' + esc(data.title) + '</div>' +
      (data.sub ? '<div class="fb-sub">' + esc(data.sub) + '</div>' : '') + '</div>';
    const done = () => { b.classList.remove("show"); setTimeout(() => { try { b.remove(); } catch (e) {} bannerBusy = false; pumpBanner(); }, 300); };
    if (confirmEvents) {
      const ok = htmlEl("button", "fb-ok", "Ho letto ✓"); ok.onclick = done; b.appendChild(ok);
    }
    host.appendChild(b);
    setTimeout(() => b.classList.add("show"), 20);
    if (!confirmEvents) setTimeout(done, 2400);
  }
  function toggleConfirmEvents() {
    confirmEvents = !confirmEvents;
    localStorage.setItem("ig_confirmEvents", confirmEvents ? "1" : "0");
    updateConfirmBtn();
    toast(confirmEvents ? "Conferma eventi attiva: leggi e premi ✓" : "Conferma eventi disattivata");
  }
  function updateConfirmBtn() {
    const btn = $("confirmToggle");
    if (btn) { btn.textContent = confirmEvents ? "🔔 Eventi: conferma" : "🔕 Eventi: auto"; btn.classList.toggle("on", confirmEvents); }
  }

  // Freccia a scomparsa che indica uno spostamento sul tabellone
  function showMoveArrow(fq, fr, tq, tr, color) {
    const svg = $("board"); if (!svg) return;
    const a = hexCenter(fq, fr), b = hexCenter(tq, tr);
    const g = svgEl("g", { class: "move-arrow" }); g.style.color = color;
    g.appendChild(svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: color, "stroke-width": 4.5, "stroke-linecap": "round", "stroke-dasharray": "10 7", class: "arrow-flow" }));
    const ang = Math.atan2(b.y - a.y, b.x - a.x), s = 13;
    const p1x = b.x - s * Math.cos(ang - 0.45), p1y = b.y - s * Math.sin(ang - 0.45);
    const p2x = b.x - s * Math.cos(ang + 0.45), p2y = b.y - s * Math.sin(ang + 0.45);
    g.appendChild(svgEl("polygon", { points: b.x.toFixed(1) + "," + b.y.toFixed(1) + " " + p1x.toFixed(1) + "," + p1y.toFixed(1) + " " + p2x.toFixed(1) + "," + p2y.toFixed(1), fill: color }));
    svg.appendChild(g);
    setTimeout(() => { try { g.remove(); } catch (e) {} }, 1400);
  }

  // Banner informativo in basso (usato per gli spostamenti dell'IA)
  function bottomInfo(text, color) {
    let el = $("moveBanner");
    if (!el) { el = htmlEl("div"); el.id = "moveBanner"; document.body.appendChild(el); }
    el.innerHTML = text; el.style.borderColor = color || "var(--border-bright)";
    el.classList.add("show");
    clearTimeout(el._h); el._h = setTimeout(() => el.classList.remove("show"), 1700);
  }

  // ---------------------------------------------------------------- SELEZIONE / AZIONI
  function renderSelection() {
    const body = $("selectionBody");
    body.innerHTML = "";
    const p = game.player(game.currentPlayer);
    if (!sel.cellKey) { body.innerHTML = '<p class="muted">Clicca una flotta o un pianeta.</p>'; return; }
    const [q, r] = sel.cellKey.split(",").map(Number);
    const cell = game.cell(q, r);

    // --- Info cella ---
    if (cell.explored) {
      body.appendChild(htmlEl("div", "info-line", "Cella (" + q + "," + r + "): " + game._tileLabel(cell.type)));
      if (cell.type === "planet") {
        const d = cell.planet.data;
        body.appendChild(htmlEl("div", "info-line", "Pianeta " + d.nome + " — " + d.tipo + " | Prod ×" + d.produttivita + " | Eco ×" + d.economia));
        body.appendChild(htmlEl("div", "info-line", "Materie/turno: C×" + d.moltMaterie.carburante + " M×" + d.moltMaterie.metallo + " P×" + d.moltMaterie.pietra + " | $" + (CFG.SOLDI_BASE_PIANETA * d.economia)));
        if (cell.owner != null) {
          body.appendChild(htmlEl("div", "info-line", "Proprietario: " + game.player(cell.owner).name + " | Guarnigione: " + cell.garrison + " carri"));
          const b = cell.buildings;
          body.appendChild(htmlEl("div", "info-line", "Edifici: Fab.Navale " + b.fabbricaNavale + ", Fab.Carri " + b.fabbricaCarri + ", Tesor. " + b.tesoreria + ", Cannone " + b.cannone + ", Torretta " + b.torretta + " (slot " + Object.values(b).reduce((a, c) => a + c, 0) + "/9)"));
        } else body.appendChild(htmlEl("div", "info-line", "Pianeta libero — colonizzabile con una Nave Colonia."));
      }
    } else {
      body.appendChild(htmlEl("div", "info-line", "Cella inesplorata."));
    }

    // --- Pianeta proprio: produzione / costruzione ---
    if (cell.type === "planet" && cell.owner === p.id && canControl()) {
      if (game.phase === "produzione") {
        body.appendChild(htmlEl("h3", null, "Produzione"));
        if (cell.buildings.fabbricaNavale > 0) {
          const capN = cell.buildings.fabbricaNavale * cell.planet.data.produttivita;
          body.appendChild(htmlEl("div", "info-line muted", "Cantiere navale — max " + (capN - cell.producedNavi) + "/" + capN + " navi rimaste questo turno"));
          for (const t of ["caccia", "torpediniera", "colonia"]) {
            const S = CFG.SHIPS[t];
            const b = htmlEl("button", "prod-btn");
            b.innerHTML = '<span class="pb-name">' + legendSwatch(t) + " " + CFG.SHIP_NAMES[t] + '</span>' +
              '<span class="pb-cost">💰' + (S.costo / 1000) + 'k · ⛽' + S.carburante + ' · 🔩' + S.metallo + '</span>';
            // non permettibile → grigio e non cliccabile
            b.disabled = p.money < S.costo || p.res.carburante < S.carburante || p.res.metallo < S.metallo || (capN - cell.producedNavi) <= 0;
            b.onclick = () => act(game.produceShip(q, r, t, 1), "🏭 " + CFG.SHIP_NAMES[t] + " prodotto");
            body.appendChild(b);
          }
        } else body.appendChild(htmlEl("div", "info-line muted", "Serve una Fabbrica Navale per le navi."));
        if (cell.buildings.fabbricaCarri > 0) {
          const capC = cell.buildings.fabbricaCarri * cell.planet.data.produttivita;
          const cc = CFG.CARRO;
          const b = htmlEl("button", "prod-btn");
          b.innerHTML = '<span class="pb-name">' + legendSwatch("carri") + ' Carro Armato</span>' +
            '<span class="pb-cost">💰' + (cc.costo / 1000) + 'k · ⛽' + cc.carburante + ' · 🔩' + cc.metallo + '</span>';
          b.disabled = p.money < cc.costo || p.res.carburante < cc.carburante || p.res.metallo < cc.metallo ||
            (capC - cell.producedCarri) <= 0 || cell.garrison >= CFG.MAX_CARRI_PIANETA;
          b.onclick = () => act(game.produceCarri(q, r, 1));
          body.appendChild(b);
          body.appendChild(htmlEl("div", "info-line muted", "max " + (capC - cell.producedCarri) + "/" + capC + " carri rimasti questo turno"));
        }
      }
      if (game.phase === "costruzione") {
        body.appendChild(htmlEl("h3", null, "Costruisci edificio (1/turno)"));
        const grid = htmlEl("div", "action-grid");
        const slotsUsed = Object.values(cell.buildings).reduce((a, c2) => a + c2, 0);
        for (const t in CFG.BUILDINGS) {
          const B = CFG.BUILDINGS[t];
          const b = htmlEl("button", "small", B.nome + " (" + (B.ndri / 1000) + "k+" + B.pietra + "P)");
          // non permettibile → grigio e non cliccabile
          b.disabled = p.money < B.ndri || p.res.pietra < B.pietra || slotsUsed >= 9;
          b.onclick = () => { const r2 = game.buildBuilding(q, r, t); if (r2.ok) flashBanner("discovery", "🏗️ Costruzione", "🏗️", B.nome, "su " + cell.planet.data.nome); act(r2); };
          grid.appendChild(b);
        }
        body.appendChild(grid);
      }
    }

    // --- Flotte sulla cella ---
    const fleets = game.fleetsAt(q, r).filter((f) => f.owner === p.id);
    if (fleets.length) {
      body.appendChild(htmlEl("h3", null, "Le tue flotte qui"));
      for (const f of fleets) renderFleetActions(body, f, cell);
    }
  }

  function renderFleetActions(body, f, cell) {
    const isSel = f.id === sel.fleetId;
    const wrap = htmlEl("div", "fleet-card" + (isSel ? " sel" : ""));
    const head = htmlEl("div", "fc-head");
    head.innerHTML = (isSel ? '<span class="fc-arrow">▶</span>' : "") + "<b>Flotta #" + f.id + "</b>" +
      (game.phase === "movimento" ? ' <span class="tag">🚀 ' + f.stepsLeft + " passi</span>" : "");
    wrap.appendChild(head);
    // Composizione chiara: icona nave + quantità
    const units = htmlEl("div", "fc-units");
    const LABEL = { caccia: "Caccia", torpediniera: "Torpediniera", colonia: "Nave Colonia", carri: "Carri" };
    for (const t of ["caccia", "torpediniera", "colonia", "carri"]) {
      const val = t === "carri" ? f.carri : f.ships[t];
      const u = htmlEl("div", "fc-unit" + (val > 0 ? "" : " zero"));
      u.title = LABEL[t];
      u.innerHTML = legendSwatch(t) + '<span class="fc-n">' + val + "</span>";
      units.appendChild(u);
    }
    wrap.appendChild(units);

    const grid = htmlEl("div", "action-grid");
    if (!isSel) { const s = htmlEl("button", "small", "Seleziona"); s.onclick = () => { sel.fleetId = f.id; render(); }; grid.appendChild(s); }

    if (canControl()) {
      if (game.phase === "movimento" && cell.type === "planet" && cell.owner === null && f.ships.colonia > 0) {
        const b = htmlEl("button", "small", "Colonizza"); b.onclick = () => { if (game.colonize(f.id).ok) { sel.fleetId = game.fleetById(f.id) ? f.id : null; render(); syncNet(); } }; grid.appendChild(b);
      }
      if (cell.type === "market") {
        const b = htmlEl("button", "small", "🛒 Mercato"); b.onclick = () => openMarket(f.id); grid.appendChild(b);
      }
      if (cell.type === "casino") {
        const b = htmlEl("button", "small", "🎲 Casinò"); b.onclick = () => openCasino(f.id); grid.appendChild(b);
      }
      if (cell.type === "planet" && cell.owner === f.owner) {
        const cap = game.fleetCarriCapacity(f) - f.carri;
        if (cell.garrison > 0 && cap > 0) { const b = htmlEl("button", "small", "Imbarca carro"); b.onclick = () => act(game.loadTanks(f.id, 1)); grid.appendChild(b); }
        if (f.carri > 0) { const b = htmlEl("button", "small", "Sbarca carro"); b.onclick = () => act(game.unloadTanks(f.id, 1)); grid.appendChild(b); }
      }
      if (game.phase === "movimento") {
        const sp = htmlEl("button", "small", "Dividi flotta"); sp.onclick = () => openSplit(f.id); grid.appendChild(sp);
      }
    }
    wrap.appendChild(grid);
    body.appendChild(wrap);
  }

  function act(result, okMsg) {
    if (!result.ok) { toast(result.msg || "Azione non valida."); return; }
    if (okMsg) toast(okMsg);
    render();
    syncNet();
  }

  // ---------------------------------------------------------------- MODALI
  function modal(title, bodyNode, actions) {
    $("modalTitle").textContent = title;
    const body = $("modalBody"); body.innerHTML = ""; body.appendChild(bodyNode);
    const act = $("modalActions"); act.innerHTML = "";
    for (const a of actions) {
      const b = htmlEl("button", a.primary ? "primary" : null, a.label);
      if (a.disabled) b.disabled = true;
      b.onclick = a.onClick; act.appendChild(b);
    }
    $("modal").classList.remove("hidden");
  }
  function closeModal() { const box = $("modal").querySelector(".modal-box"); if (box) box.classList.remove("wide"); $("modal").classList.add("hidden"); }

  // -------- Composizioni unità (per la visualizzazione a icone) --------
  const UNIT_NAME = { caccia: "Caccia", torpediniera: "Torpediniera", colonia: "Nave Colonia", carri: "Carro", cannone: "Cannone", torretta: "Torretta" };
  function fleetComp(f) { return f ? { caccia: f.ships.caccia, torpediniera: f.ships.torpediniera, colonia: f.ships.colonia, carri: f.carri } : { caccia: 0, torpediniera: 0, colonia: 0, carri: 0 }; }
  function planetDefComp(cell, defFleet) {
    const c = fleetComp(defFleet);
    c.cannone = cell.buildings.cannone; c.torretta = cell.buildings.torretta;
    c.carri = (c.carri || 0) + cell.garrison;
    return c;
  }
  function uchip(type, color, dead) {
    const s = htmlEl("span", "uchip" + (dead ? " dead" : "")); s.style.borderColor = color;
    s.title = UNIT_NAME[type] || type; s.textContent = UNIT_ICON[type] || "?";
    return s;
  }
  function unitChips(before, after, color) {
    const wrap = htmlEl("div", "unit-row"); let any = false;
    for (const t of ["caccia", "torpediniera", "colonia", "carri", "cannone", "torretta"]) {
      const tot = before[t] || 0; const alive = after ? (after[t] || 0) : tot; const dead = Math.max(0, tot - alive);
      for (let i = 0; i < alive; i++) { wrap.appendChild(uchip(t, color, false)); any = true; }
      for (let i = 0; i < dead; i++) { wrap.appendChild(uchip(t, color, true)); any = true; }
    }
    if (!any) wrap.appendChild(htmlEl("span", "muted", "annientata"));
    return wrap;
  }

  function promptColonize(fleetId) {
    const f = game.fleetById(fleetId); if (!f) return;
    const cell = game.cell(f.q, f.r); const d = cell.planet.data;
    const body = htmlEl("div", "discover-modal");
    body.innerHTML =
      '<div class="dm-icon" style="--pc:' + PLANET_COLORS[d.tipo] + '">' + (PLANET_EMOJI[d.tipo] || "🪐") + '</div>' +
      '<div class="dm-title">' + esc(d.nome) + '</div>' +
      '<div class="dm-sub">Pianeta ' + d.tipo + '</div>' +
      '<div class="dm-stats">' +
      '<span>⚙️ Produttività ×' + d.produttivita + '</span><span>💰 Economia ×' + d.economia + ' ($' + (CFG.SOLDI_BASE_PIANETA * d.economia).toLocaleString() + '/turno)</span>' +
      '<span>⛽×' + d.moltMaterie.carburante + '</span><span>🔩×' + d.moltMaterie.metallo + '</span><span>🪨×' + d.moltMaterie.pietra + '</span>' +
      '</div>';
    modal("Colonizzare questo pianeta?", body, [
      { label: "🚩 Colonizza", primary: true, onClick: () => { game.colonize(fleetId); closeModal(); sel.fleetId = game.fleetById(fleetId) ? fleetId : null; render(); syncNet(); } },
      { label: "Lascia libero", onClick: () => { closeModal(); } },
    ]);
  }

  // ===================== COMBATTIMENTO INTERATTIVO (tiri i tuoi dadi) =====================
  function unitsToComp(units) {
    const c = { caccia: 0, torpediniera: 0, colonia: 0, carri: 0, cannone: 0, torretta: 0 };
    for (const u of units) c[u.type] = (c[u.type] || 0) + 1;
    return c;
  }

  function promptFleetCombat(ev) {
    const att = game.fleetById(ev.attacker), def = game.fleetById(ev.defender);
    if (!att || !def) return;
    const aOwner = game.player(att.owner), dOwner = game.player(def.owner);
    const body = htmlEl("div");
    const grid = htmlEl("div", "battle-grid");
    grid.appendChild(battleCol("La tua flotta", aOwner.color, fleetComp(att), null));
    grid.appendChild(htmlEl("div", "vs-badge", "VS"));
    grid.appendChild(battleCol(dOwner.name, dOwner.color, fleetComp(def), null));
    body.appendChild(grid);
    body.appendChild(htmlEl("p", "muted center", "Lancerai tu i tuoi dadi, uno per uno."));
    modal("⚔ Scontro spaziale (" + ev.q + "," + ev.r + ")", body, [
      { label: "⚔ Combatti!", primary: true, onClick: () => launchAttack("fleet", ev) },
      { label: "Annulla", onClick: () => { closeModal(); render(); } },
    ]);
  }

  function promptPlanetCombat(ev) {
    const att = game.fleetById(ev.attacker);
    const cell = game.cell(ev.q, ev.r);
    const dOwner = game.player(cell.owner);
    const defFleet = game.fleets.find((o) => o.q === ev.q && o.r === ev.r && o.owner === cell.owner);
    const body = htmlEl("div");
    const grid = htmlEl("div", "battle-grid");
    grid.appendChild(battleCol("La tua flotta", game.player(att.owner).color, fleetComp(att), null));
    grid.appendChild(htmlEl("div", "vs-badge", "VS"));
    grid.appendChild(battleCol(dOwner.name + " · " + cell.planet.data.nome, dOwner.color, planetDefComp(cell, defFleet), null));
    body.appendChild(grid);
    const landRow = htmlEl("div", "field-row");
    landRow.appendChild(htmlEl("span", null, "🪖 Carri da sbarcare se superi le difese (max " + att.carri + "):"));
    const inp = htmlEl("input"); inp.type = "number"; inp.value = att.carri; inp.min = 0; inp.max = att.carri;
    landRow.appendChild(inp);
    body.appendChild(landRow);
    modal("⚔ Attacco a pianeta (" + ev.q + "," + ev.r + ")", body, [
      { label: "⚔ Combatti!", primary: true, onClick: () => { const land = Math.max(0, Math.min(att.carri, parseInt(inp.value || "0", 10))); launchAttack("planet", Object.assign({}, ev, { land: land })); } },
      { label: "Annulla", onClick: () => { closeModal(); render(); } },
    ]);
  }

  let combatCtx = null;
  // opts: { mySide: 'A' (attacco, default) | 'B' (difesa), onDone: fn (per riprendere il turno IA) }
  function startInteractiveCombat(kind, ev, opts) {
    opts = opts || {};
    const att = game.fleetById(ev.attacker);
    if (kind === "fleet") {
      const def = game.fleetById(ev.defender);
      const uA = game._shipUnits(att), uB = game._shipUnits(def);
      combatCtx = { kind: kind, phase: "space", att: att, def: def, ev: ev, uA: uA, uB: uB,
        attName: game.player(att.owner).name, attColor: game.player(att.owner).color,
        defName: game.player(def.owner).name, defColor: game.player(def.owner).color,
        mySide: opts.mySide || "A", onDone: opts.onDone || null,
        session: game.makeCombatSession(uA, uB, false) };
    } else {
      const cell = game.cell(ev.q, ev.r);
      const setup = game.planetCombatSetup(att, cell);
      combatCtx = { kind: kind, phase: "space", att: att, cell: cell, ev: ev, defFleet: setup.defFleet, uA: setup.uA, uB: setup.uB, land: ev.land,
        attName: game.player(att.owner).name, attColor: game.player(att.owner).color,
        defName: game.player(cell.owner).name + " · " + cell.planet.data.nome, defColor: game.player(cell.owner).color,
        mySide: opts.mySide || "A", onDone: opts.onDone || null,
        session: game.makeCombatSession(setup.uA, setup.uB, false) };
    }
    combatCtx.net = !!opts.net;
    combatCtx.cid = opts.cid || null;
    combatCtx.enemyQueue = [];      // tiri di dado dell'avversario ricevuti dalla rete
    combatCtx.sentRoundKey = null;  // per inviare i miei dadi una sola volta a round
    combatCtx.bfOwners = { A: combatCtx.att.owner, B: combatCtx.def ? combatCtx.def.owner : combatCtx.cell.owner };
    initBattlefield(combatCtx);
    combatCtx.session.startRound();
    renderCombat();
  }

  // L'attaccante avvia il combattimento. Online, se il difensore è un altro
  // giocatore umano, i dadi di DIFESA li lancia lui: si usa il combattimento in rete.
  function launchAttack(kind, ev) {
    let defenderSeat = null;
    if (kind === "fleet") { const def = game.fleetById(ev.defender); defenderSeat = def ? def.owner : null; }
    else { const cell = game.cell(ev.q, ev.r); defenderSeat = cell ? cell.owner : null; }
    if (onlineMode && defenderSeat != null && defenderSeat !== myPlayerId) {
      const cid = "c" + Date.now() + "_" + Math.floor(Math.random() * 1e6);
      window.IGNet.sendCombat({ sub: "start", cid: cid, kind: kind, attacker: ev.attacker, defender: ev.defender != null ? ev.defender : null, q: ev.q, r: ev.r, land: ev.land || 0, attackerSeat: myPlayerId, defenderSeat: defenderSeat });
      startInteractiveCombat(kind, ev, { mySide: "A", net: true, cid: cid });
    } else {
      startInteractiveCombat(kind, ev, { mySide: "A" });
    }
  }

  // Ricezione dei messaggi di combattimento online
  function onNetCombat(m) {
    if (m.sub === "start") {
      if (m.defenderSeat !== myPlayerId) return; // non tocca a me difendere
      if (combatCtx) return; // già in un combattimento
      toast("⚠ Sei sotto attacco — lancia i dadi di difesa!");
      Snd.turnStart();
      startInteractiveCombat(m.kind, { attacker: m.attacker, defender: m.defender, q: m.q, r: m.r, land: m.land }, { mySide: "B", net: true, cid: m.cid });
    } else if (m.sub === "roll") {
      if (combatCtx && combatCtx.net && combatCtx.cid === m.cid) { combatCtx.enemyQueue.push(m.dice || []); tryApplyEnemyRoll(); }
    }
  }
  // Invia i miei dadi del round corrente (una sola volta per round)
  function sendMyRoll(list) {
    const ctx = combatCtx; if (!ctx || !ctx.net) return;
    const key = ctx.phase + ":" + ctx.session.roundIndex;
    if (ctx.sentRoundKey === key) return;
    ctx.sentRoundKey = key;
    window.IGNet.sendCombat({ sub: "roll", cid: ctx.cid, dice: list.map((d) => d.die) });
  }
  // Applica i dadi dell'avversario in coda al round corrente
  function tryApplyEnemyRoll() {
    const ctx = combatCtx; if (!ctx || !ctx.net || !ctx.enemyQueue.length || !ctx.session.round) return;
    const r = ctx.session.round;
    const iAmAggressor = (r.aggressorIsA === (ctx.mySide === "A"));
    const enemy = iAmAggressor ? r.def : r.att;
    if (enemy.every((d) => d.die != null)) return; // già riempito
    const dice = ctx.enemyQueue.shift();
    for (let i = 0; i < enemy.length; i++) enemy[i].die = dice[i];
    renderCombat();
  }

  // ===================== CAMPO DI BATTAGLIA VISIVO =====================
  // Le unità dei due lati schierate una di fronte all'altra; dopo la risoluzione
  // dei dadi si vedono i colpi (laser/proiettili), le esplosioni e gli scudi.
  function initBattlefield(ctx) {
    ctx.session.A.forEach((u, i) => { u._slot = i; });
    ctx.session.B.forEach((u, i) => { u._slot = i; });
    ctx.bfPos = {}; // "A-3" -> {x,y}, riempito dal rendering
  }

  const BF_W = 560, BF_H = 210;
  function renderBattlefield(ctx) {
    const s = ctx.session, ground = !!s.ground;
    const svg = svgEl("svg", { viewBox: "0 0 " + BF_W + " " + BF_H, class: "battlefield " + (ground ? "bf-ground" : "bf-space") });
    if (ground) {
      // teatro terrestre: cielo all'orizzonte + suolo con crateri
      svg.innerHTML = '<defs>' +
        '<linearGradient id="bf-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#141c38"/><stop offset="100%" stop-color="#513c2a"/></linearGradient>' +
        '<linearGradient id="bf-terra" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5c4832"/><stop offset="100%" stop-color="#20160c"/></linearGradient>' +
        '</defs>' +
        '<rect x="0" y="0" width="' + BF_W + '" height="72" fill="url(#bf-sky)"/>' +
        '<rect x="0" y="72" width="' + BF_W + '" height="' + (BF_H - 72) + '" fill="url(#bf-terra)"/>';
      for (let i = 0; i < 8; i++) {
        const cx = 20 + Math.random() * (BF_W - 40), cy = 88 + Math.random() * (BF_H - 108), rx = 6 + Math.random() * 14;
        svg.appendChild(svgEl("ellipse", { cx: cx.toFixed(0), cy: cy.toFixed(0), rx: rx.toFixed(0), ry: (rx * 0.35).toFixed(0), fill: "#000", opacity: 0.2 }));
      }
    } else {
      // teatro spaziale: campo stellare + nebulose
      svg.innerHTML = '<rect x="0" y="0" width="' + BF_W + '" height="' + BF_H + '" fill="#060b1a"/>';
      for (let i = 0; i < 42; i++) {
        svg.appendChild(svgEl("circle", { cx: (Math.random() * BF_W).toFixed(0), cy: (Math.random() * BF_H).toFixed(0), r: (0.3 + Math.random() * 1.2).toFixed(1), fill: "#cfe0ff", opacity: (0.2 + Math.random() * 0.6).toFixed(2) }));
      }
      svg.appendChild(svgEl("ellipse", { cx: 120, cy: 45, rx: 140, ry: 65, fill: "url(#neb-violet)" }));
      svg.appendChild(svgEl("ellipse", { cx: 450, cy: 168, rx: 125, ry: 58, fill: "url(#neb-cyan)" }));
    }
    // linea del fronte
    svg.appendChild(svgEl("line", { x1: BF_W / 2, y1: 14, x2: BF_W / 2, y2: BF_H - 14, stroke: "#5b6c96", "stroke-width": 1, "stroke-dasharray": "4 6", opacity: 0.35 }));
    ctx.bfPos = {};
    drawBFSide(svg, ctx, "A", s.A, ground);
    drawBFSide(svg, ctx, "B", s.B, ground);
    return svg;
  }

  // Schiera le unità di un lato a griglia (A a sinistra, B a destra, muso verso il nemico)
  function drawBFSide(svg, ctx, side, units, ground) {
    const n = units.length; if (!n) return;
    const rows = Math.min(5, Math.max(2, Math.ceil(n / 4)));
    const cols = Math.ceil(n / rows);
    const rowH = Math.min(ground ? 30 : 36, 160 / rows);
    const colW = Math.min(42, 145 / cols);
    const scale = Math.max(0.55, Math.min(1.1, rowH / 30));
    const y0 = (ground ? 128 : 105) - ((rows - 1) * rowH) / 2;
    const color = side === "A" ? ctx.attColor : ctx.defColor;
    const ownerId = ctx.bfOwners ? ctx.bfOwners[side] : 0;
    units.forEach((u, i) => {
      const row = i % rows, col = Math.floor(i / rows);
      const x = side === "A" ? 235 - col * colW - (row % 2) * 9 : 325 + col * colW + (row % 2) * 9;
      const y = y0 + row * rowH;
      ctx.bfPos[side + "-" + u._slot] = { x: x, y: y };
      const g = svgEl("g", { id: "bf-" + side + "-" + u._slot, class: "bf-unit" });
      drawBFUnit(g, u, x, y, scale, ownerId, color, side === "A");
      svg.appendChild(g);
    });
  }

  function drawBFUnit(parent, u, x, y, s, ownerId, color, facingRight) {
    if (u.type === "cannone") return drawBFCannon(parent, x, y, s, color, facingRight);
    if (u.type === "torretta") return drawBFTurret(parent, x, y, s, color);
    const type = u.type === "carro" ? "carri" : u.type;
    parent.appendChild(svgEl("ellipse", { cx: x, cy: y + 11 * s, rx: 10 * s, ry: 2.6 * s, fill: "#000", opacity: 0.35 }));
    const g = svgEl("g", { transform: "translate(" + x + " " + y + ") scale(" + s + ") rotate(" + (facingRight ? 90 : -90) + ")" });
    shipParts(g, type, ownerId, color);
    parent.appendChild(g);
  }
  // Cannone interstellare (difesa spaziale): piattaforma con canna verso il nemico
  function drawBFCannon(parent, x, y, s, color, facingRight) {
    const dk = shade(color, -0.4);
    const g = svgEl("g", { transform: "translate(" + x + " " + y + ") scale(" + s + ")" });
    g.appendChild(svgEl("rect", { x: -4, y: -13, width: 8, height: 6, rx: 1, fill: dk }));
    g.appendChild(svgEl("rect", { x: -4, y: 7, width: 8, height: 6, rx: 1, fill: dk }));
    g.appendChild(svgEl("circle", { cx: 0, cy: 0, r: 6, fill: "#1b2440", stroke: color, "stroke-width": 1.4 }));
    g.appendChild(svgEl("rect", { x: facingRight ? 5 : -15, y: -1.6, width: 10, height: 3.2, rx: 1.4, fill: color }));
    g.appendChild(svgEl("circle", { cx: 0, cy: 0, r: 2.2, fill: color }));
    parent.appendChild(g);
  }
  // Torretta di terra: torre con cupola e canna
  function drawBFTurret(parent, x, y, s, color) {
    const dk = shade(color, -0.45);
    const g = svgEl("g", { transform: "translate(" + x + " " + y + ") scale(" + s + ")" });
    g.appendChild(svgEl("ellipse", { cx: 0, cy: 10, rx: 9, ry: 2.6, fill: "#000", opacity: 0.35 }));
    g.appendChild(svgEl("path", { d: "M-8 10 L-5 -2 L5 -2 L8 10 Z", fill: dk, stroke: "#0a0f1e", "stroke-width": 0.6 }));
    g.appendChild(svgEl("circle", { cx: 0, cy: -4, r: 4.4, fill: color, stroke: dk, "stroke-width": 1 }));
    g.appendChild(svgEl("rect", { x: -14, y: -5.4, width: 11, height: 2.6, rx: 1.2, fill: dk }));
    parent.appendChild(g);
  }

  // Animazione SMIL avviata manualmente (inserita a runtime, begin="indefinite")
  function smilAnim(el, attrs) {
    const a = svgEl("animate", Object.assign({ begin: "indefinite", fill: "freeze" }, attrs));
    el.appendChild(a);
    requestAnimationFrame(() => { try { a.beginElement(); } catch (e) {} });
  }
  function fireLaser(svg, a, b, color) {
    [[3.2, color], [1.2, "#ffffff"]].forEach((cfg) => {
      const ln = svgEl("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: cfg[1], "stroke-width": cfg[0], "stroke-linecap": "round", class: "bf-laser" });
      ln.style.color = cfg[1];
      svg.appendChild(ln);
      setTimeout(() => { try { ln.remove(); } catch (e) {} }, 320);
    });
  }
  function explodeAt(svg, p, unitId) {
    const unit = document.getElementById("bf-" + unitId);
    if (unit) unit.classList.add("bf-dying");
    const g = svgEl("g", { class: "bf-exp" });
    const fire = svgEl("circle", { cx: p.x, cy: p.y, r: 1, fill: "#ff9a3c" });
    smilAnim(fire, { attributeName: "r", from: "1", to: "12", dur: "0.55s" });
    smilAnim(fire, { attributeName: "opacity", from: "1", to: "0", dur: "0.55s" });
    const flash = svgEl("circle", { cx: p.x, cy: p.y, r: 2, fill: "#ffffff" });
    smilAnim(flash, { attributeName: "r", from: "2", to: "17", dur: "0.4s" });
    smilAnim(flash, { attributeName: "opacity", from: "1", to: "0", dur: "0.4s" });
    g.appendChild(fire); g.appendChild(flash);
    for (let i = 0; i < 6; i++) {
      const an = Math.random() * Math.PI * 2, d = 10 + Math.random() * 12;
      const sp = svgEl("line", { x1: p.x, y1: p.y, x2: p.x + Math.cos(an) * d, y2: p.y + Math.sin(an) * d, stroke: "#ffcf7a", "stroke-width": 1.1 });
      smilAnim(sp, { attributeName: "opacity", from: "0.9", to: "0", dur: "0.5s" });
      g.appendChild(sp);
    }
    svg.appendChild(g);
    setTimeout(() => { try { g.remove(); } catch (e) {} }, 700);
  }
  function shieldAt(svg, p) {
    const c = svgEl("circle", { cx: p.x, cy: p.y, r: 9, fill: "none", stroke: "#7fd0ff", "stroke-width": 2, class: "bf-shield" });
    smilAnim(c, { attributeName: "r", from: "9", to: "17", dur: "0.4s" });
    smilAnim(c, { attributeName: "opacity", from: "0.9", to: "0", dur: "0.4s" });
    svg.appendChild(c);
    setTimeout(() => { try { c.remove(); } catch (e) {} }, 500);
  }
  function shakeModal() {
    const box = $("modal").querySelector(".modal-box");
    if (box) { box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake"); setTimeout(() => box.classList.remove("shake"), 450); }
  }

  // Risolve il round e mette in scena i colpi: laser dall'aggressore, poi
  // esplosioni sulle unità distrutte (o scudo se nessun colpo va a segno).
  function resolveRoundWithFX() {
    const ctx = combatCtx; if (!ctx) return;
    const s = ctx.session;
    const aggSide = s.aggressorIsA ? "A" : "B";
    const defArr = s.aggressorIsA ? s.B : s.A;
    const before = defArr.slice();
    const res = s.resolve();
    const dead = before.filter((u) => defArr.indexOf(u) === -1);
    playBattleFX(ctx, aggSide, dead, () => { if (combatCtx === ctx) onRoundResolved(res); });
  }
  function playBattleFX(ctx, aggSide, dead, done) {
    const svg = document.querySelector("#modalBody .battlefield");
    if (!svg) { done(); return; }
    const defSide = aggSide === "A" ? "B" : "A";
    const shooters = (aggSide === "A" ? ctx.session.A : ctx.session.B).slice(0, 3);
    const attColor = aggSide === "A" ? ctx.attColor : ctx.defColor;
    const defUnits = aggSide === "A" ? ctx.session.B : ctx.session.A;
    // bersagli: le unità distrutte; se nessuna, un difensore a caso (colpo parato)
    const targets = dead.length ? dead : (defUnits.length ? [defUnits[Math.floor(Math.random() * defUnits.length)]] : []);
    if (!targets.length || !shooters.length) { done(); return; }
    let delay = 0;
    targets.forEach((t, ti) => {
      const shooter = shooters[ti % shooters.length];
      const from = ctx.bfPos[aggSide + "-" + shooter._slot];
      const to = ctx.bfPos[defSide + "-" + t._slot];
      if (!from || !to) return;
      setTimeout(() => {
        fireLaser(svg, from, to, attColor);
        Snd.laser();
        setTimeout(() => {
          if (dead.length) { explodeAt(svg, to, defSide + "-" + t._slot); Snd.boom(); if (ti === 0) shakeModal(); }
          else shieldAt(svg, to);
        }, 170);
      }, delay);
      delay += 280;
    });
    setTimeout(done, delay + 750);
  }

  function caCol(name, color, comp) {
    const col = htmlEl("div", "battle-col");
    const h = htmlEl("div", "battle-col-h"); h.innerHTML = '<span class="dot" style="background:' + color + '"></span>' + esc(name);
    col.appendChild(h); col.appendChild(unitChips(comp, comp, color));
    return col;
  }

  function renderCombat() {
    const ctx = combatCtx, s = ctx.session;
    const body = htmlEl("div", "combat-arena");
    // testata: nomi e conteggi ai lati, round al centro
    const head = htmlEl("div", "bf-head");
    head.innerHTML =
      '<span class="bf-side"><span class="dot" style="background:' + ctx.attColor + '"></span>' + esc(ctx.attName) + ' <span class="bf-n">×' + s.A.length + '</span></span>' +
      '<span class="bf-round">Round ' + (s.roundIndex + 1) + (ctx.phase === "ground" ? " · 🪖 TERRA" : " · ⚔") + '</span>' +
      '<span class="bf-side"><span class="bf-n">×' + s.B.length + '</span> ' + esc(ctx.defName) + ' <span class="dot" style="background:' + ctx.defColor + '"></span></span>';
    body.appendChild(head);
    // campo di battaglia: le unità schierate una di fronte all'altra
    body.appendChild(renderBattlefield(ctx));

    const r = s.round;
    const iAmAggressor = (r.aggressorIsA === (ctx.mySide === "A")); // sono io ad attaccare in questo round?
    const yours = iAmAggressor ? r.att : r.def;
    const enemy = iAmAggressor ? r.def : r.att;
    const whoAtt = r.aggressorIsA ? ctx.attName : ctx.defName;
    const rt = htmlEl("div", "ca-roundtitle"); rt.innerHTML = "🎯 Attacca: <b>" + esc(whoAtt) + "</b>"; body.appendChild(rt);
    const rows = htmlEl("div", "ca-dice-rows");
    rows.appendChild(diceRow("I TUOI DADI", yours, true));
    rows.appendChild(diceRow("AVVERSARIO", enemy, false));
    body.appendChild(rows);

    const title = ctx.mySide === "B" ? "🛡 Sei sotto attacco — Difenditi!" : (ctx.kind === "fleet" ? "⚔ Scontro spaziale" : "⚔ Attacco al pianeta");
    modalWide(title, body);
    const acts = $("modalActions"); acts.innerHTML = "";
    const yoursDone = yours.every((d) => d.die != null), enemyDone = enemy.every((d) => d.die != null);

    // --- Combattimento in rete: ognuno lancia SOLO i propri dadi ---
    if (ctx.net) {
      // Appena i miei dadi sono completi li invio SEMPRE, anche se quelli
      // dell'avversario sono già arrivati (altrimenti lui resta in attesa).
      if (yoursDone) sendMyRoll(yours);
      if (!yoursDone) {
        acts.appendChild(htmlEl("div", "ca-hint", "👆 Clicca i tuoi dadi (o lanciali tutti)"));
        const all = htmlEl("button", "primary", "Lancia i miei dadi 🎲"); all.onclick = () => { s.rollAll(yours); Snd.dice(); renderCombat(); }; acts.appendChild(all);
      } else if (!enemyDone) {
        acts.appendChild(htmlEl("div", "ca-hint", "⏳ In attesa dei dadi dell'avversario…"));
        tryApplyEnemyRoll();               // se sono già arrivati, applicali
      } else {
        acts.appendChild(htmlEl("div", "ca-hint", "Risoluzione del round…"));
        setTimeout(() => { if (combatCtx === ctx && !ctx._resolving) { ctx._resolving = true; resolveRoundWithFX(); } }, 550);
      }
      return;
    }

    // --- Combattimento locale (hot-seat / difesa contro l'IA): tiri tu tutti i dadi ---
    if (!yoursDone) {
      acts.appendChild(htmlEl("div", "ca-hint", "👆 Clicca i tuoi dadi per lanciarli"));
      const all = htmlEl("button", null, "Lancia tutti"); all.onclick = () => { s.rollAll(yours); renderCombat(); }; acts.appendChild(all);
    } else if (!enemyDone) {
      const b = htmlEl("button", "primary", "Lancia dadi avversario 🎲"); b.onclick = () => { s.rollAll(enemy); renderCombat(); }; acts.appendChild(b);
    } else {
      const b = htmlEl("button", "primary", "Risolvi round ⚔"); b.onclick = () => { b.disabled = true; resolveRoundWithFX(); }; acts.appendChild(b);
    }
  }

  function diceRow(label, list, clickable) {
    const row = htmlEl("div", "ca-dice " + (clickable ? "yours" : "enemy"));
    row.appendChild(htmlEl("div", "ca-dice-label", label));
    const wrap = htmlEl("div", "ca-dice-list");
    if (!list.length) wrap.appendChild(htmlEl("span", "muted", "—"));
    for (const slot of list) {
      const d = htmlEl("span", "cdie" + (slot.die == null && clickable ? " rollable" : "") + (slot.die == null && !clickable ? " pending" : ""));
      d.style.color = DIE_COLOR[slot.type] || "#fff";
      const face = htmlEl("span", "die-face"); face.textContent = slot.die != null ? DIE_GLYPH[slot.die] : "🎲"; d.appendChild(face);
      if (slot.mult > 1) { const m = htmlEl("span", "die-mult"); m.textContent = "×" + slot.mult; d.appendChild(m); }
      if (slot.die == null && clickable) {
        d.onclick = () => { combatCtx.session.rollSlot(slot); Snd.dice(); tumbleSingle(face, slot.die, () => renderCombat()); };
      }
      wrap.appendChild(d);
    }
    row.appendChild(wrap);
    return row;
  }

  function tumbleSingle(faceEl, finalDie, cb) {
    let t = 0; const iv = setInterval(() => {
      faceEl.textContent = DIE_GLYPH[1 + Math.floor(Math.random() * 6)];
      if (++t >= 7) { clearInterval(iv); faceEl.textContent = DIE_GLYPH[finalDie]; if (faceEl.parentNode) faceEl.parentNode.classList.add("die-pop"); if (cb) setTimeout(cb, 130); }
    }, 55);
  }

  function onRoundResolved(res) {
    if (!combatCtx) return;
    combatCtx._resolving = false; // lo scuotimento avviene durante gli effetti (playBattleFX)
    if (res.finished) { combatFinished(); }
    else { combatCtx.session.startRound(); renderCombat(); }
  }

  // Esito mostrato dalla prospettiva giusta (attacco vs difesa)
  function endDisplay(code) {
    const def = combatCtx && combatCtx.mySide === "B";
    const M = {
      winA: ["VITTORIA", "win", "🛑 FLOTTA PERDUTA", "lose"],
      winB: ["SCONFITTA", "lose", "🛡 DIFESA RIUSCITA", "win"],
      draw: ["Inconcludente", "push", "Inconcludente", "push"],
      attackerDestroyed: ["FLOTTA DISTRUTTA", "lose", "🛡 ATTACCANTE ANNIENTATO", "win"],
      spaceFailed: ["ATTACCO RESPINTO", "lose", "🛡 ATTACCO RESPINTO", "win"],
      captured: ["🚩 PIANETA CONQUISTATO", "win", "🛑 PIANETA PERDUTO", "lose"],
      spaceWonNoCapture: ["DIFESE SUPERATE", "push", "Difese spaziali cadute", "push"],
      spaceWonNoLand: ["DIFESE A TERRA INTATTE", "push", "🛡 Terra difesa", "win"],
      groundFailed: ["SBARCO RESPINTO", "lose", "🛡 SBARCO RESPINTO", "win"],
    };
    const e = M[code] || ["Esito", "push", "Esito", "push"];
    return def ? { text: e[2], type: e[3] } : { text: e[0], type: e[1] };
  }

  function combatFinished() {
    const ctx = combatCtx, s = ctx.session, winner = s.winner;
    if (ctx.kind === "fleet") {
      game.applyFleetCombatResult(ctx.att, ctx.def, ctx.uA, ctx.uB, winner);
      return showCombatEnd(endDisplay(winner === "A" ? "winA" : winner === "B" ? "winB" : "draw"));
    }
    // PIANETA
    if (ctx.phase === "space") {
      const res = game.applyPlanetSpaceResult(ctx.att, ctx.cell, ctx.defFleet, ctx.uA, ctx.uB, winner);
      if (res.outcome === "attackerDestroyed") return showCombatEnd(endDisplay("attackerDestroyed"));
      if (res.outcome === "spaceFailed") return showCombatEnd(endDisplay("spaceFailed"));
      // difese spaziali superate
      if (!res.groundDef) {
        const r2 = game.applyPlanetNoGround(ctx.att, ctx.cell, ctx.land);
        return showCombatEnd(endDisplay(r2.outcome === "captured" ? "captured" : "spaceWonNoCapture"));
      }
      const landN = Math.min(ctx.att.carri, ctx.land != null ? ctx.land : ctx.att.carri);
      if (landN <= 0) { game.applyPlanetSkipGround(ctx.att, ctx.cell); return showCombatEnd(endDisplay("spaceWonNoLand")); }
      // passa alla lotta di terra (interattiva)
      const gs = game.planetGroundSetup(ctx.cell, landN);
      ctx.landN = landN; ctx.gtA = gs.tA; ctx.gtB = gs.tB; ctx.phase = "ground";
      ctx.attName = game.player(ctx.att.owner).name + " (sbarco)";
      ctx.session = game.makeCombatSession(gs.tA, gs.tB, true);
      initBattlefield(ctx); // nuovo campo di battaglia per la fase di terra
      ctx.session.startRound();
      flashBanner("discovery", "⚔ Lotta di terra", "🪖", "Sbarco di " + landN + " carri", "");
      renderCombat();
      return;
    }
    if (ctx.phase === "ground") {
      game.applyPlanetGroundResult(ctx.att, ctx.cell, ctx.landN, ctx.gtA, ctx.gtB, winner);
      return showCombatEnd(endDisplay(winner === "A" ? "captured" : "groundFailed"));
    }
  }

  function showCombatEnd(out) {
    const ev = combatCtx ? combatCtx.ev : null;
    const onDone = combatCtx ? combatCtx.onDone : null;
    const mySide = combatCtx ? combatCtx.mySide : "A";
    const net = combatCtx ? combatCtx.net : false;
    const body = htmlEl("div");
    const ban = htmlEl("div", "outcome-banner " + out.type); ban.textContent = out.text; body.appendChild(ban);
    body.appendChild(htmlEl("p", "muted center", "Premi OK per continuare."));
    modalWide("Esito del combattimento", body);
    const acts = $("modalActions"); acts.innerHTML = "";
    const ok = htmlEl("button", "primary", "OK");
    ok.onclick = () => {
      closeModalWide();
      if (mySide === "A") {
        const af = ev && game.fleetById(ev.attacker);
        sel.fleetId = af ? ev.attacker : null;
        if (af) sel.cellKey = Hex.key(af.q, af.r); // seleziona il pianeta conquistato → mostra la plancia
      }
      render();
      if (game.winner != null) { showWin(); return; }
      if (onDone) { onDone(); return; }  // riprende il turno dell'IA dopo la difesa
      if (!(net && mySide === "B")) syncNet(); // online: l'attaccante sincronizza l'esito (il difensore no)
    };
    acts.appendChild(ok);
    combatCtx = null;
  }

  function modalWide(title, bodyNode) {
    $("modalTitle").textContent = title;
    const b = $("modalBody"); b.innerHTML = ""; b.appendChild(bodyNode);
    const box = $("modal").querySelector(".modal-box"); if (box) box.classList.add("wide");
    $("modal").classList.remove("hidden");
  }
  function closeModalWide() { const box = $("modal").querySelector(".modal-box"); if (box) box.classList.remove("wide"); closeModal(); }

  function battleCol(name, color, before, after) {
    const col = htmlEl("div", "battle-col");
    const h = htmlEl("div", "battle-col-h");
    h.innerHTML = '<span class="dot" style="background:' + color + '"></span>' + esc(name);
    col.appendChild(h);
    col.appendChild(unitChips(before, after, color));
    return col;
  }

  // ----------------------------------------------- Dadi (rendering + animazione)
  const DIE_GLYPH = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const DIE_COLOR = { caccia: "#ff6b6b", torpediniera: "#ffd86b", colonia: "#5fd17a", cannone: "#9fb4ff", torretta: "#9fb4ff", carro: "#cfd8ef", casino: "#ffffff" };
  function dieEl(val, type, mult) {
    const d = htmlEl("span", "die"); d.style.color = DIE_COLOR[type] || "#fff";
    const face = htmlEl("span", "die-face"); face.textContent = DIE_GLYPH[val] || "⚀"; d.appendChild(face);
    if (mult && mult > 1) { const m = htmlEl("span", "die-mult"); m.textContent = "×" + mult; d.appendChild(m); }
    d._final = val; return d;
  }
  function tumbleDice(root, done) {
    const faces = [].slice.call(root.querySelectorAll(".die-face"));
    if (!faces.length) { if (done) done(); return; }
    let t = 0;
    const iv = setInterval(() => {
      for (const f of faces) f.textContent = DIE_GLYPH[1 + Math.floor(Math.random() * 6)];
      if (++t >= 9) {
        clearInterval(iv);
        for (const f of faces) { f.textContent = DIE_GLYPH[f.parentNode._final] || "⚀"; f.parentNode.classList.add("die-pop"); }
        if (done) done();
      }
    }, 65);
  }
  function roundsSection(label, rounds) {
    const sec = htmlEl("div", "battle-sec");
    if (label) sec.appendChild(htmlEl("div", "battle-sec-h", label));
    const shown = rounds.slice(0, 8);
    shown.forEach((rd, i) => {
      const row = htmlEl("div", "round");
      row.appendChild(htmlEl("span", "round-n", "R" + (i + 1)));
      const who = htmlEl("span", "side-tag " + (rd.aggressorIsAttacker ? "att" : "def"));
      who.textContent = rd.aggressorIsAttacker ? "Att" : "Dif"; row.appendChild(who);
      rd.att.forEach((x) => row.appendChild(dieEl(x.die, x.type, x.mult)));
      row.appendChild(htmlEl("span", "vs", "›"));
      rd.def.forEach((x) => row.appendChild(dieEl(x.die, x.type, x.mult)));
      if (rd.killed) row.appendChild(htmlEl("span", "kills", "💥" + rd.killed));
      sec.appendChild(row);
    });
    if (rounds.length > shown.length) sec.appendChild(htmlEl("div", "muted", "…e altri " + (rounds.length - shown.length) + " round (vedi diario)"));
    return sec;
  }

  function showBattleResult(o) {
    const body = htmlEl("div");
    // Banner di esito (grande, visivo)
    const ban = htmlEl("div", "outcome-banner " + o.outcome.type); ban.textContent = o.outcome.text;
    body.appendChild(ban);
    // Le due flotte come icone (con perdite barrate)
    const grid = htmlEl("div", "battle-grid result");
    grid.appendChild(battleColRich(o.attacker));
    grid.appendChild(htmlEl("div", "vs-badge", "⚔"));
    grid.appendChild(battleColRich(o.defender));
    body.appendChild(grid);
    // Dadi (in dettaglio apribile, di default aperto)
    const diceWrap = htmlEl("div", "battle-dice");
    if (o.rounds && o.rounds.length) diceWrap.appendChild(roundsSection("Tiri di dado", o.rounds));
    if (o.spaceRounds && o.spaceRounds.length) diceWrap.appendChild(roundsSection("Combattimento spaziale", o.spaceRounds));
    if (o.groundRounds && o.groundRounds.length) diceWrap.appendChild(roundsSection("Lotta di terra", o.groundRounds));
    if (diceWrap.children.length) {
      const det = document.createElement("details"); det.className = "dice-details"; det.open = true;
      const sum = document.createElement("summary"); sum.textContent = "🎲 Dettaglio dei tiri"; det.appendChild(sum);
      det.appendChild(diceWrap); body.appendChild(det);
    }
    modal(o.title, body, [{ label: "OK", primary: true, onClick: () => { closeModal(); render(); if (game.winner != null) showWin(); } }]);
    tumbleDice(body);
  }
  function battleColRich(side) {
    const col = htmlEl("div", "battle-col");
    const h = htmlEl("div", "battle-col-h");
    h.innerHTML = '<span class="role ' + (side.isAtt ? "att" : "def") + '">' + esc(side.role) + '</span>' +
      '<span class="bc-name"><span class="dot" style="background:' + side.color + '"></span>' + esc(side.name) + '</span>';
    col.appendChild(h);
    col.appendChild(unitChips(side.before, side.after, side.color));
    return col;
  }

  function openSplit(fleetId) {
    const f = game.fleetById(fleetId); if (!f) return;
    const body = htmlEl("div");
    body.appendChild(htmlEl("p", null, "Quante unità spostare in una nuova flotta?"));
    const inputs = {};
    for (const t of ["caccia", "torpediniera", "colonia"]) {
      const row = htmlEl("div", "field-row");
      row.appendChild(htmlEl("span", null, CFG.SHIP_NAMES[t] + " (max " + f.ships[t] + ")"));
      const i = htmlEl("input"); i.type = "number"; i.value = 0; i.min = 0; i.max = f.ships[t]; inputs[t] = i; row.appendChild(i);
      body.appendChild(row);
    }
    const rowc = htmlEl("div", "field-row");
    rowc.appendChild(htmlEl("span", null, "Carri (max " + f.carri + ")"));
    const ci = htmlEl("input"); ci.type = "number"; ci.value = 0; ci.min = 0; ci.max = f.carri; rowc.appendChild(ci);
    body.appendChild(rowc);
    modal("Dividi flotta #" + f.id, body, [
      { label: "Dividi", primary: true, onClick: () => {
          const take = { caccia: +inputs.caccia.value, torpediniera: +inputs.torpediniera.value, colonia: +inputs.colonia.value, carri: +ci.value };
          game.splitFleet(fleetId, take); closeModal(); render();
        } },
      { label: "Annulla", onClick: closeModal },
    ]);
  }

  // ---------------------------------------------------------------- MERCATO
  let marketCardCache = {}; // fleetId -> {turn, card, bought} (una carta per turno)
  function openMarket(fleetId) {
    const f = game.fleetById(fleetId); if (!f) return;
    let entry = marketCardCache[fleetId];
    if (!entry || entry.turn !== game.turnNumber) { entry = { turn: game.turnNumber, card: game.marketDraw(), bought: false }; marketCardCache[fleetId] = entry; }

    function refresh() {
      const p = game.player(f.owner);
      const card = entry.card;
      const unitName = card.unita === "carri" ? "Carri" : CFG.SHIP_NAMES[card.unita];
      const body = htmlEl("div");
      const moneyLine = htmlEl("div", "info-line"); moneyLine.innerHTML = "💰 Hai <b>" + p.money.toLocaleString() + "</b> Ndri"; body.appendChild(moneyLine);
      // Carta deal del turno
      const dealBox = htmlEl("div", "market-deal" + (entry.bought ? " done" : ""));
      dealBox.innerHTML = '<div class="md-icon">' + (card.unita === "carri" ? "🪖" : (UNIT_ICON[card.unita] || "🚀")) + "</div>" +
        '<div class="md-info"><div class="md-title">' + card.qta + "× " + esc(unitName) + "</div>" +
        '<div class="md-price">' + card.prezzo.toLocaleString() + " Ndri</div></div>";
      body.appendChild(dealBox);
      if (entry.bought) body.appendChild(htmlEl("div", "info-line", "✓ Deal già acquistato questo turno."));
      else if (p.money < card.prezzo) body.appendChild(htmlEl("div", "info-line", "⚠ Ndri insufficienti per questo deal."));

      body.appendChild(htmlEl("h3", null, "Compra/vendi cubi materia"));
      for (const m of ["carburante", "metallo", "pietra"]) {
        const row = htmlEl("div", "field-row");
        row.appendChild(htmlEl("span", null, m + " (hai " + p.res[m] + ")"));
        const buy = htmlEl("button", "small", "Compra (" + CFG.PREZZO_ACQUISTO_CUBO / 1000 + "k)"); buy.disabled = p.money < CFG.PREZZO_ACQUISTO_CUBO; buy.onclick = () => { const r = game.marketTradeCube(f.owner, m, 1, false); if (!r.ok) { toast(r.msg); return; } render(); syncNet(); refresh(); };
        const sell = htmlEl("button", "small", "Vendi (" + CFG.PREZZO_VENDITA_CUBO / 1000 + "k)"); sell.disabled = p.res[m] < 1; sell.onclick = () => { const r = game.marketTradeCube(f.owner, m, 1, true); if (!r.ok) { toast(r.msg); return; } render(); syncNet(); refresh(); };
        row.appendChild(buy); row.appendChild(sell); body.appendChild(row);
      }

      // Acquisto della carta (per i carri: nave se c'è capienza, altrimenti scelta del pianeta)
      function tryBuyCard(targetPlanet) {
        const r = game.marketBuy(fleetId, card, targetPlanet);
        if (r.ok) {
          entry.bought = true; render(); syncNet();
          flashBanner("bonus", "🛒 Mercato", "🛒", "Acquistati " + card.qta + "× " + unitName, r.dest === "planet" ? "assegnati a un pianeta" : "caricati sulla flotta");
          refresh(); return;
        }
        if (r.needPlanet) { chooseCarriPlanet(); return; }
        toast("❌ " + r.msg);
      }
      function chooseCarriPlanet() {
        const planets = game.planetsWithGarrisonRoom(f.owner, card.qta);
        const b = htmlEl("div");
        b.appendChild(htmlEl("p", "muted center", "Le navi non hanno capienza per " + card.qta + " carri. Assegnali a un tuo pianeta (max " + CFG.MAX_CARRI_PIANETA + " per pianeta):"));
        const acts = planets.map((cell) => ({ label: "🪐 " + cell.planet.data.nome + " (" + cell.garrison + "/" + CFG.MAX_CARRI_PIANETA + ")", onClick: () => tryBuyCard({ q: cell.q, r: cell.r }) }));
        acts.push({ label: "Annulla", onClick: () => refresh() });
        modal("🪖 Assegna i carri a un pianeta", b, acts);
      }

      const actions = [];
      if (!entry.bought) actions.push({ label: "🛒 Acquista il deal (" + (card.prezzo / 1000) + "k)", primary: true, disabled: p.money < card.prezzo, onClick: () => tryBuyCard() });
      actions.push({ label: "Chiudi", onClick: () => { closeModal(); render(); } });
      modal("🛒 Mercato", body, actions);
    }
    refresh();
  }

  // ---------------------------------------------------------------- CASINO
  function openCasino(fleetId) {
    const f = game.fleetById(fleetId); if (!f) return;
    const pid = f.owner;
    function refresh() {
      const s = game._casinoSession(pid);
      const body = htmlEl("div");
      body.appendChild(htmlEl("p", null, "Banca Interstellare. Somma 7/11 vince (raddoppia il banco), 2/3/12 perde, altro = pareggio (rilancia con escalation o lascia)."));
      body.appendChild(htmlEl("div", "info-line", "Banco attuale: " + s.banco.toLocaleString() + " Ndri | Tuoi Ndri: " + game.player(pid).money.toLocaleString()));
      const row = htmlEl("div", "field-row");
      const minBet = s.banco > 0 ? Math.max(CFG.CASINO_PUNTATA_MIN, s.banco) : CFG.CASINO_PUNTATA_MIN;
      row.appendChild(htmlEl("span", null, "Puntata (min " + minBet.toLocaleString() + "):"));
      const inp = htmlEl("input"); inp.type = "number"; inp.value = minBet; inp.min = minBet; inp.step = 1000; row.appendChild(inp);
      body.appendChild(row);
      const actions = [
        { label: "Punta e lancia 🎲", primary: true, onClick: () => {
            const r = game.casinoBet(pid, parseInt(inp.value || "0", 10));
            if (!r.ok) { toast(r.msg); return; }
            const roll = game.casinoRoll(pid);
            render(); syncNet();
            showCasinoRoll(pid, roll, refresh);
          } },
      ];
      if (s.banco > 0) actions.push({ label: "Lascia (perdi banco)", onClick: () => { game.casinoLeave(pid); closeModal(); render(); syncNet(); } });
      actions.push({ label: "Esci", onClick: () => { closeModal(); render(); } });
      modal("🎲 Casinò Interspaziale", body, actions);
    }
    refresh();
  }

  // Mostra i due dadi del Casinò che rotolano, poi rivela l'esito
  function showCasinoRoll(pid, roll, refresh) {
    const body = htmlEl("div");
    const dz = htmlEl("div", "dice-line big");
    dz.appendChild(dieEl(roll.d1, "casino"));
    dz.appendChild(dieEl(roll.d2, "casino"));
    body.appendChild(dz);
    const outBox = htmlEl("div", "casino-outcome"); body.appendChild(outBox);
    modal("🎲 Casinò — lancio dei dadi", body, []);
    const acts = $("modalActions"); acts.style.visibility = "hidden";
    tumbleDice(body, () => {
      acts.style.visibility = "";
      let msg, cls;
      if (roll.outcome === "win") { msg = "🎉 " + roll.d1 + " + " + roll.d2 + " = " + roll.sum + " — VINCI! Il banco si raddoppia."; cls = "win"; }
      else if (roll.outcome === "lose") { msg = "💸 " + roll.d1 + " + " + roll.d2 + " = " + roll.sum + " — perdi il banco."; cls = "lose"; }
      else { msg = "➖ " + roll.d1 + " + " + roll.d2 + " = " + roll.sum + " — pareggio."; cls = "push"; }
      outBox.textContent = msg; outBox.className = "casino-outcome " + cls;
      acts.innerHTML = "";
      if (roll.outcome === "push") {
        const cont = htmlEl("button", "primary", "Rilancia ▸"); cont.onclick = () => { closeModal(); refresh(); };
        const leave = htmlEl("button", null, "Lascia (perdi banco)"); leave.onclick = () => { game.casinoLeave(pid); closeModal(); render(); syncNet(); };
        acts.appendChild(cont); acts.appendChild(leave);
      } else {
        const ok = htmlEl("button", "primary", "OK"); ok.onclick = () => { closeModal(); render(); }; acts.appendChild(ok);
      }
    });
  }

  // ---------------------------------------------------------------- WIN
  function showWin() {
    const body = htmlEl("div", "win-banner");
    if (game.winner === -1) body.appendChild(htmlEl("div", "big", "Pareggio: tutte le fazioni eliminate."));
    else { const p = game.player(game.winner); body.appendChild(htmlEl("div", "big", "🏆 " + p.name + " domina la galassia!")); }
    modal("Fine partita", body, [{ label: "Nuova partita", primary: true, onClick: () => location.reload() }]);
  }

  // Lancio dei dadi d'inizio: chi ottiene il numero più basso comincia (e sceglie il senso).
  function showStartDice(onDone) {
    const rolls = game.orderRolls || [];
    if (!rolls.length) { onDone(); return; }
    const starterId = game.startPlayer != null ? game.startPlayer : (game.turnOrder ? game.turnOrder[0] : rolls[0].id);
    const body = htmlEl("div", "startdice");
    body.appendChild(htmlEl("p", "muted center", "Ogni fazione lancia un dado: chi ottiene il numero più basso inizia."));
    const grid = htmlEl("div", "sd-grid");
    const items = rolls.map((r) => {
      const cell = htmlEl("div", "sd-player");
      const nm = htmlEl("div", "sd-name"); nm.innerHTML = '<span class="dot" style="background:' + r.color + '"></span>' + esc(r.name); cell.appendChild(nm);
      const d = dieEl(r.roll, "casino"); cell.appendChild(d);
      grid.appendChild(cell);
      return { cell, id: r.id };
    });
    body.appendChild(grid);
    const result = htmlEl("div", "sd-result"); body.appendChild(result);
    modalWide("🎲 Chi inizia la partita?", body);
    $("modalActions").innerHTML = "";
    tumbleDice(body, () => {
      items.forEach((it) => { if (it.id === starterId) it.cell.classList.add("starter"); });
      const starter = game.player(starterId);
      result.innerHTML = '🏁 Inizia <b style="color:' + starter.color + '">' + esc(starter.name) + "</b>";
      const acts = $("modalActions"); acts.innerHTML = "";
      const iAmStarter = !starter.isAI && (!onlineMode || starterId === myPlayerId);
      if (!onlineMode && iAmStarter) {
        // Il primo giocatore sceglie il senso di gioco
        result.innerHTML += '<div class="sd-dir">Scegli il senso di gioco (2+ giocatori):</div>';
        const cw = htmlEl("button", "primary", "↻ Orario"); cw.onclick = () => { game.setDirection(1); closeModalWide(); onDone(); };
        const ccw = htmlEl("button", null, "↺ Antiorario"); ccw.onclick = () => { game.setDirection(-1); closeModalWide(); onDone(); };
        acts.appendChild(cw); acts.appendChild(ccw);
      } else {
        const ok = htmlEl("button", "primary", "Comincia ▸"); ok.onclick = () => { closeModalWide(); onDone(); }; acts.appendChild(ok);
      }
    });
  }

  // ---------------------------------------------------------------- TURN FLOW
  let lastRiscossioneToken = null;
  function maybeShowRiscossione() {
    if (onlineMode) return; // online: gli incassi si mostrano tramite il diff degli eventi
    const ric = game.lastRiscossione;
    if (!ric) return;
    const token = game.turnNumber + "-" + ric.playerId;
    if (token === lastRiscossioneToken) return;
    lastRiscossioneToken = token;
    if (ric.planets <= 0) return; // niente da riscuotere
    const parts = [];
    if (ric.money > 0) parts.push("💰 " + ric.money.toLocaleString() + " Ndri");
    if (ric.res.carburante) parts.push("⛽ " + ric.res.carburante);
    if (ric.res.metallo) parts.push("🔩 " + ric.res.metallo);
    if (ric.res.pietra) parts.push("🪨 " + ric.res.pietra);
    flashBanner("bonus", "💰 Riscossione — " + game.player(ric.playerId).name, "💰", parts.join("   "), "da " + ric.planets + " pianeti");
  }

  // Overlay grande per il turno dell'IA
  function aiOverlay(show, name, color) {
    let ov = $("aiOverlay");
    if (!ov) { ov = htmlEl("div"); ov.id = "aiOverlay"; document.body.appendChild(ov); }
    if (show) { ov.innerHTML = '<div class="ai-card" style="--ac:' + color + '"><div class="ai-spin">🤖</div><div class="ai-card-t">Turno dell\'IA</div><div class="ai-card-n">' + esc(name) + '</div></div>'; ov.classList.add("on"); }
    else ov.classList.remove("on");
  }

  function checkTurn() {
    render();
    if (game.winner != null) { showWin(); return; }
    const p = game.player(game.currentPlayer);
    if (!onlineMode) maybeTurnSound();
    if (!p.isAI) maybeShowRiscossione(); // per l'IA la riscossione è già nel riepilogo eventi (niente sovrapposizioni)
    if (p.isAI) {
      aiOverlay(true, aiName(p), p.color);
      const before = game.log.length;
      const moveBefore = (game.moveLog || []).length;
      setTimeout(() => runAIGen(before, moveBefore, p), 1100);
    }
  }
  function aiName(p) { const d = CFG.DIFFICULTY[p.difficulty]; return p.name + (d ? " · " + d.label : ""); }

  // Esegue il turno IA passo-passo: si ferma quando l'IA attacca un umano, che si difende.
  function runAIGen(before, moveBefore, aiPlayer) {
    const gen = IG.aiTurnGen(game);
    function pump() {
      let res;
      try { res = gen.next(); } catch (e) { console.error(e); toast("Errore IA: " + e.message); res = { done: true }; }
      if (res.done) { finishAITurn(before, moveBefore, aiPlayer); return; }
      const c = res.value; // combattimento contro un umano
      aiOverlay(false); render();
      const resume = () => { if (game.winner == null) aiOverlay(true, aiName(aiPlayer), aiPlayer.color); pump(); };
      toast("⚠ " + aiPlayer.name + " ti attacca — difenditi!");
      if (c.type === "fleetCombat") startInteractiveCombat("fleet", { attacker: c.attacker, defender: c.defender, q: c.q, r: c.r }, { mySide: "B", onDone: resume });
      else startInteractiveCombat("planet", { attacker: c.attacker, q: c.q, r: c.r, land: c.land }, { mySide: "B", onDone: resume });
    }
    pump();
  }
  function finishAITurn(before, moveBefore, aiPlayer) {
    const newLines = game.log.slice(before);
    const newMoves = (game.moveLog || []).slice(moveBefore).filter((m) => m.owner === aiPlayer.id);
    sel = { fleetId: null, cellKey: null };
    aiOverlay(false); // nascondi l'overlay PRIMA del riepilogo (i banner non ci vanno più sopra)
    render();
    // prima gli spostamenti (frecce + banner in basso), poi gli altri eventi
    playAIMoves(newMoves, aiPlayer, () => {
      playAIEvents(newLines, () => { checkTurn(); });
    });
  }

  // Riproduce gli spostamenti dell'IA con freccia sul tabellone + banner informativo in basso
  function playAIMoves(moves, aiPlayer, done) {
    const shown = moves.slice(-6);
    let i = 0;
    function next() {
      if (i >= shown.length) { setTimeout(done, 200); return; }
      const m = shown[i++];
      showMoveArrow(m.fromQ, m.fromR, m.toQ, m.toR, aiPlayer.color);
      Snd.move();
      bottomInfo('🤖 <b style="color:' + aiPlayer.color + '">' + esc(aiPlayer.name) + '</b> sposta una flotta → (' + m.toQ + ',' + m.toR + ')', aiPlayer.color);
      setTimeout(next, 700);
    }
    if (!shown.length) { done(); return; }
    next();
  }

  // Mostra gli eventi rilevanti del turno IA come banner, ritmati
  function playAIEvents(lines, done) {
    const events = [];
    for (const l of lines) {
      if (/conquista/.test(l)) events.push(["malus", "⚔️ IA", "🚩", l]);
      else if (/colonizza/.test(l)) events.push(["discovery", "🛰️ IA", "🪐", l]);
      else if (/Scontro spaziale|Attacco al pianeta/.test(l)) events.push(["discovery", "⚔️ IA", "⚔️", l]);
      else if (/riscuote/.test(l)) events.push(["bonus", "💰 IA", "💰", l]);
      else if (/produce/.test(l)) events.push(["discovery", "🏭 IA", "🏭", l]);
      else if (/costruisce/.test(l)) events.push(["discovery", "🏗️ IA", "🏗️", l]);
      else if (/Asteroidi.*perde/.test(l)) events.push(["malus", "☄️ IA", "💥", l]);
      else if (/Asteroidi.*guadagna/.test(l)) events.push(["bonus", "☄️ IA", "✨", l]);
      else if (/eliminato/.test(l)) events.push(["malus", "☠️", "☠️", l]);
    }
    // La coda dei banner gestisce ritmo e (eventuale) conferma: accodo tutto e proseguo.
    events.slice(0, 8).forEach((e) => flashBanner(e[0], e[1], e[2], e[3], ""));
    setTimeout(done, 400);
  }

  function advancePhase() {
    if (game.winner || !canControl()) return;
    const prevPlayer = game.currentPlayer, prevTurn = game.turnNumber;
    game.advancePhase();
    if (game.currentPlayer !== prevPlayer || game.turnNumber !== prevTurn) Snd.passTurn(); // suono di passaggio turno
    sel = { fleetId: null, cellKey: null };
    syncNet(); // invia lo stato (incluso l'eventuale passaggio di turno) agli altri
    checkTurn();
  }

  // ---------------------------------------------------------------- HELP
  function showHelp() {
    const body = htmlEl("div");
    body.innerHTML =
      "<p><b>Obiettivo:</b> eliminare tutte le altre fazioni.</p>" +
      "<p><b>Fasi del turno:</b> 1) Riscossione (automatica) · 2) Produzione (navi/carri sui pianeti con fabbrica) · 3) Movimento (esplora, colonizza, attacca) · 4) Costruzione (1 edificio/pianeta) e commercio.</p>" +
      "<p><b>Movimento:</b> seleziona una flotta, poi clicca una cella adiacente evidenziata. Flotte di soli Caccia muovono di 2.</p>" +
      "<p><b>Combattimento:</b> spostati su una flotta/pianeta nemico per attaccare. Risoluzione a dadi automatica (vedi diario).</p>" +
      "<p><b>Colonizzazione:</b> serve una Nave Colonia nella flotta (viene consumata).</p>";
    modal("Regole rapide", body, [{ label: "Chiudi", primary: true, onClick: closeModal }]);
  }

  // ---------------------------------------------------------------- INIT
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  // Hook di sviluppo (ispezione dello stato dalla console)
  window.IGDebug = { get game() { return game; }, render: () => render() };

  window.addEventListener("DOMContentLoaded", () => {
    buildPlayerRows();
    $("numPlayers").addEventListener("change", buildPlayerRows);
    $("startBtn").addEventListener("click", startGame);
    $("advanceBtn").addEventListener("click", advancePhase);
    $("helpBtn").addEventListener("click", showHelp);
    $("confirmToggle").addEventListener("click", toggleConfirmEvents);
    updateConfirmBtn();
    initOnlineUI();
    // Audio: pulsanti separati musica/effetti + suono ai clic + sblocco al primo gesto
    const musB = $("musicToggle"), sfxB = $("sfxToggle");
    if (musB) musB.addEventListener("click", () => { Snd.toggleMusic(); updateAudioBtns(); });
    if (sfxB) sfxB.addEventListener("click", () => { Snd.toggleSfx(); updateAudioBtns(); });
    updateAudioBtns();
    document.addEventListener("pointerdown", () => Snd.resume(), true);
    document.addEventListener("click", (e) => { if (e.target && e.target.closest && e.target.closest("button")) Snd.click(); }, true);
    // Barra spaziatrice: avanza fase/turno (fuori da campi di testo e finestre)
    document.addEventListener("keydown", (e) => {
      if (e.code !== "Space") return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (!game || $("game").classList.contains("hidden")) return;
      if (!$("modal").classList.contains("hidden")) return; // finestra aperta: lo spazio non avanza
      e.preventDefault();
      advancePhase();
    });
  });
  function updateAudioBtns() {
    const m = $("musicToggle"), s = $("sfxToggle");
    if (m) { m.textContent = Snd.musicMuted ? "🎵 Musica: off" : "🎵 Musica"; m.classList.toggle("on", !Snd.musicMuted); }
    if (s) { s.textContent = Snd.sfxMuted ? "🔇 Effetti: off" : "🔊 Effetti"; s.classList.toggle("on", !Snd.sfxMuted); }
  }
})();
