# Imperium Galactica — Progetto Unity (prototipo)

Progetto Unity già pronto in `unity/ImperiumGalactica`, con dentro il **motore di
gioco in C#** e un **prototipo giocabile** che parte da solo appena premi Play
(niente da montare a mano: tutto generato da codice).

Gli script sono già stati **compilati contro le DLL di Unity 6** (0 errori), quindi
in Unity compilano.

## 1) Attiva la licenza (una volta sola)
Serve la tua licenza Unity attiva (gratuita):
1. Apri **Unity Hub**.
2. Icona account in alto a destra → **Sign in** (o crea un account gratis).
3. **⚙ Preferences → Licenses → Add → "Get a free personal license"** (Unity Personal).

## 2) Apri il progetto
1. Unity Hub → **Add → Add project from disk** → scegli la cartella
   `...\GiocoDaTavolo\unity\ImperiumGalactica`.
2. Aprilo con **Unity 6000.0.36f1** (se propone 6000.4.2f1 va bene comunque).
3. La prima apertura importa e compila: **qualche minuto**, è normale.

## 3) Gioca
Premi **▶ Play** in alto. Vedrai il **tabellone esagonale**:
- In alto: turno, fase, risorse, e i pulsanti (**Avanza fase**, produzione, costruzione).
- Sei **"Tu"** (giocatore rosso); le altre 3 fazioni sono IA e giocano da sole.
- **Muovere:** in fase *Movimento* clicca una tua **flotta** (marker colorato), poi
  clicca una **cella adiacente evidenziata in oro**.
- **Colonizzare/produrre/costruire:** seleziona un pianeta/flotta e usa i pulsanti in alto.

## Cos'è (e cosa non è ancora)
Questo è un **prototipo funzionale** per confermare che il motore gira in Unity e
per giocare la mappa. Volutamente essenziale:
- I **combattimenti sono auto-risolti** (niente ancora dadi interattivi/animazioni).
- Grafica minimale (esagoni colorati + marker), HUD in stile "debug" (IMGUI).

## Prossimi passi (li facciamo insieme)
- Grafica vera: sprite/mesh dei pianeti e delle navi, effetti.
- **Schermata di battaglia** con i dadi (come nella versione web).
- **Salvataggio/caricamento** partita.
- Menu iniziale, audio, e build dell'**eseguibile** per PC/Steam.

## Struttura
```
unity/ImperiumGalactica/
  Assets/Scripts/Engine/      <- motore (copia di csharp/Engine)
  Assets/Scripts/Prototype/   <- GameBootstrap, HexBoardView, HexMeshFactory
  Packages/manifest.json
  ProjectSettings/ProjectVersion.txt
```

© 2026 Matteo Congedo — Tutti i diritti riservati.
