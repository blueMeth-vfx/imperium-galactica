// ============================================================================
// Game.cs — Motore principale (port da engine/game.js): stato, setup, fasi,
// economia, produzione, movimento, esplorazione, conquista, eliminazione.
// Combattimento/Casinò/Mercato/IA in file partial separati.
// ============================================================================
using System;
using System.Collections.Generic;
using System.Linq;

namespace ImperiumGalactica.Engine
{
    public struct PlayerDef
    {
        public string name;
        public bool isAI;
        public string difficulty;
        public PlayerDef(string name, bool isAI = false, string difficulty = null)
        { this.name = name; this.isAI = isAI; this.difficulty = difficulty; }
    }

    [Serializable]
    public class Riscossione { public int playerId, money, planets; public Res res = new Res(); }

    public partial class Game
    {
        public static readonly string[] PHASES = { "riscossione", "produzione", "movimento", "costruzione" };

        public Rng rng;
        public List<string> log = new List<string>();
        public int fleetSeq = 1;
        public int? winner = null;

        public List<Player> players = new List<Player>();
        public Dictionary<string, Cell> board = new Dictionary<string, Cell>();
        public List<Fleet> fleets = new List<Fleet>();
        public List<string> tileDeck = new List<string>();
        public List<PlanetData> planetPool = new List<PlanetData>();
        public List<AsteroidCard> asteroidDeck = new List<AsteroidCard>();
        public List<AsteroidCard> asteroidDiscard = new List<AsteroidCard>();
        public List<MarketCard> marketDeck = new List<MarketCard>();
        public List<int> turnOrder = new List<int>();
        public int startPlayer, direction = 1, turnNumber = 1, orderIdx, phaseIdx, currentPlayer;
        public List<OrderRoll> orderRolls = new List<OrderRoll>();
        public List<MoveRecord> moveLog = new List<MoveRecord>();
        public Riscossione lastRiscossione;
        public Dictionary<int, CasinoSession> casinoSessions = new Dictionary<int, CasinoSession>();
        public int playSeconds;

        public Game(List<PlayerDef> playersDef, int seed = 0)
        {
            rng = new Rng(seed != 0 ? seed : (int)(Environment.TickCount) + 1);
            Setup(playersDef);
        }

        // ---------------------------------------------------------------- utilità
        public void Say(string msg) { log.Add(msg); if (log.Count > 500) log.RemoveAt(0); }
        public int RollDie() { return rng.RollDie(); }
        public List<T> Shuffle<T>(List<T> arr) { return rng.Shuffle(arr); }

        public int PlanetIncome(Cell cell)
        {
            return Config.SOLDI_BASE_PIANETA * cell.planet.data.economia + cell.buildings.tesoreria * Config.TESORERIA_BONUS;
        }

        // ---------------------------------------------------------------- setup
        private void Setup(List<PlayerDef> playersDef)
        {
            int n = Math.Max(2, Math.Min(4, playersDef.Count));
            players = new List<Player>();
            for (int i = 0; i < n; i++)
            {
                PlayerDef d = playersDef[i];
                players.Add(new Player
                {
                    id = i,
                    name = string.IsNullOrEmpty(d.name) ? ("Giocatore " + (i + 1)) : d.name,
                    isAI = d.isAI,
                    difficulty = string.IsNullOrEmpty(d.difficulty) ? Config.DEFAULT_DIFFICULTY : d.difficulty,
                    color = Config.COLORS[i],
                    colorName = Config.COLOR_NAMES[i],
                    money = Config.START_MONEY,
                    res = new Res(),
                    eliminated = false
                });
            }

            board = new Dictionary<string, Cell>();
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                    board[Hex.Key(q, r)] = new Cell { q = q, r = r, explored = false, type = null, owner = -1 };

            for (int i = 0; i < n; i++)
            {
                Cell cell = board[Hex.Key(Config.CORNERS[i].q, Config.CORNERS[i].r)];
                cell.explored = true; cell.type = "space"; cell.startOf = i;
            }

            BuildTileDeck();
            planetPool = Shuffle(GameData.Planets());
            asteroidDeck = Shuffle(GameData.Asteroids());
            asteroidDiscard = new List<AsteroidCard>();
            marketDeck = Shuffle(GameData.Market());

            fleets = new List<Fleet>();
            for (int i = 0; i < n; i++)
                NewFleet(i, Config.CORNERS[i].q, Config.CORNERS[i].r,
                    Config.START_CACCIA, Config.START_TORPEDINIERA, Config.START_COLONIA, 0);

            // Ordine di turno: dado per ciascuno, il più basso inizia; senso orario di default
            List<OrderRoll> rolls = new List<OrderRoll>();
            for (int i = 0; i < n; i++)
                rolls.Add(new OrderRoll { id = i, roll = RollDie(), name = players[i].name, color = players[i].color });
            List<OrderRoll> sorted = rolls.OrderBy(x => x.roll).ToList();
            startPlayer = sorted[0].id;
            direction = 1;
            turnOrder = ComputeOrder(startPlayer, direction);
            orderRolls = rolls;
            moveLog = new List<MoveRecord>();
            Say("Lanci d'ordine: " + string.Join(", ", rolls.Select(x => players[x.id].name + "=" + x.roll).ToArray()) +
                ". Inizia " + players[startPlayer].name + ".");

            turnNumber = 1; orderIdx = 0; phaseIdx = 0; playSeconds = 0;
            currentPlayer = turnOrder[0];
            BeginPlayerTurn();
        }

