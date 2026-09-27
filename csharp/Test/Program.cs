// ============================================================================
// Program.cs — Banco di prova del motore C# (equivalente di test/simulate.js).
// NON fa parte del progetto Unity: serve solo a verificare il motore qui.
// Compila con csc insieme a Engine/*.cs ed esegui.
// ============================================================================
using System;
using System.Collections.Generic;
using System.Linq;
using ImperiumGalactica.Engine;

class Program
{
    static int Main(string[] args)
    {
        int seed = args.Length > 0 ? int.Parse(args[0]) : 42;
        int maxTurns = args.Length > 1 ? int.Parse(args[1]) : 60;
        List<PlayerDef> defs = new List<PlayerDef>
        {
            new PlayerDef("Rosso", true, "medio"),
            new PlayerDef("Blu", true, "difficile"),
            new PlayerDef("Verde", true, "facile"),
            new PlayerDef("Giallo", true, "medio"),
        };
        Game g = new Game(defs, seed);

        Console.WriteLine("=== Simulazione motore C# (seed " + seed + ", max " + maxTurns + " turni) ===");
        int safety = 0;
        while (g.winner == null && g.turnNumber <= maxTurns && safety++ < 4000)
        {
            Ai.RunTurn(g);
        }

        // Stato finale
        int explored = g.board.Values.Count(c => c.explored);
        Console.WriteLine("--- Stato finale (turno " + g.turnNumber + ") ---");
        Console.WriteLine("Celle esplorate: " + explored + "/" + (Config.COLS * Config.ROWS));
        foreach (Player p in g.players)
        {
            int planets = g.PlanetsOf(p.id).Count;
            List<Fleet> fl = g.FleetsOf(p.id);
            int navi = fl.Sum(f => g.FleetShipCount(f));
            string dead = p.eliminated ? "☠ " : "  ";
            Console.WriteLine(dead + p.name.PadRight(7) + "| pianeti: " + planets + " | flotte: " + fl.Count +
                " | navi: " + navi + " | Ndri: " + p.money + " | C" + p.res.carburante + " M" + p.res.metallo + " P" + p.res.pietra);
        }
        Console.WriteLine("Vincitore: " + (g.winner == null ? "(nessuno entro il limite)" : (g.winner == -1 ? "pareggio" : g.players[g.winner.Value].name)));

        // Controlli di sanità (verifica che il motore si comporti come atteso)
        int combats = g.log.Count(l => l.Contains("Scontro spaziale") || l.Contains("Attacco al pianeta"));
        int conquiste = g.log.Count(l => l.Contains("conquista"));
        int colonizzazioni = g.log.Count(l => l.Contains("colonizza"));
        Console.WriteLine("Eventi: " + combats + " combattimenti, " + conquiste + " conquiste, " + colonizzazioni + " colonizzazioni.");

        bool ok = explored >= 20 && (colonizzazioni + conquiste) >= 1 && g.turnNumber >= 2;
        Console.WriteLine(ok ? "SANITY OK: il motore gira e la partita evolve." : "SANITY FALLITO");
        return ok ? 0 : 1;
    }
}
