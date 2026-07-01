# Imperium Galactica — Punti ambigui o incompleti del regolamento

Domande da chiarire **prima** dell'implementazione. Numerate per riferimento nelle risposte.

## A. Tabellone e geometria (BLOCCANTE)
1. **Forma della griglia.** Le tessere sono esagonali ma il manuale parla di "4 angoli". Una griglia esagonale non ha angoli netti. Qual è la disposizione? (es. griglia esagonale a colonne/righe con dimensioni fisse, oppure griglia "a mattoni"?). Quante righe × colonne (per arrivare a ~74 celle)?
2. **Adiacenza e movimento.** Su esagoni ogni cella ha 6 vicini. Il movimento di "1 casella" segue le 6 direzioni esagonali? I 4 angoli di partenza sono 4 celle specifiche agli estremi?
3. **Bordi del tabellone.** Cosa succede ai bordi (movimento bloccato)? Le ~74 celle sono un limite rigido o si esplora finché ci sono tessere nel mazzo?
4. **Esplorazione del percorso.** Muovendo di 2, il giocatore sceglie liberamente il percorso passo-passo (anche curvando) e pesca una tessera per ogni passo in zona inesplorata? Può attraversare liberamente celle già esplorate?

## B. Dati dei pianeti (BLOCCANTE)
5. **Carte Pianeta specifiche.** Il manuale dà solo i moltiplicatori a livello di tipologia; i 30 pianeti hanno valori "Variabile" per materia/economia non riportati. Come procediamo?
   - (a) Genero io i 30 pianeti con valori plausibili e coerenti (ti fornisco la tabella per conferma), oppure
   - (b) mi passi i dati delle carte pianeta, oppure
   - (c) uso valori casuali entro un range a ogni partita.
6. **Materie "Variabile".** Per i tipi Fuoco/Ghiaccio le materie sono "Variabile": quale range di moltiplicatore (1x–3x?) e con quale distribuzione?

## C. Produzione (BLOCCANTE)
7. **Limite di produzione per fabbrica.** Il manuale si contraddice: "ogni fabbrica può produrre 2 unità per turno (con 2x)" ma anche "senza limite, in base a risorse/Ndri spesi". Qual è la regola? (es. limite = Produttività unità per fabbrica per turno, oppure nessun limite e la Produttività è solo un moltiplicatore sulla resa?)
8. **Dove si produce.** Confermi che navi e carri si producono **solo** su pianeti con la relativa fabbrica, e che le navi prodotte appaiono nella flotta presente su quel pianeta (o ne formano una nuova lì)? Se sul pianeta non c'è una flotta, dove nasce la nave?

## D. Economia / risorse
9. **Bonus Tesoreria.** Di quanto aumenta i soldi per turno? (valore fisso? percentuale? moltiplicatore?)
10. **Quante materie produce ogni pianeta.** Confermi: 1 cubo base per materia × moltiplicatore-materia della carta × eventuale Produttività? La Produttività si applica alle materie o solo alle fabbriche? (Il testo lega Produttività alle fabbriche, non alla raccolta.)
11. **Soldi base 5.000 × Economia.** Confermi 5.000 Ndri/turno per pianeta × moltiplicatore Economia, + bonus Tesoreria.

## E. Movimento e flotte
12. **Velocità contraddittoria.** La tabella navi dà Caccia vel.3 / Torped.2 / Colonia 1, ma le regole dicono "2 se soli Caccia, altrimenti 1". Quale vale? (Propongo: ignorare la colonna velocità e usare la regola 2/1. Confermi?)
13. **Gestione flotte.** Una flotta deve davvero contenere ≥1 Caccia, o basta ≥1 nave qualsiasi? Si possono **dividere/unire** flotte, e in quale fase? Le navi nuove possono formare flotte separate?

## F. Combattimento spaziale
14. **Identità delle navi nella risoluzione.** Confronto a coppie di valori ordinati: quando "Attacco>Difesa", quale nave difensore esatta muore (quella associata al valore di difesa di quella coppia)? Un Caccia genera 2 valori d'attacco: ognuno può distruggere una nave difensore diversa?
15. **Più di 3 navi.** Se una flotta ha >3 navi, dopo che muoiono le prime 3 si schierano le successive in round successivi? Chi sceglie quali 3 navi schierare? L'altro lato può sostituire le perdite tra un round e l'altro?
16. **Ritirata.** È possibile ritirarsi da un combattimento? (il manuale non lo cita)
17. **Esito.** Vinto lo scontro su casella non-pianeta, l'attaccante avanza sulla casella? Le navi superstiti del difensore tornano da dove? (eliminato il difensore = navi distrutte).

## G. Combattimento di terra
18. **Risoluzione.** Confermi che usa lo stesso meccanismo dello scontro spaziale (valori ordinati, confronto a coppie, alternanza attaccante-prima)?
19. **Esito conquista.** Vinto il combattimento di terra, il pianeta passa all'attaccante: gli **edifici esistenti** (fabbriche, tesoreria, difese) restano al conquistatore o vengono distrutti? Serve comunque una Nave Colonia per conquistare un pianeta nemico, o basta vincere e avere una Torpediniera?
20. **Carri sbarcati persi.** I carri attaccanti che sopravvivono restano sul pianeta conquistato come guarnigione?

## H. Carri armati / trasporto
21. **Caricamento carri.** Come si caricano i carri sulle navi? (es. quando una flotta è su un proprio pianeta con carri, li imbarca fino alla capienza?) I carri prodotti su un pianeta restano lì come difesa finché non vengono imbarcati?

## I. Asteroidi
22. **Malus "unità perse".** "Truppe perse (0–3 unità)": sono **carri** o **navi**? Cosa succede se la flotta non ha l'unità indicata (es. malus carri ma la flotta non ne trasporta)?
23. **Bonus.** "Materie o soldi (0–3)": quale risorsa di preciso (casuale tra le 3? scelta del giocatore?) e quanti soldi corrispondono a "1 unità"?
24. Le 40 carte asteroidi hanno valori specifici da fornire o le genero io secondo le percentuali (24 malus / 16 bonus, 0–3)?

## J. Mercato
25. **Vendita materie.** Il testo dice "comprare o vendere materie prime" al Mercato, ma le 55 carte coprono solo acquisti di unità. A quale prezzo si comprano/vendono i cubi di materia? (tabella prezzi mancante)
26. Confermi che ogni turno sul Mercato si pesca **1** sola carta deal?

## K. Commercio tra giocatori (Fase 4)
27. In hot-seat, il commercio tra giocatori è una negoziazione libera: lo implemento come trasferimento manuale concordato (risorse/navi/carri ↔ soldi) tra due giocatori al tavolo? Vincoli particolari?

## L. Condizione di eliminazione / vittoria
28. **Quando una fazione è eliminata?** Quando non ha **né navi né pianeti**? O basta perdere tutti i pianeti? Un giocatore con pianeti ma senza flotte è ancora in gioco? Un giocatore senza pianeti ma con flotte?

## M. IA avversaria
29. Il gioco è pensato per umani in hot-seat. Vuoi che implementi anche un'**IA basilare** per i posti non occupati da umani? Con che priorità (anche solo "stub" che esplora e colonizza)?

## N. Casinò
30. Con flotta sul Casinò "obbligato a giocare ogni turno": l'obbligo è una sola puntata minima (1.000) per turno con possibilità di escalation finché vuole, oppure deve continuare finché vince/perde? Confermi che la mia lettura (1 sessione di craps per turno) è corretta.
