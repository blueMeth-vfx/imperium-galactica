// ============================================================================
// HexMeshFactory.cs — Genera una mesh esagonale (flat-top) a runtime.
// Doppia faccia: visibile da qualunque lato (niente problemi di culling/camera).
// ============================================================================
using UnityEngine;

namespace ImperiumGalactica.UnityView
{
    public static class HexMeshFactory
    {
        public static Mesh CreateHex(float radius)
        {
            Mesh m = new Mesh();
            m.name = "Hex";
            Vector3[] verts = new Vector3[7];
            verts[0] = Vector3.zero;
            for (int i = 0; i < 6; i++)
            {
                float a = Mathf.Deg2Rad * (60f * i);
                verts[i + 1] = new Vector3(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius, 0f);
            }
            // 6 triangoli fronte + 6 retro (doppia faccia)
            int[] tris = new int[36];
            for (int i = 0; i < 6; i++)
            {
                int a = i + 1, b = (i + 1) % 6 + 1;
                // fronte
                tris[i * 3] = 0; tris[i * 3 + 1] = a; tris[i * 3 + 2] = b;
                // retro (winding invertito)
                tris[18 + i * 3] = 0; tris[18 + i * 3 + 1] = b; tris[18 + i * 3 + 2] = a;
            }
            m.vertices = verts;
            m.triangles = tris;
            m.RecalculateNormals();
            m.RecalculateBounds();
            return m;
        }
    }
}
