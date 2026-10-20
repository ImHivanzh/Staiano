import { describe, expect, it } from "vitest";
import {
  normalizePlanImage,
  rotatePlanTensor,
  semanticWallMask,
  suppressPlanAnnotations,
} from "./plan-segmentation";

describe("preparazione e segmentazione AI locale", () => {
  it("rimuove caratteri isolati mantenendo muri lunghi e tramezzi corti allungati", () => {
    const size = 64,
      pixels = new Uint8ClampedArray(size * size * 4).fill(255),
      mask = new Uint8Array(size * size).fill(1);
    for (const [x, y, w, h] of [
      [5, 5, 8, 12],
      [30, 5, 2, 12],
      [5, 40, 50, 3],
    ])
      for (let py = y; py < y + h; py++)
        for (let px = x; px < x + w; px++) {
          const i = (py * size + px) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
    const input = normalizePlanImage(pixels, size, size, {
      left: 0,
      top: 0,
      width: size,
      height: size,
    });
    const result = suppressPlanAnnotations(mask, input, size, size);
    expect(result[10 * size + 8]).toBe(0);
    expect(result[10 * size + 30]).toBe(1);
    expect(result[41 * size + 25]).toBe(1);
    expect(mask[10 * size + 8]).toBe(1);
  });
  it("allinea gli esiti delle quattro rotazioni senza scambiare i canali", () => {
    const values = Float32Array.from({ length: 3 * 9 }, (_, i) => i);
    expect(Array.from(rotatePlanTensor(values, 3, 3, 1).slice(0, 9))).toEqual([
      6, 3, 0, 7, 4, 1, 8, 5, 2,
    ]);
    for (let turn = 0; turn < 4; turn++)
      expect(
        rotatePlanTensor(
          rotatePlanTensor(values, 3, 3, turn),
          3,
          3,
          (4 - turn) % 4,
        ),
      ).toEqual(values);
  });
  const channelValue = (input: Float32Array, i: number) =>
    (input[i] * 0.229 + 0.485) * 255;
  it.each([180, 255])(
    "mantiene lo sfondo uniforme %i invece di farlo diventare nero",
    (gray) => {
      const data = new Uint8ClampedArray([
        gray,
        gray,
        gray,
        255,
        gray,
        gray,
        gray,
        255,
      ]);
      const input = normalizePlanImage(data, 2, 1, {
        left: 0,
        top: 0,
        width: 2,
        height: 1,
      });
      expect(channelValue(input, 0)).toBeCloseTo(gray, 4);
      expect(channelValue(input, 1)).toBeCloseTo(gray, 4);
    },
  );
  it("recupera il contrasto di una scansione sbiadita senza alterare il letterbox", () => {
    const input = normalizePlanImage(
      new Uint8ClampedArray([
        124, 116, 104, 255, 150, 150, 150, 255, 240, 240, 240, 255,
      ]),
      3,
      1,
      { left: 1, top: 0, width: 2, height: 1 },
    );
    expect(channelValue(input, 0)).toBeCloseTo(124, 4);
    expect(channelValue(input, 1)).toBeCloseTo(0, 4);
    expect(channelValue(input, 2)).toBeCloseTo(255, 4);
  });
  it("compone i pixel trasparenti su carta bianca", () => {
    const input = normalizePlanImage(
      new Uint8ClampedArray([0, 0, 0, 0]),
      1,
      1,
      { left: 0, top: 0, width: 1, height: 1 },
    );
    expect(channelValue(input, 0)).toBeCloseTo(255, 4);
  });
  it("ripara un buco nello sfondo, ma conserva la porta e il muro finestrato", () => {
    const size = 7,
      plane = size * size,
      logits = new Float32Array(4 * plane);
    for (let i = 0; i < plane; i++) logits[i] = 1;
    for (let x = 1; x <= 5; x++) {
      const i = 3 * size + x;
      logits[plane + i] = 5;
    }
    logits[plane + 3 * size + 2] = 0;
    logits[2 * plane + 3 * size + 4] = 10;
    logits[3 * plane + 3 * size + 5] = 10;
    const mask = semanticWallMask(logits, size, size);
    expect(mask[3 * size + 2]).toBe(1);
    expect(mask[3 * size + 4]).toBe(0);
    expect(mask[3 * size + 5]).toBe(1);
  });
});
