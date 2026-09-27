# Imperium Galactica — Motore di gioco in C# (per Unity)

Port fedele del motore di gioco (le **regole**) dalla versione web (`engine/*.js`)
a **C#**, come libreria pura **senza dipendenze da Unity**. È la base su cui
costruire la versione Unity per PC/Steam: la logica è già pronta e testata, resta
da fare la parte grafica/UI dentro l'Editor Unity.

## Struttura

```
csharp/
  Engine/        <- IL MOTORE (copia questi .cs in Unity: Assets/Scripts/Engine/)
    Config.cs        costanti e parametri (navi, edifici, difficoltà, limiti)
    Hex.cs           griglia esagonale flat-top / odd-q
    Rng.cs           RNG deterministico (mulberry32) per partite riproducibili
    Models.cs        classi dati (Player, Cell, Fleet, Ships, Res, Buildings, ...)
    GameData.cs      pianeti / asteroidi / carte mercato (GENERATO da data/gamedata.js)
    Game.cs          motore: setup, fasi, economia, produzione, movimento, ...
    GameCombat.cs    combattimento spaziale e di terra (risolutori)
    GameCasino.cs    Casinò (craps)
    GameMarket.cs    Mercato (carte + cubi materia)
    Ai.cs            IA avversaria (turno automatico)
  Test/
    Program.cs     banco di prova a console (NON va in Unity)
```

Namespace: `ImperiumGalactica.Engine`. Nessun `using UnityEngine` — funziona sia
in Unity sia come normale libreria .NET.

## Come si usa (in codice)

```csharp
using ImperiumGalactica.Engine;

var players = new System.Collections.Generic.List<PlayerDef> {
    new PlayerDef("Matteo", isAI: false),
    new PlayerDef("Bot", isAI: true, difficulty: "medio"),
};
var g = new Game(players, seed: 42);

// Esempio di turno: fase Movimento
g.AdvancePhase();                 // Riscossione(auto) -> Produzione -> Movimento
var ev = g.StepFleet(fleetId, q, r);
if (ev.ev == "combat") { /* apri la UI di battaglia, poi g.ResolveFleetCombat(...) */ }

// Turno di un bot:
Ai.RunTurn(g);
```

Tutte le azioni restituiscono un `Result { ok, msg, ev, ... }` come nel motore JS.

## Verificare il motore fuori da Unity (Windows, senza Unity)

Serve il compilatore C# di sistema (già presente con .NET Framework):

```bash
CSC="C:/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
"$CSC" -nologo -out:build/igtest.exe -r:System.Core.dll "csharp\Engine\*.cs" "csharp\Test\Program.cs"
./build/igtest.exe 42 60      # seed 42, max 60 turni (partita tutta IA)
./build/igtest.exe 7 6        # partita corta: si vedono le colonizzazioni nel log
```

## Portarlo in Unity

1. In Unity Hub crea un nuovo progetto (2D o 3D, URP va bene) per PC.
2. Crea la cartella `Assets/Scripts/Engine/` e **copia dentro tutti i file di
   `csharp/Engine/`** (NON copiare `csharp/Test/`).
3. Unity compila da solo: il motore è pronto. Da un `MonoBehaviour` fai
   `new Game(players, seed)` e chiami i metodi del motore.
4. La parte grafica (tabellone esagonale, flotte, UI, battaglie) si costruisce
   nell'Editor con GameObject/Prefab/Canvas che **leggono lo stato** dal `Game`.

### Note per la fase Unity
- **Salvataggio**: incluso — `Game.ToState()` produce un `GameState` serializzabile
  (liste, niente Dictionary/nullable/oggetti null) e `Game.FromState(...)` ricostruisce
  la partita. In Unity il livello JSON è `SaveSystem` (JsonUtility su `GameState`).
- **Combattimento interattivo** (dadi round per round): incluso in
  `GameCombatSession.cs` (`MakeCombatSession`, `CombatSession`, e le `Apply*` per
  applicare gli esiti). Resta anche il risolutore automatico usato dall'IA.
- **Multiplayer**: la versione web usa un server Cloudflare; in Unity si rifà con
  il netcode di Unity (o si resta single-player + IA per la prima release Steam).

© 2026 Matteo Congedo — Tutti i diritti riservati (vedi LICENSE nella root).
