// ============================================================================
// HexBoardView.cs — Prototipo giocabile: disegna il tabellone esagonale dal
// motore ImperiumGalactica.Engine, gestisce clic/selezione/movimento, i turni
// dell'IA e un HUD (IMGUI). Tutto da codice: premi Play e si vede.
//
// PRIMA VERSIONE: i combattimenti sono auto-risolti (niente dadi interattivi
// ancora). Serve a confermare che il motore gira in Unity e a giocare la mappa.
// ============================================================================
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using ImperiumGalactica.Engine;

namespace ImperiumGalactica.UnityView
{
    public class HexBoardView : MonoBehaviour
    {
        private Game game;
        private Camera cam;
        private Mesh hexMesh, markerMesh;
        private readonly Dictionary<string, Renderer> tileRend = new Dictionary<string, Renderer>();
        private Transform tilesRoot, fleetsRoot;
        private static Shader _colorShader;

        private int selFleet = -1;
        private int selQ = -100, selR = -100;
        private bool aiRunning;
        private string toast = "";
        private float toastT;

        void Start()
        {
            // 1 umano + 3 IA
            List<PlayerDef> defs = new List<PlayerDef>
            {
                new PlayerDef("Tu", false, null),
                new PlayerDef("IA Blu", true, "medio"),
                new PlayerDef("IA Verde", true, "facile"),
                new PlayerDef("IA Giallo", true, "difficile"),
            };
            game = new Game(defs, 0);

            cam = Camera.main;
            if (cam == null)
            {
                GameObject camGo = new GameObject("MainCamera");
                camGo.tag = "MainCamera";
                cam = camGo.AddComponent<Camera>();
            }
            cam.orthographic = true;
            cam.backgroundColor = new Color(0.03f, 0.04f, 0.08f);
            cam.clearFlags = CameraClearFlags.SolidColor;

            hexMesh = HexMeshFactory.CreateHex(0.92f);
            markerMesh = HexMeshFactory.CreateHex(0.34f);

            tilesRoot = new GameObject("Tiles").transform; tilesRoot.parent = transform;
            fleetsRoot = new GameObject("Fleets").transform; fleetsRoot.parent = transform;

            BuildTiles();
            FitCamera();
            Refresh();
        }

        // ------------------------------------------------------------ coordinate
        private Vector3 CellWorld(int q, int r)
        {
            Vec2 p = Hex.ToPixel(q, r, 1.0);
            return new Vector3((float)p.x, -(float)p.y, 0f);
        }

        private void BuildTiles()
        {
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    GameObject go = new GameObject("t" + q + "_" + r);
                    go.transform.parent = tilesRoot;
                    go.transform.position = CellWorld(q, r);
                    MeshFilter mf = go.AddComponent<MeshFilter>(); mf.sharedMesh = hexMesh;
                    MeshRenderer mr = go.AddComponent<MeshRenderer>();
                    mr.sharedMaterial = MakeMaterial(Color.gray);
                    tileRend[Hex.Key(q, r)] = mr;
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
            float cx = (minx + maxx) * 0.5f, cy = (miny + maxy) * 0.5f;
            cam.transform.position = new Vector3(cx, cy, -10f);
            float halfH = (maxy - miny) * 0.5f + 1.2f;
            float halfW = (maxx - minx) * 0.5f + 1.2f;
            float aspect = cam.aspect > 0.01f ? cam.aspect : 1.6f;
            cam.orthographicSize = Mathf.Max(halfH, halfW / aspect);
        }

        // ------------------------------------------------------------ colori
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
        private static Material MakeMaterial(Color c)
        {
            Material m = new Material(ColorShader());
            m.color = c;
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            return m;
        }
        private static Color Hex2Col(string hex)
        {
            Color c;
            return ColorUtility.TryParseHtmlString(hex, out c) ? c : Color.white;
        }
        private Color FactionColor(int owner)
        {
            if (owner < 0 || owner >= Config.COLORS.Length) return Color.white;
            return Hex2Col(Config.COLORS[owner]);
        }
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

        // ------------------------------------------------------------ refresh
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
            if (game == null) return;
            HashSet<string> reach = Reachable();
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    string k = Hex.Key(q, r);
                    Cell c = game.Cell(q, r);
                    Color col = TileColor(c);
                    if (reach.Contains(k)) col = Color.Lerp(col, new Color(1f, 0.85f, 0.3f), 0.55f);
                    if (selQ == q && selR == r) col = Color.Lerp(col, Color.white, 0.45f);
                    Renderer rd;
                    if (tileRend.TryGetValue(k, out rd)) { rd.sharedMaterial.color = col; if (rd.sharedMaterial.HasProperty("_BaseColor")) rd.sharedMaterial.SetColor("_BaseColor", col); }
                }

