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
            // Evita doppioni se il componente è già in scena
            if (Object.FindFirstObjectByType<HexBoardView>() != null) return;
            GameObject go = new GameObject("ImperiumGalactica");
            go.AddComponent<HexBoardView>();
        }
    }
}