        private List<int> ComputeOrder(int start, int dir)
        {
            int n = players.Count;
            List<int> order = new List<int>();
            for (int k = 0; k < n; k++) order.Add((((start + dir * k) % n) + n) % n);
            return order;
        }

        public void SetDirection(int dir)
        {
            direction = dir < 0 ? -1 : 1;
            turnOrder = ComputeOrder(startPlayer, direction);
            orderIdx = turnOrder.IndexOf(currentPlayer);
        }

        private void BuildTileDeck()
        {
            List<string> deck = new List<string>();
            foreach (KeyValuePair<string, int> kv in Config.TILE_DECK)
                for (int i = 0; i < kv.Value; i++) deck.Add(kv.Key);
            tileDeck = Shuffle(deck);
        }

        private Fleet NewFleet(int owner, int q, int r, int caccia, int torp, int colonia, int carri)
        {
            Fleet f = new Fleet { id = fleetSeq++, owner = owner, q = q, r = r, carri = carri, stepsLeft = 0 };
            f.ships.caccia = caccia; f.ships.torpediniera = torp; f.ships.colonia = colonia;
            fleets.Add(f);
            return f;
        }

        // ---------------------------------------------------------------- accessor
        public Player Player(int id) { return players[id]; }
        public Cell Cell(int q, int r) { Cell c; return board.TryGetValue(Hex.Key(q, r), out c) ? c : null; }
        public Fleet FleetById(int id) { return fleets.FirstOrDefault(f => f.id == id); }
        public List<Fleet> FleetsAt(int q, int r) { return fleets.Where(f => f.q == q && f.r == r).ToList(); }
        public Fleet FleetOfAt(int owner, int q, int r) { return fleets.FirstOrDefault(f => f.owner == owner && f.q == q && f.r == r); }
        public List<Fleet> FleetsOf(int owner) { return fleets.Where(f => f.owner == owner).ToList(); }
        public List<Cell> PlanetsOf(int owner)
        {
            List<Cell> outList = new List<Cell>();
            foreach (Cell c in board.Values) if (c.owner == owner && c.type == "planet") outList.Add(c);
            return outList;
        }
        public int FleetShipCount(Fleet f) { return f.ships.caccia + f.ships.torpediniera + f.ships.colonia; }
        public bool FleetIsPureCaccia(Fleet f) { return f.ships.caccia > 0 && f.ships.torpediniera == 0 && f.ships.colonia == 0; }
        public int FleetSpeed(Fleet f) { return FleetIsPureCaccia(f) ? 2 : 1; }
        public int FleetCarriCapacity(Fleet f)
        {
            return f.ships.caccia * Config.SHIPS["caccia"].carri
                 + f.ships.torpediniera * Config.SHIPS["torpediniera"].carri
                 + f.ships.colonia * Config.SHIPS["colonia"].carri;
        }
        public int CountUnits(int owner, string type)
        {
            int n = 0;
            foreach (Fleet f in FleetsOf(owner)) n += (type == "carri") ? f.carri : f.ships.Get(type);
            if (type == "carri") foreach (Cell p in PlanetsOf(owner)) n += p.garrison;
            return n;
        }

        // ---------------------------------------------------------------- fasi
        public string Phase { get { return PHASES[phaseIdx]; } }

        private void BeginPlayerTurn() { phaseIdx = 0; Riscossione(); }

