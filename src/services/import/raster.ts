import type { Floor } from "@/schemas/project";
export async function readRaster(
  file: File,
): Promise<NonNullable<Floor["background"]>> {
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Immagine troppo grande. Limite 15 MB.");
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Usare PNG, JPEG o WebP per lo sfondo immagine.");
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png =
    signature[0] === 137 &&
    signature[1] === 80 &&
    signature[2] === 78 &&
    signature[3] === 71;
  const jpeg =
    signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  const webp =
    String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
  if (
    (file.type === "image/png" && !png) ||
    (file.type === "image/jpeg" && !jpeg) ||
    (file.type === "image/webp" && !webp)
  )
    throw new Error(
      "Il contenuto del file non corrisponde al formato immagine dichiarato.",
    );
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Immagine non leggibile."));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("Il file non contiene un'immagine valida."));
    image.src = dataUrl;
  });
  if (
    img.width > 20000 ||
    img.height > 20000 ||
    img.width * img.height > 40_000_000
  )
    throw new Error("Risoluzione troppo elevata. Ridurre la planimetria.");
  return {
    dataUrl,
    widthPx: img.width,
    heightPx: img.height,
    metersPerPixel: 10 / img.width,
    origin: { x: 0, y: 0 },
    opacity: 0.5,
    filename: file.name.slice(0, 255),
  };
}
