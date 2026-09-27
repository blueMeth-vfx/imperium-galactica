// ============================================================================
// GameCombatSession.cs — Combattimento INTERATTIVO (dadi round per round),
// port da makeCombatSession + funzioni apply* di engine/combat.js.
// Usato dalla UI per far tirare i dadi al giocatore; il motore resta autorevole.
// ============================================================================
using System.Collections.Generic;
using System.Linq;

namespace ImperiumGalactica.Engine
{
    public class CombatSlot
    {
        public string type, label;
        public int mult;
        public int? die;    // null = non ancora tirato
    }

    public class CombatRound
    {
        public bool aggressorIsA;
        public List<CombatSlot> att = new List<CombatSlot>();
        public List<CombatSlot> def = new List<CombatSlot>();
        public int? killed;
    }

    public class RoundResult { public int killed; public bool finished; public string winner; }

    // Sessione di combattimento interattiva. unitsA = aggressore iniziale.
    public class CombatSession
    {
        private readonly Game game;
        public List<CombatUnit> A, B;
        public bool ground;
        public bool aggressorIsA = true, finished = false;
        public string winner = null;
        public int roundIndex = 0;
        public CombatRound round;

        public CombatSession(Game game, List<CombatUnit> a, List<CombatUnit> b, bool ground)
        {
            this.game = game; A = a; B = b; this.ground = ground;
        }

        public CombatRound StartRound()
        {
            List<CombatUnit> agg = aggressorIsA ? A : B;
            List<CombatUnit> def = aggressorIsA ? B : A;
            List<CombatUnit> aggFront = game.PickFront(agg, true, ground);
            List<CombatUnit> defFront = game.PickFront(def, false, ground);
            round = new CombatRound { aggressorIsA = aggressorIsA };
            foreach (CombatUnit u in aggFront)
            {
                int n = u.twice ? 2 : 1;
                for (int k = 0; k < n; k++) round.att.Add(new CombatSlot { type = u.type, label = u.label, mult = u.att, die = null });
            }
            foreach (CombatUnit u in defFront)
                round.def.Add(new CombatSlot { type = u.type, label = u.label, mult = u.def, die = null });
            return round;
        }

        public int RollSlot(CombatSlot s) { if (s.die == null) s.die = game.RollDie(); return s.die.Value; }
        public void RollAll(List<CombatSlot> list) { foreach (CombatSlot s in list) if (s.die == null) s.die = game.RollDie(); }
        public bool AllRolled() { return round.att.Concat(round.def).All(s => s.die != null); }

        public RoundResult Resolve()
        {
            List<int> attVals = round.att.Select(s => s.die.Value * s.mult).OrderByDescending(v => v).ToList();
            List<int> defVals = round.def.Select(s => s.die.Value * s.mult).OrderByDescending(v => v).ToList();
            int hits = 0, pairs = System.Math.Min(attVals.Count, defVals.Count);
            for (int i = 0; i < pairs; i++) if (attVals[i] > defVals[i]) hits++;
            List<CombatUnit> defenderUnits = aggressorIsA ? B : A;
            int killed = game.RemoveKills(defenderUnits, hits);
            round.killed = killed; roundIndex++;
            if (A.Count == 0 || B.Count == 0)
            {
                finished = true;
                winner = (B.Count == 0 && A.Count > 0) ? "A" : (A.Count == 0 && B.Count > 0) ? "B" : "mutual";
            }
            else aggressorIsA = !aggressorIsA;
            return new RoundResult { killed = killed, finished = finished, winner = winner };
        }
    }

    public class PlanetSetup { public Fleet defFleet; public List<CombatUnit> uA, uB; }
    public class GroundSetup { public List<CombatUnit> tA, tB; }

    public partial class Game
    {
        public CombatSession MakeCombatSession(List<CombatUnit> a, List<CombatUnit> b, bool ground)
        {
            return new CombatSession(this, a, b, ground);
        }

