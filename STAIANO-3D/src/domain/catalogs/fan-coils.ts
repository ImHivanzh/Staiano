import raw from "../../../catalog-data/generated/fan-coils.json" with { type: "json" };
import { catalogHistory } from "./catalog-history";
import {
  fanCoilCatalogSchema,
  type FanCoilProduct,
  type FanCoilControl,
} from "./fan-coil-schema";
export {
  fanCoilCatalogSchema,
  fanCoilProductSchema,
  controlProductSchema,
} from "./fan-coil-schema";
export type {
  FanCoilProduct,
  FanCoilControl,
  FanCoilCatalog,
  FanCoilOperatingPoint,
} from "./fan-coil-schema";
export const fanCoilCatalog = fanCoilCatalogSchema.parse(raw);
export const fanCoilCatalogAtVersion = catalogHistory(
  [fanCoilCatalog],
  "fanCoils",
  fanCoilCatalogSchema.parse,
);
export function fanCoilProductAtVersion(id: string, version: string) {
  return (
    fanCoilCatalogAtVersion(version)?.products.find((p) => p.id === id) ?? null
  );
}
export function fanCoilControlAtVersion(id: string, version: string) {
  return (
    fanCoilCatalogAtVersion(version)?.controls.find((p) => p.id === id) ?? null
  );
}

/**
 * Il ventilconvettore si calcola e si disegna sempre al punto di massima
 * potenza pubblicata: le velocità inferiori restano solo nella scheda.
 */
export function fanCoilMaximumPoint(
  product: Pick<FanCoilProduct, "operatingPoints">,
) {
  return product.operatingPoints.reduce(
    (best, point, index) =>
      point.coolingW + point.heatingW >
      best.point.coolingW + best.point.heatingW
        ? { index, point }
        : best,
    { index: 0, point: product.operatingPoints[0] },
  );
}

export type FanCoilCategory = "ducted" | "ambient";

export function isConcealedFanCoil(
  product: Pick<FanCoilProduct, "family"> | null | undefined,
) {
  return [
    "AirLeaf SLI",
    "AirLeaf RSI",
    "AirLeaf SLSI",
    "FCZ P",
    "FCZ PO",
    "Bi2 Naked SLI",
    "Bi2 Naked SLIR",
  ].includes(product?.family ?? "");
}

/**
 * Prodotti per installazione ad incasso con faccia anteriore a filo muro:
 * il corpo resta nella parete o nel vuoto tecnico e il pannello chiude il vano.
 * Le serie canalizzabili (Aermec FCZ P/PO) sono nascoste ma distribuite a
 * canali: non richiedono il filo muro e non hanno pannello frontale.
 */
export function isRecessedFanCoil(
  product: Pick<FanCoilProduct, "family" | "features"> | null | undefined,
) {
  if (isDuctedFanCoil(product)) return false;
  return (
    isConcealedFanCoil(product) ||
    (product?.features ?? []).some((feature) =>
      /installazione ad incasso/i.test(feature),
    )
  );
}

/**
 * Famiglie canalizzabili: il costruttore le pubblica per distribuzione a canali
 * (Aermec FCZ, FCZ P e FCZ PO, scheda FCZ-P_I_UN50_16). Restano
 * ventilconvettori, ma non hanno pannello frontale a filo muro.
 */
const DUCTED_FAMILIES: readonly string[] = ["FCZ", "FCZ P", "FCZ PO"];

export function isDuctedFanCoil(
  product: Pick<FanCoilProduct, "family"> | null | undefined,
) {
  return DUCTED_FAMILIES.includes(product?.family ?? "");
}

export const fanCoilCategoryLabels: Record<FanCoilCategory, string> = {
  ducted: "Ventilconvettori canalizzabili",
  ambient: "Ventilconvettori a parete e a soffitto",
};

export function fanCoilCategory(
  product: Pick<FanCoilProduct, "manufacturer" | "family">,
): FanCoilCategory {
  return isDuctedFanCoil(product) ? "ducted" : "ambient";
}

/** Ordine di presentazione: prima i canalizzabili, poi gli altri. */
export const fanCoilCategories: readonly FanCoilCategory[] = [
  "ducted",
  "ambient",
];

