using System.Runtime.InteropServices;
using System.Text.Json;

if (args.Length != 3) return 2;
try
{
    var api = Path.GetFullPath(args[0]);
    if (Path.GetFileName(api) != "SketchUpAPI.dll" || new FileInfo(args[1]).Length > 64L * 1024 * 1024) return 2;
    NativeLibrary.SetDllImportResolver(typeof(SU).Assembly, (name, _, _) => name == "SketchUpAPI" ? NativeLibrary.Load(api) : IntPtr.Zero);
    var input = JsonSerializer.Deserialize<ModelData>(File.ReadAllText(args[1]), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
    SU.SUInitialize();
    var model = new Ref();
    try
    {
        SU.Check(SU.SUModelCreate(ref model));
        SU.Check(SU.SUModelGetEntities(model, out var root));
        SU.Check(SU.SUModelSetName(model, input.Name));
        SU.Check(SU.SUModelGetOptionsManager(model, out var options));
        SU.Check(SU.SUOptionsManagerGetOptionsProviderByName(options, "UnitsOptions", out var units));
        var unitValue = new Ref(); SU.Check(SU.SUTypedValueCreate(ref unitValue));
        try
        {
            SU.Check(SU.SUTypedValueSetInt32(unitValue, 4));
            SU.Check(SU.SUOptionsProviderSetValue(units, "LengthUnit", unitValue));
            SU.Check(SU.SUTypedValueSetInt32(unitValue, 0));
            SU.Check(SU.SUOptionsProviderSetValue(units, "LengthFormat", unitValue));
        }
        finally { SU.SUTypedValueRelease(ref unitValue); }
        var totalFaces = 0;
        foreach (var mesh in input.Meshes)
        {
            var group = new Ref(); SU.Check(SU.SUGroupCreate(ref group));
            SU.Check(SU.SUEntitiesAddGroup(root, group));
            SU.Check(SU.SUGroupSetName(group, mesh.Name));
            SU.Check(SU.SUGroupGetEntities(group, out var entities));
            var geometry = new Ref(); SU.Check(SU.SUGeometryInputCreate(ref geometry));
            try
            {
                var points = Enumerable.Range(0, mesh.Vertices.Length / 3).Select(i => new Point(mesh.Vertices[i * 3] / 0.0254, mesh.Vertices[i * 3 + 1] / 0.0254, mesh.Vertices[i * 3 + 2] / 0.0254)).ToArray();
                SU.Check(SU.SUGeometryInputSetVertices(geometry, (nuint)points.Length, points));
                for (nuint i = 0; i < (nuint)points.Length; i += 3)
                {
                    var loop = new Ref(); SU.Check(SU.SULoopInputCreate(ref loop));
                    try
                    {
                        for (nuint j = 0; j < 3; j++) SU.Check(SU.SULoopInputAddVertexIndex(loop, i + j));
                        SU.Check(SU.SUGeometryInputAddFace(geometry, ref loop, out _));
                        totalFaces++;
                    }
                    finally { if (loop.Ptr != IntPtr.Zero) SU.SULoopInputRelease(ref loop); }
                }
                SU.Check(SU.SUEntitiesFill(entities, geometry, true));
            }
            finally { SU.SUGeometryInputRelease(ref geometry); }
            var material = new Ref(); SU.Check(SU.SUMaterialCreate(ref material));
            var color = new Color((byte)mesh.Color[0], (byte)mesh.Color[1], (byte)mesh.Color[2], 255);
            SU.Check(SU.SUMaterialSetColor(material, ref color));
            SU.Check(SU.SUMaterialSetOpacity(material, mesh.Color[3] / 255.0));
            SU.Check(SU.SUModelAddMaterials(model, 1, [material]));
            SU.Check(SU.SUDrawingElementSetMaterial(SU.SUGroupToDrawingElement(group), material));
        }
        if (input.Background is { } background)
        {
            var image = new Ref(); SU.Check(SU.SUImageCreateFromFile(ref image, background.File));
            SU.Check(SU.SUImageGetDimensions(image, out var originalWidth, out var originalHeight));
            var transform = new Transform { Values = [background.WidthM / 0.0254 / originalWidth, 0, 0, 0, 0, background.HeightM / 0.0254 / originalHeight, 0, 0, 0, 0, 1, 0, background.X / 0.0254, -(background.Y + background.HeightM) / 0.0254, -0.002 / 0.0254, 1] };
            SU.Check(SU.SUImageSetTransform(image, ref transform));
            SU.Check(SU.SUEntitiesAddImage(root, image));
        }
        SU.Check(SU.SUEntitiesGetBoundingBox(root, out var bounds));
        var target = new Point((bounds.Min.X + bounds.Max.X) / 2, (bounds.Min.Y + bounds.Max.Y) / 2, (bounds.Min.Z + bounds.Max.Z) / 2);
        var span = Math.Max(1, Math.Max(bounds.Max.X - bounds.Min.X, Math.Max(bounds.Max.Y - bounds.Min.Y, bounds.Max.Z - bounds.Min.Z)));
        var eye = new Point(target.X + span * 1.2, target.Y - span * 1.4, target.Z + span * 1.1);
        var up = new Point(0, 0, 1);
        var camera = new Ref(); SU.Check(SU.SUCameraCreate(ref camera));
        try
        {
            SU.Check(SU.SUCameraSetOrientation(camera, ref eye, ref target, ref up));
            SU.Check(SU.SUCameraSetPerspectiveFrustumFOV(camera, 40));
            SU.Check(SU.SUModelSetCamera(model, ref camera));
        }
        finally { if (camera.Ptr != IntPtr.Zero) SU.SUCameraRelease(ref camera); }
        SU.Check(SU.SUModelSaveToFile(model, args[2]));
        var verified = new Ref();
        try
        {
            SU.Check(SU.SUModelCreateFromFile(ref verified, args[2]));
            SU.Check(SU.SUModelGetEntities(verified, out var entities));
            SU.Check(SU.SUEntitiesGetNumGroups(entities, out var groups));
            SU.Check(SU.SUEntitiesGetNumImages(entities, out var images));
            if (groups != (nuint)input.Meshes.Length || images != (nuint)(input.Background == null ? 0 : 1)) throw new Exception("Verifica del modello SKP non superata.");
            File.WriteAllText(args[2] + ".info.json", JsonSerializer.Serialize(new { groups = (ulong)groups, images = (ulong)images, faces = totalFaces }));
        }
        finally { if (verified.Ptr != IntPtr.Zero) SU.SUModelRelease(ref verified); }
    }
    finally { if (model.Ptr != IntPtr.Zero) SU.SUModelRelease(ref model); SU.SUTerminate(); }
    return 0;
}
catch (Exception error) { Console.Error.WriteLine("Esportazione SketchUp non riuscita: " + error.Message); return 1; }

record ModelData(string Name, MeshData[] Meshes, BackgroundData? Background);
record MeshData(string Name, double[] Vertices, int[] Color);
record BackgroundData(string File, double WidthM, double HeightM, double X, double Y);
[StructLayout(LayoutKind.Sequential)] struct Ref { public IntPtr Ptr; }
[StructLayout(LayoutKind.Sequential)] struct Point(double x, double y, double z) { public double X = x, Y = y, Z = z; }
[StructLayout(LayoutKind.Sequential)] struct Bounds { public Point Min, Max; }
[StructLayout(LayoutKind.Sequential)] struct Color(byte r, byte g, byte b, byte a) { public byte R = r, G = g, B = b, A = a; }
[StructLayout(LayoutKind.Sequential)] struct Transform { [MarshalAs(UnmanagedType.ByValArray, SizeConst = 16)] public double[] Values; }
static class SU
{
    public static void Check(int result) { if (result != 0) throw new Exception("SketchUp API: " + result); }
    [DllImport("SketchUpAPI")] public static extern void SUInitialize();
    [DllImport("SketchUpAPI")] public static extern void SUTerminate();
    [DllImport("SketchUpAPI")] public static extern int SUModelCreate(ref Ref model);
    [DllImport("SketchUpAPI")] public static extern int SUModelRelease(ref Ref model);
    [DllImport("SketchUpAPI")] public static extern int SUModelGetEntities(Ref model, out Ref entities);
    [DllImport("SketchUpAPI")] public static extern int SUModelSetName(Ref model, [MarshalAs(UnmanagedType.LPUTF8Str)] string name);
    [DllImport("SketchUpAPI")] public static extern int SUModelGetOptionsManager(Ref model, out Ref options);
    [DllImport("SketchUpAPI")] public static extern int SUOptionsManagerGetOptionsProviderByName(Ref options, [MarshalAs(UnmanagedType.LPUTF8Str)] string name, out Ref provider);
    [DllImport("SketchUpAPI")] public static extern int SUOptionsProviderSetValue(Ref provider, [MarshalAs(UnmanagedType.LPUTF8Str)] string key, Ref value);
    [DllImport("SketchUpAPI")] public static extern int SUTypedValueCreate(ref Ref value);
    [DllImport("SketchUpAPI")] public static extern int SUTypedValueSetInt32(Ref value, int number);
    [DllImport("SketchUpAPI")] public static extern int SUTypedValueRelease(ref Ref value);
    [DllImport("SketchUpAPI")] public static extern int SUCameraCreate(ref Ref camera);
    [DllImport("SketchUpAPI")] public static extern int SUCameraRelease(ref Ref camera);
    [DllImport("SketchUpAPI")] public static extern int SUCameraSetOrientation(Ref camera, ref Point eye, ref Point target, ref Point up);
    [DllImport("SketchUpAPI")] public static extern int SUCameraSetPerspectiveFrustumFOV(Ref camera, double fov);
    [DllImport("SketchUpAPI")] public static extern int SUModelSetCamera(Ref model, ref Ref camera);
    [DllImport("SketchUpAPI")] public static extern int SUEntitiesGetBoundingBox(Ref entities, out Bounds bounds);
    [DllImport("SketchUpAPI")] public static extern int SUModelSaveToFile(Ref model, [MarshalAs(UnmanagedType.LPUTF8Str)] string file);
    [DllImport("SketchUpAPI")] public static extern int SUModelCreateFromFile(ref Ref model, [MarshalAs(UnmanagedType.LPUTF8Str)] string file);
    [DllImport("SketchUpAPI")] public static extern int SUGroupCreate(ref Ref group);
    [DllImport("SketchUpAPI")] public static extern int SUGroupSetName(Ref group, [MarshalAs(UnmanagedType.LPUTF8Str)] string name);
    [DllImport("SketchUpAPI")] public static extern int SUGroupGetEntities(Ref group, out Ref entities);
    [DllImport("SketchUpAPI")] public static extern Ref SUGroupToDrawingElement(Ref group);
    [DllImport("SketchUpAPI")] public static extern int SUEntitiesAddGroup(Ref entities, Ref group);
    [DllImport("SketchUpAPI")] public static extern int SUEntitiesFill(Ref entities, Ref geometry, [MarshalAs(UnmanagedType.I1)] bool weld);
    [DllImport("SketchUpAPI")] public static extern int SUEntitiesGetNumGroups(Ref entities, out nuint count);
    [DllImport("SketchUpAPI")] public static extern int SUEntitiesGetNumImages(Ref entities, out nuint count);
    [DllImport("SketchUpAPI")] public static extern int SUGeometryInputCreate(ref Ref geometry);
    [DllImport("SketchUpAPI")] public static extern int SUGeometryInputRelease(ref Ref geometry);
    [DllImport("SketchUpAPI")] public static extern int SUGeometryInputSetVertices(Ref geometry, nuint count, [In] Point[] points);
    [DllImport("SketchUpAPI")] public static extern int SUGeometryInputAddFace(Ref geometry, ref Ref loop, out nuint index);
    [DllImport("SketchUpAPI")] public static extern int SULoopInputCreate(ref Ref loop);
    [DllImport("SketchUpAPI")] public static extern int SULoopInputRelease(ref Ref loop);
    [DllImport("SketchUpAPI")] public static extern int SULoopInputAddVertexIndex(Ref loop, nuint index);
    [DllImport("SketchUpAPI")] public static extern int SUMaterialCreate(ref Ref material);
    [DllImport("SketchUpAPI")] public static extern int SUMaterialSetColor(Ref material, ref Color color);
    [DllImport("SketchUpAPI")] public static extern int SUMaterialSetOpacity(Ref material, double opacity);
    [DllImport("SketchUpAPI")] public static extern int SUModelAddMaterials(Ref model, nuint count, [In] Ref[] materials);
    [DllImport("SketchUpAPI")] public static extern int SUDrawingElementSetMaterial(Ref element, Ref material);
    [DllImport("SketchUpAPI")] public static extern int SUImageCreateFromFile(ref Ref image, [MarshalAs(UnmanagedType.LPUTF8Str)] string file);
    [DllImport("SketchUpAPI")] public static extern int SUImageGetDimensions(Ref image, out double width, out double height);
    [DllImport("SketchUpAPI")] public static extern int SUImageSetTransform(Ref image, ref Transform transform);
    [DllImport("SketchUpAPI")] public static extern int SUEntitiesAddImage(Ref entities, Ref image);
}
