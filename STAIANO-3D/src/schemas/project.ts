import { z } from "zod";
import { terminalCommercialOptionsSchema } from "@/domain/catalogs/ecoclima-price-schema";

export const CURRENT_SCHEMA_VERSION = 6;
export const DIMENSION_MODES = ["internal", "axis", "external"] as const;
export const DECISION_ORIGINS = [
  "calculated",
  "suggested",
  "confirmed",
  "manual",
] as const;
const id = z.string().min(1).max(120);
const finite = z.number().finite();
/** Quote dell'attacco dichiarate dall'operatore, mai dedotte dall'ingombro. */
export const connectionDeclarationSchema = z.object({
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
});
export const manualDuctedMachineSchema = z.object({
  manufacturer: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  maxAirflowM3h: finite.positive(),
  coolingCapacityW: finite.positive().optional(),
  heatingCapacityW: finite.positive().optional(),
  widthMm: finite.positive().optional(),
  heightMm: finite.positive().optional(),
  depthMm: finite.positive().optional(),
  dischargeConnection: connectionDeclarationSchema.optional(),
  returnConnection: connectionDeclarationSchema.optional(),
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
  locked: z.boolean().default(false),
  curveId: id.optional(),
  recognition: z
    .object({
      confidence: finite.min(0).max(1),
      origin: z.enum(DECISION_ORIGINS),
      reason: z.string().max(500),
    })
    .optional(),
});
export const importAnalysisSchema = z.object({
  algorithmVersion: z.string().max(50),
  analyzedAt: z.iso.datetime(),
  sourceType: z.enum(["raster", "pdf", "dxf", "dwg", "manual"]),
  scaleConfidence: z.enum(["high", "medium", "low"]),
  wallCandidates: z.number().int().nonnegative(),
  wallsAutoCreated: z.number().int().nonnegative(),
  wallsConfirmedByOperator: z.number().int().nonnegative(),
  wallsManual: z.number().int().nonnegative(),
  roomsDetected: z.number().int().nonnegative(),
  openingsDetected: z.number().int().nonnegative(),
  notes: z.array(z.string().max(500)).max(50),
  candidates: z
    .array(
      z.object({
        id,
        start: pointSchema,
        end: pointSchema,
        thicknessM: finite.positive().nullable(),
        confidence: finite.min(0).max(1),
        reason: z.string().max(500),
        status: z.enum(["automatic", "confirmed", "rejected", "pending"]),
      }),
    )
    .max(5000)
    .optional(),
  openingCandidates: z
    .array(
      z.object({
        start: pointSchema,
        end: pointSchema,
        confidence: finite.min(0).max(1),
        reason: z.string().max(500),
      }),
    )
    .max(2000)
    .optional(),
});
export type ImportAnalysis = z.infer<typeof importAnalysisSchema>;
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
  importAnalysis: importAnalysisSchema.nullable().default(null),
  configurationWizard: z
    .object({
      step: z.number().int().min(0).max(10),
      confirmedSteps: z.array(z.number().int().min(0).max(10)).max(11),
      status: z.enum(["active", "paused", "complete"]),
    })
    .nullable()
    .optional(),
});
export const ceilingBandSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  wallId: id,
  offsetM: finite.nonnegative().max(1000),
  lengthM: finite.positive().max(1000),
  depthM: finite.positive().max(100),
  elevationM: finite.positive().max(30),
});
export type CeilingBand = z.infer<typeof ceilingBandSchema>;
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
  ceilingHeightM: finite.positive().max(30).nullable().default(null),
  ceilingBands: z.array(ceilingBandSchema).max(100).optional(),
  roof: z
    .object({ ridgeWallId: id, ridgeHeightM: finite.positive().max(30) })
    .optional(),
  volumeM3: finite.nonnegative(),
  designLoadW: finite.nonnegative(),
  systemType: z.enum(["none", "split", "vrv", "ducted", "radiator", "fanCoil"]),
  supplyPoints: z.number().int().min(1).max(100),
  returnPoints: z.number().int().min(1).max(100),
  usage: z.string().max(100).default(""),
  conditioningExclusion: z
    .object({ reason: z.string().trim().min(1).max(500) })
    .optional(),
});
const placement = z.object({
  id,
  installationId: id.optional(),
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
  locked: z.boolean().default(false),
});
export const outdoorUnitSchema = z.object({
  id,
  floorId: id,
  position: pointSchema,
  rotation: finite,
  widthMm: finite.positive(),
  heightMm: finite.positive(),
  depthMm: finite.positive(),
  elevationM: finite.nonnegative().max(100),
  mounting: z.enum(["ground", "brackets"]).optional(),
  locked: z.boolean().default(false),
});
export const linearPlanSchema = z.object({
  updatedAt: z.iso.datetime(),
  airflowM3h: finite.positive(),
  familyCode: z.string().max(100),
  catalogVersion: z.string().max(100).optional(),
  supplyVariantId: id.optional(),
  supplyOperatingPointIndex: z.number().int().nonnegative().optional(),
  returnVariantId: id.optional(),
  returnOperatingPointIndex: z.number().int().nonnegative().optional(),
  operatingPointLabel: z.string().max(100),
  airflowPerMeterM3h: finite.positive().nullable(),
  returnFamilyCode: z.string().max(100).nullable().default(null),
  returnOperatingPointLabel: z.string().max(100).nullable().default(null),
  returnAirflowPerMeterM3h: finite.positive().nullable().default(null),
  requiredSupplyM: finite.nonnegative(),
  requiredReturnM: finite.nonnegative(),
  distribution: z
    .array(
      z.object({
        roomId: id,
        use: z.enum(["supply", "return"]),
        suggestedM: finite.nonnegative(),
        airflowM3h: finite.nonnegative(),
      }),
    )
    .max(2000),
  status: z.enum(["proposed", "accepted", "modified", "none"]),
});
export type LinearPlan = z.infer<typeof linearPlanSchema>;
export const plenumSchema = z.object({
  id,
  systemId: id.nullable(),
  /** undefined: plenum macchina storico; null: elemento ancora da collegare. */
  attachmentId: id.nullable().optional(),
  portCount: z.number().int().min(1).max(24).optional(),
  portDiameterMm: finite.positive().max(2000).optional(),
  material: z.enum(["insulated", "galvanized"]).optional(),
  /** Un plenum di ripresa, uno di mandata: raccolgono bocchette di quel lato. */
  use: z.enum(["supply", "return"]).default("supply"),
  floorId: id,
  roomId: id.nullable(),
  position: pointSchema,
  rotation: finite,
  widthMm: finite.positive().max(10000),
  heightMm: finite.positive().max(10000),
  depthMm: finite.positive().max(10000),
  status: z.enum(["proposed", "confirmed", "manual"]),
  elevationM: finite.positive().max(30).optional(),
  model: z.string().max(100).optional(),
  locked: z.boolean().default(false),
  designSettings: z
    .object({
      edgeClearanceMm: finite.positive(),
      portClearanceMm: finite.positive(),
      collarLengthMm: finite.positive(),
      minimumBoxDepthMm: finite.positive(),
      expansionHalfAngleDeg: finite.positive(),
      faceWidthMm: finite.positive().nullable(),
    })
    .nullable()
    .default(null),
});
export type Plenum = z.infer<typeof plenumSchema>;
export const pillarSchema = z.object({
  id,
  floorId: id,
  position: pointSchema,
  rotation: finite,
  widthMm: finite.positive().max(10000),
  depthMm: finite.positive().max(10000),
  heightMm: finite.positive().max(30000),
  locked: z.boolean().default(false),
});
export type Pillar = z.infer<typeof pillarSchema>;
export const ductSchema = z.object({
  id,
  systemId: id,
  plenumId: id,
  terminalId: id.nullable(),
  branchId: z.string().max(250).nullable(),
  /** Flessibile = tubo corrugato verso il terminale, non condotto rigido. */
  kind: z.enum(["rigid", "flexible"]).default("rigid"),
  shape: z.enum(["circle", "rectangle"]),
  diameterMm: finite.positive().nullable(),
  widthMm: finite.positive().nullable(),
  heightMm: finite.positive().nullable(),
  routing: z.enum(["orthogonal", "manual"]),
  waypoints: z
    .array(pointSchema.extend({ elevationM: finite.min(0).max(30) }))
    .max(100),
  decisionOrigin: z.enum(DECISION_ORIGINS),
  locked: z.boolean().default(false),
});
export type Duct = z.infer<typeof ductSchema>;
export const projectSchema = z
  .object({
    schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
    id,
    name: z.string().trim().min(1).max(150),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    floors: z.array(floorSchema).min(1).max(30),
    walls: z.array(wallSchema).max(5000),
    rooms: z.array(roomSchema).max(1000),
    installations: z
      .array(
        z.object({
          id,
          name: z.string().trim().min(1).max(100),
          type: z.enum(["radiator", "ducted", "split", "vrv", "fanCoil"]),
          radiatorDeltaTK: finite.min(1).max(100).optional(),
          roomAirPoints: z
            .record(
              id,
              z.object({
                supply: z.number().int().min(1).max(100),
                return: z.number().int().min(1).max(100),
              }),
            )
            .optional(),
          roomIds: z.array(id).min(1).max(1000),
        }),
      )
      .max(2000)
      .default([]),
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
          type: z.enum(["split", "vrv", "ducted"]),
          installationId: id.optional(),
          name: z.string().trim().max(100).optional(),
          plenumSettings: z
            .object({
              maxBranchVelocityMs: finite.min(0.5).max(10),
              grouping: z.enum(["terminal", "point"]),
            })
            .optional(),
          manufacturer: z.string().max(100),
          productId: id,
          roomIds: z.array(id),
          capacityW: finite.positive().nullable(),
          genericMachine: manualDuctedMachineSchema.optional(),
          /** Ventilconvettore catalogo che alimenta questa distribuzione aeraulica. */
          fanCoilId: id.optional(),
          /** Macchine previste sugli stessi ambienti: il carico si divide. */
          plannedMachines: z.number().int().min(1).max(100).optional(),
          /** Attacco di ripresa dichiarato: serve al plenum di ripresa. */
          returnConnection: connectionDeclarationSchema.optional(),
          dataOrigin: z.enum(["catalog", "manual", "fanCoil"]).optional(),
          airflowM3h: finite.positive().nullable(),
          catalogVersion: z.string().max(100),
          indoorUnits: z.array(placement),
          outdoorUnit: outdoorUnitSchema.nullable().default(null),
          compatibilityStatus: z.enum(["verified", "unverifiable", "invalid"]),
          linearPlan: linearPlanSchema.nullable().default(null),
          decisionOrigin: z.enum(DECISION_ORIGINS).optional(),
        }),
      )
      .max(1000),
    equipmentDrafts: z
      .array(
        z.object({
          id,
          roomId: id,
          floorId: id,
          position: pointSchema,
          type: z.enum(["radiator", "fanCoil", "split", "vrv"]),
        }),
      )
      .max(2000)
      .optional(),
    heatPumpDrafts: z
      .array(
        z.object({
          id,
          floorId: id,
          position: pointSchema,
          terminalIds: z.array(id).max(2000).optional(),
        }),
      )
      .max(2000)
      .optional(),
    ductedDrafts: z
      .array(
        z.object({
          id,
          installationId: id,
          roomId: id,
          floorId: id,
          position: pointSchema,
          kind: z.enum(["machine", "terminal"]),
          use: z.enum(["supply", "return"]),
          machineId: id.optional(),
        }),
      )
      .max(2000)
      .optional(),
    plenums: z.array(plenumSchema).max(1000).default([]),
    pillars: z.array(pillarSchema).max(2000).optional(),
    ducts: z.array(ductSchema).max(5000).optional(),
    hydronicSystems: z
      .array(
        z.object({
          id,
          name: z.string().min(1).max(100),
          productId: id,
          catalogVersion: z.string().max(100),
          roomIds: z.array(id).min(1).max(1000),
          fanCoilIds: z.array(id).max(2000),
          terminalIds: z.array(id).max(2000).optional(),
          operatingPointIndex: z.number().int().nonnegative().max(100),
          outdoorUnit: outdoorUnitSchema,
          pipeWaypoints: z
            .array(
              z.object({
                fanCoilId: id,
                points: z.array(pointSchema).max(100),
              }),
            )
            .max(2000)
            .optional(),
        }),
      )
      .max(1000)
      .optional(),
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
    fanCoils: z
      .array(
        placement.extend({
          mounting: z.enum(["wall", "ceiling"]),
          elevationM: finite.positive().max(30),
          operatingPointIndex: z.number().int().nonnegative().max(100),
          controllerId: id.nullable().default(null),
          controllerBoard: z.string().max(100).nullable().default(null),
        }),
      )
      .max(2000)
      .optional(),
    airTerminals: z
      .array(
        placement.extend({
          use: z.enum(["supply", "return"]),
          requiredAirflowM3h: finite.nonnegative(),
          availableAirflowM3h: finite.positive(),
          noiseDbA: finite.nonnegative().nullable(),
          theoreticalLengthM: finite.positive().nullable(),
          family: z.string().max(100),
          depthMm: finite.positive().nullable(),
          systemId: id.nullable(),
          pendingSystemId: id.optional(),
          pendingMachineId: id.optional(),
          mounting: z.enum(["wall", "ceiling", "unknown"]),
          ceilingBandId: id.optional(),
          ceilingEdge: z.number().int().min(0).max(3).optional(),
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
          decisionOrigin: z
            .enum(["calculated", "suggested", "confirmed", "manual"])
            .default("calculated"),
          style: z.string().max(100).default(""),
          color: z.string().max(100).default(""),
          finish: z.string().max(100).default(""),
          productCode: z.string().max(100).default(""),
          plenumId: id.nullable().default(null),
          proposalId: z.string().max(200).optional(),
          manualDimensions: z.boolean().optional(),
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
      dimensionMode: z.enum(DIMENSION_MODES).default("internal"),
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
          originalDataUrl: z
            .string()
            .max(45_000_000)
            .regex(/^data:[^;]*;base64,/)
            .optional(),
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
      p.fanCoils ?? [],
      p.airTerminals,
      p.plenums,
      p.pillars ?? [],
      p.ducts ?? [],
      p.hydronicSystems ?? [],
      p.hydronicSystems?.map((s) => s.outdoorUnit) ?? [],
      p.hvacSystems.flatMap((s) => s.indoorUnits),
      p.hvacSystems.map((s) => s.outdoorUnit).filter((unit) => unit !== null),
      p.ductedDrafts ?? [],
      p.heatPumpDrafts ?? [],
      p.equipmentDrafts ?? [],
    ];
    const ids = groups.flat().map((e) => e.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Identificativi duplicati" });
    const floors = new Set(p.floors.map((f) => f.id));
    for (const draft of p.heatPumpDrafts ?? []) {
      if (!floors.has(draft.floorId))
        ctx.addIssue({
          code: "custom",
          message: "Pompa da configurare senza piano coerente",
        });
    }
    const walls = new Map(p.walls.map((w) => [w.id, w]));
    const rooms = new Map(p.rooms.map((r) => [r.id, r]));
    for (const draft of p.equipmentDrafts ?? []) {
      if (rooms.get(draft.roomId)?.floorId !== draft.floorId)
        ctx.addIssue({
          code: "custom",
          message: "Apparecchio da configurare senza ambiente o piano coerente",
        });
    }
    const installations = new Map(
      p.installations.map((item) => [item.id, item]),
    );
    for (const draft of p.ductedDrafts ?? []) {
      const installation = installations.get(draft.installationId);
      if (
        installation?.type !== "ducted" ||
        !installation.roomIds.includes(draft.roomId) ||
        rooms.get(draft.roomId)?.floorId !== draft.floorId
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Elemento da configurare senza impianto, stanza o piano coerenti",
        });
    }
    for (const terminal of p.airTerminals) {
      if (!terminal.installationId) continue;
      const installation = installations.get(terminal.installationId);
      const system = p.hvacSystems.find((s) => s.id === terminal.systemId);
      if (
        installation?.type !== "ducted" ||
        !installation.roomIds.includes(terminal.roomId) ||
        (system && system.installationId !== terminal.installationId)
      )
        ctx.addIssue({
          code: "custom",
          message: "Bocchetta associata a un impianto incoerente",
        });
    }
    if (installations.size !== p.installations.length)
      ctx.addIssue({
        code: "custom",
        message: "Impianti con identificativi duplicati",
      });
    for (const installation of p.installations) {
      if (
        new Set(installation.roomIds).size !== installation.roomIds.length ||
        installation.roomIds.some((roomId) => !rooms.has(roomId))
      )
        ctx.addIssue({
          code: "custom",
          message: "Stanze dell’impianto non valide",
        });
    }
    for (const [type, devices] of [
      ["radiator", p.radiators],
      ["fanCoil", p.fanCoils ?? []],
      ["ducted", p.hvacSystems.filter((s) => s.type === "ducted")],
      ["split", p.hvacSystems.filter((s) => s.type === "split")],
      ["vrv", p.hvacSystems.filter((s) => s.type === "vrv")],
    ] as const) {
      for (const device of devices) {
        if (!device.installationId) continue;
        const installation = installations.get(device.installationId);
        const roomIds = "roomIds" in device ? device.roomIds : [device.roomId];
        if (
          !installation ||
          installation.type !== type ||
          roomIds.some((roomId) => !installation.roomIds.includes(roomId))
        )
          ctx.addIssue({
            code: "custom",
            message:
              "Apparecchio associato a un impianto di tipo o stanze incoerenti",
          });
      }
    }
    for (const e of [
      ...p.walls,
      ...p.rooms,
      ...p.openings,
      ...p.radiators,
      ...(p.fanCoils ?? []),
      ...p.airTerminals,
      ...p.plenums,
      ...(p.pillars ?? []),
      ...p.sourceFilesMetadata,
    ])
      if (!floors.has(e.floorId))
        ctx.addIssue({ code: "custom", message: "Piano inesistente" });
    for (const r of p.rooms)
      if (r.wallIds.some((wid) => walls.get(wid)?.floorId !== r.floorId))
        ctx.addIssue({ code: "custom", message: "Muri stanza incoerenti" });
    for (const room of p.rooms) {
      if (
        room.roof &&
        (!room.wallIds.includes(room.roof.ridgeWallId) ||
          room.roof.ridgeHeightM <= room.heightM)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Tetto: colmo superiore alla gronda e parete di riferimento necessari",
        });
      if (
        new Set(room.ceilingBands?.map((b) => b.id)).size !==
        (room.ceilingBands?.length ?? 0)
      )
        ctx.addIssue({
          code: "custom",
          message: "Fasce del controsoffitto duplicate",
        });
      for (const band of room.ceilingBands ?? [])
        if (
          !room.wallIds.includes(band.wallId) ||
          band.elevationM >= (room.ceilingHeightM ?? room.heightM)
        )
          ctx.addIssue({
            code: "custom",
            message: "Fascia del controsoffitto senza parete o quota coerente",
          });
    }
    for (const terminal of p.airTerminals)
      if (
        terminal.ceilingBandId &&
        (terminal.mounting !== "wall" ||
          terminal.wallId ||
          terminal.ceilingEdge === undefined ||
          !rooms
            .get(terminal.roomId)
            ?.ceilingBands?.some((b) => b.id === terminal.ceilingBandId))
      )
        ctx.addIssue({
          code: "custom",
          message: "Bocchetta senza fronte del controsoffitto coerente",
        });
    for (const o of p.openings)
      if (walls.get(o.wallId)?.floorId !== o.floorId)
        ctx.addIssue({ code: "custom", message: "Apertura senza muro" });
    for (const e of [
      ...p.radiators,
      ...(p.fanCoils ?? []),
      ...p.airTerminals,
      ...p.hvacSystems.flatMap((s) => s.indoorUnits),
    ]) {
      if (rooms.get(e.roomId)?.floorId !== e.floorId)
        ctx.addIssue({ code: "custom", message: "Apparecchio senza stanza" });
      if (e.wallId && walls.get(e.wallId)?.floorId !== e.floorId)
        ctx.addIssue({ code: "custom", message: "Apparecchio senza muro" });
    }
    for (const s of p.hvacSystems) {
      if ((s.type === "split" || s.type === "vrv") && !s.roomIds.length)
        ctx.addIssue({
          code: "custom",
          message:
            s.type === "vrv"
              ? "Sistema VRV senza stanza"
              : "Sistema split senza stanza",
        });
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
    const airOwners = new Set<string>();
    for (const s of p.hvacSystems) {
      if (!s.fanCoilId) continue;
      if (
        s.type !== "ducted" ||
        !(p.fanCoils ?? []).some((unit) => unit.id === s.fanCoilId)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Distribuzione aeraulica senza ventilconvettore o tipo sistema coerenti",
        });
      if (airOwners.has(s.fanCoilId))
        ctx.addIssue({
          code: "custom",
          message: "Ventilconvettore collegato a più distribuzioni aerauliche",
        });
      airOwners.add(s.fanCoilId);
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
    const plenumIds = new Map(p.plenums.map((pl) => [pl.id, pl]));
    for (const terminal of p.airTerminals)
      if (
        terminal.pendingSystemId &&
        (terminal.systemId ||
          !p.hvacSystems.some(
            (system) =>
              system.id === terminal.pendingSystemId &&
              system.type === "ducted" &&
              (system.roomIds.includes(terminal.roomId) ||
                system.indoorUnits.some(
                  (unit) => unit.floorId === terminal.floorId,
                )),
          ))
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Punto bocchetta in attesa senza macchina di destinazione coerente",
        });
    const plenumUses = new Set<string>();
    for (const pl of p.plenums) {
      const system = p.hvacSystems.find((s) => s.id === pl.systemId);
      if (pl.systemId && (!system || system.type !== "ducted"))
        ctx.addIssue({
          code: "custom",
          message: "Plenum senza sistema canalizzato coerente",
        });
      const useKey = `${pl.attachmentId ?? pl.systemId}:${pl.use}`;
      if (
        (pl.attachmentId || pl.attachmentId === undefined) &&
        plenumUses.has(useKey)
      )
        ctx.addIssue({
          code: "custom",
          message: "Due plenums dello stesso lato sulla stessa macchina",
        });
      plenumUses.add(useKey);
      if (pl.attachmentId) {
        const owner =
          p.airTerminals.find((t) => t.id === pl.attachmentId) ??
          p.hvacSystems
            .flatMap((s) => s.indoorUnits)
            .find((u) => u.id === pl.attachmentId);
        if (
          !owner ||
          owner.floorId !== pl.floorId ||
          ("use" in owner
            ? owner.use !== "supply" ||
              pl.use !== "supply" ||
              owner.systemId !== pl.systemId
            : pl.use !== "return" ||
              !system?.indoorUnits.some((u) => u.id === owner.id))
        )
          ctx.addIssue({
            code: "custom",
            message: "Collegamento plenum non coerente",
          });
      }
      if (
        pl.roomId &&
        pl.systemId &&
        !system?.roomIds.includes(pl.roomId) &&
        !system?.indoorUnits.some((unit) => unit.roomId === pl.roomId)
      )
        ctx.addIssue({
          code: "custom",
          message: "Plenum in stanza non servita dal sistema",
        });
      if (pl.roomId && rooms.get(pl.roomId)?.floorId !== pl.floorId)
        ctx.addIssue({ code: "custom", message: "Piano plenum incoerente" });
    }
    for (const t of p.airTerminals)
      if (
        t.plenumId &&
        (plenumIds.get(t.plenumId)?.systemId !== t.systemId ||
          plenumIds.get(t.plenumId)?.floorId !== t.floorId ||
          plenumIds.get(t.plenumId)?.use !== t.use ||
          (plenumIds.get(t.plenumId)?.attachmentId != null &&
            plenumIds.get(t.plenumId)?.attachmentId !== t.id))
      )
        ctx.addIssue({
          code: "custom",
          message: "Terminale senza plenum coerente",
        });
    for (const duct of p.ducts ?? []) {
      const plenum = plenumIds.get(duct.plenumId);
      const terminal = p.airTerminals.find((t) => t.id === duct.terminalId);
      if (
        !plenum ||
        plenum.systemId !== duct.systemId ||
        (duct.terminalId &&
          (!terminal ||
            terminal.systemId !== duct.systemId ||
            terminal.plenumId !== duct.plenumId ||
            terminal.floorId !== plenum.floorId))
      )
        ctx.addIssue({
          code: "custom",
          message: "Canale con collegamenti incoerenti",
        });
    }
    for (const room of p.rooms)
      if (room.ceilingHeightM !== null && room.ceilingHeightM >= room.heightM)
        ctx.addIssue({
          code: "custom",
          message: "Controsoffitto non inferiore all'altezza della stanza",
        });
    for (const system of p.hvacSystems)
      if (system.outdoorUnit && !floors.has(system.outdoorUnit.floorId))
        ctx.addIssue({
          code: "custom",
          message: "Unità esterna split/VRV senza piano coerente",
        });
    for (const system of p.hydronicSystems ?? []) {
      if (
        !floors.has(system.outdoorUnit.floorId) ||
        system.roomIds.some((rid) => !rooms.has(rid)) ||
        system.fanCoilIds.some(
          (fid) =>
            !p.fanCoils?.some(
              (u) => u.id === fid && system.roomIds.includes(u.roomId),
            ),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "Collegamenti impianto idronico incoerenti",
        });
    }
  });

export type Point = z.infer<typeof pointSchema>;
export type Wall = z.infer<typeof wallSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Floor = z.infer<typeof floorSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Selection = { kind: "room" | "wall" | "device"; id: string };