/** Only the documented M7 families and board/pipe pairings can be associated. */
export function controllerBoardFor(
  product: FanCoilProduct,
  control: FanCoilControl,
): string | null {
  if (
    product.manufacturer !== "Innova" ||
    control.manufacturer !== product.manufacturer ||
    control.series !== "M7" ||
    !["AirLeaf SLI", "AirLeaf RSI", "AirLeaf SLSI"].includes(product.family) ||
    !control.compatibleFamilies.includes(product.family)
  )
    return null;
  const board =
    control.connection === "bluetooth"
      ? product.pipes === "2"
        ? "ESE746II"
        : "ESE741II"
      : product.pipes === "2"
        ? "ESE745II"
        : "ESE748II";
  return control.requiredBoards.includes(board) ? board : null;
}
export function compatibleFanCoilControls(
  product: FanCoilProduct,
  catalog = fanCoilCatalog,
) {
  return catalog.controls.filter(
    (control) => controllerBoardFor(product, control) !== null,
  );
}

export type FanCoilPanelType =
  "traditional" | "rasomuro" | "grilles-top" | "grilles-90";
export type FanCoilCoverType = "fixed" | "adjustable";

const AERMEC_COVER_GROUPS: Readonly<Record<string, number>> = {
  "100": 100,
  "101": 100,
  "102": 100,
  "150": 100,
  "200": 200,
  "201": 200,
  "202": 200,
  "250": 200,
  "300": 300,
  "301": 300,
  "302": 300,
  "350": 300,
  "400": 500,
  "401": 500,
  "402": 500,
  "450": 500,
  "500": 500,
  "501": 500,
  "502": 500,
  "550": 500,
  "600": 800,
  "601": 800,
  "602": 800,
  "650": 800,
  "700": 800,
  "701": 800,
  "702": 800,
  "750": 800,
  "800": 800,
  "801": 800,
  "802": 800,
  "850": 800,
  "900": 900,
  "901": 900,
  "950": 900,
  "1000": 900,
  "1001": 900,
};

export function fanCoilPanelOptions(
  product: Pick<FanCoilProduct, "family" | "pipes">,
  mounting: "wall" | "ceiling",
): FanCoilPanelType[] {
  if (product.family === "AirLeaf RSI" || product.family === "AirLeaf SLSI")
    return mounting === "wall" ? ["traditional", "rasomuro"] : [];
  if (product.family === "AirLeaf SLI")
    return product.pipes === "2"
      ? ["traditional", "rasomuro"]
      : ["traditional"];
  if (product.family === "Bi2 Naked SLI")
    return mounting === "wall"
      ? ["traditional", "grilles-90"]
      : ["grilles-top", "grilles-90"];
  if (product.family === "Bi2 Naked SLIR" && mounting === "wall")
    return ["traditional"];
  return [];
}

export function fanCoilDefaultPanelType(
  product: Pick<FanCoilProduct, "family" | "pipes">,
  mounting: "wall" | "ceiling",
): FanCoilPanelType | null {
  return fanCoilPanelOptions(product, mounting)[0] ?? null;
}

export function fanCoilPanelTypeValid(
  product: FanCoilProduct,
  mounting: "wall" | "ceiling",
  panelType: FanCoilPanelType | null,
) {
  const options = fanCoilPanelOptions(product, mounting);
  return options.length
    ? panelType !== null && options.includes(panelType)
    : panelType === null;
}

export function fanCoilPanelTypeLabel(panelType: FanCoilPanelType) {
  return {
    traditional: "Incasso tradizionale · pannello metallico",
    rasomuro: "Incasso RASOMURO · filomuro",
    "grilles-top": "Griglie · plenum superiore",
    "grilles-90": "Griglie · plenum 90°",
  }[panelType];
}

export function fanCoilRecessDepthMm(
  product: Pick<FanCoilProduct, "family" | "depthMm" | "recessDepthMm">,
  panelType: FanCoilPanelType | null,
) {
  if (product.family.startsWith("Bi2 Naked") && panelType === "traditional")
    return product.recessDepthMm ?? product.depthMm;
  if (["AirLeaf SLI", "AirLeaf RSI", "AirLeaf SLSI"].includes(product.family))
    return panelType === "rasomuro" && product.family !== "AirLeaf SLSI"
      ? 162
      : panelType
        ? 142
        : product.depthMm;
  return product.depthMm;
}

