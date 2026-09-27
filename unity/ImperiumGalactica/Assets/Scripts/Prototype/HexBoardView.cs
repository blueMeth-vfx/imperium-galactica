// ============================================================================
// HexBoardView.cs — Prototipo GIOCABILE completo (logica), grafica minimale.
// Menu iniziale, tabellone esagonale, movimento, COMBATTIMENTO INTERATTIVO coi
// dadi, mercato, casinò, salva/carica, schermata vittoria. Tutto da codice
// (IMGUI, nessun prefab). La parte grafica "bella" la aggiungerai tu.
// ============================================================================
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using ImperiumGalactica.Engine;

namespace ImperiumGalactica.UnityView
{
    public class HexBoardView : MonoBehaviour
    {
        private enum ViewState { Menu, Playing }
        private ViewState state = ViewState.Menu;

        private Game game;
        private Camera cam;
        private Mesh hexMesh, markerMesh;
        private readonly Dictionary<string, Renderer> tileRend = new Dictionary<string, Renderer>();
        private Transform tilesRoot, fleetsRoot;
        private static Shader _colorShader;

        private int selFleet = -1, selQ = -100, selR = -100;
        private bool aiRunning;
        private string toast = ""; private float toastT;

        // Menu
        private int menuPlayers = 4;
        private readonly bool[] menuAI = { false, true, true, true };
        private string menuSeed = "";

        // Mercato (una carta per flotta per turno)
        private int mktFleet = -1, mktTurn = -1; private MarketCard mktCard; private bool mktBought;

        // Combattimento interattivo
        private class CombatState
        {
            public string kind, phase;
            public Fleet att, def, defFleet;
            public Cell cell;
            public List<CombatUnit> uA, uB, gtA, gtB;
            public int land, landN;
            public CombatSession session;
        }
        private CombatState combat;

        void Start()
        {
            cam = Camera.main;
            if (cam == null)
            {
                GameObject camGo = new GameObject("MainCamera"); camGo.tag = "MainCamera";
                cam = camGo.AddComponent<Camera>();
            }
            cam.orthographic = true;
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.03f, 0.04f, 0.08f);

            hexMesh = HexMeshFactory.CreateHex(0.92f);
            markerMesh = HexMeshFactory.CreateHex(0.34f);
            tilesRoot = new GameObject("Tiles").transform; tilesRoot.parent = transform;
            fleetsRoot = new GameObject("Fleets").transform; fleetsRoot.parent = transform;

            BuildTiles();
            FitCamera();
            Refresh();
        }

        // --------------------------------------------------------- setup partita
        private void NewGame(List<PlayerDef> defs, int seed)
        {
            game = new Game(defs, seed);
            state = ViewState.Playing;
            combat = null; selFleet = -1; selQ = selR = -100; aiRunning = false;
            mktFleet = -1; mktTurn = -1;
            Refresh();
        }

        // --------------------------------------------------------- coordinate/mesh
        private Vector3 CellWorld(int q, int r) { Vec2 p = Hex.ToPixel(q, r, 1.0); return new Vector3((float)p.x, -(float)p.y, 0f); }

