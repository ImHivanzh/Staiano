import { z } from "zod";
import { terminalCommercialOptionsSchema } from "@/domain/catalogs/ecoclima-price-schema";

export const CURRENT_SCHEMA_VERSION = 2;
const id = z.string().min(1).max(120);
const finite = z.number().finite();
export const manualDuctedMachineSchema = z.object({
  manufacturer: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  maxAirflowM3h: finite.positive(),
  coolingCapacityW: finite.positive().optional(),
  heatingCapacityW: finite.positive().optional(),
  widthMm: finite.positive().optional(),
  heightMm: finite.positive().optional(),
  depthMm: finite.positive().optional(),
  dischargeConnection: z
    .object({
      connectionWidthMm: finite.positive(),
      connectionHeightMm: finite.positive(),
      dimensionBasis: z.enum(["ductOpening", "flangeMountingSpan"]).optional(),
      clearOpeningWidthMm: finite.positive().optional(),
      clearOpeningHeightMm: finite.positive().optional(),
      collarDepthMm: finite.positive().optional(),
      flangeOuterWidthMm: finite.positive().optional(),
      flangeOuterHeightMm: finite.positive().optional(),
      holePattern: z
        .object({
          diameterMm: finite.positive(),
          horizontalPitchMm: finite.positive(),
          horizontalCount: z.number().int().positive(),
          rows: z.number().int().positive(),
          verticalPitchMm: finite.positive().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type ManualDuctedMachine = z.infer<typeof manualDuctedMachineSchema>;
export const pointSchema = z.object({
  x: finite.min(-10000).max(10000),
  y: finite.min(-10000).max(10000),
});
export const wallSchema = z.object({
  id,
  floorId: id,
  start: pointSchema,
  end: pointSchema,
  thickness: finite.min(0.01).max(2),
  type: z.enum(["INTERNO", "ESTERNO"]),
  height: finite.positive().max(30).nullable(),
});
export const floorSchema = z.object({
  id,
  name: z.string().min(1).max(100),
  elevationM: finite.min(-100).max(1000),
  scaleVerified: z.boolean(),
  background: z
    .object({
      dataUrl: z
        .string()
        .max(28_000_000)
        .regex(/^data:image\/(png|jpeg|webp);base64,/),
      widthPx: finite.positive().max(20000),
      heightPx: finite.positive().max(20000),
      metersPerPixel: finite.positive().max(100),
      origin: pointSchema,
      opacity: finite.min(0).max(1),
      filename: z.string().max(255),
    })
    .nullable(),
});
export const roomSchema = z.object({
  id,
  floorId: id,
  name: z.string().max(100),
  polygon: z.array(pointSchema).min(3).max(1000),
  wallIds: z.array(id).max(1000),
  geometryStatus: z.enum(["closed", "unresolved"]).default("closed"),
  netAreaM2: finite.nonnegative(),
  perimeterM: finite.nonnegative(),
  centroid: pointSchema,
  heightM: finite.positive().max(30),
  volumeM3: finite.nonnegative(),
  designLoadW: finite.nonnegative(),
  systemType: z.enum(["none", "split", "ducted", "radiator"]),
  supplyPoints: z.number().int().min(1).max(100),
  returnPoints: z.number().int().min(1).max(100),
});
const placement = z.object({
  id,
  roomId: id,
  floorId: id,
  wallId: id.nullable(),
  position: pointSchema,
  rotation: finite,
  widthMm: finite.positive(),
  heightMm: finite.positive(),
  depthMm: finite.positive(),
  productId: id,
  catalogVersion: z.string().max(100),
});
export const projectSchema = z
  .object({
    schemaVersion: z.literal(2),
    id,
    name: z.string().trim().min(1).max(150),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    floors: z.array(floorSchema).min(1).max(30),
    walls: z.array(wallSchema).max(5000),
    rooms: z.array(roomSchema).max(1000),
    openings: z
      .array(
        z.object({
          id,
          wallId: id,
          floorId: id,
          offsetM: finite.nonnegative(),
          widthM: finite.positive(),
          heightM: finite.positive(),
          type: z.enum(["door", "window"]),
          sillHeightM: finite.nonnegative().max(30).nullable().default(null),
        }),
      )
      .max(2000),
    hvacSystems: z
      .array(
        z.object({
          id,
          type: z.enum(["split", "ducted"]),
          name: z.string().trim().max(100).optional(),
          plenumSettings: z
            .object({
              maxBranchVelocityMs: finite.min(0.5).max(10),
              grouping: z.enum(["terminal", "point"]),
            })
            .optional(),
          manufacturer: z.string().max(100),
          productId: id,
          roomIds: z.array(id).min(1),
          capacityW: finite.positive().nullable(),
          genericMachine: manualDuctedMachineSchema.optional(),
          dataOrigin: z.enum(["catalog", "manual"]).optional(),
          airflowM3h: finite.positive().nullable(),
          catalogVersion: z.string().max(100),
          indoorUnits: z.array(placement),
          compatibilityStatus: z.enum(["verified", "unverifiable", "invalid"]),
        }),
      )
      .max(1000),
    radiators: z
      .array(
        placement.extend({
          elements: z.number().int().positive().max(500),
          outputW: finite.positive(),
          deltaTK: finite.positive(),
          family: z.string().max(100),
          manufacturer: z.string().max(100),
          finishes: z
            .object({
              bodyColorId: z.string().max(200).optional(),
              valveColorId: z.string().max(200).optional(),
              lockshieldColorId: z.string().max(200).optional(),
              pipeCoverColorId: z.string().max(200).optional(),
              catalogVersion: z.string().max(100).optional(),
            })
            .optional(),
        }),
      )
      .max(2000),
    airTerminals: z
      .array(
        placement.extend({
          use: z.enum(["supply", "return"]),
          requiredAirflowM3h: finite.positive(),
          availableAirflowM3h: finite.positive(),
          noiseDbA: finite.nonnegative().nullable(),
          theoreticalLengthM: finite.positive().nullable(),
          family: z.string().max(100),
          depthMm: finite.positive().nullable(),
          systemId: id.nullable(),
          mounting: z.enum(["wall", "ceiling", "unknown"]),
          shape: z.enum(["rectangle", "circle", "unknown"]),
          elevationM: finite.positive().max(30).nullable(),
          operatingPointIndex: z
            .number()
            .int()
            .nonnegative()
            .max(500)
            .nullable(),
          noiseUpperBoundDbA: finite.nonnegative().nullable(),
          noiseLabel: z.string().max(50),
          pressureDropPa: finite.nonnegative().nullable(),
          throwM: finite.nonnegative().nullable(),
          openingMm: finite.nullable(),
          pointIndex: z.number().int().nonnegative().max(100).nullable(),
          unitIndex: z.number().int().nonnegative().max(1000).nullable(),
          legacyUnverified: z.boolean().default(false),
          commercialOptions: terminalCommercialOptionsSchema.optional(),
        }),
      )
      .max(2000),
    projectSettings: z.object({
      radiatorDeltaTK: finite.min(1).max(100),
      defaultHeightM: finite.positive().max(30),
      internalWallThicknessM: finite.min(0.01).max(2),
      externalWallThicknessM: finite.min(0.01).max(2),
      coefficientWm3: z.literal(35),
      maxNoiseDbA: z.literal(37),
    }),
    catalogVersions: z.record(z.string().max(100), z.string().max(100)),
    sourceFilesMetadata: z
      .array(
        z.object({
          id,
          filename: z.string().max(255),
          mimeType: z.string().max(100),
          sizeBytes: z.number().int().nonnegative(),
          importedAt: z.iso.datetime(),
          floorId: id,
          sourceType: z.enum(["raster", "pdf", "dxf", "dwg"]),
        }),
      )
      .max(100),
  })
  .superRefine((p, ctx) => {
    const groups = [
      p.floors,
      p.walls,
      p.rooms,
      p.openings,
      p.hvacSystems,
      p.radiators,
      p.airTerminals,
      p.hvacSystems.flatMap((s) => s.indoorUnits),
    ];
    const ids = groups.flat().map((e) => e.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Identificativi duplicati" });
    const floors = new Set(p.floors.map((f) => f.id));
    const walls = new Map(p.walls.map((w) => [w.id, w]));
    const rooms = new Map(p.rooms.map((r) => [r.id, r]));
    for (const e of [
      ...p.walls,
      ...p.rooms,
      ...p.openings,
      ...p.radiators,
      ...p.airTerminals,
      ...p.sourceFilesMetadata,
    ])
      if (!floors.has(e.floorId))
        ctx.addIssue({ code: "custom", message: "Piano inesistente" });
    for (const r of p.rooms)
      if (r.wallIds.some((wid) => walls.get(wid)?.floorId !== r.floorId))
        ctx.addIssue({ code: "custom", message: "Muri stanza incoerenti" });
    for (const o of p.openings)
      if (walls.get(o.wallId)?.floorId !== o.floorId)
        ctx.addIssue({ code: "custom", message: "Apertura senza muro" });
    for (const e of [
      ...p.radiators,
      ...p.airTerminals,
      ...p.hvacSystems.flatMap((s) => s.indoorUnits),
    ]) {
      if (rooms.get(e.roomId)?.floorId !== e.floorId)
        ctx.addIssue({ code: "custom", message: "Apparecchio senza stanza" });
      if (e.wallId && walls.get(e.wallId)?.floorId !== e.floorId)
        ctx.addIssue({ code: "custom", message: "Apparecchio senza muro" });
    }
    for (const s of p.hvacSystems) {
      if (
        (s.genericMachine || s.dataOrigin === "manual") &&
        s.type !== "ducted"
      )
        ctx.addIssue({
          code: "custom",
          message: "Macchina manuale ammessa solo nel sistema canalizzato",
        });
      if (s.dataOrigin === "manual" && !s.genericMachine)
        ctx.addIssue({
          code: "custom",
          message: "Dati macchina manuale mancanti",
        });
      if (!s.genericMachine && s.capacityW === null)
        ctx.addIssue({
          code: "custom",
          message: "Potenza del sistema di catalogo mancante",
        });
      if (s.roomIds.some((rid) => !rooms.has(rid)))
        ctx.addIssue({
          code: "custom",
          message: "Sistema con stanza inesistente",
        });
    }
    for (const t of p.airTerminals)
      if (
        t.systemId &&
        !p.hvacSystems.some(
          (s) =>
            s.id === t.systemId &&
            s.type === "ducted" &&
            s.roomIds.includes(t.roomId),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Terminale senza sistema canalizzato coerente",
        });
  });

export type Point = z.infer<typeof pointSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Selection = { kind: "room" | "wall" | "device"; id: string };