/** Official Innova cover dimensions; null means no measured panel is declared. */
export function fanCoilPanelDimensions(
  product: Pick<FanCoilProduct, "family" | "model" | "pipes">,
  panelType: FanCoilPanelType | null,
) {
  if (
    !panelType ||
    !["traditional", "rasomuro"].includes(panelType) ||
    !["AirLeaf SLI", "AirLeaf RSI", "AirLeaf SLSI"].includes(product.family)
  )
    return null;
  const size = Number(product.model.match(/\b(200|400|600|800|1000)\b/)?.[1]);
  if (!size) return null;
  const rasomuro = panelType === "rasomuro";
  if (rasomuro && product.pipes !== "2") return null;
  const slim = product.family === "AirLeaf SLSI";
  const heightMm = rasomuro
    ? slim
      ? 523
      : 723
    : slim
      ? 553
      : product.pipes === "4"
        ? 814
        : 754;
  return {
    widthMm: size + (rasomuro ? 507 : 572),
    heightMm,
    depthMm: 30,
  };
}

/** MZA/MZU compatibility is published by FCZ-P model code; cover dimensions are not. */
export function fanCoilCoverAccessory(
  product: Pick<FanCoilProduct, "manufacturer" | "family" | "model">,
  coverType: FanCoilCoverType | null,
) {
  if (
    product.manufacturer !== "Aermec" ||
    product.family !== "FCZ P" ||
    !coverType
  )
    return null;
  const model = product.model.match(/^FCZ(\d{3,4})P$/)?.[1];
  if (!model) return null;
  const size = AERMEC_COVER_GROUPS[model];
  return size
    ? {
        code: `${coverType === "fixed" ? "MZA" : "MZU"}${size}`,
        description: `Mobile di copertura Aermec FCZ P · alette ${coverType === "fixed" ? "fisse" : "orientabili"}`,
      }
    : null;
}

export function fanCoilCoverTypeValid(
  product: FanCoilProduct,
  coverType: FanCoilCoverType | null,
) {
  return (
    coverType === null || fanCoilCoverAccessory(product, coverType) !== null
  );
}

export function airLeafRecessedAccessories(
  product: FanCoilProduct,
  mounting: "wall" | "ceiling",
  panelType: FanCoilPanelType | null,
) {
  if (
    !["AirLeaf SLI", "AirLeaf RSI", "AirLeaf SLSI"].includes(product.family) ||
    !panelType ||
    !["traditional", "rasomuro"].includes(panelType)
  )
    return [];
  const size = Number(product.model.match(/\b(200|400|600|800|1000)\b/)?.[1]);
  if (!size) return [];
  const index = size / 200 - 1;
  const slim = product.family === "AirLeaf SLSI";
  if (panelType === "rasomuro") {
    if (product.pipes !== "2") return [];
    return [
      {
        code: `L${String((slim ? 1049 : 1040) + index).padStart(5, "0")}II`,
        description: `Cassaforma RASOMURO Innova ${product.family}`,
      },
      {
        code: `LC${String((slim ? 1095 : mounting === "wall" ? 1081 : 1086) + index).padStart(4, "0")}II`,
        description: `Pannello estetico RASOMURO Innova AirLeaf ${product.family.replace("AirLeaf ", "")} ${mounting === "wall" ? "verticale" : "orizzontale"}`,
      },
    ];
  }
  return [
    {
      code: slim
        ? `L${String(700 + index).padStart(5, "0")}II`
        : product.pipes === "2"
          ? `L${String(568 + index).padStart(5, "0")}II`
          : `L${String(1064 + index).padStart(5, "0")}II`,
      description: `Cassaforma tradizionale Innova ${product.family}`,
    },
    {
      code: slim
        ? `LC${String(692 + index).padStart(4, "0")}II`
        : product.pipes === "2"
          ? mounting === "wall"
            ? `LC${String(578 + index).padStart(4, "0")}II`
            : `LC${String(618 + index).padStart(4, "0")}II`
          : mounting === "wall"
            ? `LC${String(759 + index).padStart(4, "0")}II`
            : `LC${String(764 + index).padStart(4, "0")}II`,
      description: `Pannello estetico tradizionale Innova ${product.family} ${mounting === "wall" ? "parete" : "soffitto"}`,
    },
  ];
}

