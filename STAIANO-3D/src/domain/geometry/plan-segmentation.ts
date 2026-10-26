const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/** Four overlapping crops at most: small plans retain one global inference. */
export function planSegmentationTiles(width: number, height: number) {
  if (Math.max(width, height) <= 1400) return [];
  const side = 1280,
    starts = (size: number) => (size <= side ? [0] : [0, size - side]);
  return starts(height).flatMap((top) =>
    starts(width).map((left) => ({
      left,
      top,
      width: Math.min(width, side),
      height: Math.min(height, side),
    })),
  );
}

/** Rotate every NCHW plane without resampling fine lines. */
export function rotatePlanTensor(
  data: Float32Array,
  channels: number,
  size: number,
  turns: number,
) {
  if (turns === 0) return data;
  const plane = size * size,
    rotated = new Float32Array(data.length);
  for (let channel = 0; channel < channels; channel++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let rx = x,
          ry = y;
        for (let turn = 0; turn < turns; turn++) [rx, ry] = [size - 1 - ry, rx];
        rotated[channel * plane + ry * size + rx] =
          data[channel * plane + y * size + x];
      }
  return rotated;
}

/** Match the model's ImageNet input without turning flat paper into black ink. */
export function normalizePlanImage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  region: { left: number; top: number; width: number; height: number },
) {
  const histogram = new Uint32Array(256);
  const valueAt = (i: number, channel: number) =>
    255 + ((data[i * 4 + channel] - 255) * data[i * 4 + 3]) / 255;
  for (let y = region.top; y < region.top + region.height; y++)
    for (let x = region.left; x < region.left + region.width; x++) {
      const i = y * width + x;
      histogram[
        Math.round(
          valueAt(i, 0) * 0.2126 +
            valueAt(i, 1) * 0.7152 +
            valueAt(i, 2) * 0.0722,
        )
      ]++;
    }
  const percentile = (fraction: number) => {
    let seen = 0;
    for (let value = 0; value < 256; value++) {
      seen += histogram[value];
      if (seen >= region.width * region.height * fraction) return value;
    }
    return 255;
  };
  const low = percentile(0.005),
    high = percentile(0.995);
  const stretch = high - low > 48 && (low > 24 || high < 240);
  const plane = width * height,
    input = new Float32Array(3 * plane);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const inside =
        x >= region.left &&
        x < region.left + region.width &&
        y >= region.top &&
        y < region.top + region.height;
      for (let channel = 0; channel < 3; channel++) {
        const value = valueAt(i, channel);
        const adjusted =
          inside && stretch
            ? Math.max(0, Math.min(255, ((value - low) * 255) / (high - low)))
            : value;
        input[channel * plane + i] =
          (adjusted / 255 - MEAN[channel]) / STD[channel];
      }
    }
  return input;
}

/** Repair isolated background cells, preserving cells classified as doors. */
export function semanticWallMask(
  logits: Float32Array,
  width: number,
  height: number,
) {
  const plane = width * height;
  if (logits.length !== 4 * plane)
    throw new Error("Risposta del modello AI non valida.");
  const classes = new Uint8Array(plane),
    walls = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) {
    let best = 0;
    for (let channel = 1; channel < 4; channel++)
      if (logits[channel * plane + i] > logits[best * plane + i])
        best = channel;
    classes[i] = best;
    walls[i] = best === 1 || best === 3 ? 1 : 0;
  }
  const repaired = walls.slice();
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (
        classes[i] === 0 &&
        ((walls[i - 1] && walls[i + 1]) ||
          (walls[i - width] && walls[i + width]))
      )
        repaired[i] = 1;
    }
  return repaired;
}

/** Isolated compact ink is usually lettering or symbols, rather than a wall. */
export function suppressPlanAnnotations(
  mask: Uint8Array,
  input: Float32Array,
  width: number,
  height: number,
) {
  const plane = width * height,
    visited = new Uint8Array(plane),
    queue = new Int32Array(plane),
    result = mask.slice();
  const dark = (i: number) =>
    (input[i] * STD[0] + MEAN[0]) * 0.2126 +
      (input[plane + i] * STD[1] + MEAN[1]) * 0.7152 +
      (input[2 * plane + i] * STD[2] + MEAN[2]) * 0.0722 <
    110 / 255;
  for (let seed = 0; seed < plane; seed++) {
    if (visited[seed] || !dark(seed)) continue;
    let head = 0,
      tail = 1,
      minX = seed % width,
      maxX = minX,
      minY = Math.floor(seed / width),
      maxY = minY;
    queue[0] = seed;
    visited[seed] = 1;
    while (head < tail) {
      const i = queue[head++],
        x = i % width,
        y = Math.floor(i / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx,
            ny = y + dy,
            next = ny * width + nx;
          if (
            nx < 0 ||
            nx >= width ||
            ny < 0 ||
            ny >= height ||
            visited[next] ||
            !dark(next)
          )
            continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
    }
    const w = maxX - minX + 1,
      h = maxY - minY + 1;
    if (Math.max(w, h) > 32 || Math.max(w, h) >= Math.min(w, h) * 3) continue;
    for (
      let y = Math.max(0, minY - 2);
      y <= Math.min(height - 1, maxY + 2);
      y++
    )
      for (
        let x = Math.max(0, minX - 2);
        x <= Math.min(width - 1, maxX + 2);
        x++
      )
        result[y * width + x] = 0;
  }
  return result;
}
