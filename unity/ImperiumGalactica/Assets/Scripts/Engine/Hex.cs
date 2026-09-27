// ============================================================================
// Hex.cs — Griglia esagonale flat-top, offset "odd-q" (port da engine/hex.js).
// ============================================================================
using System;
using System.Collections.Generic;

namespace ImperiumGalactica.Engine
{
    public struct HexCoord
    {
        public int q, r;
        public HexCoord(int q, int r) { this.q = q; this.r = r; }
    }

    public struct Vec2 { public double x, y; public Vec2(double x, double y) { this.x = x; this.y = y; } }

    public static class Hex
    {
        public static string Key(int q, int r) { return q + "," + r; }

        public static bool InBounds(int q, int r)
        {
            return q >= 0 && q < Config.COLS && r >= 0 && r < Config.ROWS;
        }

        // Vicini per griglia flat-top con offset odd-q.
        public static List<HexCoord> Neighbors(int q, int r)
        {
            bool even = (q % 2) == 0;
            int[][] deltas = even
                ? new int[][] { new[] { +1, 0 }, new[] { +1, -1 }, new[] { 0, -1 }, new[] { -1, -1 }, new[] { -1, 0 }, new[] { 0, +1 } }
                : new int[][] { new[] { +1, +1 }, new[] { +1, 0 }, new[] { 0, -1 }, new[] { -1, 0 }, new[] { -1, +1 }, new[] { 0, +1 } };
            List<HexCoord> outList = new List<HexCoord>();
            foreach (int[] d in deltas)
            {
                int nq = q + d[0], nr = r + d[1];
                if (InBounds(nq, nr)) outList.Add(new HexCoord(nq, nr));
            }
            return outList;
        }

        private static void ToCube(int q, int r, out int x, out int y, out int z)
        {
            x = q;
            z = r - (q - (q & 1)) / 2;
            y = -x - z;
        }

        public static int Distance(int aq, int ar, int bq, int br)
        {
            int ax, ay, az, bx, by, bz;
            ToCube(aq, ar, out ax, out ay, out az);
            ToCube(bq, br, out bx, out by, out bz);
            return Math.Max(Math.Abs(ax - bx), Math.Max(Math.Abs(ay - by), Math.Abs(az - bz)));
        }

        // Centro in pixel (flat-top). size = raggio esagono.
        public static Vec2 ToPixel(int q, int r, double size)
        {
            double x = size * 1.5 * q;
            double y = size * Math.Sqrt(3) * (r + 0.5 * (q & 1));
            return new Vec2(x, y);
        }
    }
}
