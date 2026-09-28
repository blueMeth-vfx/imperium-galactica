// ============================================================================
// Board3D.cs — Scena 3D SEGNAPOSTO del tabellone (per provare la SmartCamera).
// Tessere esagonali piatte sul piano XZ, pianeti come sfere, flotte come cubi
// colorati per fazione. Partita tutta-IA: il tabellone è "vivo" mentre provi la
// camera. Clic su un pianeta = lo selezioni (la camera ci si focalizza zoomando).
// I modelli veri sostituiranno questi segnaposto.
// ============================================================================
using System.Collections.Generic;
using UnityEngine;
using ImperiumGalactica.Engine;

namespace ImperiumGalactica.UnityView
{
    public class Board3D : MonoBehaviour
    {
        private Game game;
        private Camera cam;
        private SmartCamera smart;
        private Mesh hexMesh;
        private Transform tilesRoot, planetsRoot, fleetsRoot;
        private readonly Dictionary<string, Renderer> tileRend = new Dictionary<string, Renderer>();
        private readonly List<Vector3> planetPositions = new List<Vector3>();
        private static Shader _lit, _unlit;

        private int selQ = -100, selR = -100;
        private float aiTimer;
        private const float AiDelay = 1.1f;
        private const float PlanetY = 0.35f;

        void Start()
        {
            // Partita dimostrativa: tutte IA, così si vede il movimento
            List<PlayerDef> defs = new List<PlayerDef>
            {
                new PlayerDef("Rosso", true, "medio"),
                new PlayerDef("Blu", true, "difficile"),
                new PlayerDef("Verde", true, "facile"),
                new PlayerDef("Giallo", true, "medio"),
            };
            game = new Game(defs, 0);

            // Luci + ambiente
            GameObject lgo = new GameObject("Sun");
            Light sun = lgo.AddComponent<Light>();
            sun.type = LightType.Directional; sun.intensity = 1.1f; sun.color = new Color(1f, 0.96f, 0.9f);
            lgo.transform.rotation = Quaternion.Euler(55f, -35f, 0f);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.20f, 0.24f, 0.34f);

            hexMesh = HexMeshFactory.CreateHex(0.92f);
            tilesRoot = new GameObject("Tiles").transform; tilesRoot.parent = transform;
            planetsRoot = new GameObject("Planets").transform; planetsRoot.parent = transform;
            fleetsRoot = new GameObject("Fleets").transform; fleetsRoot.parent = transform;

            BuildTiles();

            // Camera 3D + SmartCamera
            cam = Camera.main;
            if (cam == null) { GameObject cgo = new GameObject("MainCamera"); cgo.tag = "MainCamera"; cam = cgo.AddComponent<Camera>(); }
            cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = new Color(0.02f, 0.03f, 0.06f);
            smart = cam.gameObject.GetComponent<SmartCamera>(); if (smart == null) smart = cam.gameObject.AddComponent<SmartCamera>();
            smart.cam = cam; smart.board = this;

            Vector3 min, max; BoardBounds(out min, out max);
            float halfMax = Mathf.Max(max.x - min.x, max.z - min.z) * 0.5f;
            float fitDist = halfMax / Mathf.Tan(Mathf.Deg2Rad * 25f) * 1.25f; // fov/2 = 25
            smart.Configure(min, max, fitDist);

            Refresh();
        }

        private Vector3 WorldOf(int q, int r) { Vec2 p = Hex.ToPixel(q, r, 1.0); return new Vector3((float)p.x, 0f, (float)p.y); }