        private void BuildTiles()
        {
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    GameObject go = new GameObject("t" + q + "_" + r);
                    go.transform.parent = tilesRoot; go.transform.position = CellWorld(q, r);
                    go.AddComponent<MeshFilter>().sharedMesh = hexMesh;
                    go.AddComponent<MeshRenderer>().sharedMaterial = MakeMaterial(Color.gray);
                    tileRend[Hex.Key(q, r)] = go.GetComponent<Renderer>();
                }
        }

        private void FitCamera()
        {
            float minx = 1e9f, miny = 1e9f, maxx = -1e9f, maxy = -1e9f;
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    Vector3 w = CellWorld(q, r);
                    minx = Mathf.Min(minx, w.x); maxx = Mathf.Max(maxx, w.x);
                    miny = Mathf.Min(miny, w.y); maxy = Mathf.Max(maxy, w.y);
                }
            cam.transform.position = new Vector3((minx + maxx) * 0.5f, (miny + maxy) * 0.5f, -10f);
            float halfH = (maxy - miny) * 0.5f + 1.2f, halfW = (maxx - minx) * 0.5f + 1.2f;
            float aspect = cam.aspect > 0.01f ? cam.aspect : 1.6f;
            cam.orthographicSize = Mathf.Max(halfH, halfW / aspect);
        }

        private static Shader ColorShader()
        {
            if (_colorShader == null)
            {
                _colorShader = Shader.Find("Unlit/Color");
                if (_colorShader == null) _colorShader = Shader.Find("Universal Render Pipeline/Unlit");
                if (_colorShader == null) _colorShader = Shader.Find("Sprites/Default");
                if (_colorShader == null) _colorShader = Shader.Find("Standard");
            }
            return _colorShader;
        }
        private static Material MakeMaterial(Color c) { Material m = new Material(ColorShader()); m.color = c; if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c); return m; }
        private static Color Hex2Col(string hex) { Color c; return ColorUtility.TryParseHtmlString(hex, out c) ? c : Color.white; }
        private Color FactionColor(int owner) { return (owner < 0 || owner >= Config.COLORS.Length) ? Color.white : Hex2Col(Config.COLORS[owner]); }
        private Color TileColor(Cell c)
        {
            if (c == null || !c.explored) return new Color(0.16f, 0.17f, 0.20f);
            switch (c.type)
            {
                case "planet": return c.owner >= 0 ? FactionColor(c.owner) : new Color(0.30f, 0.55f, 0.35f);
                case "asteroids": return new Color(0.42f, 0.34f, 0.20f);
                case "market": return new Color(0.15f, 0.45f, 0.55f);
                case "casino": return new Color(0.42f, 0.20f, 0.50f);
                default: return new Color(0.10f, 0.14f, 0.28f);
            }
        }

        // --------------------------------------------------------- refresh
        private HashSet<string> Reachable()
        {
            HashSet<string> set = new HashSet<string>();
            if (game == null || game.Phase != "movimento" || selFleet < 0) return set;
            Fleet f = game.FleetById(selFleet);
            if (f == null || f.owner != game.currentPlayer || f.stepsLeft <= 0) return set;
            foreach (HexCoord n in Hex.Neighbors(f.q, f.r)) set.Add(Hex.Key(n.q, n.r));
            return set;
        }

        private void Refresh()
        {
            HashSet<string> reach = Reachable();
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    string k = Hex.Key(q, r);
                    Color col = game == null ? new Color(0.14f, 0.15f, 0.18f) : TileColor(game.Cell(q, r));
                    if (reach.Contains(k)) col = Color.Lerp(col, new Color(1f, 0.85f, 0.3f), 0.55f);
                    if (selQ == q && selR == r) col = Color.Lerp(col, Color.white, 0.45f);
                    Renderer rd;
                    if (tileRend.TryGetValue(k, out rd)) { rd.sharedMaterial.color = col; if (rd.sharedMaterial.HasProperty("_BaseColor")) rd.sharedMaterial.SetColor("_BaseColor", col); }
                }

            for (int i = fleetsRoot.childCount - 1; i >= 0; i--) Destroy(fleetsRoot.GetChild(i).gameObject);
            if (game == null) return;
            Dictionary<string, int> countAt = new Dictionary<string, int>();
            foreach (Fleet f in game.fleets)
            {
                string k = Hex.Key(f.q, f.r);
                int idx; countAt.TryGetValue(k, out idx); countAt[k] = idx + 1;
                Vector3 pos = CellWorld(f.q, f.r) + new Vector3(0.28f * idx - 0.14f, 0.10f * idx, -0.2f);
                if (f.id == selFleet)
                {
                    GameObject ring = new GameObject("sel"); ring.transform.parent = fleetsRoot;
                    ring.transform.position = pos + new Vector3(0, 0, 0.05f); ring.transform.localScale = Vector3.one * 1.35f;
                    ring.AddComponent<MeshFilter>().sharedMesh = markerMesh;
                    ring.AddComponent<MeshRenderer>().sharedMaterial = MakeMaterial(Color.white);
                }
                GameObject m = new GameObject("f" + f.id); m.transform.parent = fleetsRoot; m.transform.position = pos;
                m.AddComponent<MeshFilter>().sharedMesh = markerMesh;
                m.AddComponent<MeshRenderer>().sharedMaterial = MakeMaterial(FactionColor(f.owner));
            }
        }

        // --------------------------------------------------------- update/input
        void Update()
        {
            if (state != ViewState.Playing || game == null || combat != null || game.winner != null) return;
            Player cur = game.Player(game.currentPlayer);
            if (cur.isAI) { if (!aiRunning) StartCoroutine(RunAiTurn()); return; }
            if (Input.GetMouseButtonDown(0)) OnClickWorld();
        }

        private IEnumerator RunAiTurn()
        {
            aiRunning = true;
            yield return new WaitForSeconds(0.45f);
            try { Ai.RunTurn(game); } catch (System.Exception e) { Debug.LogException(e); ShowToast("Errore IA: " + e.Message); }
            selFleet = -1; selQ = selR = -100; aiRunning = false; Refresh();
        }

        private void OnClickWorld()
        {
            Vector3 mp = Input.mousePosition; mp.z = -cam.transform.position.z;
            Vector3 w = cam.ScreenToWorldPoint(mp);
            int bq = -1, br = -1; float best = 1e9f;
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    float d = (CellWorld(q, r) - new Vector3(w.x, w.y, 0)).sqrMagnitude;
                    if (d < best) { best = d; bq = q; br = r; }
                }
            if (bq < 0 || best > 1.4f) return;
            if (game.Phase == "movimento" && selFleet >= 0 && Reachable().Contains(Hex.Key(bq, br))) { DoMove(selFleet, bq, br); return; }
            selQ = bq; selR = br;
            Fleet own = game.FleetOfAt(game.currentPlayer, bq, br);
            selFleet = own != null ? own.id : -1;
            Refresh();
        }

        private void DoMove(int fleetId, int q, int r)
        {
            Result ev;
            try { ev = game.StepFleet(fleetId, q, r); } catch (System.Exception e) { Debug.LogException(e); return; }
            if (!ev.ok) { ShowToast(ev.msg); return; }
            if (ev.ev == "combat") { StartCombat("fleet", ev); return; }
            if (ev.ev == "planetCombat") { StartCombat("planet", ev); return; }
            if (ev.ev == "destroyed") { selFleet = -1; }
            else
            {
                if (ev.canColonize) { Fleet f = game.FleetById(ev.fleet); if (f != null && f.ships.colonia > 0) game.Colonize(f.id); }
                selFleet = ev.fleet; selQ = q; selR = r;
            }
            Refresh();
        }

        // --------------------------------------------------------- combattimento
        private void StartCombat(string kind, Result ev)
        {
            combat = new CombatState { kind = kind, phase = "space" };
            combat.att = game.FleetById(ev.attacker);
            if (kind == "fleet")
            {
                combat.def = game.FleetById(ev.defender);
                combat.uA = game.ShipUnits(combat.att); combat.uB = game.ShipUnits(combat.def);
                combat.session = game.MakeCombatSession(combat.uA, combat.uB, false);
            }
            else
            {
                combat.cell = game.Cell(ev.q, ev.r);
                PlanetSetup setup = game.PlanetCombatSetup(combat.att, combat.cell);
                combat.defFleet = setup.defFleet; combat.uA = setup.uA; combat.uB = setup.uB;
                combat.land = combat.att.carri; // sbarca tutti i carri (prototipo)
                combat.session = game.MakeCombatSession(combat.uA, combat.uB, false);
            }
            combat.session.StartRound();
        }

        private void CombatFinished()
        {
            string w = combat.session.winner;
            if (combat.kind == "fleet") { game.ApplyFleetCombatResult(combat.att, combat.def, combat.uA, combat.uB, w); EndCombat(); return; }
            if (combat.phase == "space")
            {
                Result res = game.ApplyPlanetSpaceResult(combat.att, combat.cell, combat.defFleet, combat.uA, combat.uB, w);
                if (res.outcome == "attackerDestroyed" || res.outcome == "spaceFailed") { EndCombat(); return; }
                if (!res.groundDef) { game.ApplyPlanetNoGround(combat.att, combat.cell, combat.land); EndCombat(); return; }
                int landN = Mathf.Min(combat.att.carri, combat.land);
                if (landN <= 0) { game.ApplyPlanetSkipGround(combat.att, combat.cell); EndCombat(); return; }
                GroundSetup gs = game.PlanetGroundSetup(combat.cell, landN);
                combat.landN = landN; combat.gtA = gs.tA; combat.gtB = gs.tB; combat.phase = "ground";
                combat.session = game.MakeCombatSession(gs.tA, gs.tB, true); combat.session.StartRound();
                return;
            }
            // ground
            game.ApplyPlanetGroundResult(combat.att, combat.cell, combat.landN, combat.gtA, combat.gtB, w);
            EndCombat();
        }

        private void EndCombat() { combat = null; selFleet = -1; selQ = selR = -100; Refresh(); }

        private void ShowToast(string m) { if (string.IsNullOrEmpty(m)) return; toast = m; toastT = Time.time; }

        // --------------------------------------------------------- HUD (IMGUI)
        void OnGUI()
        {
            GUI.skin.label.fontSize = 14; GUI.skin.button.fontSize = 14; GUI.skin.textField.fontSize = 14;
            if (state == ViewState.Menu) { DrawMenu(); return; }
            if (game == null) return;
            if (combat != null) { DrawCombat(); return; }
            DrawHud();
            if (game.winner != null) DrawWin();
        }

        private void DrawMenu()
        {
            float w = 420, h = 330;
            GUILayout.BeginArea(new Rect(Screen.width / 2 - w / 2, Screen.height / 2 - h / 2, w, h), GUI.skin.box);
            GUILayout.Label("<b>IMPERIUM GALACTICA</b> — prototipo");
            GUILayout.Space(6);
            GUILayout.BeginHorizontal();
            GUILayout.Label("Giocatori: " + menuPlayers, GUILayout.Width(120));
            if (GUILayout.Button("-", GUILayout.Width(30)) && menuPlayers > 2) menuPlayers--;
            if (GUILayout.Button("+", GUILayout.Width(30)) && menuPlayers < 4) menuPlayers++;
            GUILayout.EndHorizontal();
            for (int i = 0; i < menuPlayers; i++)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label("Giocatore " + (i + 1) + " (" + Config.COLOR_NAMES[i] + ")", GUILayout.Width(200));
                menuAI[i] = GUILayout.Toggle(menuAI[i], " IA");
                GUILayout.EndHorizontal();
            }
            GUILayout.BeginHorizontal();
            GUILayout.Label("Seed (opzionale):", GUILayout.Width(140));
            menuSeed = GUILayout.TextField(menuSeed ?? "", GUILayout.Width(120));
            GUILayout.EndHorizontal();
            GUILayout.Space(8);
            if (GUILayout.Button("▶ Inizia partita"))
            {
                List<PlayerDef> defs = new List<PlayerDef>();
                for (int i = 0; i < menuPlayers; i++)
                    defs.Add(new PlayerDef("Giocatore " + (i + 1), menuAI[i], "medio"));
                int seed = 0; int.TryParse(menuSeed, out seed);
                NewGame(defs, seed);
            }
            if (SaveSystem.HasSave() && GUILayout.Button("📂 Carica partita salvata"))
            {
                Game loaded = SaveSystem.Load();
                if (loaded != null) { game = loaded; state = ViewState.Playing; combat = null; selFleet = -1; selQ = selR = -100; Refresh(); }
                else ShowToast("Salvataggio non valido.");
            }
            GUILayout.EndArea();
        }

        private void DrawHud()
        {
            Player p = game.Player(game.currentPlayer);
            GUILayout.BeginArea(new Rect(8, 8, 560, 190), GUI.skin.box);
            GUILayout.Label("Turno " + game.turnNumber + " — " + p.name + (p.isAI ? " (IA)" : "") + "  |  Fase: " + PhaseLabel(game.Phase));
            GUILayout.Label("Ndri " + p.money + "   Carb " + p.res.carburante + "   Met " + p.res.metallo + "   Pietra " + p.res.pietra +
                "   Pianeti " + game.PlanetsOf(p.id).Count + "   Flotte " + game.FleetsOf(p.id).Count);

            GUILayout.BeginHorizontal();
            if (GUILayout.Button("💾 Salva", GUILayout.Width(90))) ShowToast(SaveSystem.Save(game) ? "Salvato." : "Salvataggio non riuscito.");
            if (GUILayout.Button("Menu", GUILayout.Width(70))) { state = ViewState.Menu; }
            GUILayout.EndHorizontal();

            if (p.isAI) { GUILayout.Label("L'IA sta giocando…"); }
            else
            {
                if (GUILayout.Button(game.phaseIdx >= Game.PHASES.Length - 1 ? "Fine turno ▸" : "Avanza fase ▸", GUILayout.Width(160)))
                { try { game.AdvancePhase(); } catch (System.Exception e) { Debug.LogException(e); } selFleet = -1; selQ = selR = -100; Refresh(); }
                DrawCellActions(p);
            }
            GUILayout.EndArea();

            GUILayout.BeginArea(new Rect(8, Screen.height - 150, Screen.width - 16, 142), GUI.skin.box);
            int n = game.log.Count;
            for (int i = System.Math.Max(0, n - 6); i < n; i++) GUILayout.Label(game.log[i]);
            GUILayout.EndArea();

            if (!string.IsNullOrEmpty(toast) && Time.time - toastT < 2.5f)
                GUI.Label(new Rect(Screen.width / 2 - 220, 210, 440, 24), "⚠ " + toast);
        }

        private void DrawCellActions(Player p)
        {
            if (selQ < 0) return;
            Cell c = game.Cell(selQ, selR);
            if (c == null || !c.explored) return;

            if (c.type == "planet" && c.owner == p.id)
            {
                if (game.Phase == "produzione")
                {
                    GUILayout.BeginHorizontal();
                    if (c.buildings.fabbricaNavale > 0)
                    {
                        if (GUILayout.Button("+Caccia")) Act(game.ProduceShip(selQ, selR, "caccia", 1));
                        if (GUILayout.Button("+Torped.")) Act(game.ProduceShip(selQ, selR, "torpediniera", 1));
                        if (GUILayout.Button("+Colonia")) Act(game.ProduceShip(selQ, selR, "colonia", 1));
                    }
                    if (c.buildings.fabbricaCarri > 0 && GUILayout.Button("+Carro")) Act(game.ProduceCarri(selQ, selR, 1));
                    GUILayout.EndHorizontal();
                }
                else if (game.Phase == "costruzione")
                {
                    GUILayout.BeginHorizontal();
                    foreach (KeyValuePair<string, BuildingDef> kv in Config.BUILDINGS)
                        if (GUILayout.Button(kv.Value.nome.Split(' ')[0])) Act(game.BuildBuilding(selQ, selR, kv.Key));
                    GUILayout.EndHorizontal();
                }
            }

            Fleet f = game.FleetOfAt(p.id, selQ, selR);
            if (f != null)
            {
                GUILayout.Label("Flotta #" + f.id + ": C" + f.ships.caccia + " T" + f.ships.torpediniera + " Col" + f.ships.colonia + " Carri" + f.carri +
                    (game.Phase == "movimento" ? "  (" + f.stepsLeft + " passi)" : ""));
                if (game.Phase == "movimento" && c.type == "planet" && c.owner < 0 && f.ships.colonia > 0 && GUILayout.Button("Colonizza")) Act(game.Colonize(f.id));
                if (c.type == "market") DrawMarket(f, p);
                if (c.type == "casino") DrawCasino(f, p);
                if (c.type == "planet" && c.owner == f.owner)
                {
                    GUILayout.BeginHorizontal();
                    if (c.garrison > 0 && (game.FleetCarriCapacity(f) - f.carri) > 0 && GUILayout.Button("Imbarca carro")) Act(game.LoadTanks(f.id, 1));
                    if (f.carri > 0 && GUILayout.Button("Sbarca carro")) Act(game.UnloadTanks(f.id, 1));
                    GUILayout.EndHorizontal();
                }
            }
        }

        private void DrawMarket(Fleet f, Player p)
        {
            if (mktFleet != f.id || mktTurn != game.turnNumber) { mktCard = game.MarketDraw(); mktFleet = f.id; mktTurn = game.turnNumber; mktBought = false; }
            GUILayout.Label("🛒 Mercato — offerta: " + mktCard.qta + "x " + mktCard.unita + " a " + mktCard.prezzo + " Ndri");
            GUILayout.BeginHorizontal();
            if (!mktBought && GUILayout.Button("Compra offerta"))
            {
                Result r = game.MarketBuy(f.id, mktCard);
                if (r.needPlanet)
                {
                    List<Cell> pl = game.PlanetsWithGarrisonRoom(f.owner, mktCard.qta);
                    if (pl.Count > 0) r = game.MarketBuy(f.id, mktCard, pl[0].q, pl[0].r);
                }
                if (r.ok) { mktBought = true; Refresh(); } else ShowToast(r.msg);
            }
            foreach (string mtl in new[] { "carburante", "metallo", "pietra" })
            {
                if (GUILayout.Button("+" + mtl.Substring(0, 3))) Act(game.MarketTradeCube(p.id, mtl, 1, false));
                if (GUILayout.Button("-" + mtl.Substring(0, 3))) Act(game.MarketTradeCube(p.id, mtl, 1, true));
            }
            GUILayout.EndHorizontal();
        }

        private void DrawCasino(Fleet f, Player p)
        {
            CasinoSession s = game.CasinoSessionOf(p.id);
            GUILayout.Label("🎲 Casinò — banco: " + s.banco + " Ndri");
            GUILayout.BeginHorizontal();
            if (GUILayout.Button("Punta e lancia"))
            {
                int min = s.banco > 0 ? Mathf.Max(Config.CASINO_PUNTATA_MIN, s.banco) : Config.CASINO_PUNTATA_MIN;
                Result b = game.CasinoBet(p.id, min);
                if (!b.ok) ShowToast(b.msg);
                else { Result rr = game.CasinoRoll(p.id); ShowToast(rr.d1 + "+" + rr.d2 + "=" + rr.sum + " → " + rr.outcome); Refresh(); }
            }
            if (s.banco > 0 && GUILayout.Button("Lascia")) { game.CasinoLeave(p.id); Refresh(); }
            GUILayout.EndHorizontal();
        }

        private void DrawCombat()
        {
            CombatSession s = combat.session; CombatRound r = s.round;
            float w = 560, h = 260;
            GUILayout.BeginArea(new Rect(Screen.width / 2 - w / 2, Screen.height / 2 - h / 2, w, h), GUI.skin.box);
            GUILayout.Label("<b>⚔ Battaglia</b> — round " + (s.roundIndex + 1) + (combat.phase == "ground" ? "  (TERRA)" : "  (SPAZIO)"));
            GUILayout.Label("Attacca: " + (r.aggressorIsA ? "TU" : "avversario"));
            GUILayout.Label("Dadi attacco: " + DiceStr(r.att));
            GUILayout.Label("Dadi difesa:  " + DiceStr(r.def));

            bool allRolled = r.att.All(d => d.die != null) && r.def.All(d => d.die != null);
            GUILayout.Space(8);
            if (!allRolled)
            {
                if (GUILayout.Button("🎲 Tira i dadi", GUILayout.Width(160))) { s.RollAll(r.att); s.RollAll(r.def); }
            }
            else
            {
                if (GUILayout.Button("Risolvi round ⚔", GUILayout.Width(160)))
                {
                    RoundResult rr = s.Resolve();
                    if (rr.finished) CombatFinished(); else s.StartRound();
                }
            }
            GUILayout.Label("La tua flotta e le difese si scontrano round per round. (dadi/animazioni: prossimo step)");
            GUILayout.EndArea();
        }

        private static string DiceStr(List<CombatSlot> list)
        {
            if (list == null || list.Count == 0) return "—";
            return string.Join("  ", list.Select(d => (d.die == null ? "?" : d.die.Value.ToString()) + "x" + d.mult).ToArray());
        }

        private void DrawWin()
        {
            float w = 380, h = 120;
            GUILayout.BeginArea(new Rect(Screen.width / 2 - w / 2, 60, w, h), GUI.skin.box);
            GUILayout.Label(game.winner == -1 ? "Pareggio: tutte le fazioni eliminate." : ("🏆 Vince " + game.Player(game.winner.Value).name + "!"));
            if (GUILayout.Button("Torna al menu")) { state = ViewState.Menu; game = null; selFleet = -1; selQ = selR = -100; Refresh(); }
            GUILayout.EndArea();
        }

        private void Act(Result r) { if (r != null && !r.ok) ShowToast(r.msg); Refresh(); }

        private static string PhaseLabel(string ph)
        {
            switch (ph) { case "riscossione": return "Riscossione"; case "produzione": return "Produzione"; case "movimento": return "Movimento"; case "costruzione": return "Costruzione"; }
            return ph;
        }
    }
}
