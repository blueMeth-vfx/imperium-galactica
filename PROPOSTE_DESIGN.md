# Imperium Galactica — Proposte di lettura (da confermare)

Per ogni dubbio aperto in `DUBBI_REGOLAMENTO.md` propongo una regola precisa. **Confermami il blocco o segnalami le correzioni.** Dove la regola non è nel manuale, è segnata come 🏠 *house rule*.

## A. Tabellone (proposto da me)
- **Griglia esagonale rettangolare 11 colonne × 7 righe = 77 celle**, esagoni *flat-top* in colonne (offset "odd-q"), adiacenza a 6 direzioni.
- I **4 angoli** (alto-sx, alto-dx, basso-sx, basso-dx) sono le **partenze**: 4 celle "Spazio Interstellare" già rivelate. → restano **73 celle** da esplorare pescando dal mazzo (≈ "74 tessere posizionate"). Le 100−73 ≈ 27 tessere non escono dal mazzo.
- **Bordi:** movimento bloccato fuori dalla griglia. Esplorazione fino a esaurimento celle/mazzo.
- **Percorso:** muovendo di 2 (soli Caccia) si sceglie il percorso passo-passo; si pesca 1 tessera per ogni passo entrato in zona inesplorata; le celle già esplorate si attraversano liberamente.

## B. Carte Pianeta / Asteroidi — generate (vedi `data/planets.json`, `data/asteroids.json`)
- **30 pianeti**: Fuoco 8, Ghiaccio 7, Terra 8, Roccia 7. Moltiplicatori per tipo come da manuale; i valori "Variabile" sorteggiati in **1x–3x**:
  - Fuoco/Ghiaccio: 3 materie variabili (1–3 ciascuna), produttività 2x, economia 1x.
  - Terra: materie 2x, produttività 1x, economia variabile (1–3).
  - Roccia: materie 1x, produttività variabile (1–3), economia 2x.
  - Soldi/turno = 5.000 × economia.
- **40 asteroidi**: 24 malus (0–3 unità perse) / 16 bonus (0–3 di una risorsa o soldi).

## C. Produzione
- **C7 (limite):** ogni fabbrica produce **fino a `Produttività` unità per turno** (cap), e **ogni unità va pagata** col suo costo (Carburante+Metallo+Ndri). Più fabbriche sullo stesso pianeta sommano i cap. → riconcilia "2 unità con 2x" (cap) e "in base alle risorse spese" (paghi ogni unità).
- **C8 (dove):** navi/carri si producono **solo** su pianeti con la fabbrica relativa. Le nuove unità si aggiungono alla flotta presente sul pianeta; se non c'è flotta, formano una **nuova flotta** su quella cella.

## D. Economia
- **D9 (Tesoreria):** 🏠 +5.000 Ndri/turno per ogni Tesoreria (fisso, cumulabile), aggiunto dopo il calcolo dell'economia.
- **D10 (materie):** ogni pianeta raccoglie **1 cubo base per materia × moltiplicatore-materia della carta**. La Produttività **non** si applica alla raccolta (solo alla resa delle fabbriche).
- **D11 (soldi):** 5.000 × Economia + 5.000 per Tesoreria, per pianeta, ogni turno.

## E. Movimento e flotte
- **E12 (velocità):** ignoro la colonna "Velocità" della tabella navi; vale la regola **2 caselle se soli Caccia, altrimenti 1**.
- **E13 (flotte):** una flotta richiede **≥1 nave qualsiasi** (allento "≥1 Caccia"). Split/merge di flotte consentito **a inizio Fase Movimento**, sulla cella di partenza. Le navi nuove possono restare flotta separata.

## F. Combattimento spaziale
- **F14 (identità):** ogni nave fornisce un valore (i Caccia attaccanti due). Si ordinano i valori di attacco e di difesa, si confrontano a coppie; per ogni coppia con Attacco>Difesa muore **la nave difensore** associata a quel valore di difesa. Due valori di un Caccia possono colpire due navi difensore diverse.
- **F15 (>3 navi):** ogni lato schiera fino a **3 navi per round**; il proprietario sceglie quali (IA automatica). Dopo lo scambio (turno attaccante + difensore) si rimuovono le distrutte e si schierano altre navi (fino a 3) finché un lato resta a 0.
- **F16 (ritirata):** 🏠 **nessuna ritirata** (non prevista dal manuale): si combatte fino alla conclusione.
- **F17 (esito):** chi vince occupa la cella; le navi del perdente schierate e sconfitte sono distrutte. Se l'attaccante perde tutte le navi, il difensore mantiene la cella.

## G. Combattimento di terra
- **G18:** stessa meccanica dello scontro spaziale (valori ordinati, confronto a coppie, attaccante prima).
- **G19 (conquista):** vinto il combattimento, il pianeta passa all'attaccante con **gli edifici esistenti intatti** (fabbriche, tesoreria, difese superstiti). Per conquistare un pianeta **nemico** non serve una Nave Colonia (serve solo per colonizzare un pianeta **libero**); basta eliminare le difese e avere ≥1 Torpediniera (o vincere a terra).
- **G20:** i carri attaccanti superstiti **restano come guarnigione** sul pianeta conquistato.

## H. Carri / trasporto
- **H21 (caricamento):** 🏠 i carri prodotti restano sul pianeta come guarnigione; una flotta che si trova su un proprio pianeta può **imbarcarli** (fino alla capienza delle navi: Caccia 0, Torped. 2, Colonia 3) durante la Fase Produzione/Movimento.

## I. Asteroidi
- **I22 (malus):** rimuove unità dalla flotta che attraversa, in ordine: **carri → Caccia → Torpediniera → Nave Colonia**. Se ce ne sono meno, si perde quel che c'è.
- **I23 (bonus):** 🏠 si guadagnano 0–3 di **una risorsa estratta a caso** tra Carburante/Metallo/Pietra/Soldi; "1 unità" di soldi = **5.000 Ndri**.

## J. Mercato
- **J25 (vendita materie):** 🏠 oltre alle 55 carte deal (riprodotte fedelmente), prezzo fisso per i cubi: **acquisto 2.000 / vendita 1.000 Ndri per cubo**.
- **J26:** sul Mercato si pesca **1 carta deal per turno**.

## K. Commercio tra giocatori
- **K27:** trasferimento manuale concordato in hot-seat (risorse/navi/carri ↔ Ndri) tra due giocatori nella Fase 4, senza vincoli.

## L. Eliminazione / vittoria
- **L28:** una fazione è **eliminata quando non ha né pianeti né navi** (né carri imbarcati). Vince l'**ultima fazione non eliminata**. Un giocatore con pianeti ma senza navi resta in gioco (può ricostruire).

## M. IA
- **M29:** IA basilare: esplora, colonizza pianeti liberi, costruisce fabbriche/difese, produce navi, attacca bersagli vantaggiosi vicini, gioca prudente al Casinò.

## N. Casinò
- **N30:** 1 sessione di craps per turno mentre la flotta è sulla cella; puntata minima 1.000; su pareggio il giocatore sceglie se continuare (con escalation) o lasciare; lancio condiviso se più giocatori presenti.
