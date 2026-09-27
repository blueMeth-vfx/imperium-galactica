// ============================================================================
// GameCombat.cs — Combattimento spaziale e terrestre (port da engine/combat.js).
// Qui il risolutore batch (_battle) e i risolutori automatici usati dall'IA.
// (La sessione interattiva round-per-round verrà aggiunta per la UI Unity.)
// ============================================================================
using System;
using System.Collections.Generic;
using System.Linq;

namespace ImperiumGalactica.Engine
{
    public class CombatUnit
    {
        public string type, label;
        public int att, def;
        public bool twice, lastLine;
    }

    public class BattleResult { public string winner; public int rounds; }

    public partial class Game
    {
        // Espande le navi di una flotta in unità di combattimento
        public List<CombatUnit> ShipUnits(Fleet fleet)
        {
            List<CombatUnit> outList = new List<CombatUnit>();
            foreach (string t in new[] { "caccia", "torpediniera", "colonia" })
            {
                ShipStat s = Config.SHIPS[t];
                for (int i = 0; i < fleet.ships.Get(t); i++)
                    outList.Add(new CombatUnit { type = t, label = Config.SHIP_NAMES[t], att = s.att, def = s.def, twice = s.doppioAttacco, lastLine = false });
            }
            return outList;
        }
        public List<CombatUnit> CannonUnits(Cell cell)
        {
            List<CombatUnit> outList = new List<CombatUnit>();
            for (int i = 0; i < cell.buildings.cannone; i++)
                outList.Add(new CombatUnit { type = "cannone", label = "Cannone", att = Config.DEFENSE_MULT, def = Config.DEFENSE_MULT, twice = false, lastLine = true });
            return outList;
        }
        public List<CombatUnit> TankUnits(int n)
        {
            List<CombatUnit> outList = new List<CombatUnit>();
            for (int i = 0; i < n; i++) outList.Add(new CombatUnit { type = "carro", label = "Carro", att = 1, def = 1, twice = false, lastLine = false });
            return outList;
        }
        public List<CombatUnit> TurretUnits(Cell cell)
        {
            List<CombatUnit> outList = new List<CombatUnit>();
            for (int i = 0; i < cell.buildings.torretta; i++)
                outList.Add(new CombatUnit { type = "torretta", label = "Torretta", att = Config.DEFENSE_MULT, def = Config.DEFENSE_MULT, twice = false, lastLine = true });
            return outList;
        }

        private static int Stat(CombatUnit u, bool attack) { return attack ? u.att : u.def; }

        // Fino a 3 unità del lato (normali prima; le lastLine entrano a condizione).
        private List<CombatUnit> PickFront(List<CombatUnit> units, bool attack, bool isGround)
        {
            List<CombatUnit> normals = units.Where(u => !u.lastLine).ToList();
            List<CombatUnit> last = units.Where(u => u.lastLine).ToList();
            List<CombatUnit> pool = new List<CombatUnit>(normals);
            if (last.Count > 0)
            {
                bool join = isGround ? normals.Count < 2 : normals.Count == 0;
                if (join) pool.AddRange(last);
            }
            pool = pool.OrderByDescending(u => Stat(u, attack)).ToList();
            return pool.Take(3).ToList();
        }

        // Rimuove `hits` unità dal difensore (prima normali con difesa più bassa, poi lastLine).
        private int RemoveKills(List<CombatUnit> units, int hits)
        {
            int toRemove = hits;
            List<int> order = Enumerable.Range(0, units.Count)
                .OrderBy(i => (units[i].lastLine ? 1 : 0))
                .ThenBy(i => units[i].def).ToList();
            HashSet<int> remove = new HashSet<int>();
            foreach (int i in order) { if (toRemove <= 0) break; remove.Add(i); toRemove--; }
            List<CombatUnit> kept = new List<CombatUnit>();
            for (int i = 0; i < units.Count; i++) if (!remove.Contains(i)) kept.Add(units[i]);
            units.Clear(); units.AddRange(kept);
            return hits - toRemove;
        }

        // Risolutore generico. `unitsA` è l'aggressore iniziale. Mutua le liste.
        public BattleResult Battle(List<CombatUnit> unitsA, List<CombatUnit> unitsB, bool ground)
        {
            bool aggrIsA = true; int rounds = 0, lastKill = 0;
            while (unitsA.Count > 0 && unitsB.Count > 0 && rounds < 100)
            {
                rounds++;
                List<CombatUnit> agg = aggrIsA ? unitsA : unitsB;
                List<CombatUnit> def = aggrIsA ? unitsB : unitsA;
                List<CombatUnit> aggFront = PickFront(agg, true, ground);
                List<CombatUnit> defFront = PickFront(def, false, ground);

                List<int> attVals = new List<int>();
                foreach (CombatUnit u in aggFront) { int n = u.twice ? 2 : 1; for (int k = 0; k < n; k++) attVals.Add(RollDie() * u.att); }
                List<int> defVals = new List<int>();
                foreach (CombatUnit u in defFront) defVals.Add(RollDie() * u.def);
                attVals.Sort(); attVals.Reverse();
                defVals.Sort(); defVals.Reverse();
                int hits = 0, pairs = Math.Min(attVals.Count, defVals.Count);
                for (int i = 0; i < pairs; i++) if (attVals[i] > defVals[i]) hits++;
                int killed = RemoveKills(def, hits);
                if (killed > 0) lastKill = rounds;
                aggrIsA = !aggrIsA;
                if (rounds - lastKill > 4) break;
            }
            string winner = "draw";
            if (unitsB.Count == 0 && unitsA.Count > 0) winner = "A";
            else if (unitsA.Count == 0 && unitsB.Count > 0) winner = "B";
            else if (unitsA.Count == 0 && unitsB.Count == 0) winner = "mutual";
            return new BattleResult { winner = winner, rounds = rounds };
        }