        private void Riscossione()
        {
            Player p = Player(currentPlayer);
            int gainMoney = 0;
            Res gainRes = new Res();
            List<Cell> planets = PlanetsOf(p.id);
            foreach (Cell cell in planets)
            {
                cell.producedNavi = 0; cell.producedCarri = 0; cell.builtThisTurn = false;
                PlanetData pl = cell.planet.data;
                gainMoney += PlanetIncome(cell);
                gainRes.carburante += pl.moltMaterie.carburante;
                gainRes.metallo += pl.moltMaterie.metallo;
                gainRes.pietra += pl.moltMaterie.pietra;
            }
            p.money += gainMoney;
            p.res.carburante += gainRes.carburante; p.res.metallo += gainRes.metallo; p.res.pietra += gainRes.pietra;
            lastRiscossione = new Riscossione { playerId = p.id, money = gainMoney, planets = planets.Count, res = gainRes };
            if (planets.Count > 0)
                Say(p.name + " riscuote " + gainMoney + " Ndri e materie (C" + gainRes.carburante + " M" + gainRes.metallo + " P" + gainRes.pietra + ").");
            phaseIdx = 1;
        }

        public void AdvancePhase()
        {
            if (winner != null) return;
            if (phaseIdx < PHASES.Length - 1)
            {
                phaseIdx++;
                if (Phase == "movimento") BeginMovement();
            }
            else EndPlayerTurn();
        }

        private void BeginMovement()
        {
            foreach (Fleet f in FleetsOf(currentPlayer)) f.stepsLeft = FleetSpeed(f);
        }

        private void EndPlayerTurn()
        {
            CheckElimination();
            if (winner != null) return;
            orderIdx++;
            if (orderIdx >= turnOrder.Count) { orderIdx = 0; turnNumber++; Say("— Inizia il turno " + turnNumber + " —"); }
            int guard = 0;
            do
            {
                currentPlayer = turnOrder[orderIdx];
                if (Player(currentPlayer).eliminated)
                {
                    orderIdx++;
                    if (orderIdx >= turnOrder.Count) { orderIdx = 0; turnNumber++; }
                }
                else break;
            } while (guard++ < 10);
            BeginPlayerTurn();
        }

        // ---------------------------------------------------------------- produzione
        public Result ProduceShip(int q, int r, string type, int qty = 1)
        {
            Cell cell = Cell(q, r);
            Player p = Player(currentPlayer);
            ShipStat S = Config.SHIPS[type];
            if (cell == null || cell.owner != p.id || cell.type != "planet") return Result.Fail("Pianeta non valido.");
            if (cell.buildings.fabbricaNavale < 1) return Result.Fail("Serve una Fabbrica Navale.");
            int cap = cell.buildings.fabbricaNavale * cell.planet.data.produttivita;
            if (cell.producedNavi + qty > cap) return Result.Fail("Limite produzione navi: " + cap + "/turno su questo pianeta.");
            if (CountUnits(p.id, type) + qty > Config.LIMITS[type]) return Result.Fail("Limite di fazione raggiunto per " + Config.SHIP_NAMES[type] + ".");
            int needC = S.carburante * qty, needM = S.metallo * qty, needN = S.costo * qty;
            if (p.res.carburante < needC || p.res.metallo < needM || p.money < needN) return Result.Fail("Risorse insufficienti.");
            p.res.carburante -= needC; p.res.metallo -= needM; p.money -= needN;
            cell.producedNavi += qty;
            Fleet f = FleetOfAt(p.id, q, r);
            if (f == null) f = NewFleet(p.id, q, r, 0, 0, 0, 0);
            f.ships.Add(type, qty);
            Say(p.name + " produce " + qty + " " + Config.SHIP_NAMES[type] + " su " + cell.planet.data.nome + ".");
            return Result.Good();
        }

        public Result ProduceCarri(int q, int r, int qty = 1)
        {
            Cell cell = Cell(q, r);
            Player p = Player(currentPlayer);
            if (cell == null || cell.owner != p.id || cell.type != "planet") return Result.Fail("Pianeta non valido.");
            if (cell.buildings.fabbricaCarri < 1) return Result.Fail("Serve una Fabbrica Carri Armati.");
            int cap = cell.buildings.fabbricaCarri * cell.planet.data.produttivita;
            if (cell.producedCarri + qty > cap) return Result.Fail("Limite produzione carri: " + cap + "/turno.");
            if (CountUnits(p.id, "carri") + qty > Config.LIMITS["carri"]) return Result.Fail("Limite carri di fazione.");
            if (cell.garrison + qty > Config.MAX_CARRI_PIANETA) return Result.Fail("Massimo " + Config.MAX_CARRI_PIANETA + " carri per pianeta.");
            if (p.res.carburante < Config.CARRO_CARBURANTE * qty || p.res.metallo < Config.CARRO_METALLO * qty || p.money < Config.CARRO_COSTO * qty)
                return Result.Fail("Risorse insufficienti.");
            p.res.carburante -= Config.CARRO_CARBURANTE * qty; p.res.metallo -= Config.CARRO_METALLO * qty; p.money -= Config.CARRO_COSTO * qty;
            cell.producedCarri += qty; cell.garrison += qty;
            Say(p.name + " produce " + qty + " Carri su " + cell.planet.data.nome + ".");
            return Result.Good();
        }

