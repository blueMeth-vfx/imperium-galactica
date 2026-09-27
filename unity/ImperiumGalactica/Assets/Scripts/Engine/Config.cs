// ============================================================================
// Config.cs — Costanti e parametri di gioco (port da engine/config.js).
// Logica pura: nessuna dipendenza da Unity. Namespace ImperiumGalactica.Engine.
// ============================================================================
using System.Collections.Generic;

namespace ImperiumGalactica.Engine
{
    public class ShipStat
    {
        public int att, def, carri, carburante, metallo, costo;
        public bool doppioAttacco;
        public ShipStat(int att, int def, int carri, int carb, int met, int costo, bool doppio)
        {
            this.att = att; this.def = def; this.carri = carri;
            this.carburante = carb; this.metallo = met; this.costo = costo; this.doppioAttacco = doppio;
        }
    }

    public class BuildingDef
    {
        public string nome;
        public int ndri, pietra;
        public BuildingDef(string nome, int ndri, int pietra) { this.nome = nome; this.ndri = ndri; this.pietra = pietra; }
    }

    public class Difficulty
    {
        public string label;
        public double attackFactor;
        public bool produceTorped;
        public int buildLevel;
        public double prodPortion;
        public bool aggressive;
        public Difficulty(string label, double attackFactor, bool produceTorped, int buildLevel, double prodPortion, bool aggressive)
        {
            this.label = label; this.attackFactor = attackFactor; this.produceTorped = produceTorped;
            this.buildLevel = buildLevel; this.prodPortion = prodPortion; this.aggressive = aggressive;
        }
    }

    public struct Corner { public int q, r; public Corner(int q, int r) { this.q = q; this.r = r; } }

    public static class Config
    {
        public const int COLS = 11;
        public const int ROWS = 7;

        public static readonly Corner[] CORNERS = {
            new Corner(0, 0), new Corner(10, 0), new Corner(0, 6), new Corner(10, 6)
        };

        public static readonly string[] COLORS = { "#e23b3b", "#3b7de2", "#36b84a", "#e2c23b" };
        public static readonly string[] COLOR_NAMES = { "Rosso", "Blu", "Verde", "Giallo" };

        public const int START_MONEY = 50000;
        // Flotta iniziale: 3 Caccia + 1 Nave Colonia
        public const int START_CACCIA = 3, START_TORPEDINIERA = 0, START_COLONIA = 1;

        public static readonly Dictionary<string, Difficulty> DIFFICULTY = new Dictionary<string, Difficulty>
        {
            { "facile",    new Difficulty("Facile",    2.4,  false, 0, 0.5, false) },
            { "medio",     new Difficulty("Medio",     1.2,  true,  1, 1.0, false) },
            { "difficile", new Difficulty("Difficile", 0.85, true,  2, 1.0, true) },
        };
        public const string DEFAULT_DIFFICULTY = "medio";

        public static readonly Dictionary<string, int> LIMITS = new Dictionary<string, int>
        {
            { "caccia", 20 }, { "torpediniera", 15 }, { "colonia", 5 }, { "carri", 50 }
        };
        public const int MAX_CARRI_PIANETA = 10;

        public static readonly Dictionary<string, int> TILE_DECK = new Dictionary<string, int>
        {
            { "space", 47 }, { "planet", 30 }, { "asteroids", 15 }, { "market", 5 }, { "casino", 3 }
        };

        public static readonly Dictionary<string, ShipStat> SHIPS = new Dictionary<string, ShipStat>
        {
            { "caccia",       new ShipStat(1, 1, 0, 1, 1, 5000,  true) },
            { "torpediniera", new ShipStat(3, 2, 2, 3, 3, 20000, false) },
            { "colonia",      new ShipStat(0, 3, 3, 5, 5, 50000, false) },
        };
        public static readonly Dictionary<string, string> SHIP_NAMES = new Dictionary<string, string>
        {
            { "caccia", "Caccia" }, { "torpediniera", "Torpediniera" }, { "colonia", "Nave Colonia" }
        };

        // Carro armato
        public const int CARRO_COSTO = 10000, CARRO_CARBURANTE = 1, CARRO_METALLO = 1;

        public static readonly Dictionary<string, BuildingDef> BUILDINGS = new Dictionary<string, BuildingDef>
        {
            { "fabbricaNavale", new BuildingDef("Fabbrica Navale",       30000, 5) },
            { "fabbricaCarri",  new BuildingDef("Fabbrica Carri Armati",  30000, 5) },
            { "tesoreria",      new BuildingDef("Tesoreria",              50000, 5) },
            { "cannone",        new BuildingDef("Cannone Interstellare",  30000, 10) },
            { "torretta",       new BuildingDef("Torretta Terrestre",     30000, 10) },
        };
        public const int PLANET_SLOTS = 9;

        public const int SOLDI_BASE_PIANETA = 5000;
        public const int TESORERIA_BONUS = 5000;
        public const int DEFENSE_MULT = 2;

        public const int PREZZO_ACQUISTO_CUBO = 2000;
        public const int PREZZO_VENDITA_CUBO = 1000;

        public const int CASINO_PUNTATA_MIN = 1000;
    }
}
