# Multiplayer online

Il gioco supporta il **multiplayer in rete** (2–4 giocatori su dispositivi diversi), oltre
all'hot-seat locale.

## ✅ Già pronto: non devi fare nulla
Il server è **già deployato** su Cloudflare e **preimpostato nel gioco**:
`wss://imperium-mp.matteocongedo-vfx.workers.dev`

Per giocare online basta: scheda **🌐 Online** → nome → **Genera** un codice (o incollane uno)
→ **Entra nella stanza** → l'host preme **Avvia partita**. Il campo *Server* è già compilato.

---

## (Solo se un giorno vuoi rifare il deploy del server)
Il server è un piccolo Worker su **Cloudflare Workers + Durable Objects** (codice in `server/`).

## 1. Deploy del server (una volta sola)

Dal computer, nella cartella del progetto:

```powershell
cd C:\Users\matte\GiocoDaTavolo\server
npx wrangler login       # apre il browser: autorizza il tuo account Cloudflare
npx wrangler deploy      # pubblica il Worker
```

Al termine `wrangler` stampa l'URL del server, del tipo:

```
https://imperium-mp.<tuo-sottodominio>.workers.dev
```

Annotalo: per il gioco useremo la versione **wss://** dello stesso indirizzo, cioè:

```
wss://imperium-mp.<tuo-sottodominio>.workers.dev
```

> I Durable Objects usati sono in versione **SQLite**, inclusi nel **piano gratuito** di Cloudflare.
> Il server tiene lo stato solo in memoria (nessun database), quindi non ha costi di storage.

## 2. Giocare online

1. Apri il gioco (https://imperium-galactica.pages.dev) su ogni dispositivo.
2. Scheda **🌐 Online**.
3. Metti il tuo **nome**, un **codice stanza** (l'host lo crea con "Genera", gli altri lo
   incollano uguale) e nel campo **Server** incolla `wss://imperium-mp.<...>.workers.dev`.
4. Premi **Entra nella stanza**. Il primo che entra è l'**host**.
5. Quando siete tutti nella stessa stanza, l'host preme **Avvia partita**.
6. Si gioca a turni: quando tocca a te i comandi sono attivi, altrimenti vedi "⏳ Turno di …".

## Come funziona (in breve)
- Modello **turn-based a stato condiviso**: chi è di turno gioca sul proprio dispositivo e, a
  ogni azione, invia lo stato aggiornato al server, che lo ritrasmette agli altri.
- Il server **valida il turno** (solo il giocatore di turno può modificare lo stato).
- È pensato per **amici**: i client sono considerati fidati (nessun anti-cheat forte).

## Sviluppo/test in locale
```powershell
cd server
npx wrangler dev         # server locale su ws://127.0.0.1:8787
```
Poi nel gioco, come Server, usa `ws://127.0.0.1:8787`.
