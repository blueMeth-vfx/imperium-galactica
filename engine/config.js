// ============================================================================
// config.js — Costanti e parametri di gioco (dal manuale Imperium Galactica).
// Nessuna dipendenza dalla UI: usabile in browser e in Node.
// ============================================================================
(function (g) {
  g.IG = g.IG || {};

  const CONFIG = {
    // --- Tabellone (griglia esagonale "flat-top", offset odd-q) ---
    COLS: 11,
    ROWS: 7,
    // I 4 angoli sono le partenze (max 4 giocatori).
    CORNERS: [
      { q: 0, r: 0 },
      { q: 10, r: 0 },
      { q: 0, r: 6 },
      { q: 10, r: 6 },
    ],

    COLORS: ["#e23b3b", "#3b7de2", "#36b84a", "#e2c23b"], // rosso, blu, verde, giallo
    COLOR_NAMES: ["Rosso", "Blu", "Verde", "Giallo"],

    START_MONEY: 50000,
    START_FLEET: { caccia: 3, torpediniera: 0, colonia: 1 }, // 3 Caccia + 1 Nave Colonia

    // Livelli di difficoltà dell'IA
    DIFFICULTY: {
      facile:    { label: "Facile",    attackFactor: 2.4, produceTorped: false, buildLevel: 0, prodPortion: 0.5, aggressive: false },
      medio:     { label: "Medio",     attackFactor: 1.2, produceTorped: true,  buildLevel: 1, prodPortion: 1.0, aggressive: false },
      difficile: { label: "Difficile", attackFactor: 0.85, produceTorped: true, buildLevel: 2, prodPortion: 1.0, aggressive: true },
    },
    DEFAULT_DIFFICULTY: "medio",

    // Limiti unità per fazione (contenuto scatola)
    LIMITS: { caccia: 20, torpediniera: 15, colonia: 5, carri: 50 },

    // Composizione mazzo tessere (100; ~73 entrano in gioco con 4 angoli pre-rivelati)
    TILE_DECK: { space: 47, planet: 30, asteroids: 15, market: 5, casino: 3 },

    // --- Navi: statistiche (manuale, sezione 8) ---
    SHIPS: {
      caccia:       { att: 1, def: 1, carri: 0, carburante: 1, metallo: 1, costo: 5000,  dado: "rosso",  doppioAttacco: true },
      torpediniera: { att: 3, def: 2, carri: 2, carburante: 3, metallo: 3, costo: 20000, dado: "giallo", doppioAttacco: false },
      colonia:      { att: 0, def: 3, carri: 3, carburante: 5, metallo: 5, costo: 50000, dado: "verde",  doppioAttacco: false },
    },
    SHIP_NAMES: { caccia: "Caccia", torpediniera: "Torpediniera", colonia: "Nave Colonia" },

    // Carri armati: costo (manuale sez. 8)
    CARRO: { costo: 10000, carburante: 1, metallo: 1 },

    // --- Edifici: costo Ndri + Pietra e funzione (manuale sez. 7) ---
    BUILDINGS: {
      fabbricaNavale:  { nome: "Fabbrica Navale",       ndri: 30000, pietra: 5 },
      fabbricaCarri:   { nome: "Fabbrica Carri Armati",  ndri: 30000, pietra: 5 },
      tesoreria:       { nome: "Tesoreria",              ndri: 50000, pietra: 5 },
      cannone:         { nome: "Cannone Interstellare",  ndri: 30000, pietra: 10 }, // difesa spaziale 2x
      torretta:        { nome: "Torretta Terrestre",     ndri: 30000, pietra: 10 }, // difesa terra 2x
    },
    PLANET_SLOTS: 9, // reticolo 3x3

    // --- Economia ---
    SOLDI_BASE_PIANETA: 5000,  // per turno, x economia
    TESORERIA_BONUS: 5000,     // 🏠 house rule: +5000/turno per Tesoreria
    DEFENSE_MULT: 2,           // Cannone/Torretta valgono 2x att/dif

    // --- Mercato (house rule prezzi cubi) ---
    PREZZO_ACQUISTO_CUBO: 2000,
    PREZZO_VENDITA_CUBO: 1000,

    // --- Casinò ---
    CASINO_PUNTATA_MIN: 1000,
  };

  g.IG.CONFIG = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);
