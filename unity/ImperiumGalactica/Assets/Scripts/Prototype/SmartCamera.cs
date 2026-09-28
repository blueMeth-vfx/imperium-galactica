// ============================================================================
// SmartCamera.cs — Camera "intelligente" per il tabellone 3D.
// Un solo controllo (rotella) che allo stesso tempo avvicina, INCLINA e mette a
// fuoco: zoomato fuori = quasi a piombo dall'alto; zoomando dentro la camera si
// abbassa e si mette quasi a livello dei pianeti, inquadrando il pianeta
// SELEZIONATO (se c'è) oppure quello più vicino al centro.
// Rotella = zoom · trascina col tasto destro = pan · orientamento fisso (nord su).
// I parametri sono pubblici: regolabili dall'Inspector.
// ============================================================================
using UnityEngine;

namespace ImperiumGalactica.UnityView
{
    public class SmartCamera : MonoBehaviour
    {
        public Board3D board;              // fonte dei pianeti / selezione
        public Camera cam;

        [Header("Zoom / inclinazione")]
        public float pitchFar = 88f;       // gradi: quasi a piombo (zoom out)
        public float pitchNear = 30f;      // gradi: quasi a livello dei pianeti (zoom in)
        public float distFar = 40f;        // distanza da lontano (calcolata al bounds)
        public float distNear = 2.0f;      // distanza da vicino
        public float zoomSpeed = 0.08f;    // per tacca di rotella
        [Header("Movimento")]
        public float panSpeed = 1.0f;
        public float smooth = 8f;          // morbidezza inseguimento
        public float focusStart = 0.35f;   // da questo zoom in poi inizia a "puntare" il pianeta

        private float zoomT = 0.1f;        // 0 = lontano, 1 = vicino
        private Vector3 panPivot;          // punto sul tabellone controllato dal pan
        private Vector3 boundsMin, boundsMax;
        private Vector3 lastMouse;

        public void Configure(Vector3 min, Vector3 max, float fitDist)
        {
            boundsMin = min; boundsMax = max; distFar = fitDist;
            panPivot = new Vector3((min.x + max.x) * 0.5f, 0f, (min.z + max.z) * 0.5f);
            if (cam != null) { cam.orthographic = false; cam.fieldOfView = 50f; cam.nearClipPlane = 0.05f; cam.farClipPlane = 2000f; }
        }

        void Update()
        {
            if (cam == null) return;

            // Zoom con la rotella
            float scroll = Input.mouseScrollDelta.y;
            if (Mathf.Abs(scroll) > 0.001f) zoomT = Mathf.Clamp01(zoomT + scroll * zoomSpeed);

            // Pan con trascinamento (tasto destro o centrale) — annulla la selezione
            if (Input.GetMouseButtonDown(1) || Input.GetMouseButtonDown(2)) lastMouse = Input.mousePosition;
            if (Input.GetMouseButton(1) || Input.GetMouseButton(2))
            {
                Vector3 delta = Input.mousePosition - lastMouse; lastMouse = Input.mousePosition;
                float dist = Mathf.Lerp(distFar, distNear, zoomT);
                float k = panSpeed * dist * 0.0016f;
                panPivot += new Vector3(-delta.x * k, 0f, -delta.y * k);
                panPivot.x = Mathf.Clamp(panPivot.x, boundsMin.x, boundsMax.x);
                panPivot.z = Mathf.Clamp(panPivot.z, boundsMin.z, boundsMax.z);
                if (board != null) board.Deselect();
            }
            // Pan opzionale con WASD
            float kx = (Input.GetKey(KeyCode.D) ? 1 : 0) - (Input.GetKey(KeyCode.A) ? 1 : 0);
            float kz = (Input.GetKey(KeyCode.W) ? 1 : 0) - (Input.GetKey(KeyCode.S) ? 1 : 0);
            if (kx != 0 || kz != 0)
            {
                float d = Mathf.Lerp(distFar, distNear, zoomT);
                panPivot += new Vector3(kx, 0f, kz) * (panSpeed * d * 0.02f * Time.deltaTime * 60f);
                panPivot.x = Mathf.Clamp(panPivot.x, boundsMin.x, boundsMax.x);
                panPivot.z = Mathf.Clamp(panPivot.z, boundsMin.z, boundsMax.z);
            }

            // Punto di fuoco: pianeta selezionato → quello; altrimenti quello più vicino al centro
            Vector3 focus = panPivot;
            Vector3 sel;
            if (board != null && board.TryGetSelectedPlanet(out sel)) focus = sel;
            else if (board != null)
            {
                Vector3 nearest;
                if (board.NearestPlanet(panPivot, out nearest)) focus = nearest;
            }

            // Più sei zoomato, più il pivot "punta" il pianeta a fuoco
            float focusBlend = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(focusStart, 1f, zoomT));
            Vector3 pivot = Vector3.Lerp(panPivot, focus, focusBlend);

            // Posizione/rotazione target dalla coppia (distanza, pitch)
            float distNow = Mathf.Lerp(distFar, distNear, zoomT);
            float pitchNow = Mathf.Lerp(pitchFar, pitchNear, zoomT);
            Quaternion rot = Quaternion.Euler(pitchNow, 0f, 0f);
            Vector3 back = rot * Vector3.forward;      // direzione di sguardo
            Vector3 targetPos = pivot - back * distNow;

            float t = 1f - Mathf.Exp(-smooth * Time.deltaTime); // smoothing indipendente dal framerate
            cam.transform.position = Vector3.Lerp(cam.transform.position, targetPos, t);
            cam.transform.rotation = Quaternion.Slerp(cam.transform.rotation, rot, t);
        }
    }
}
