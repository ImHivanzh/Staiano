import { create } from "zustand";
import { z } from "zod";

/** Stato della proiezione sulla TV: lo stesso valore vale per il PC e per la Vista Cliente. */
export const customerViewSchema = z.object({
  systemOn: z.boolean(),
  comfort: z.enum(["cool", "heat"]),
  tour: z.boolean(),
  explain: z.boolean(),
});
export type CustomerViewValues = z.infer<typeof customerViewSchema>;
/** `social` (orbita automatica in 9:16) e `recording` (registrazione del video) valgono solo sulla TV: non passano al PC. */
export type CustomerViewState = CustomerViewValues & {
  social: boolean;
  recording: boolean;
  /** Video con didascalie e invito finale (altrimenti solo immagini, logo e nome del negozio). */
  captions: boolean;
  /** Avanzamento della creazione del video, da 0 a 1. */
  progress: number;
};
// Transitorio: non sporca né salva il progetto.
export const useCustomerView = create<CustomerViewState>(() => ({
  systemOn: false,
  comfort: "cool",
  tour: false,
  explain: false,
  social: false,
  recording: false,
  captions: true,
  progress: 0,
}));
export const customerViewValues = (): CustomerViewValues => {
  const { systemOn, comfort, tour, explain } = useCustomerView.getState();
  return { systemOn, comfort, tour, explain };
};
