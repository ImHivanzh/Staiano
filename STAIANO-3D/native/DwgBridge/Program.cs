using ACadSharp;
using ACadSharp.IO;
using System.Text;
using System.Text.Json;

const long limit = 32L * 1024 * 1024;
if (args.Length != 2) return 2;
try
{
    var input = Path.GetFullPath(args[0]);
    var output = Path.GetFullPath(args[1]);
    if (!File.Exists(input) || new FileInfo(input).Length > limit) return 2;
    Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    var warnings = new List<string>();
    void Notify(object sender, NotificationEventArgs notification)
    {
        if (warnings.Count >= 100) return;
        var text = notification.Message.Replace('\r', ' ').Replace('\n', ' ');
        warnings.Add(text.Length > 300 ? text[..300] : text);
    }
    var document = DwgReader.Read(input, new DwgReaderConfiguration { CrcCheck = true, ReadSummaryInfo = false, IgnoreProxyGraphics = true }, Notify);
    if (document.Entities.Count() > 50000) return 3;
    var originalVersion = document.Header.Version.ToString();
    // DXF R2018 uses UTF-8. No geometry/unit changes, script execution or XREF fetching.
    document.Header.Version = ACadVersion.AC1032;
    using (var file = File.Create(output))
    using (var stream = new LimitedWriteStream(file, limit))
        DxfWriter.Write(stream, document, false, new DxfWriterConfiguration { DecimalPrecision = 17 }, Notify);
    File.WriteAllText(output + ".info.json", JsonSerializer.Serialize(new { parser = "ACadSharp 3.8.0", license = "MIT", originalVersion, entities = document.Entities.Count(), warnings }), new UTF8Encoding(false));
    return 0;
}
catch
{
    Console.Error.WriteLine("DWG non leggibile o versione/entita non supportata. Esportare DXF ASCII dal CAD.");
    return 1;
}

sealed class LimitedWriteStream(Stream inner, long maximum) : Stream
{
    public override bool CanRead => false;
    public override bool CanSeek => inner.CanSeek;
    public override bool CanWrite => true;
    public override long Length => inner.Length;
    public override long Position { get => inner.Position; set { Guard(value); inner.Position = value; } }
    private void Guard(long end) { if (end < 0 || end > maximum) throw new IOException("Output DXF troppo grande"); }
    public override void Flush() => inner.Flush();
    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    public override long Seek(long offset, SeekOrigin origin) { var result = inner.Seek(offset, origin); Guard(result); return result; }
    public override void SetLength(long value) { Guard(value); inner.SetLength(value); }
    public override void Write(byte[] buffer, int offset, int count) { Guard(inner.Position + count); inner.Write(buffer, offset, count); }
    public override void Write(ReadOnlySpan<byte> buffer) { Guard(inner.Position + buffer.Length); inner.Write(buffer); }
    protected override void Dispose(bool disposing) { if (disposing) inner.Dispose(); base.Dispose(disposing); }
}
