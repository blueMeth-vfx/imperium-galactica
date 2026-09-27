// ============================================================================
// GameCasino.cs — Casinò Interspaziale (port da engine/casino.js). Craps.
// ============================================================================
using System;
using System.Linq;

namespace ImperiumGalactica.Engine
{
    public partial class Game
    {
        public bool PlayerOnCasino(int pid)
        {
            return fleets.Any(f => f.owner == pid && Cell(f.q, f.r).type == "casino");
        }

        public CasinoSession CasinoSessionOf(int pid)
        {
            CasinoSession s;
            if (!casinoSessions.TryGetValue(pid, out s)) { s = new CasinoSession { banco = 0 }; casinoSessions[pid] = s; }
            return s;
        }

        public Result CasinoBet(int pid, int amount)
        {
            Player p = Player(pid);
            CasinoSession s = CasinoSessionOf(pid);
            int minBet = s.banco > 0 ? Math.Max(Config.CASINO_PUNTATA_MIN, s.banco) : Config.CASINO_PUNTATA_MIN;
            if (amount < minBet) return Result.Fail("Puntata minima ora: " + minBet + " Ndri.");
            if (p.money < amount) return Result.Fail("Ndri insufficienti.");
            p.money -= amount; s.banco += amount;
            Say(p.name + " punta " + amount + " al Casinò (banco: " + s.banco + ").");
            return new Result { ok = true, banco = s.banco };
        }

        public Result CasinoRoll(int pid)
        {
            Player p = Player(pid);
            CasinoSession s = CasinoSessionOf(pid);
            if (s.banco <= 0) return Result.Fail("Nessuna puntata sul banco.");
            int d1 = RollDie(), d2 = RollDie(), sum = d1 + d2;
            string outcome;
            if (sum == 7 || sum == 11)
            {
                int vincita = s.banco * 2; p.money += vincita;
                Say("🎲 Casinò " + p.name + ": " + d1 + "+" + d2 + "=" + sum + " → VINCE! Incassa " + vincita + " Ndri.");
                s.banco = 0; outcome = "win";
            }
            else if (sum == 2 || sum == 3 || sum == 12)
            {
                Say("🎲 Casinò " + p.name + ": " + d1 + "+" + d2 + "=" + sum + " → PERDE il banco (" + s.banco + ").");
                s.banco = 0; outcome = "lose";
            }
            else
            {
                Say("🎲 Casinò " + p.name + ": " + d1 + "+" + d2 + "=" + sum + " → pareggio (banco resta " + s.banco + ").");
                outcome = "push";
            }
            return new Result { ok = true, d1 = d1, d2 = d2, sum = sum, outcome = outcome, banco = s.banco };
        }

        public Result CasinoLeave(int pid)
        {
            CasinoSession s = CasinoSessionOf(pid);
            if (s.banco > 0) Say(Player(pid).name + " lascia il Casinò perdendo " + s.banco + " Ndri.");
            s.banco = 0;
            return Result.Good();
        }
    }
}
