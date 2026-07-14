# Imperium Galactica — Versione digitale

Adattamento digitale, eseguibile in locale, del gioco da tavolo **Imperium Galactica** (manuale Alpha).
4X spaziale per 2–4 giocatori in **hot-seat** sullo stesso PC, con **IA** opzionale per le fazioni non umane.

---

## Come avviare il gioco

Il gioco è un'app web in **HTML/CSS/JavaScript puro**, senza dipendenze né servizi esterni.
Serve solo un browser. Poiché carica alcuni file via `<script>`, va servito da un piccolo
server locale (aprire `index.html` con doppio clic funziona sulla maggior parte dei browser,
ma alcuni bloccano i file locali: in quel caso usare il server).

### Opzione A — Doppio clic (più semplice)
Apri `index.html` con un doppio clic. Se il tabellone non compare, usa l'Opzione B.

### Opzione B — Server locale (consigliata)
Serve **Python** (già presente su Windows 11) **oppure** Node.js.

Con Python:
```powershell
cd C:\Users\matte\GiocoDaTavolo
python -m http.server 8123
```
Poi apri nel browser: **http://localhost:8123**

Con Node (se preferisci):
```powershell
cd C:\Users\matte\GiocoDaTavolo
npx serve -l 8123
```

### Avvio della partita
1. Scegli il numero di fazioni (2–4).
2. Dai un nome a ogni fazione; spunta **IA** per farla giocare al computer.
3. (Facoltativo) Inserisci un *seed* per una partita riproducibile.
4. Premi **Inizia la partita**.

---

## Come si gioca (riepilogo)
- **Obiettivo:** eliminare tutte le altre fazioni (ultima rimasta = vincitrice).
- **Fasi del turno** (pulsante *Avanza fase*):
  1. **Riscossione** (automatica): incassi Ndri e materie dai tuoi pianeti.
  2. **Produzione**: clicca un tuo pianeta con fabbrica e produci navi/carri.
  3. **Movimento**: seleziona una flotta, poi clicca una cella adiacente evidenziata.
     Flotte di soli Caccia muovono di 2. Esplori pescando tessere; colonizzi pianeti liberi
     (serve una Nave Colonia); muovendo su flotte/pianeti nemici parte il combattimento.
  4. **Costruzione e Commercio**: 1 edificio per pianeta; al Mercato compri/vendi.
- **Combattimento**: risoluzione a dadi automatica (i tiri compaiono nel *Diario di gioco*).

Pulsante **Regole** in alto a destra per il riepilogo rapido in gioco.

---

## Test del motore (partita simulata)
Per verificare la logica senza interfaccia (richiede **Node.js**):
```powershell
cd C:\Users\matte\GiocoDaTavolo
node test/simulate.js 200 7      # 200 turni max, seed 7 (tutte IA)
```
Stampa il diario finale, lo stato delle fazioni e l'eventuale vincitore.

---

## Struttura del progetto
```
index.html              Pagina principale
ui/styles.css           Stile
ui/ui.js                Interfaccia (DOM/SVG) — nessuna regola, chiama solo il motore
engine/config.js        Costanti e parametri (dal manuale)
engine/hex.js           Griglia esagonale (adiacenza, distanze, pixel)
engine/game.js          Stato, setup, fasi, economia, produzione, movimento, esplorazione
engine/combat.js        Combattimento spaziale e terrestre
engine/casino.js        Casinò Interspaziale
engine/market.js        Mercato
engine/ai.js            IA basilare
data/gamedata.js        Dati generati (pianeti, asteroidi, mazzo Mercato)
data/planets.json       Dati pianeti (consultabili)
data/asteroids.json     Dati asteroidi (consultabili)
test/simulate.js        Partita simulata da riga di comando (Node)
SINTESI_REGOLE.md       Sintesi del manuale
DUBBI_REGOLAMENTO.md    Punti ambigui del manuale
PROPOSTE_DESIGN.md      Decisioni di lettura adottate
```
La **logica di gioco** (`engine/`) è completamente separata dall'**interfaccia** (`ui/`)
e funziona sia nel browser sia in Node.

---

## Regole semplificate, omesse o interpretate

Il manuale è una versione **Alpha** con diverse lacune. Le scelte adottate sono dettagliate in
`PROPOSTE_DESIGN.md` (confermate prima dell'implementazione). In sintesi:

**Dati mancanti generati da noi**
- I **30 pianeti** e le **40 carte asteroidi**: il manuale dà solo i moltiplicatori per
  tipologia; i valori specifici "Variabile" sono stati generati (1x–3x) in modo coerente
  (`data/planets.json`, `data/asteroids.json`).

**House rules** (non presenti nel manuale, segnalate)
- **Tesoreria**: +5.000 Ndri/turno per edificio.
- **Bonus asteroidi**: 0–3 di una risorsa estratta a caso; 1 "unità soldi" = 5.000 Ndri.
- **Vendita materie al Mercato**: acquisto 2.000 / vendita 1.000 Ndri per cubo.
- **Caricamento carri**: imbarco sui propri pianeti fino alla capienza delle navi.

**Interpretazioni di regole contraddittorie/incomplete**
- **Produzione**: ogni fabbrica produce fino a `Produttività` unità/turno (cap), e ogni unità
  va pagata col suo costo (riconcilia "2 unità con 2x" e "in base alle risorse spese").
- **Velocità**: ignorata la colonna "Velocità" della tabella navi (incoerente); vale la regola
  "2 caselle se soli Caccia, altrimenti 1".
- **Eliminazione**: fazione fuori quando non ha né pianeti né navi.
- **Conquista pianeta nemico**: gli edifici esistenti restano al conquistatore; non serve una
  Nave Colonia (serve solo per i pianeti liberi).
- **Combattimento**: schieramento a ondate di max 3 unità per round fino all'annientamento di
  un lato; nessuna ritirata (non prevista dal manuale).

**Semplificazioni dell'implementazione (dichiarate)**
- **Scelta delle navi in battaglia**: il manuale lascia scegliere quali 3 navi schierare; qui la
  scelta è **automatica** (le unità più forti per la statistica rilevante).
- **Casinò con più giocatori**: il manuale prevede un lancio condiviso se più flotte sono sulla
  stessa casella; qui ogni giocatore gioca nel proprio turno con lancio proprio.
- **Commercio tra giocatori (Fase 4)**: in hot-seat è una libera negoziazione al tavolo; nell'app
  è disponibile l'acquisto/vendita di cubi al Mercato, ma non un'interfaccia dedicata di scambio
  diretto fra giocatori (può essere gestito a voce + trasferimenti manuali se necessario).
- **Obbligo di gioco al Casinò**: l'accesso è tramite pulsante quando una flotta è sulla casella;
  non è forzato automaticamente a ogni turno.

In caso di dubbi su una regola, la fonte di verità resta il manuale: segnalaci eventuali
correzioni e le adeguiamo.

## Licenza

© 2026 Matteo Congedo — **Tutti i diritti riservati**.
Software proprietario: non è consentito copiare, modificare, ridistribuire o
usare a fini commerciali senza permesso scritto. Vedi il file [LICENSE](LICENSE).
