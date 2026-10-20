import type { Point, Project } from "@/schemas/project";
import { placeDuctedMachine } from "./placement";
import { movePlacedDevice } from "../geometry/move-device";
import { footprintInsideRoom } from "../geometry/footprint";
import {
  addOperatorTerminal,
  type OperatorTerminalInput,
} from "../air-terminals/operator";
import { linearRunMembers, layoutLinearRun } from "../air-terminals/linear-run";
import { pointInPolygon } from "../geometry/primitives";
import { needsTerminalReconfiguration } from "../air-terminals/legacy";
import { ductedRoomAllocation } from "./apply";
import { refreshDuctedBindings } from "./refresh";
import { assignInstallationRooms } from "../installations";
import {
  airTerminalCatalog,
  airTerminalFamilyAtVersion,
} from "../catalogs/air-terminals";
import { acousticUpperBound } from "../air-terminals/size";
import {
  isTerminalFinishAvailable,
  terminalFinishChoices,
} from "../air-terminals/finishes";

export function placeDuctedDraft(
  project: Project,
  installationId: string,
  roomId: string,
  point: Point,
  kind: "machine" | "terminal",
  use: "supply" | "return" = "supply",
) {
  const room = project.rooms.find((item) => item.id === roomId);
  const installation = project.installations.find(
    (item) => item.id === installationId,
  );
  if (
    !room ||
    installation?.type !== "ducted" ||
    !installation.roomIds.includes(roomId) ||
    room.conditioningExclusion ||
    room.geometryStatus !== "closed" ||
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !pointInPolygon(point, room.polygon) ||
    !project.floors.find((item) => item.id === room.floorId)?.scaleVerified
  )
    throw new Error(
      "Scegli un punto in un ambiente valido dell’impianto con scala verificata.",
    );
  return {
    ...project,
    ductedDrafts: [
      ...(project.ductedDrafts ?? []),
      {
        id: crypto.randomUUID(),
        installationId,
        roomId,
        floorId: room.floorId,
        position: point,
        kind,
        use,
      },
    ],
  };
}

/**
 * Move an incomplete machine/terminal to any verified room of its floor,
 * registering that room in the installation. Replaces the draft in place so a
 * cancelled or repeated drag can never leave a second copy.
 */
export function moveDuctedDraft(
  project: Project,
  draftId: string,
  point: Point,
): Project {
  const draft = project.ductedDrafts?.find((item) => item.id === draftId);
  if (!draft) throw new Error("Bozza non trovata.");
  const room = project.rooms.find(
    (item) =>
      item.floorId === draft.floorId &&
      !item.conditioningExclusion &&
      item.geometryStatus === "closed" &&
      pointInPolygon(point, item.polygon) &&
      project.floors.find((floor) => floor.id === item.floorId)?.scaleVerified,
  );
  if (!room)
    throw new Error(
      "Scegli un punto in un ambiente valido dell’impianto con scala verificata.",
    );
  const assigned = project.installations.some(
    (item) => item.id === draft.installationId && item.type === "ducted",
  )
    ? assignInstallationRooms(project, draft.installationId, "ducted", [
        room.id,
      ])
    : project;
  return {
    ...assigned,
    ductedDrafts: assigned.ductedDrafts?.map((item) =>
      item.id === draftId
        ? { ...item, roomId: room.id, floorId: room.floorId, position: point }
        : item,
    ),
  };
}

export function placeMachineOnPlan(
  project: Project,
  systemId: string,
  roomId: string,
  point: Point,
) {
  const next = placeDuctedMachine(project, systemId, roomId);
  const unit = next.hvacSystems.find((system) => system.id === systemId)!
    .indoorUnits[0];
  const room = project.rooms.find((room) => room.id === roomId)!;
  if (
    !footprintInsideRoom(
      room,
      point,
      unit.widthMm / 1000,
      unit.depthMm / 1000,
      unit.rotation,
    )
  )
    throw new Error("La macchina deve rientrare nell’ambiente servito.");
  return movePlacedDevice(next, unit.id, point);
}

export function configureMachineOnPlan(
  project: Project,
  systemId: string,
  roomId: string,
  point: Point,
  draftId?: string,
): Project {
  const prepared = {
    ...project,
    airTerminals: project.airTerminals.map((terminal) =>
      draftId && terminal.pendingMachineId === draftId
        ? { ...terminal, systemId, pendingMachineId: undefined }
        : terminal,
    ),
    ductedDrafts: project.ductedDrafts?.map((draft) =>
      draftId && draft.machineId === draftId
        ? { ...draft, machineId: systemId }
        : draft,
    ),
  };
  let placed = placeMachineOnPlan(prepared, systemId, roomId, point);
  for (const terminal of project.airTerminals.filter(
    (t) =>
      draftId &&
      t.pendingMachineId === draftId &&
      linearRunMembers(project, t)[0]?.id === t.id,
  ))
    placed = connectTerminalOnPlan(placed, terminal.id, systemId);
  const unitId = placed.hvacSystems.find((s) => s.id === systemId)!
    .indoorUnits[0].id;
  const remap = (ids?: string[]) =>
    ids?.map((id) => (id === draftId ? unitId : id));
  return {
    ...placed,
    ductedDrafts: placed.ductedDrafts?.filter((draft) => draft.id !== draftId),
    heatPumpDrafts: placed.heatPumpDrafts?.map((pump) => ({
      ...pump,
      terminalIds: remap(pump.terminalIds),
    })),
    hydronicSystems: placed.hydronicSystems?.map((pump) => ({
      ...pump,
      terminalIds: remap(pump.terminalIds),
    })),
  };
}

