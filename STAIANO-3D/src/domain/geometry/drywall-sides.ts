import type { Wall } from "@/schemas/project";

export type DrywallSide = Pick<
  NonNullable<Wall["drywall"]>,
  "roomId" | "offsetM"
>;

export function drywallSides(wall: Wall): DrywallSide[] {
  const sides = wall.drywall;
  return sides
    ? [
        { roomId: sides.roomId, offsetM: sides.offsetM },
        ...(sides.otherSide ? [sides.otherSide] : []),
      ]
    : [];
}

export function drywallSideForRoom(wall: Wall, roomId: string) {
  return drywallSides(wall).find((side) => side.roomId === roomId);
}

export function withDrywallSides(wall: Wall, sides: DrywallSide[]): Wall {
  const [primary, otherSide] = sides;
  return {
    ...wall,
    drywall: primary
      ? { ...primary, ...(otherSide ? { otherSide } : {}) }
      : undefined,
  };
}
