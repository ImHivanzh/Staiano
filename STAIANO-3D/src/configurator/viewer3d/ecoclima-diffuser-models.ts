/** Ecoclima terminals that have a Blender model (scripts/blender/ecoclima-diffusers.py, ecoclima-grilles.py). */
const families = {
  "edrc-round": ["EDRC", "EDRCS", "EDRCS THERM"],
  "edrc-square": ["EDRC-PQR", "EDRCS-PQR", "EDRCS-PQR THERM"],
  "edrf-round": ["EDRF", "EDRFB"],
  "edrf-square": ["EDRFQ", "EDRFQB"],
  "edra-round": ["EDRA"],
  "edra-square": ["EDRA-PQ"],
  "edcs-round": ["EDCS"],
  "edcs-square": ["EDCS-PQ"],
  "edqv-square": ["EDQV", "EDQV-PQ"],
  "edu-round": ["EDU", "EDU-M", "EDUB", "EDU-F", "EDU-S", "EDU-SM", "EDU-LFS"],
  "ede-square": ["EDE1", "EDE1R", "EDE2", "EDE2S", "EDE5", "EDE-FB"],
  "ede2-square": ["EDE2R"],
  "valve-round": ["EVVMC", "EVVRC"],
  "valve-abs": ["EVPMC"],
  "valve-inox": ["EAM-VRFN"],
  "edcf-round": ["EDCF"],
  "edcc-round": ["EDCC"],
  "edqf-square": ["EDQF1", "EDQF3"],
  "edqc-square": ["EDQC1"],
  "edea-round": ["EDEA-SD"],
  "edqm-square": ["EDQMQ"],
  "edqm-round": ["EDQMC"],
  "edfds-round": ["EDFDS"],
  "edsc-round": ["EDSC-C", "EDSC-CC"],
  "edsc-square": ["EDSC-Q"],
  "eadd-square": ["EADD"],
} as const;

export type EcoclimaDiffuserModel = keyof typeof families;
export const ecoclimaDiffuserModels = Object.keys(families) as EcoclimaDiffuserModel[];
export const ecoclimaDiffuserFamilies = Object.values(families).flat();

export function ecoclimaDiffuserModel(familyCode: string) {
  return ecoclimaDiffuserModels.find((model) => (families[model] as readonly string[]).includes(familyCode)) ?? null;
}

/** Rectangular grilles and linear slot diffusers (scripts/blender/ecoclima-grilles.py): pitch of blades, bars, slats and holes is real, so each catalog variant has its own file, named after its id. */
export const ecoclimaGrilleFamilies = [
  "EBA", "EBV", "EBCV", "EBIA", "EBLF", "EBLR", "EBLS", "EBL3",
  "EGA", "EGA1-4", "EGA50", "EGA50-3F", "EGA50-3S", "EGZ50", "EGZ100", "ETA", "EGS", "EDC1", "EDC2", "EDC3", "EDC4", "EDC5", "EDC6",
  "EAG", "EAL", "EAG-AL", "EAG-INOX", "EGQ", "EGQR", "EGQIF", "EGQ1-4", "EGQ-PUSH", "EGQR-PUSH", "EGFR", "EGFF", "EAGF", "EGA-ONE", "EGFC",
  "EDMP-P", "EDMP-C", "EDMF-S", "EDLH", "EDLSV", "EBP", "EBP-T",
];
export const ecoclimaGrilleUrl = (familyCode: string, productId: string) =>
  ecoclimaGrilleFamilies.includes(familyCode) ? `/models/ecoclima/${familyCode.toLowerCase()}/${productId}.glb` : null;

/** Grilles delivered in white lacquer; the others are bare aluminium or steel. */
const lacquered = ["EBLF", "EBLR", "EBL3", "EGA", "EGA1-4", "EGS", "EAG", "EAL", "EAG-AL", "EGQ", "EGQR", "EGQIF", "EGQ1-4", "EGQ-PUSH", "EGQR-PUSH", "EGFR", "EGFF", "EAGF", "EGA-ONE", "EGFC", "EDMP-P", "EDMP-C", "EDMF-S", ...["EDC1", "EDC2", "EDC3", "EDC4", "EDC5", "EDC6"]];
export const ecoclimaGrilleIsNatural = (familyCode: string) => !lacquered.includes(familyCode);

/** Bare-metal terminals: no tint unless the project sets a colour. */
export const ecoclimaNaturalModels: readonly string[] = ["edu-round", "valve-inox"];