export function saveTerminalOnPlan(
  project: Project,
  input: OperatorTerminalInput,
  point: Point,
  existingId?: string,
  draftId?: string,
): Project {
  if (!input.color?.trim())
    throw new Error("Scegli il colore della bocchetta prima di salvare.");
  if (
    draftId &&
    !project.ductedDrafts?.some(
      (draft) =>
        draft.id === draftId &&
        draft.kind === "terminal" &&
        draft.installationId === input.installationId &&
        draft.roomId === input.roomId,
    )
  )
    throw new Error("Bocchetta da configurare non più disponibile.");
  const family = airTerminalCatalog.families.find(
    (item) => item.familyCode === input.familyCode,
  );
  const old = project.airTerminals.find(
    (terminal) => terminal.id === existingId,
  );
  if (
    (input.color &&
      family &&
      terminalFinishChoices(family).length &&
      !isTerminalFinishAvailable(family, input.color) &&
      !(old?.family === input.familyCode && old.color === input.color)) ||
    (input.finish &&
      family &&
      !isTerminalFinishAvailable(family, input.finish) &&
      !(old?.family === input.familyCode && old.finish === input.finish))
  )
    throw new Error("Scegli colore e finitura disponibili nel catalogo.");
  const variant = family?.variants.find((item) => item.id === input.variantId);
  if (
    family?.isLinearPerMeter &&
    !(input.customLength && !input.moduleLengthsMm) &&
    (input.moduleLengthsMm ?? [input.lengthMm]).some(
      (length) =>
        !variant?.commercialLengthsMm.includes(length) &&
        !(
          old?.family === input.familyCode &&
          old.productId === input.variantId &&
          linearRunMembers(project, old).some(
            (member) => member.widthMm === length,
          )
        ),
    )
  )
    throw new Error("Scegli una lunghezza disponibile nel catalogo.");
  if (existingId && !old)
    throw new Error(
      "Il punto da modificare non esiste più. Seleziona nuovamente la bocchetta.",
    );
  const previous = old ? linearRunMembers(project, old) : [];
  if (previous.some((terminal) => terminal.locked))
    throw new Error("Sbloccare tutti i moduli prima di modificarli.");
  const previousIds = new Set(previous.map((terminal) => terminal.id));
  const next = addOperatorTerminal(
    {
      ...project,
      // A pending machine supplies sizing data, without serving the room until connected.
      hvacSystems: project.hvacSystems.map((system) =>
        system.id === input.systemId
          ? {
              ...system,
              roomIds: [...new Set([...system.roomIds, input.roomId])],
            }
          : system,
      ),
      airTerminals: project.airTerminals.filter(
        (terminal) => !previousIds.has(terminal.id),
      ),
      ducts: project.ducts?.filter(
        (duct) => !duct.terminalId || !previousIds.has(duct.terminalId),
      ),
    },
    input,
  );
  const count = input.moduleLengthsMm?.length ?? 1;
  const added = next.airTerminals.slice(-count);
  const identified = added.map((terminal, index) => {
    const before = previous[index];
    const sameModel =
      before?.productId === terminal.productId && before.use === terminal.use;
    return {
      ...terminal,
      id: before?.id ?? terminal.id,
      productCode: sameModel ? before.productCode : terminal.productCode,
      ceilingBandId:
        before?.mounting === terminal.mounting
          ? before.ceilingBandId
          : undefined,
      ceilingEdge:
        before?.mounting === terminal.mounting ? before.ceilingEdge : undefined,
      elevationM:
        before?.mounting === terminal.mounting
          ? before.elevationM
          : terminal.elevationM,
      commercialOptions:
        sameModel && before.commercialOptions
          ? {
              ...terminal.commercialOptions,
              ...before.commercialOptions,
              ...(before.color !== terminal.color
                ? { colorCode: undefined }
                : {}),
              linearRunId: terminal.commercialOptions?.linearRunId,
              linearRunOrder: terminal.commercialOptions?.linearRunOrder,
              ...input.plenumOptions,
            }
          : terminal.commercialOptions,
    };
  });
  const arranged = layoutLinearRun(identified, {
    ...identified[0],
    position: point,
    rotation: old?.rotation ?? added[0].rotation,
  });
  let positioned = {
    ...next,
    airTerminals: [...next.airTerminals.slice(0, -count), ...arranged],
  };
  positioned = movePlacedDevice(
    positioned,
    arranged[0].id,
    arranged[0].position,
  );
  const systemId =
    old?.systemId ??
    project.ductedDrafts?.find((draft) => draft.id === draftId)?.machineId ??
    null;
  const plenumId = input.use === "supply" ? (old?.plenumId ?? null) : null;
  const addedIds = new Set(arranged.map((terminal) => terminal.id));
  const savedTerminals = positioned.airTerminals.map((terminal) =>
    addedIds.has(terminal.id)
      ? {
          ...terminal,
          systemId,
          plenumId,
          pendingSystemId: systemId
            ? undefined
            : (old?.pendingSystemId ?? input.systemId ?? undefined),
        }
      : terminal,
  );
  const beforeIndex = project.airTerminals.findIndex((terminal) =>
    previousIds.has(terminal.id),
  );
  return {
    ...positioned,
    hvacSystems: project.hvacSystems,
    ducts: project.ducts?.filter(
      (duct) =>
        !duct.terminalId ||
        !previousIds.has(duct.terminalId) ||
        (addedIds.has(duct.terminalId) &&
          old?.use === input.use &&
          duct.plenumId === plenumId),
    ),
    ductedDrafts: positioned.ductedDrafts?.filter(
      (draft) => draft.id !== draftId,
    ),
    airTerminals:
      beforeIndex < 0
        ? savedTerminals
        : [
            ...project.airTerminals
              .slice(0, beforeIndex)
              .filter((terminal) => !previousIds.has(terminal.id)),
            ...savedTerminals.filter((terminal) => addedIds.has(terminal.id)),
            ...project.airTerminals
              .slice(beforeIndex)
              .filter((terminal) => !previousIds.has(terminal.id)),
          ],
  };
}

