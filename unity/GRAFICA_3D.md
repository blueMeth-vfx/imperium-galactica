# Imperium Galactica — Elenco asset grafici (versione FULL 3D)

Il **motore di gioco (regole) è già pronto e non cambia**: qui c'è solo ciò che
serve **graficamente** per la versione 3D in Unity. Legenda priorità:
**[MVP]** = serve per un primo 3D giocabile · **[POI]** = rifinitura successiva.

---

## 1. Ambiente e scena
- **[MVP]** Skybox spaziale 3D (cubemap stelle + nebulose) per lo sfondo.
- **[MVP]** Luce direzionale (il "sole") + 1–2 luci d'accento; ambient occlusion.
- **[MVP]** Camera 3D orbitale sul tabellone: rotazione, **zoom**, pan, "inquadra tutto".
- **[POI]** Nebulose/particelle di sfondo che si muovono lentamente.
- **[POI]** Post-processing (bloom per motori/laser, tone mapping, vignette).

## 2. Tabellone esagonale (3D)
- **[MVP]** Mesh **tessera esagonale 3D** (con spessore/estrusione).
- **[MVP]** Materiali per tipo di cella: **spazio, pianeta, asteroidi, mercato,
  casinò, inesplorata (nebbia)**.
- **[MVP]** Evidenziazioni: **cella selezionata**, **celle raggiungibili** (movimento).
- **[POI]** Bordi luminosi delle tessere; effetto "nebbia di guerra" sulle inesplorate.
- **[POI]** Freccia/traiettoria di movimento in 3D.

## 3. Pianeti (3D) — 4 tipi
- **[MVP]** Modello sfera pianeta + **materiali per tipo**: **Fuoco, Ghiaccio,
  Terra, Roccia** (mappa colore; per Fuoco emissive lava, per Ghiaccio calotte,
  per Terra continenti, per Roccia crateri).
- **[MVP]** **Anello colorato del proprietario** (4 colori fazione) attorno al pianeta.
- **[POI]** Atmosfera/alone, anelli planetari, rotazione lenta.
- **[POI]** Badge 3D/holo sopra il pianeta per **edifici** e **guarnigione**.

## 4. Navi e unità (3D) — colorabili per fazione
- **[MVP]** Modelli 3D: **Caccia**, **Torpediniera**, **Nave Colonia**, **Carro armato**.
- **[MVP]** Variante **colore per fazione** (4 colori) sullo stesso modello.
- **[MVP]** **Segnalino flotta** con numero (quante unità) leggibile dall'alto.
- **[POI]** Particelle motori + scia; animazione di spostamento tra celle.
- **[POI]** Modelli distinti invece del solo colore per fazione.

## 5. Difese planetarie (3D)
- **[MVP]** Modello **Cannone Interstellare** (difesa spaziale).
- **[MVP]** Modello **Torretta Terrestre** (difesa a terra).
- **[MVP]** Modelli edifici: **Fabbrica Navale, Fabbrica Carri, Tesoreria**
  (bastano forme low-poly riconoscibili sul pianeta o icone).

## 6. Schermata / arena di combattimento
- **[MVP]** **Dadi 3D** con facce 1–6 e **animazione di lancio** (i tipi unità usano
  colori diversi come nel web: caccia rosso, torpediniera giallo, colonia verde,
  cannone/torretta blu).
- **[MVP]** Fondale battaglia **spaziale** e **terrestre** (superficie pianeta).
- **[MVP]** Navi/carri schierati sui due lati (riuso dei modelli sopra).
- **[MVP]** VFX colpi: **laser/proiettili**, **esplosioni**, **scudo** (colpo parato).
- **[POI]** Detriti, scuotimento camera, rallenty sul colpo decisivo.

## 7. Interfaccia (UI/HUD) e icone 2D
- **[MVP]** **Font** di gioco (titoli + testo).
- **[MVP]** Barra superiore: turno, **4 icone delle fasi** (Riscossione, Produzione,
  Movimento, Costruzione), **icone risorse** (Ndri, carburante, metallo, pietra),
  nome + colore fazione, tempo di gioco.
- **[MVP]** Pannello **selezione** (pianeta/flotta) con statistiche e pulsanti azione.
- **[MVP]** Pannello **produzione/costruzione**: icone unità/edifici + costi.
- **[MVP]** **Icone**: 4 navi, carri, 5 edifici, 4 risorse, 4 fasi, azioni
  (colonizza, attacca, muovi, mercato, casinò, imbarca/sbarca).
- **[MVP]** Schermate: **menu iniziale**, **vittoria**, salva/carica.
- **[POI]** **Carte-pianeta** in mano (come sul web), **diario/log** eventi,
  **banner** eventi (scoperta, asteroidi ±, conquista), carta **mercato**, dado casinò.
- **[POI]** Lobby online (se si rifà il multiplayer in Unity).

## 8. VFX / Feedback (particellari)
- **[MVP]** Esplosione, laser/proiettile, scudo (per il combattimento).
- **[POI]** Colonizzazione (bandiera/onda), costruzione, asteroidi bonus/malus,
  vincita/perdita al Casinò, evidenziazione selezione pulsante.

## 9. Menu e branding
- **[MVP]** **Logo** "Imperium Galactica".
- **[MVP]** **Icona dell'app** (.ico per l'eseguibile).
- **[POI]** Scena 3D animata di sfondo al menu (pianeta + navi che orbitano).

## 10. Audio (non grafico, ma spesso nella stessa lista)
- **[POI]** Musica di sottofondo, click UI, movimento (whoosh), dadi, laser,
  esplosione, inizio turno, vittoria. *(Nel web esistono già come suoni sintetizzati:
  si possono riusare/ricreare.)*

---

## Riepilogo minimo per un "primo 3D giocabile" (MVP)
1. Skybox + luce + camera orbitale.
2. Tessera esagonale 3D + materiali per tipo cella + highlight selezione/movimento.
3. 4 pianeti (sfere + materiali per tipo) + anello proprietario.
4. 4 modelli nave/carro colorabili per fazione + segnalino conteggio.
5. Dadi 3D animati + VFX laser/esplosione per la battaglia.
6. HUD base (barra turno/fase/risorse, pannello azioni) + set icone.
7. Logo + icona app.

## Note pratiche
- Si può partire **low-poly / primitive** e sostituire dopo con modelli migliori:
  il codice userà i modelli/sprite che gli dai, con ripiego automatico.
- I **dati e i colori** delle fazioni/pianeti sono già definiti nel motore (riuso).
- Formati tipici: modelli **.fbx/.obj**, texture **.png**, icone **.png/SVG→PNG**,
  particellari con lo **Shuriken/VFX Graph** di Unity, UI con **uGUI o UI Toolkit**.
