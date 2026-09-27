# Imperium Galactica — Progetto Unity (prototipo)

Progetto Unity pronto in `unity/ImperiumGalactica`, con il **motore di gioco in C#**
e un **prototipo giocabile completo** (solo la grafica è minimale — quella la
sistemi tu). Parte da solo appena premi Play: niente scene/prefab da montare.

Tutti gli script sono stati **compilati contro le DLL vere di Unity 6** (0 errori).

## 1) Attiva la licenza (una volta sola)
1. Apri **Unity Hub**.
2. Icona account in alto a destra → **Sign in** (o crea un account gratis).
3. **⚙ Preferences → Licenses → Add → "Get a free personal license"** (Unity Personal).

## 2) Apri il progetto
1. Unity Hub → **Add → Add project from disk** → cartella
   `...\GiocoDaTavolo\unity\ImperiumGalactica`.
2. Aprilo con **Unity 6000.0.36f1** (se propone 6000.4.2f1 va bene comunque).
3. Prima apertura: importa e compila, **qualche minuto** (normale).

## 3) Gioca — premi ▶ Play
- **Menu iniziale:** scegli numero di giocatori, chi è IA, un seed opzionale →
  **Inizia partita** (o **Carica partita** se ne hai una salvata).
- **Tabellone esagonale** con HUD in alto (turno, fase, risorse, pulsanti).
- **Muovere:** in fase *Movimento* clicca una tua **flotta** (marker colorato),
  poi una **cella adiacente evidenziata in oro**.
- **Combattimento interattivo:** attaccando flotta/pianeta si apre la finestra
  di battaglia → *Tira i dadi* → *Risolvi round*, round per round (spazio +
  eventuale sbarco a terra coi carri).
- **Colonizzare / produrre / costruire / mercato / casinò / imbarca-sbarca carri:**
  seleziona un pianeta o una flotta e usa i pulsanti che compaiono in alto.
- **Salva / Carica** dalla barra e dal menu; **schermata di vittoria** a fine partita.

## Cos'è (e cosa manca)
**Prototipo con tutta la logica di gioco funzionante**: menu, movimento,
combattimento coi dadi, mercato, casinò, salvataggio, fine partita.
Manca solo la **grafica**:
- esagoni colorati + marker come navi, HUD "debug" (IMGUI);
- dadi come numeri (niente animazioni), niente sprite di pianeti/navi ancora.

## Struttura
```
unity/ImperiumGalactica/
  Assets/Scripts/Engine/      <- motore (Config, Hex, Rng, Game, Combat,
                                 CombatSession, Casino, Market, Ai, Serialization)
  Assets/Scripts/Prototype/   <- GameBootstrap, HexBoardView (UI/gioco),
                                 HexMeshFactory, SaveSystem
  Packages/manifest.json
  ProjectSettings/ProjectVersion.txt
```

## Prossimi passi (li facciamo insieme)
- **Grafica**: sprite/mesh di pianeti e navi, animazioni dei dadi, effetti battaglia.
- Menu/HUD grafici (al posto dell'IMGUI di debug), audio.
- Build dell'**eseguibile** per PC/Steam (posso farla io da qui una volta attiva
  la licenza).

© 2026 Matteo Congedo — Tutti i diritti riservati.