        public Result LoadTanks(int fleetId, int nWanted)
        {
            Fleet f = FleetById(fleetId);
            if (f == null) return Result.Fail("Flotta inesistente.");
            Cell cell = Cell(f.q, f.r);
            if (cell == null || cell.owner != f.owner || cell.type != "planet") return Result.Fail("La flotta non è su un proprio pianeta.");
            int cap = FleetCarriCapacity(f) - f.carri;
            int n = Math.Min(nWanted, Math.Min(cap, cell.garrison));
            if (n <= 0) return Result.Fail("Nessun carro imbarcabile (capienza o guarnigione esaurita).");
            cell.garrison -= n; f.carri += n;
            Say("Imbarcati " + n + " carri sulla flotta #" + f.id + ".");
            return Result.Good();
        }

        public Result UnloadTanks(int fleetId, int nWanted)
        {
            Fleet f = FleetById(fleetId);
            if (f == null) return Result.Fail(null);
            Cell cell = Cell(f.q, f.r);
            if (cell == null || cell.owner != f.owner || cell.type != "planet") return Result.Fail("Non su un proprio pianeta.");
            int n = Math.Min(nWanted, Math.Min(f.carri, Config.MAX_CARRI_PIANETA - cell.garrison));
            if (n <= 0) return Result.Fail("Guarnigione piena (max " + Config.MAX_CARRI_PIANETA + " carri per pianeta).");
            f.carri -= n; cell.garrison += n;
            return Result.Good();
        }

        // ---------------------------------------------------------------- costruzione
        public Result BuildBuilding(int q, int r, string type)
        {
            Cell cell = Cell(q, r);
            Player p = Player(currentPlayer);
            BuildingDef B;
            if (cell == null || cell.owner != p.id || cell.type != "planet") return Result.Fail("Pianeta non valido.");
            if (!Config.BUILDINGS.TryGetValue(type, out B)) return Result.Fail("Edificio sconosciuto.");
            if (cell.colonizedTurn == turnNumber) return Result.Fail("Pianeta colonizzato in questo turno: potrai costruire dal prossimo turno.");
            if (cell.buildings.Total() >= Config.PLANET_SLOTS) return Result.Fail("Slot edifici esauriti (9).");
            if (cell.builtThisTurn) return Result.Fail("Max 1 edificio per pianeta per turno.");
            if (p.money < B.ndri || p.res.pietra < B.pietra) return Result.Fail("Servono " + B.ndri + " Ndri e " + B.pietra + " Pietra.");
            p.money -= B.ndri; p.res.pietra -= B.pietra;
            cell.buildings.Inc(type); cell.builtThisTurn = true;
            Say(p.name + " costruisce " + B.nome + " su " + cell.planet.data.nome + ".");
            return Result.Good();
        }

        // ---------------------------------------------------------------- esplorazione/movimento
        private string DrawTile() { if (tileDeck.Count == 0) return "space"; string t = tileDeck[tileDeck.Count - 1]; tileDeck.RemoveAt(tileDeck.Count - 1); return t; }

        private bool RevealCell(Cell cell)
        {
            if (cell.explored) return false;
            cell.explored = true;
            cell.type = DrawTile();
            if (cell.type == "planet")
            {
                PlanetData data = planetPool.Count > 0 ? planetPool[planetPool.Count - 1] : GameData.Planets()[0];
                if (planetPool.Count > 0) planetPool.RemoveAt(planetPool.Count - 1);
                cell.planet = new Planet { data = data };
            }
            Say("Esplorato (" + cell.q + "," + cell.r + "): " + TileLabel(cell.type) +
                (cell.planet != null ? " — " + cell.planet.data.nome + " (" + cell.planet.data.tipo + ")" : ""));
            return true;
        }

