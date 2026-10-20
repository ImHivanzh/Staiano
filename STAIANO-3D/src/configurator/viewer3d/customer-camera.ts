import { create } from "zustand";
import { z } from "zod";

const vector = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export const customerCameraSchema = z.object({
  projectId: z.string(),
  floorId: z.string(),
  position: vector,
  target: vector,
  fov: z.number().min(1).max(170),
  top: z.boolean(),
});
export type CustomerCamera = z.infer<typeof customerCameraSchema>;
// Camera updates are transient: never dirty or persist the project.
export const useCustomerCamera = create<{ camera: CustomerCamera | null }>(
  () => ({ camera: null }),
);
