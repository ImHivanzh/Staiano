import type { Floor, Point, Project } from "@/schemas/project";

export type PlanSegment = {
  id: string;
  layer: string;
  start: Point;
  end: Point;
  kind: string;
};
export type PlanAnnotation = {
  layer: string;
  text: string;
  position: Point;
  measuredValue?: number;
};
export type ParsedPlan = {
  sourceType: "raster" | "pdf" | "dxf" | "dwg";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  segments: PlanSegment[];
  annotations: PlanAnnotation[];
  layers: { name: string; count: number; visible: boolean }[];
  warnings: string[];
  suggestedMetersPerUnit: number | null;
  unitLabel: string;
  background: NonNullable<Floor["background"]> | null;
  pageCount?: number;
  pageNumber?: number;
};
export type ImportedPlan = {
  walls: { start: Point; end: Point }[];
  thicknessM: number;
  background: Floor["background"];
  source: Omit<
    Project["sourceFilesMetadata"][number],
    "id" | "floorId" | "importedAt"
  >;
  scaleVerified: true;
};