export function connectTerminalOnPlan(
  project: Project,
  terminalId: string,
  systemId: string | null,
): Project {
  const terminal = project.airTerminals.find(
    (terminal) => terminal.id === terminalId,
  );
  if (!terminal) throw new Error("Bocchetta inesistente.");
  const members = linearRunMembers(project, terminal);
  if (members.some((terminal) => terminal.locked))
    throw new Error("Sbloccare tutti i moduli prima di collegarli.");
  const system = project.hvacSystems.find(
    (system) => system.id === systemId && system.type === "ducted",
  );
  if (systemId && members.some(needsTerminalReconfiguration))
    throw new Error("Configura la bocchetta prima di collegarla.");
  if (
    systemId &&
    members.some((member) => {
      const family = airTerminalFamilyAtVersion(
        member.family,
        member.catalogVersion,
      );
      const variant = family?.variants.find(
        (item) => item.id === member.productId,
      );
      const point =
        member.operatingPointIndex === null
          ? undefined
          : variant?.operatingPoints[member.operatingPointIndex];
      return (
        !family?.use.includes(member.use) ||
        !point ||
        point.quality !== "valid" ||
        (point.use && point.use !== member.use) ||
        (member.use === "supply" &&
          (acousticUpperBound(point) ?? Infinity) > 37)
      );
    })
  )
    throw new Error(
      "Modello e prestazioni della bocchetta non compatibili: riconfigura prima di collegare.",
    );
  if (
    systemId &&
    (!system?.indoorUnits.length ||
      members.some(
        (member) => system.indoorUnits[0].floorId !== member.floorId,
      ))
  )
    throw new Error("Collega a una macchina posizionata sullo stesso piano.");
  const ids = new Set(members.map((member) => member.id));
  const plenum = project.plenums.find(
    (plenum) =>
      plenum.systemId === systemId &&
      plenum.floorId === terminal.floorId &&
      plenum.use === terminal.use &&
      plenum.attachmentId === undefined,
  );
  const connected = refreshDuctedBindings({
    ...project,
    airTerminals: project.airTerminals.map((member) =>
      ids.has(member.id)
        ? {
            ...member,
            installationId: system?.installationId ?? member.installationId,
            systemId,
            pendingMachineId: undefined,
            pendingSystemId: systemId
              ? undefined
              : (member.systemId ?? member.pendingSystemId),
            plenumId:
              project.plenums.find((p) => p.attachmentId === member.id)?.id ??
              (member.use === "supply" ? (plenum?.id ?? null) : null),
          }
        : member,
    ),
    ducts: project.ducts?.filter(
      (duct) => !duct.terminalId || !ids.has(duct.terminalId),
    ),
  });
  if (
    systemId &&
    members.some(
      (member) =>
        !ductedRoomAllocation(
          connected,
          member.roomId,
          system!.installationId,
          systemId,
        ),
    )
  )
    throw new Error(
      "Collegamento non valido: verifica geometria e dati macchina.",
    );
  return systemId
    ? assignInstallationRooms(
        connected,
        system!.installationId,
        "ducted",
        members.map((member) => member.roomId),
      )
    : connected;
}
