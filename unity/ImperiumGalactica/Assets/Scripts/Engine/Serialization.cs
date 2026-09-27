// ============================================================================
// Serialization.cs — Salvataggio/caricamento: snapshot serializzabile della
// partita (GameState) + ToState/FromState. Pensato per essere serializzabile
// anche con Unity JsonUtility (liste, niente Dictionary/nullable/oggetti null).
// ============================================================================
using System;
using System.Collections.Generic;
using System.Linq;

namespace ImperiumGalactica.Engine
{
    [Serializable]
    public class CellState
    {
        public int q, r;
        public bool explored;
        public string type = "";
        public int planetId = -1;   // -1 = nessun pianeta (evita oggetti null)
        public int owner = -1;
        public Buildings buildings = new Buildings();
        public int garrison, producedNavi, producedCarri;
        public bool builtThisTurn;
        public int colonizedTurn;
        public int startOf = -1;
    }

    [Serializable]
    public class CasinoEntry { public int pid; public int banco; }

    [Serializable]
    public class GameState
    {
        public List<Player> players = new List<Player>();
        public List<CellState> cells = new List<CellState>();
        public List<Fleet> fleets = new List<Fleet>();
        public int fleetSeq;
        public List<string> tileDeck = new List<string>();
        public List<PlanetData> planetPool = new List<PlanetData>();
        public List<AsteroidCard> asteroidDeck = new List<AsteroidCard>();
        public List<AsteroidCard> asteroidDiscard = new List<AsteroidCard>();
        public List<MarketCard> marketDeck = new List<MarketCard>();
        public List<int> turnOrder = new List<int>();
        public int startPlayer, direction, turnNumber, orderIdx, phaseIdx, currentPlayer;
        public int winnerCode = -2;  // -2 = in corso, -1 = pareggio, >=0 = vincitore
        public List<string> log = new List<string>();
        public Riscossione lastRiscossione;
        public List<CasinoEntry> casino = new List<CasinoEntry>();
        public List<OrderRoll> orderRolls = new List<OrderRoll>();
        public List<MoveRecord> moveLog = new List<MoveRecord>();
        public int playSeconds;
    }

    public partial class Game
    {
        public GameState ToState()
        {
            GameState s = new GameState();
            s.players = players;
            foreach (Cell c in board.Values)
            {
                s.cells.Add(new CellState
                {
                    q = c.q, r = c.r, explored = c.explored, type = c.type ?? "",
                    planetId = c.planet != null ? c.planet.data.id : -1,
                    owner = c.owner, buildings = c.buildings, garrison = c.garrison,
                    producedNavi = c.producedNavi, producedCarri = c.producedCarri,
                    builtThisTurn = c.builtThisTurn, colonizedTurn = c.colonizedTurn, startOf = c.startOf
                });
            }
            s.fleets = fleets;
            s.fleetSeq = fleetSeq;
            s.tileDeck = tileDeck;
            s.planetPool = planetPool;
            s.asteroidDeck = asteroidDeck;
            s.asteroidDiscard = asteroidDiscard;
            s.marketDeck = marketDeck;
            s.turnOrder = turnOrder;
            s.startPlayer = startPlayer; s.direction = direction; s.turnNumber = turnNumber;
            s.orderIdx = orderIdx; s.phaseIdx = phaseIdx; s.currentPlayer = currentPlayer;
            s.winnerCode = winner == null ? -2 : winner.Value;
            s.log = log;
            s.lastRiscossione = lastRiscossione;
            foreach (KeyValuePair<int, CasinoSession> kv in casinoSessions)
                s.casino.Add(new CasinoEntry { pid = kv.Key, banco = kv.Value.banco });
            s.orderRolls = orderRolls;
            s.moveLog = moveLog;
            s.playSeconds = playSeconds;
            return s;
        }

        public static Game FromState(GameState s)
        {
            Game g = new Game();
            g.players = s.players ?? new List<Player>();
            // Ricostruisci i dati dei pianeti per id (immutabili, canonici)
            Dictionary<int, PlanetData> byId = GameData.Planets().ToDictionary(p => p.id, p => p);
            g.board = new Dictionary<string, Cell>();
            foreach (CellState cs in s.cells)
            {
                Cell c = new Cell
                {
                    q = cs.q, r = cs.r, explored = cs.explored,
                    type = string.IsNullOrEmpty(cs.type) ? null : cs.type,
                    owner = cs.owner, buildings = cs.buildings ?? new Buildings(),
                    garrison = cs.garrison, producedNavi = cs.producedNavi, producedCarri = cs.producedCarri,
                    builtThisTurn = cs.builtThisTurn, colonizedTurn = cs.colonizedTurn, startOf = cs.startOf
                };
                if (cs.planetId >= 0 && byId.ContainsKey(cs.planetId)) c.planet = new Planet { data = byId[cs.planetId] };
                g.board[Hex.Key(c.q, c.r)] = c;
            }
            g.fleets = s.fleets ?? new List<Fleet>();
            g.fleetSeq = s.fleetSeq;
            g.tileDeck = s.tileDeck ?? new List<string>();
            g.planetPool = s.planetPool ?? new List<PlanetData>();
            g.asteroidDeck = s.asteroidDeck ?? new List<AsteroidCard>();
            g.asteroidDiscard = s.asteroidDiscard ?? new List<AsteroidCard>();
            g.marketDeck = s.marketDeck ?? new List<MarketCard>();
            g.turnOrder = s.turnOrder ?? new List<int>();
            g.startPlayer = s.startPlayer; g.direction = s.direction; g.turnNumber = s.turnNumber;
            g.orderIdx = s.orderIdx; g.phaseIdx = s.phaseIdx; g.currentPlayer = s.currentPlayer;
            g.winner = s.winnerCode == -2 ? (int?)null : s.winnerCode;
            g.log = s.log ?? new List<string>();
            g.lastRiscossione = s.lastRiscossione;
            g.casinoSessions = new Dictionary<int, CasinoSession>();
            if (s.casino != null) foreach (CasinoEntry e in s.casino) g.casinoSessions[e.pid] = new CasinoSession { banco = e.banco };
            g.orderRolls = s.orderRolls ?? new List<OrderRoll>();
            g.moveLog = s.moveLog ?? new List<MoveRecord>();
            g.playSeconds = s.playSeconds;
            // RNG locale: la casualità è consumata solo dal giocatore di turno e finisce
            // comunque nello stato, quindi non serve sincronizzarlo esattamente.
            g.rng = new Rng(g.turnNumber * 7919 + g.currentPlayer + 1);
            return g;
        }
    }
}
