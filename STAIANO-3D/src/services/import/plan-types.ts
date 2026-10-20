import type { Floor, ImportAnalysis, Point, Project } from "@/schemas/project";
import type { PlanAnalysis } from "@/domain/geometry/plan-analysis";

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
  analysis?: PlanAnalysis;
  analysisDataUrl?: string;
  originalDataUrl?: string;
};
export type ImportedPlan = {
  openings?: {
    wallIndex: number;
    type: "door" | "window";
    offsetM: number;
    widthM: number;
  }[];
  walls: {
    start: Point;
    end: Point;
    thickness?: number;
    recognition?: Project["walls"][number]["recognition"];
  }[];
  thicknessM: number;
  background: Floor["background"];
  source: Omit<
    Project["sourceFilesMetadata"][number],
    "id" | "floorId" | "importedAt"
  >;
  scaleVerified: true;
  analysis?: ImportAnalysis;
};