        // --- Applicazione esiti (chiamati dalla UI dopo la sessione interattiva) ---
        public Result ApplyFleetCombatResult(Fleet att, Fleet def, List<CombatUnit> uA, List<CombatUnit> uB, string winner)
        {
            int q = def.q, r = def.r;
            WriteShips(att, uA); WriteShips(def, uB);
            if (FleetShipCount(def) == 0) DestroyFleet(def);
            if (FleetShipCount(att) == 0) DestroyFleet(att);
            bool advanced = false;
            if (winner == "A") { Say("  " + Player(att.owner).name + " vince lo scontro."); EnterCell(att, Cell(q, r), false); advanced = true; }
            else if (winner == "B") Say("  " + Player(def.owner).name + " respinge l'attacco.");
            else Say("  Scontro inconcludente.");
            if (att != null && FleetById(att.id) != null) att.stepsLeft = 0;
            CheckElimination();
            return new Result { ok = true, outcome = advanced ? "advanced" : "" };
        }

        public PlanetSetup PlanetCombatSetup(Fleet att, Cell cell)
        {
            Fleet defFleet = fleets.FirstOrDefault(o => o.q == cell.q && o.r == cell.r && o.owner == cell.owner);
            List<CombatUnit> uA = ShipUnits(att);
            List<CombatUnit> uB = (defFleet != null ? ShipUnits(defFleet) : new List<CombatUnit>());
            uB.AddRange(CannonUnits(cell));
            return new PlanetSetup { defFleet = defFleet, uA = uA, uB = uB };
        }

        public Result ApplyPlanetSpaceResult(Fleet att, Cell cell, Fleet defFleet, List<CombatUnit> uA, List<CombatUnit> uB, string winner)
        {
            WriteShips(att, uA);
            if (defFleet != null) WriteShips(defFleet, uB.Where(u => u.type != "cannone").ToList());
            cell.buildings.cannone = uB.Count(u => u.type == "cannone");
            if (FleetShipCount(att) == 0) { DestroyFleet(att); Say("  Flotta attaccante distrutta."); CheckElimination(); return new Result { ok = true, outcome = "attackerDestroyed" }; }
            if (defFleet != null && FleetShipCount(defFleet) == 0) DestroyFleet(defFleet);
            if (winner != "A") { att.stepsLeft = 0; Say("  Difese spaziali non superate: attacco interrotto."); return new Result { ok = true, outcome = "spaceFailed" }; }
            Say("  Difese spaziali distrutte.");
            return new Result { ok = true, outcome = "spaceWon", groundDef = cell.garrison > 0 || cell.buildings.torretta > 0 };
        }

        public Result ApplyPlanetNoGround(Fleet att, Cell cell, int land)
        {
            int landN = System.Math.Min(att.carri, land >= 0 ? land : att.carri);
            if (att.ships.torpediniera > 0 || landN > 0)
            {
                att.carri -= landN;
                CapturePlanet(att.id, cell.q, cell.r, landN);
                EnterCell(att, cell, false);
                CheckElimination();
                return new Result { ok = true, outcome = "captured" };
            }
            EnterCell(att, cell, false);
            Say("  Pianeta indifeso ma senza Torpediniera né carri: non conquistato.");
            return new Result { ok = true, outcome = "spaceWonNoCapture" };
        }

        public GroundSetup PlanetGroundSetup(Cell cell, int landN)
        {
            List<CombatUnit> tB = TankUnits(cell.garrison); tB.AddRange(TurretUnits(cell));
            return new GroundSetup { tA = TankUnits(landN), tB = tB };
        }

        public Result ApplyPlanetSkipGround(Fleet att, Cell cell)
        {
            EnterCell(att, cell, false);
            att.stepsLeft = 0;
            Say("  Difese a terra presenti ma nessuno sbarco: pianeta non conquistato.");
            return new Result { ok = true, outcome = "spaceWonNoLand" };
        }

        public Result ApplyPlanetGroundResult(Fleet att, Cell cell, int landN, List<CombatUnit> tA, List<CombatUnit> tB, string winner)
        {
            att.carri -= landN;
            int survAtt = tA.Count;
            cell.buildings.torretta = tB.Count(u => u.type == "torretta");
            cell.garrison = tB.Count(u => u.type == "carro");
            if (winner == "A")
            {
                CapturePlanet(att.id, cell.q, cell.r, survAtt);
                EnterCell(att, cell, false);
                CheckElimination();
                return new Result { ok = true, outcome = "captured", survivors = survAtt };
            }
            Say("  Sbarco respinto: pianeta non conquistato.");
            EnterCell(att, cell, false);
            att.stepsLeft = 0;
            CheckElimination();
            return new Result { ok = true, outcome = "groundFailed" };
        }
    }
}
