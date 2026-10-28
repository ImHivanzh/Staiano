import { expect, it } from "vitest";
import { centroid, pointInPolygon } from "./primitives";
import { roomLabelPoint, roomLabelPointAvoiding } from "./room-label";

const corridor = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 1.4 },
  { x: 1.4, y: 1.4 },
  { x: 1.4, y: 8 },
  { x: 0, y: 8 },
];

it("keeps a concave corridor label inside even when its area centroid is outside", () => {
  expect(pointInPolygon(centroid(corridor), corridor)).toBe(false);
  for (const polygon of [
    corridor,
    [...corridor].reverse(),
    corridor.map((p) => ({ x: -p.y + 15, y: p.x - 20 })),
  ]) {
    const anchor = roomLabelPoint(polygon);
    expect(pointInPolygon(anchor, polygon)).toBe(true);
    // The whole ordinary label footprint fits, rather than touching the inner corner.
    for (const x of [-0.4, 0.4])
      for (const y of [-0.4, 0.4])
        expect(
          pointInPolygon({ x: anchor.x + x, y: anchor.y + y }, polygon),
        ).toBe(true);
  }
});

it("preserves the center of rectangular rooms and handles empty or flat contours", () => {
  expect(
    roomLabelPoint([
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 0, y: 4 },
    ]),
  ).toEqual({ x: 4, y: 2 });
  expect(roomLabelPoint([])).toEqual({ x: 0, y: 0 });
  expect(
    roomLabelPoint([
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 2, y: 5 },
    ]),
  ).toEqual({ x: 2, y: 0 });
});

it("keeps the anchor inside a long thin concave corridor below the search precision", () => {
  const polygon = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 0.2 },
    { x: 0.2, y: 0.2 },
    { x: 0.2, y: 80 },
    { x: 0, y: 80 },
  ];
  expect(pointInPolygon(roomLabelPoint(polygon), polygon)).toBe(true);
});

const hall = [
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 8, y: 6 },
  { x: 0, y: 6 },
];

it("keeps the ideal label point when nothing covers it", () => {
  expect(roomLabelPointAvoiding(hall, [])).toEqual(roomLabelPoint(hall));
});

it("moves the label off a device on the ideal point, staying inside the room", () => {
  const base = roomLabelPoint(hall);
  const moved = roomLabelPointAvoiding(hall, [
    { x: base.x, y: base.y, radius: 0.3 },
  ]);
  expect(moved).not.toEqual(base);
  expect(
    Math.abs(moved.x - base.x) >= 0.95 || Math.abs(moved.y - base.y) >= 0.7,
  ).toBe(true);
  expect(moved.x).toBeGreaterThan(0.65);
  expect(moved.x).toBeLessThan(7.35);
  expect(moved.y).toBeGreaterThan(0.4);
  expect(moved.y).toBeLessThan(5.6);
});
