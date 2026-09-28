// ============================================================================
// GameBootstrap.cs — Avvio automatico: appena premi Play crea il controller di
// gioco. Nessuna scena/prefab da montare a mano.
// ============================================================================
using UnityEngine;

namespace ImperiumGalactica.UnityView
{
    public static class GameBootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Init()
        {
            // Avvia la scena 3D (tabellone + camera intelligente).
            // Il vecchio prototipo 2D (HexBoardView) resta nel progetto ma non parte.
            if (Object.FindFirstObjectByType<Board3D>() != null) return;
            GameObject go = new GameObject("ImperiumGalactica");
            go.AddComponent<Board3D>();
        }
    }
}