            // Flotte: ricrea i marker
            for (int i = fleetsRoot.childCount - 1; i >= 0; i--) Destroy(fleetsRoot.GetChild(i).gameObject);
            Dictionary<string, int> countAt = new Dictionary<string, int>();
            foreach (Fleet f in game.fleets)
            {
                string k = Hex.Key(f.q, f.r);
                int idx; countAt.TryGetValue(k, out idx); countAt[k] = idx + 1;
                Vector3 pos = CellWorld(f.q, f.r) + new Vector3(0.28f * idx - 0.14f, 0.10f * idx, -0.2f);
                if (f.id == selFleet)
                {
                    GameObject ring = new GameObject("sel");
                    ring.transform.parent = fleetsRoot;
                    ring.transform.position = pos + new Vector3(0, 0, 0.05f);
                    ring.transform.localScale = Vector3.one * 1.35f;
                    ring.AddComponent<MeshFilter>().sharedMesh = markerMesh;
                    ring.AddComponent<MeshRenderer>().sharedMaterial = MakeMaterial(Color.white);
                }
                GameObject m = new GameObject("f" + f.id);
                m.transform.parent = fleetsRoot;
                m.transform.position = pos;
                m.AddComponent<MeshFilter>().sharedMesh = markerMesh;
                m.AddComponent<MeshRenderer>().sharedMaterial = MakeMaterial(FactionColor(f.owner));
            }
        }

        // ------------------------------------------------------------ input / turni
        void Update()
        {
            if (game == null || game.winner != null) return;

            Player cur = game.Player(game.currentPlayer);
            if (cur.isAI)
            {
                if (!aiRunning) StartCoroutine(RunAiTurn());
                return;
            }

            if (Input.GetMouseButtonDown(0)) OnClickWorld();
        }

        private IEnumerator RunAiTurn()
        {
            aiRunning = true;
            yield return new WaitForSeconds(0.5f);
            try { Ai.RunTurn(game); }
            catch (System.Exception e) { Debug.LogException(e); ShowToast("Errore IA: " + e.Message); }
            selFleet = -1; selQ = selR = -100;
            aiRunning = false;
            Refresh();
        }

        private void OnClickWorld()
        {
            Vector3 mp = Input.mousePosition; mp.z = -cam.transform.position.z;
            Vector3 w = cam.ScreenToWorldPoint(mp);
            // trova la cella più vicina
            int bq = -1, br = -1; float best = 1e9f;
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    float d = (CellWorld(q, r) - new Vector3(w.x, w.y, 0)).sqrMagnitude;
                    if (d < best) { best = d; bq = q; br = r; }
                }
            if (bq < 0 || best > 1.4f) return; // clic fuori dal tabellone

            // Movimento verso una cella adiacente raggiungibile
            if (game.Phase == "movimento" && selFleet >= 0 && Reachable().Contains(Hex.Key(bq, br)))
            {
                DoMove(selFleet, bq, br);
                return;
            }
            // Altrimenti selezione
            selQ = bq; selR = br;
            Fleet own = game.FleetOfAt(game.currentPlayer, bq, br);
            selFleet = own != null ? own.id : -1;
            Refresh();
        }

        private void DoMove(int fleetId, int q, int r)
        {
            Result ev;
            try { ev = game.StepFleet(fleetId, q, r); }
            catch (System.Exception e) { Debug.LogException(e); return; }
            if (!ev.ok) { ShowToast(ev.msg); return; }
            try
            {
                if (ev.ev == "combat") { game.ResolveFleetCombat(ev.attacker, ev.defender); selFleet = -1; }
                else if (ev.ev == "planetCombat")
                {
                    Fleet f = game.FleetById(ev.attacker);
                    game.ResolvePlanetCombat(ev.attacker, ev.q, ev.r, f != null ? f.carri : 0);
                    selFleet = -1;
                }
                else if (ev.ev == "destroyed") { selFleet = -1; }
                else
                {
                    if (ev.canColonize) { Fleet f = game.FleetById(ev.fleet); if (f != null && f.ships.colonia > 0) game.Colonize(f.id); }
                    selFleet = ev.fleet;
                    selQ = q; selR = r;
                }
            }
            catch (System.Exception e) { Debug.LogException(e); }
            Refresh();
        }

        private void ShowToast(string m) { if (string.IsNullOrEmpty(m)) return; toast = m; toastT = Time.time; }

        // ------------------------------------------------------------ HUD (IMGUI)
        void OnGUI()
        {
            if (game == null) return;
            GUI.skin.label.fontSize = 14; GUI.skin.button.fontSize = 14;

            Player p = game.Player(game.currentPlayer);
            // Barra superiore
            GUILayout.BeginArea(new Rect(8, 8, 520, 150), GUI.skin.box);
            GUILayout.Label("Turno " + game.turnNumber + " — " + p.name + (p.isAI ? " (IA)" : "") +
                "   |   Fase: " + PhaseLabel(game.Phase));
            GUILayout.Label("💰 " + p.money + "   ⛽ " + p.res.carburante + "   🔩 " + p.res.metallo + "   🪨 " + p.res.pietra +
                "   🪐 " + game.PlanetsOf(p.id).Count + "   🚀 " + game.FleetsOf(p.id).Count);

            if (game.winner != null)
            {
                GUILayout.Label(game.winner == -1 ? "Pareggio." : ("🏆 Vince " + game.Player(game.winner.Value).name + "!"));
            }
            else if (p.isAI)
            {
                GUILayout.Label("🤖 L'IA sta giocando…");
            }
            else
            {
                GUILayout.BeginHorizontal();
                if (GUILayout.Button(game.phaseIdx >= Game.PHASES.Length - 1 ? "Fine turno ▸" : "Avanza fase ▸", GUILayout.Width(150)))
                { try { game.AdvancePhase(); } catch (System.Exception e) { Debug.LogException(e); } selFleet = -1; selQ = selR = -100; Refresh(); }
                GUILayout.EndHorizontal();
                DrawCellActions(p);
            }
            GUILayout.EndArea();

            // Log in basso
            GUILayout.BeginArea(new Rect(8, Screen.height - 150, Screen.width - 16, 142), GUI.skin.box);
            int n = game.log.Count;
            for (int i = System.Math.Max(0, n - 6); i < n; i++) GUILayout.Label(game.log[i]);
            GUILayout.EndArea();

            // Toast
            if (!string.IsNullOrEmpty(toast) && Time.time - toastT < 2.5f)
                GUI.Label(new Rect(Screen.width / 2 - 200, 170, 400, 24), "⚠ " + toast);
        }

        private void DrawCellActions(Player p)
        {
            if (selQ < 0) return;
            Cell c = game.Cell(selQ, selR);
            if (c == null || !c.explored) return;

            // Produzione su pianeta proprio
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
                    if (c.buildings.fabbricaNavale == 0 && c.buildings.fabbricaCarri == 0) GUILayout.Label("(serve una fabbrica: costruiscila in fase Costruzione)");
                }
                else if (game.Phase == "costruzione")
                {
                    GUILayout.BeginHorizontal();
                    foreach (KeyValuePair<string, BuildingDef> kv in Config.BUILDINGS)
                        if (GUILayout.Button(kv.Value.nome.Split(' ')[0])) Act(game.BuildBuilding(selQ, selR, kv.Key));
                    GUILayout.EndHorizontal();
                }
            }
            // Colonizza / azioni flotta
            Fleet f = game.FleetOfAt(p.id, selQ, selR);
            if (f != null)
            {
                GUILayout.Label("Flotta #" + f.id + ": C" + f.ships.caccia + " T" + f.ships.torpediniera + " Col" + f.ships.colonia + " Carri" + f.carri +
                    (game.Phase == "movimento" ? "  (" + f.stepsLeft + " passi)" : ""));
                if (game.Phase == "movimento" && c.type == "planet" && c.owner < 0 && f.ships.colonia > 0 && GUILayout.Button("Colonizza"))
                    Act(game.Colonize(f.id));
            }
        }

        private void Act(Result r)
        {
            if (r != null && !r.ok) ShowToast(r.msg);
            Refresh();
        }

        private static string PhaseLabel(string ph)
        {
            switch (ph) { case "riscossione": return "Riscossione"; case "produzione": return "Produzione"; case "movimento": return "Movimento"; case "costruzione": return "Costruzione"; }
            return ph;
        }
    }
}
