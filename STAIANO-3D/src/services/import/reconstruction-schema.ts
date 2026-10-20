import { z } from "zod";
const point = z.object({
  x: z.number().finite().min(0).max(2200),
  y: z.number().finite().min(0).max(2200),
});
export const reconstructionSchema = z
  .object({
    width: z.number().int().min(8).max(2200),
    height: z.number().int().min(8).max(2200),
    device: z.enum(["cuda", "cpu"]),
    shapes: z
      .array(
        z.object({
          label: z.number().int().min(0).max(11),
          points: z.array(point).min(2).max(512),
        }),
      )
      .max(128),
  })
  .refine(
    (model) =>
      model.shapes.reduce((count, shape) => count + shape.points.length, 0) <=
      1024,
    "Ricostruzione troppo complessa.",
  )
  .refine(
    (model) =>
      model.shapes.every((shape) =>
        shape.points.every(
          (point) => point.x < model.width && point.y < model.height,
        ),
      ),
    "Coordinate fuori dall’immagine.",
  );
export type Reconstruction = z.infer<typeof reconstructionSchema>;