function bi2NakedAccessories(
  product: FanCoilProduct,
  panelType: FanCoilPanelType | null,
) {
  if (!product.family.startsWith("Bi2 Naked") || !panelType) return [];
  const size = Number(
    product.model.match(/\b(1600|1400|1100|200|400|600|800)\b/)?.[1],
  );
  if (!size) return [];
  const code = (n: number) => `B${String(n).padStart(4, "0")}`;
  if (size >= 1100) {
    if (panelType === "traditional")
      return [
        {
          code: "B0894",
          description: "Cassaforma Olimpia Splendid Bi2 Naked",
        },
        {
          code: product.family === "Bi2 Naked SLIR" ? "B0954" : "B0959",
          description:
            product.family === "Bi2 Naked SLIR"
              ? "Pannello di chiusura radiante Olimpia Splendid Bi2 Naked"
              : "Pannello metallico di chiusura Olimpia Splendid Bi2 Naked",
        },
      ];
    if (product.family !== "Bi2 Naked SLI") return [];
    const large = size === 1600;
    return [
      {
        code: large ? "B0889" : "B0888",
        description: "Kit di aspirazione Olimpia Splendid Bi2 Naked",
      },
      {
        code:
          panelType === "grilles-top"
            ? large
              ? "B0891"
              : "B0890"
            : large
              ? "B0893"
              : "B0892",
        description:
          panelType === "grilles-top"
            ? "Plenum di mandata superiore Olimpia Splendid Bi2 Naked"
            : "Plenum di mandata 90° coibentato Olimpia Splendid Bi2 Naked",
      },
      {
        code: large ? "B0881" : "B0880",
        description: "Griglia di mandata Olimpia Splendid Bi2 Naked",
      },
      {
        code: large ? "B0883" : "B0882",
        description: "Griglia di aspirazione Olimpia Splendid Bi2 Naked",
      },
      {
        code: "",
        description: "Pannello di copertura da realizzare in cantiere",
      },
    ];
  }
  const i = size / 200 - 1;
  if (panelType === "traditional")
    return [
      {
        code: code(568 + i),
        description: "Cassaforma Olimpia Splendid Bi2 Naked",
      },
      {
        code: code((product.family === "Bi2 Naked SLIR" ? 950 : 955) + i),
        description:
          product.family === "Bi2 Naked SLIR"
            ? "Pannello di chiusura radiante Olimpia Splendid Bi2 Naked"
            : "Pannello metallico di chiusura Olimpia Splendid Bi2 Naked",
      },
    ];
  if (product.family !== "Bi2 Naked SLI") return [];
  return [
    {
      code: code(194 + i),
      description: "Kit di aspirazione Olimpia Splendid Bi2 Naked",
    },
    {
      code: code((panelType === "grilles-top" ? 160 : 165) + i),
      description:
        panelType === "grilles-top"
          ? "Plenum di mandata superiore Olimpia Splendid Bi2 Naked"
          : "Plenum di mandata 90° coibentato Olimpia Splendid Bi2 Naked",
    },
    {
      code: code(550 + i),
      description: "Griglia di mandata Olimpia Splendid Bi2 Naked",
    },
    {
      code: code(559 + i),
      description: "Griglia di aspirazione Olimpia Splendid Bi2 Naked",
    },
    {
      code: "",
      description: "Pannello di copertura da realizzare in cantiere",
    },
  ];
}

export function fanCoilInstallationAccessories(
  product: FanCoilProduct,
  mounting: "wall" | "ceiling",
  panelType: FanCoilPanelType | null,
  coverType: FanCoilCoverType | null = null,
) {
  const cover = fanCoilCoverAccessory(product, coverType);
  return [
    ...airLeafRecessedAccessories(product, mounting, panelType),
    ...bi2NakedAccessories(product, panelType),
    ...(cover ? [cover] : []),
  ];
}