        private void BoardBounds(out Vector3 min, out Vector3 max)
        {
            min = new Vector3(1e9f, 0, 1e9f); max = new Vector3(-1e9f, 0, -1e9f);
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    Vector3 w = WorldOf(q, r);
                    min.x = Mathf.Min(min.x, w.x); max.x = Mathf.Max(max.x, w.x);
                    min.z = Mathf.Min(min.z, w.z); max.z = Mathf.Max(max.z, w.z);
                }
        }

        // ---- shader/materiali (Built-in RP) ----
        private static Shader Lit() { if (_lit == null) { _lit = Shader.Find("Standard"); if (_lit == null) _lit = Shader.Find("Universal Render Pipeline/Lit"); if (_lit == null) _lit = Shader.Find("Diffuse"); } return _lit; }
        private static Shader Unlit() { if (_unlit == null) { _unlit = Shader.Find("Unlit/Color"); if (_unlit == null) _unlit = Shader.Find("Universal Render Pipeline/Unlit"); if (_unlit == null) _unlit = Shader.Find("Standard"); } return _unlit; }
        private static Material Mat(Shader sh, Color c) { Material m = new Material(sh); m.color = c; if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c); return m; }
        private static Color Hex2Col(string hex) { Color c; return ColorUtility.TryParseHtmlString(hex, out c) ? c : Color.white; }
        private Color FactionColor(int owner) { return (owner < 0 || owner >= Config.COLORS.Length) ? Color.white : Hex2Col(Config.COLORS[owner]); }
        private Color TileColor(Cell c)
        {
            if (c == null || !c.explored) return new Color(0.13f, 0.14f, 0.17f);
            switch (c.type)
            {
                case "planet": return new Color(0.16f, 0.20f, 0.26f);
                case "asteroids": return new Color(0.34f, 0.28f, 0.17f);
                case "market": return new Color(0.13f, 0.36f, 0.44f);
                case "casino": return new Color(0.34f, 0.17f, 0.42f);
                default: return new Color(0.09f, 0.12f, 0.22f);
            }
        }
        private Color PlanetTypeColor(string tipo)
        {
            switch (tipo)
            {
                case "Fuoco": return new Color(0.90f, 0.35f, 0.15f);
                case "Ghiaccio": return new Color(0.55f, 0.80f, 1.0f);
                case "Terra": return new Color(0.30f, 0.70f, 0.40f);
                case "Roccia": return new Color(0.70f, 0.60f, 0.42f);
            }
            return Color.gray;
        }

        private void BuildTiles()
        {
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    GameObject go = new GameObject("t" + q + "_" + r);
                    go.transform.parent = tilesRoot;
                    go.transform.position = WorldOf(q, r);
                    go.transform.rotation = Quaternion.Euler(90f, 0f, 0f); // adagia l'esagono sul piano XZ
                    go.AddComponent<MeshFilter>().sharedMesh = hexMesh;
                    go.AddComponent<MeshRenderer>().sharedMaterial = Mat(Unlit(), Color.gray);
                    tileRend[Hex.Key(q, r)] = go.GetComponent<Renderer>();
                }
        }

        private static void StripCollider(GameObject go) { Collider col = go.GetComponent<Collider>(); if (col != null) Destroy(col); }

        private void Refresh()
        {
            // Tessere
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    string k = Hex.Key(q, r);
                    Color col = TileColor(game.Cell(q, r));
                    if (selQ == q && selR == r) col = Color.Lerp(col, Color.white, 0.4f);
                    Renderer rd;
                    if (tileRend.TryGetValue(k, out rd)) { rd.sharedMaterial.color = col; if (rd.sharedMaterial.HasProperty("_BaseColor")) rd.sharedMaterial.SetColor("_BaseColor", col); }
                }

            // Pianeti (sfere) + anello proprietario
            for (int i = planetsRoot.childCount - 1; i >= 0; i--) Destroy(planetsRoot.GetChild(i).gameObject);
            planetPositions.Clear();
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    Cell c = game.Cell(q, r);
                    if (c == null || !c.explored || c.type != "planet" || c.planet == null) continue;
                    Vector3 baseW = WorldOf(q, r);
                    Vector3 sphereW = baseW + Vector3.up * PlanetY;
                    planetPositions.Add(sphereW);

                    GameObject sp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    StripCollider(sp); sp.transform.parent = planetsRoot; sp.transform.position = sphereW; sp.transform.localScale = Vector3.one * 0.6f;
                    sp.GetComponent<Renderer>().sharedMaterial = Mat(Lit(), PlanetTypeColor(c.planet.data.tipo));

                    if (c.owner >= 0)
                    {
                        GameObject ring = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                        StripCollider(ring); ring.transform.parent = planetsRoot;
                        ring.transform.position = baseW + Vector3.up * 0.03f;
                        ring.transform.localScale = new Vector3(1.15f, 0.02f, 1.15f);
                        ring.GetComponent<Renderer>().sharedMaterial = Mat(Lit(), FactionColor(c.owner));
                    }
                }

            // Flotte (cubi)
            for (int i = fleetsRoot.childCount - 1; i >= 0; i--) Destroy(fleetsRoot.GetChild(i).gameObject);
            Dictionary<string, int> countAt = new Dictionary<string, int>();
            foreach (Fleet f in game.fleets)
            {
                string k = Hex.Key(f.q, f.r);
                int idx; countAt.TryGetValue(k, out idx); countAt[k] = idx + 1;
                Vector3 pos = WorldOf(f.q, f.r) + new Vector3(0.25f * idx - 0.12f, 0.5f, 0.10f * idx);
                GameObject cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                StripCollider(cube); cube.transform.parent = fleetsRoot; cube.transform.position = pos; cube.transform.localScale = Vector3.one * 0.28f;
                cube.GetComponent<Renderer>().sharedMaterial = Mat(Lit(), FactionColor(f.owner));
            }
        }

        // ---- API per la SmartCamera ----
        public void Deselect() { selQ = selR = -100; }
        public bool TryGetSelectedPlanet(out Vector3 world)
        {
            world = Vector3.zero;
            if (selQ < 0) return false;
            Cell c = game.Cell(selQ, selR);
            if (c == null || c.type != "planet" || !c.explored) return false;
            world = WorldOf(selQ, selR) + Vector3.up * PlanetY; return true;
        }
        public bool NearestPlanet(Vector3 point, out Vector3 world)
        {
            world = Vector3.zero; float best = 1e9f; bool found = false;
            foreach (Vector3 p in planetPositions)
            {
                float d = (p.x - point.x) * (p.x - point.x) + (p.z - point.z) * (p.z - point.z);
                if (d < best) { best = d; world = p; found = true; }
            }
            return found;
        }

        // ---- update: IA "viva" + selezione col clic ----
        void Update()
        {
            if (game == null) return;
            if (game.winner == null)
            {
                aiTimer += Time.deltaTime;
                if (aiTimer >= AiDelay)
                {
                    aiTimer = 0f;
                    try { Ai.RunTurn(game); } catch (System.Exception e) { Debug.LogException(e); }
                    Refresh();
                }
            }
            if (Input.GetMouseButtonDown(0)) OnClickSelect();
        }

        private void OnClickSelect()
        {
            Ray ray = cam.ScreenPointToRay(Input.mousePosition);
            Plane ground = new Plane(Vector3.up, Vector3.zero);
            float enter;
            if (!ground.Raycast(ray, out enter)) return;
            Vector3 hit = ray.GetPoint(enter);
            int bq = -1, br = -1; float best = 1e9f;
            for (int q = 0; q < Config.COLS; q++)
                for (int r = 0; r < Config.ROWS; r++)
                {
                    Vector3 w = WorldOf(q, r);
                    float d = (w.x - hit.x) * (w.x - hit.x) + (w.z - hit.z) * (w.z - hit.z);
                    if (d < best) { best = d; bq = q; br = r; }
                }
            if (bq < 0 || best > 1.4f) { Deselect(); Refresh(); return; }
            selQ = bq; selR = br; Refresh();
        }

        void OnGUI()
        {
            GUI.skin.label.fontSize = 14;
            GUILayout.BeginArea(new Rect(8, 8, 560, 90), GUI.skin.box);
            if (game != null)
                GUILayout.Label("Turno " + game.turnNumber + " — " + game.Player(game.currentPlayer).name +
                    (game.winner != null ? "  |  PARTITA FINITA" : "  |  Fase: " + game.Phase));
            GUILayout.Label("Rotella = zoom (avvicina + inclina) · Trascina (tasto destro) = muovi · Clic su un pianeta = focalizza");
            GUILayout.EndArea();
        }
    }
}
