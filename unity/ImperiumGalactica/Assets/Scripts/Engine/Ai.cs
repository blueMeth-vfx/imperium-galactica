// ============================================================================
// Ai.cs — IA avversaria (port da engine/ai.js). Driver automatico: produce,
// esplora, colonizza, attacca con vantaggio, costruisce. Auto-risolve gli scontri.
// (La versione "a passi" che cede la difesa all'umano sarà per la UI Unity.)
// ============================================================================
using System;
using System.Collections.Generic;
using System.Linq;

namespace ImperiumGalactica.Engine
{
    public static class Ai
    {
        private static int Power(Game g, Fleet f)
        {
            return f.ships.caccia * Config.SHIPS["caccia"].att * 2 + f.ships.torpediniera * Config.SHIPS["torpediniera"].att;
        }
        private static int FleetDefense(Game g, Fleet f)
        {
            return f.ships.caccia * Config.SHIPS["caccia"].def
                 + f.ships.torpediniera * Config.SHIPS["torpediniera"].def
                 + f.ships.colonia * Config.SHIPS["colonia"].def;
        }
        private static int Round(double x) { return (int)Math.Floor(x + 0.5); }

        public static void RunTurn(Game g)
        {
            int pid = g.currentPlayer;
            Player me = g.Player(pid);
            Difficulty diff;
            if (!Config.DIFFICULTY.TryGetValue(me.difficulty, out diff)) diff = Config.DIFFICULTY[Config.DEFAULT_DIFFICULTY];

            // --- Fase 2: Produzione ---
            foreach (Cell cell in g.PlanetsOf(pid))
            {
                if (cell.buildings.fabbricaNavale > 0)
                {
                    int cap = Math.Max(1, Round(cell.buildings.fabbricaNavale * cell.planet.data.produttivita * diff.prodPortion));
                    for (int i = 0; i < cap; i++)
                    {
                        string type = (diff.produceTorped && me.money > 60000 && me.res.carburante >= 3 && me.res.metallo >= 3) ? "torpediniera" : "caccia";
                        if (!g.ProduceShip(cell.q, cell.r, type, 1).ok) break;
                    }
                }
                if (cell.buildings.fabbricaCarri > 0)
                {
                    int cap = Math.Max(1, Round(cell.buildings.fabbricaCarri * cell.planet.data.produttivita * diff.prodPortion));
                    for (int i = 0; i < cap; i++) if (!g.ProduceCarri(cell.q, cell.r, 1).ok) break;
                }
            }
            g.AdvancePhase(); // -> Movimento

            // --- Fase 3: Movimento / esplorazione / attacco / colonizzazione ---
            foreach (Fleet f0 in g.FleetsOf(pid).ToList())
            {
                Fleet f = f0;
                int guard = 0;
                while (g.FleetById(f.id) != null && f.stepsLeft > 0 && guard++ < 8)
                {
                    Cell here = g.Cell(f.q, f.r);
                    if (here.type == "planet" && here.owner == -1 && f.ships.colonia > 0)
                    {
                        g.Colonize(f.id);
                        if (g.FleetById(f.id) == null) break;
                    }
                    List<HexCoord> nbs = Hex.Neighbors(f.q, f.r);
                    HexCoord target = default(HexCoord); bool hasTarget = false; string mode = null;

                    // Cerca un bersaglio d'attacco adiacente
                    Func<KeyValuePair<HexCoord, string>?> findAttack = () =>
                    {
                        foreach (HexCoord n in nbs)
                        {
                            Cell c = g.Cell(n.q, n.r);
                            Fleet ef = g.fleets.FirstOrDefault(o => o.q == n.q && o.r == n.r && o.owner != pid);
                            if (ef != null && Power(g, f) > FleetDefense(g, ef) * diff.attackFactor)
                                return new KeyValuePair<HexCoord, string>(n, "attack");
                            if (c.type == "planet" && c.owner != -1 && c.owner != pid && c.buildings.cannone == 0 && Power(g, f) > 1 && diff.attackFactor <= 1.2)
                                return new KeyValuePair<HexCoord, string>(n, "attackPlanet");
                        }
                        return null;
                    };

                    // 1) pianeta libero adiacente (se ho colonia) -> colonizzare
                    if (f.ships.colonia > 0)
                    {
                        foreach (HexCoord n in nbs) { Cell c = g.Cell(n.q, n.r); if (c.explored && c.type == "planet" && c.owner == -1) { target = n; hasTarget = true; mode = "colonize"; break; } }
                    }
                    // Difficile: attacca PRIMA di esplorare
                    if (!hasTarget && diff.aggressive) { var a = findAttack(); if (a.HasValue) { target = a.Value.Key; hasTarget = true; mode = a.Value.Value; } }
                    // 2) cella inesplorata -> esplora
                    if (!hasTarget)
                    {
                        List<HexCoord> unexp = nbs.Where(n => !g.Cell(n.q, n.r).explored).ToList();
                        if (unexp.Count > 0) { target = unexp[(int)Math.Floor(g.rng.Next() * unexp.Count)]; hasTarget = true; mode = "explore"; }
                    }
                    // 3) bersaglio nemico -> attacca
                    if (!hasTarget) { var a = findAttack(); if (a.HasValue) { target = a.Value.Key; hasTarget = true; mode = a.Value.Value; } }
                    // 4) vagabonda su spazio esplorato libero
                    if (!hasTarget)
                    {
                        List<HexCoord> free = nbs.Where(n => { Cell c = g.Cell(n.q, n.r); return c.explored && !g.fleets.Any(o => o.q == n.q && o.r == n.r && o.owner != pid); }).ToList();
                        if (free.Count > 0) { target = free[(int)Math.Floor(g.rng.Next() * free.Count)]; hasTarget = true; mode = "wander"; }
                    }
                    if (!hasTarget) break;

                    Result ev = g.StepFleet(f.id, target.q, target.r);
                    if (!ev.ok) break;
                    if (ev.ev == "combat")
                    {
                        Fleet def = g.FleetById(ev.defender);
                        if (def != null && Power(g, f) > FleetDefense(g, def)) g.ResolveFleetCombat(ev.attacker, ev.defender);
                        else break;
                    }
                    else if (ev.ev == "planetCombat")
                    {
                        g.ResolvePlanetCombat(ev.attacker, ev.q, ev.r, f.carri);
                    }
                    else if (ev.ev == "destroyed") break;
                    else if (ev.ev == "moved" && ev.canColonize && f.ships.colonia > 0) g.Colonize(f.id);
                }
            }
            g.AdvancePhase(); // -> Costruzione

            // --- Fase 4: Costruzione ---
            if (diff.buildLevel >= 1)
            {
                foreach (Cell cell in g.PlanetsOf(pid))
                {
                    if (me.money < 40000) break;
                    string type = null;
                    if (cell.buildings.fabbricaNavale == 0) type = "fabbricaNavale";
                    else if (diff.buildLevel >= 2 && cell.buildings.cannone == 0) type = "cannone";
                    else if (cell.buildings.tesoreria == 0 && me.money > 60000) type = "tesoreria";
                    else if (cell.buildings.cannone == 0) type = "cannone";
                    else if (diff.buildLevel >= 2 && cell.buildings.fabbricaCarri == 0) type = "fabbricaCarri";
                    if (type != null) g.BuildBuilding(cell.q, cell.r, type);
                }
            }
            g.AdvancePhase(); // -> fine turno
        }
    }
}
