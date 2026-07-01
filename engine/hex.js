// ============================================================================
// hex.js — Utilità per la griglia esagonale (flat-top, offset "odd-q").
// Coordinate offset (q = colonna, r = riga). Adiacenza a 6 direzioni.
// ============================================================================
(function (g) {
  g.IG = g.IG || {};

  const Hex = {
    key(q, r) {
      return q + "," + r;
    },

    inBounds(q, r) {
      const C = g.IG.CONFIG;
      return q >= 0 && q < C.COLS && r >= 0 && r < C.ROWS;
    },

    // Vicini per griglia flat-top con offset odd-q.
    // Le colonne dispari sono "spinte" verso il basso di mezza cella.
    neighbors(q, r) {
      const even = q % 2 === 0;
      const deltas = even
        ? [ [+1, 0], [+1, -1], [0, -1], [-1, -1], [-1, 0], [0, +1] ]
        : [ [+1, +1], [+1, 0], [0, -1], [-1, 0], [-1, +1], [0, +1] ];
      const out = [];
      for (const [dq, dr] of deltas) {
        const nq = q + dq, nr = r + dr;
        if (Hex.inBounds(nq, nr)) out.push({ q: nq, r: nr });
      }
      return out;
    },

    // Converte offset odd-q in coordinate cubiche (per calcolare distanze).
    toCube(q, r) {
      const x = q;
      const z = r - (q - (q & 1)) / 2;
      const y = -x - z;
      return { x, y, z };
    },

    distance(a, b) {
      const ac = Hex.toCube(a.q, a.r);
      const bc = Hex.toCube(b.q, b.r);
      return Math.max(
        Math.abs(ac.x - bc.x),
        Math.abs(ac.y - bc.y),
        Math.abs(ac.z - bc.z)
      );
    },

    // Pixel center per il rendering (flat-top). size = raggio esagono.
    toPixel(q, r, size) {
      const x = size * 1.5 * q;
      const y = size * Math.sqrt(3) * (r + 0.5 * (q & 1));
      return { x, y };
    },
  };

  g.IG.Hex = Hex;
})(typeof window !== "undefined" ? window : globalThis);
