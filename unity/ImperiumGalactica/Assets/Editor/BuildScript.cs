// ============================================================================
// BuildScript.cs — Build dell'eseguibile PC (Windows x64) da menu o da riga di
// comando. Solo Editor (#if UNITY_EDITOR): non entra nella build finale.
//
// Da menu Unity: "Imperium ▸ Build Windows (x64)".
// Da riga di comando (una volta attiva la licenza):
//   Unity.exe -batchmode -quit -projectPath <cartella> \
//     -executeMethod ImperiumGalactica.UnityView.EditorTools.BuildScript.BuildWindows
// L'eseguibile finisce in  <progetto>/Build/Windows/ImperiumGalactica.exe
// ============================================================================
#if UNITY_EDITOR
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ImperiumGalactica.UnityView.EditorTools
{
    public static class BuildScript
    {
        private const string ScenePath = "Assets/Scenes/Main.unity";

        // Crea una scena vuota se non esiste (il gioco si auto-avvia via GameBootstrap)
        [MenuItem("Imperium/Prepara scena")]
        public static string EnsureScene()
        {
            if (File.Exists(ScenePath)) return ScenePath;
            Directory.CreateDirectory("Assets/Scenes");
            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.Refresh();
            return ScenePath;
        }

        [MenuItem("Imperium/Build Windows (x64)")]
        public static void BuildWindows()
        {
            string scenePath = EnsureScene();
            string outDir = "Build/Windows";
            Directory.CreateDirectory(outDir);

            BuildPlayerOptions opts = new BuildPlayerOptions();
            opts.scenes = new[] { scenePath };
            opts.locationPathName = Path.Combine(outDir, "ImperiumGalactica.exe");
            opts.target = BuildTarget.StandaloneWindows64;
            opts.options = BuildOptions.None;

            BuildReport report = BuildPipeline.BuildPlayer(opts);
            Debug.Log("Build " + report.summary.result + " — " + report.summary.totalSize + " bytes in " + outDir);
        }
    }
}
#endif
