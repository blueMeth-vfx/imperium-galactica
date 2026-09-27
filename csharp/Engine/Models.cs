// ============================================================================
// Models.cs — Classi dati del motore (port degli oggetti JS). Serializzabili.
// Accessori per-chiave (Get/Set/Add) per rispecchiare gli accessi tipo res[m].
// ============================================================================
using System;
using System.Collections.Generic;

namespace ImperiumGalactica.Engine
{
    [Serializable]
    public class Ships
    {
        public int caccia, torpediniera, colonia;
        public int Get(string k)
        {
            if (k == "caccia") return caccia;
            if (k == "torpediniera") return torpediniera;
            if (k == "colonia") return colonia;
            return 0;
        }
        public void Set(string k, int v) { if (k == "caccia") caccia = v; else if (k == "torpediniera") torpediniera = v; else if (k == "colonia") colonia = v; }
        public void Add(string k, int v) { Set(k, Get(k) + v); }
        public Ships Clone() { return new Ships { caccia = caccia, torpediniera = torpediniera, colonia = colonia }; }
    }

    [Serializable]
    public class Res
    {
        public int carburante, metallo, pietra;
        public int Get(string k)
        {
            if (k == "carburante") return carburante;
            if (k == "metallo") return metallo;
            if (k == "pietra") return pietra;
            return 0;
        }
        public void Set(string k, int v) { if (k == "carburante") carburante = v; else if (k == "metallo") metallo = v; else if (k == "pietra") pietra = v; }
        public void Add(string k, int v) { Set(k, Get(k) + v); }
    }

    [Serializable]
    public class Buildings
    {
        public int fabbricaNavale, fabbricaCarri, tesoreria, cannone, torretta;
        public int Get(string k)
        {
            switch (k)
            {
                case "fabbricaNavale": return fabbricaNavale;
                case "fabbricaCarri": return fabbricaCarri;
                case "tesoreria": return tesoreria;
                case "cannone": return cannone;
                case "torretta": return torretta;
            }
            return 0;
        }
        public void Inc(string k)
        {
            switch (k)
            {
                case "fabbricaNavale": fabbricaNavale++; break;
                case "fabbricaCarri": fabbricaCarri++; break;
                case "tesoreria": tesoreria++; break;
                case "cannone": cannone++; break;
                case "torretta": torretta++; break;
            }
        }
        public int Total() { return fabbricaNavale + fabbricaCarri + tesoreria + cannone + torretta; }
    }

    [Serializable]
    public class MatMult { public int carburante, metallo, pietra; }

    [Serializable]
    public class PlanetData
    {
        public int id;
        public string nome, tipo;
        public MatMult moltMaterie;
        public int produttivita, economia, soldiTurno;
    }

    [Serializable]
    public class Planet { public PlanetData data; }

    [Serializable]
    public class Player
    {
        public int id;
        public string name;
        public bool isAI;
        public string difficulty;
        public string color, colorName;
        public int money;
        public Res res = new Res();
        public bool eliminated;
    }

    [Serializable]
    public class Cell
    {
        public int q, r;
        public bool explored;
        public string type;         // null = sconosciuta
        public Planet planet;       // null se non pianeta
        public int owner = -1;      // -1 = nessuno
        public Buildings buildings = new Buildings();
        public int garrison;
        public int producedNavi, producedCarri;
        public bool builtThisTurn;
        public int colonizedTurn;
        public int startOf = -1;    // -1 = nessuna partenza
    }

    [Serializable]
    public class Fleet
    {
        public int id, owner, q, r;
        public Ships ships = new Ships();
        public int carri, stepsLeft;
    }

    [Serializable]
    public class AsteroidCard
    {
        public string tipo;         // "malus" | "bonus"
        public int unitaPerse;
        public string risorsa;      // "carburante"|"metallo"|"pietra"|"soldi"
        public int quantita;
    }

    [Serializable]
    public class MarketCard { public string unita; public int qta, prezzo; }

    [Serializable]
    public class OrderRoll { public int id, roll; public string name, color; }

    [Serializable]
    public class MoveRecord { public int fromQ, fromR, toQ, toR, owner; }

    [Serializable]
    public class CasinoSession { public int banco; }

    // Risultato generico delle azioni (rispecchia gli oggetti { ok, msg, ... } del JS)
    public class Result
    {
        public bool ok;
        public string msg;
        public string ev;           // event: "combat" | "planetCombat" | "moved" | "destroyed" | "casino"
        public int attacker = -1, defender = -1;
        public int q, r;
        public int fleet = -1;
        public int fromQ, fromR;
        public bool needPlanet;
        public string dest;         // "fleet" | "planet"
        public bool canColonize;
        public string outcome;      // esiti combattimento
        public int banco, d1, d2, sum;

        public static Result Fail(string m) { return new Result { ok = false, msg = m }; }
        public static Result Good() { return new Result { ok = true }; }
    }
}