        public string TileLabel(string t)
        {
            switch (t)
            {
                case "space": return "Spazio Interstellare";
                case "planet": return "Pianeta";
                case "asteroids": return "Fasci di Asteroidi";
                case "market": return "Mercato";
                case "casino": return "Casinò Interspaziale";
            }
            return t;
        }

        private AsteroidCard DrawAsteroidCard()
        {
            if (asteroidDeck.Count == 0) { asteroidDeck = Shuffle(asteroidDiscard); asteroidDiscard = new List<AsteroidCard>(); }
            AsteroidCard card = asteroidDeck[asteroidDeck.Count - 1]; asteroidDeck.RemoveAt(asteroidDeck.Count - 1);
            asteroidDiscard.Add(card);
            return card;
        }

        private void ApplyAsteroid(Fleet fleet, AsteroidCard card)
        {
            Player p = Player(fleet.owner);
            if (card.tipo == "malus")
            {
                int toLose = card.unitaPerse;
                string[] order = { "carri", "caccia", "torpediniera", "colonia" };
                List<string> lost = new List<string>();
                foreach (string u in order)
                {
                    while (toLose > 0)
                    {
                        if (u == "carri" && fleet.carri > 0) { fleet.carri--; toLose--; lost.Add("carro"); }
                        else if (u != "carri" && fleet.ships.Get(u) > 0) { fleet.ships.Add(u, -1); toLose--; lost.Add(Config.SHIP_NAMES[u]); }
                        else break;
                    }
                }
                Say("☄ Asteroidi: " + p.name + " perde " + (lost.Count > 0 ? string.Join(", ", lost.ToArray()) : "nessuna unità") + ".");
            }
            else
            {
                int q = card.quantita;
                if (card.risorsa == "soldi") { p.money += q * 5000; Say("☄ Asteroidi: " + p.name + " guadagna " + (q * 5000) + " Ndri."); }
                else { p.res.Add(card.risorsa, q); Say("☄ Asteroidi: " + p.name + " guadagna " + q + " " + card.risorsa + "."); }
            }
        }

        public Result StepFleet(int fleetId, int q, int r)
        {
            Fleet f = FleetById(fleetId);
            if (f == null) return Result.Fail("Flotta inesistente.");
            if (f.owner != currentPlayer) return Result.Fail("Non è la tua flotta.");
            if (Phase != "movimento") return Result.Fail("Non è la fase di movimento.");
            if (f.stepsLeft <= 0) return Result.Fail("Movimento esaurito per questa flotta.");
            bool isNb = Hex.Neighbors(f.q, f.r).Any(n => n.q == q && n.r == r);
            if (!isNb) return Result.Fail("Cella non adiacente.");

            Cell cell = Cell(q, r);
            RevealCell(cell);

            if (cell.type == "casino") return EnterCell(f, cell, true);

            Fleet enemyFleet = fleets.FirstOrDefault(o => o.q == q && o.r == r && o.owner != f.owner);
            if (enemyFleet != null)
                return new Result { ok = true, ev = "combat", attacker = f.id, defender = enemyFleet.id, q = q, r = r };

            if (cell.type == "planet" && cell.owner != -1 && cell.owner != f.owner)
                return new Result { ok = true, ev = "planetCombat", attacker = f.id, q = q, r = r };

            return EnterCell(f, cell, false);
        }

        private void LogMove(int fq, int fr, int tq, int tr, int owner)
        {
            moveLog.Add(new MoveRecord { fromQ = fq, fromR = fr, toQ = tq, toR = tr, owner = owner });
            if (moveLog.Count > 300) moveLog.RemoveAt(0);
        }

        private Result EnterCell(Fleet f, Cell cell, bool casino)
        {
            int fromQ = f.q, fromR = f.r;
            if (cell.type == "asteroids")
            {
                ApplyAsteroid(f, DrawAsteroidCard());
                if (FleetShipCount(f) == 0)
                {
                    DestroyFleet(f); LogMove(fromQ, fromR, cell.q, cell.r, f.owner);
                    return new Result { ok = true, ev = "destroyed", fromQ = fromQ, fromR = fromR };
                }
            }
            Fleet mine = FleetOfAt(f.owner, cell.q, cell.r);
            f.q = cell.q; f.r = cell.r;
            f.stepsLeft--;
            if (mine != null && mine.id != f.id) MergeFleets(mine, f);
            Fleet moved = FleetById(f.id) ?? mine;
            LogMove(fromQ, fromR, cell.q, cell.r, f.owner);
            bool canColonize = cell.type == "planet" && cell.owner == -1 && (moved != null && moved.ships.colonia > 0);
            return new Result
            {
                ok = true,
                ev = casino ? "casino" : "moved",
                fleet = moved != null ? moved.id : f.id,
                q = cell.q, r = cell.r, fromQ = fromQ, fromR = fromR,
                canColonize = canColonize
            };
        }

