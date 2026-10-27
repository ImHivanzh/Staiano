import { create } from "zustand";
import { z } from "zod";

/** Stato della proiezione sulla TV: lo stesso valore vale per il PC e per la Vista Cliente. */
export const customerViewSchema = z.object({
  systemOn: z.boolean(),
  comfort: z.enum(["cool", "heat"]),
  tour: z.boolean(),
  explain: z.boolean(),
});
export type CustomerViewState = z.infer<typeof customerViewSchema>;
// Transitorio: non sporca né salva il progetto.
export const useCustomerView = create<CustomerViewState>(() => ({
  systemOn: false,
  comfort: "cool",
  tour: false,
  explain: false,
}));
export const customerViewValues = (): CustomerViewState => {
  const { systemOn, comfort, tour, explain } = useCustomerView.getState();
  return { systemOn, comfort, tour, explain };
};