        private void WriteShips(Fleet fleet, List<CombatUnit> units)
        {
            fleet.ships.caccia = units.Count(u => u.type == "caccia");
            fleet.ships.torpediniera = units.Count(u => u.type == "torpediniera");
            fleet.ships.colonia = units.Count(u => u.type == "colonia");
        }

        // -------------------------------------------------- flotta vs flotta (auto)
        public Result ResolveFleetCombat(int attId, int defId)
        {
            Fleet att = FleetById(attId), def = FleetById(defId);
            if (att == null || def == null) return Result.Fail(null);
            int q = def.q, r = def.r;
            Say("⚔ Scontro spaziale a (" + q + "," + r + "): " + Player(att.owner).name + " attacca " + Player(def.owner).name + ".");
            List<CombatUnit> uA = ShipUnits(att), uB = ShipUnits(def);
            BattleResult res = Battle(uA, uB, false);
            WriteShips(att, uA); WriteShips(def, uB);

            if (FleetShipCount(def) == 0) DestroyFleet(def);
            if (FleetShipCount(att) == 0) DestroyFleet(att);

            if (res.winner == "A")
            {
                Say("  " + Player(att.owner).name + " vince lo scontro.");
                EnterCell(att, Cell(q, r), false);
            }
            else if (res.winner == "B") Say("  " + Player(def.owner).name + " respinge l'attacco.");
            else Say("  Scontro inconcludente: l'attaccante si ferma.");
            if (att != null && FleetById(att.id) != null) att.stepsLeft = 0;
            CheckElimination();
            return new Result { ok = true, outcome = res.winner };
        }

        // -------------------------------------------------- attacco a pianeta (auto)
        public Result ResolvePlanetCombat(int attId, int q, int r, int land)
        {
            Fleet att = FleetById(attId);
            Cell cell = Cell(q, r);
            if (att == null || cell == null) return Result.Fail(null);
            Fleet defFleet = fleets.FirstOrDefault(o => o.q == q && o.r == r && o.owner == cell.owner);
            Say("⚔ Attacco al pianeta " + cell.planet.data.nome + " (" + Player(cell.owner).name + ").");

            // Fase spaziale: navi difensori + Cannoni
            List<CombatUnit> uA = ShipUnits(att);
            List<CombatUnit> uB = (defFleet != null ? ShipUnits(defFleet) : new List<CombatUnit>());
            uB.AddRange(CannonUnits(cell));
            BattleResult res = Battle(uA, uB, false);
            WriteShips(att, uA);
            if (defFleet != null) WriteShips(defFleet, uB.Where(u => u.type != "cannone").ToList());
            cell.buildings.cannone = uB.Count(u => u.type == "cannone");

            if (FleetShipCount(att) == 0) { DestroyFleet(att); Say("  Flotta attaccante distrutta."); CheckElimination(); return new Result { ok = true, outcome = "attackerDestroyed" }; }
            if (defFleet != null && FleetShipCount(defFleet) == 0) DestroyFleet(defFleet);

            if (res.winner != "A")
            {
                Say("  Difese spaziali non superate: attacco interrotto, non si scende a terra.");
                att.stepsLeft = 0;
                return new Result { ok = true, outcome = "spaceFailed" };
            }
            Say("  Difese spaziali distrutte.");

            bool groundDef = cell.garrison > 0 || cell.buildings.torretta > 0;
            if (!groundDef)
            {
                int landN0 = Math.Min(att.carri, land >= 0 ? land : att.carri);
                if (att.ships.torpediniera > 0 || landN0 > 0)
                {
                    att.carri -= landN0;
                    CapturePlanet(att.id, q, r, landN0);
                    EnterCell(att, cell, false);
                    CheckElimination();
                    return new Result { ok = true, outcome = "captured" };
                }
                EnterCell(att, cell, false);
                Say("  Pianeta indifeso ma senza Torpediniera né carri: non conquistato.");
                return new Result { ok = true, outcome = "spaceWonNoCapture" };
            }

            int wantLand = land < 0 ? att.carri : land;
            int landN = Math.Min(att.carri, wantLand);
            if (landN <= 0)
            {
                EnterCell(att, cell, false);
                Say("  Difese a terra presenti ma nessuno sbarco: pianeta non conquistato.");
                att.stepsLeft = 0;
                return new Result { ok = true, outcome = "spaceWonNoLand" };
            }
            Say("  Sbarco di " + landN + " carri. Lotta di terra!");
            List<CombatUnit> tA = TankUnits(landN);
            List<CombatUnit> tB = TankUnits(cell.garrison); tB.AddRange(TurretUnits(cell));
            BattleResult gres = Battle(tA, tB, true);
            att.carri -= landN;
            int survAtt = tA.Count;
            cell.buildings.torretta = tB.Count(u => u.type == "torretta");
            cell.garrison = tB.Count(u => u.type == "carro");

            if (gres.winner == "A")
            {
                CapturePlanet(att.id, q, r, survAtt);
                EnterCell(att, cell, false);
                CheckElimination();
                return new Result { ok = true, outcome = "captured" };
            }
            Say("  Sbarco respinto: pianeta non conquistato.");
            EnterCell(att, cell, false);
            att.stepsLeft = 0;
            CheckElimination();
            return new Result { ok = true, outcome = "groundFailed" };
        }
    }
}