        private void MergeFleets(Fleet keep, Fleet gone)
        {
            keep.ships.caccia += gone.ships.caccia;
            keep.ships.torpediniera += gone.ships.torpediniera;
            keep.ships.colonia += gone.ships.colonia;
            keep.carri += gone.carri;
            keep.stepsLeft = Math.Min(keep.stepsLeft, Math.Min(gone.stepsLeft, FleetSpeed(keep)));
            fleets = fleets.Where(x => x.id != gone.id).ToList();
        }

        private void DestroyFleet(Fleet f) { fleets = fleets.Where(x => x.id != f.id).ToList(); }

        public Result SplitFleet(int fleetId, int takeCaccia, int takeTorp, int takeColonia, int takeCarri)
        {
            Fleet f = FleetById(fleetId);
            if (f == null) return Result.Fail(null);
            Fleet nf = NewFleet(f.owner, f.q, f.r, 0, 0, 0, 0);
            int kc = Math.Min(takeCaccia, f.ships.caccia); f.ships.caccia -= kc; nf.ships.caccia += kc;
            int kt = Math.Min(takeTorp, f.ships.torpediniera); f.ships.torpediniera -= kt; nf.ships.torpediniera += kt;
            int kl = Math.Min(takeColonia, f.ships.colonia); f.ships.colonia -= kl; nf.ships.colonia += kl;
            int tc = Math.Min(takeCarri, f.carri); f.carri -= tc; nf.carri += tc;
            nf.stepsLeft = Phase == "movimento" ? FleetSpeed(nf) : 0;
            f.stepsLeft = Math.Min(f.stepsLeft, FleetSpeed(f));
            if (FleetShipCount(f) == 0) DestroyFleet(f);
            if (FleetShipCount(nf) == 0) DestroyFleet(nf);
            return new Result { ok = true, fleet = nf.id };
        }

        // ---------------------------------------------------------------- colonizzazione / conquista
        public Result Colonize(int fleetId)
        {
            Fleet f = FleetById(fleetId);
            if (f == null) return Result.Fail("Flotta inesistente.");
            Cell cell = Cell(f.q, f.r);
            if (cell == null || cell.type != "planet") return Result.Fail("Non c'è un pianeta qui.");
            if (cell.owner != -1) return Result.Fail("Pianeta già occupato.");
            if (f.ships.colonia < 1) return Result.Fail("Serve una Nave Colonia.");
            f.ships.colonia--;
            cell.owner = f.owner;
            cell.colonizedTurn = turnNumber;
            Say(Player(f.owner).name + " colonizza " + cell.planet.data.nome + " (Nave Colonia consumata).");
            if (FleetShipCount(f) == 0) DestroyFleet(f);
            return Result.Good();
        }

        public Result CapturePlanet(int fleetId, int q, int r, int survivingTanks)
        {
            Fleet f = FleetById(fleetId);
            Cell cell = Cell(q, r);
            int oldOwner = cell.owner;
            cell.owner = f != null ? f.owner : currentPlayer;
            cell.garrison = survivingTanks >= 0 ? survivingTanks : 0;
            cell.colonizedTurn = turnNumber;
            Say(Player(cell.owner).name + " conquista " + cell.planet.data.nome +
                (oldOwner != -1 ? " (era di " + Player(oldOwner).name + ")" : "") + ".");
            return Result.Good();
        }

        // ---------------------------------------------------------------- fine partita
        public void CheckElimination()
        {
            foreach (Player p in players)
            {
                if (p.eliminated) continue;
                bool noPlanets = PlanetsOf(p.id).Count == 0;
                bool noFleets = FleetsOf(p.id).Count == 0;
                if (noPlanets && noFleets) { p.eliminated = true; Say("☠ " + p.name + " è stato eliminato!"); }
            }
            List<Player> alive = players.Where(p => !p.eliminated).ToList();
            if (alive.Count == 1) { winner = alive[0].id; Say("🏆 " + alive[0].name + " domina la galassia! Partita conclusa."); }
            else if (alive.Count == 0) { winner = -1; Say("Tutte le fazioni eliminate: pareggio."); }
        }
    }
}
