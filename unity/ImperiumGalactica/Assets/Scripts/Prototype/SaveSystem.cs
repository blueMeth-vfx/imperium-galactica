// ============================================================================
// SaveSystem.cs — Salvataggio/caricamento in Unity (JsonUtility su GameState).
// Salva su PlayerPrefs (semplice, cross-platform). Il motore resta puro; qui
// solo il livello JSON specifico di Unity.
// ============================================================================
using UnityEngine;
using ImperiumGalactica.Engine;

namespace ImperiumGalactica.UnityView
{
    public static class SaveSystem
    {
        private const string KEY = "ig_save";

        public static bool HasSave() { return PlayerPrefs.HasKey(KEY); }

        public static bool Save(Game game)
        {
            if (game == null) return false;
            try
            {
                string json = JsonUtility.ToJson(game.ToState());
                PlayerPrefs.SetString(KEY, json);
                PlayerPrefs.Save();
                return true;
            }
            catch (System.Exception e) { Debug.LogException(e); return false; }
        }

        public static Game Load()
        {
            if (!HasSave()) return null;
            try
            {
                string json = PlayerPrefs.GetString(KEY, "");
                if (string.IsNullOrEmpty(json)) return null;
                GameState st = JsonUtility.FromJson<GameState>(json);
                return Game.FromState(st);
            }
            catch (System.Exception e) { Debug.LogException(e); return null; }
        }
    }
}
