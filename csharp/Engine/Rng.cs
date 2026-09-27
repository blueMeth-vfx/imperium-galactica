// ============================================================================
// Rng.cs — RNG deterministico (mulberry32), port fedele da engine/game.js.
// Stessa sequenza a parità di seed → partite riproducibili (test).
// ============================================================================
using System.Collections.Generic;

namespace ImperiumGalactica.Engine
{
    public class Rng
    {
        private int a;

        public Rng(int seed) { a = seed != 0 ? seed : 123456789; }

        private static int Imul(int x, int y) { unchecked { return x * y; } }
        private static int Ushr(int v, int n) { unchecked { return (int)((uint)v >> n); } }

        // Ritorna un double in [0,1) come Math.random di JS.
        public double Next()
        {
            unchecked
            {
                a = a + unchecked((int)0x6d2b79f5);
                int t = Imul(a ^ Ushr(a, 15), 1 | a);
                t = (t + Imul(t ^ Ushr(t, 7), 61 | t)) ^ t;
                uint res = (uint)(t ^ Ushr(t, 14));
                return res / 4294967296.0;
            }
        }

        public int RollDie() { return 1 + (int)System.Math.Floor(Next() * 6); }

        public List<T> Shuffle<T>(List<T> arr)
        {
            for (int i = arr.Count - 1; i > 0; i--)
            {
                int j = (int)System.Math.Floor(Next() * (i + 1));
                T tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
            }
            return arr;
        }
    }
}
