// ============================================================================
// GameMarket.cs — Mercato (port da engine/market.js). Carta-deal + cubi materia.
// ============================================================================
using System.Collections.Generic;
using System.Linq;

namespace ImperiumGalactica.Engine
{
    public partial class Game
    {
        public MarketCard MarketDraw()
        {
            MarketCard card = marketDeck[0];
            marketDeck.RemoveAt(0);
            marketDeck.Add(card);
            return card;
        }

        public List<Cell> PlanetsWithGarrisonRoom(int pid, int qta)
        {
            return PlanetsOf(pid).Where(c => c.garrison + qta <= Config.MAX_CARRI_PIANETA).ToList();
        }

        // Acquista l'unità della carta. targetQ<0 = nessun pianeta indicato.
        public Result MarketBuy(int fleetId, MarketCard card, int targetQ = -1, int targetR = -1)
        {
            Fleet f = FleetById(fleetId);
            if (f == null) return Result.Fail("Flotta inesistente.");
            if (Cell(f.q, f.r).type != "market") return Result.Fail("La flotta non è su un Mercato.");
            Player p = Player(f.owner);
            if (p.money < card.prezzo) return Result.Fail("Ndri insufficienti.");

            if (card.unita == "carri")
            {
                if (CountUnits(p.id, "carri") + card.qta > Config.LIMITS["carri"]) return Result.Fail("Limite carri di fazione.");
                if (targetQ >= 0)
                {
                    Cell cell = Cell(targetQ, targetR);
                    if (cell == null || cell.owner != p.id || cell.type != "planet") return Result.Fail("Pianeta non valido.");
                    if (cell.garrison + card.qta > Config.MAX_CARRI_PIANETA) return Result.Fail("Massimo " + Config.MAX_CARRI_PIANETA + " carri per pianeta.");
                    p.money -= card.prezzo; cell.garrison += card.qta;
                    Say(p.name + " acquista al Mercato " + card.qta + " Carri (assegnati a " + cell.planet.data.nome + ").");
                    return new Result { ok = true, dest = "planet" };
                }
                int cap = FleetCarriCapacity(f) - f.carri;
                if (cap >= card.qta)
                {
                    p.money -= card.prezzo; f.carri += card.qta;
                    Say(p.name + " acquista al Mercato " + card.qta + " Carri (caricati sulla flotta).");
                    return new Result { ok = true, dest = "fleet" };
                }
                if (PlanetsWithGarrisonRoom(p.id, card.qta).Count == 0)
                    return Result.Fail("Nessuna capienza sulle navi né pianeti disponibili (max " + Config.MAX_CARRI_PIANETA + "/pianeta).");
                return new Result { ok = false, needPlanet = true, msg = "Nessuna capienza sulle navi: scegli un pianeta a cui assegnarli." };
            }

            if (CountUnits(p.id, card.unita) + card.qta > Config.LIMITS[card.unita]) return Result.Fail("Limite di fazione raggiunto.");
            p.money -= card.prezzo; f.ships.Add(card.unita, card.qta);
            Say(p.name + " acquista al Mercato " + card.qta + " " + Config.SHIP_NAMES[card.unita] + " per " + card.prezzo + " Ndri.");
            return new Result { ok = true, dest = "fleet" };
        }

        public Result MarketTradeCube(int pid, string materia, int qty, bool sell)
        {
            Player p = Player(pid);
            if (sell)
            {
                if (p.res.Get(materia) < qty) return Result.Fail("Materia insufficiente.");
                p.res.Add(materia, -qty); p.money += qty * Config.PREZZO_VENDITA_CUBO;
                Say(p.name + " vende " + qty + " " + materia + " per " + (qty * Config.PREZZO_VENDITA_CUBO) + " Ndri.");
            }
            else
            {
                int cost = qty * Config.PREZZO_ACQUISTO_CUBO;
                if (p.money < cost) return Result.Fail("Ndri insufficienti.");
                p.money -= cost; p.res.Add(materia, qty);
                Say(p.name + " compra " + qty + " " + materia + " per " + cost + " Ndri.");
            }
            return Result.Good();
        }
    }
}
