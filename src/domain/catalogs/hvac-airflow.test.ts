import { expect, it } from "vitest";
import { maximumAirflowOption } from "./hvac-airflow";
import { hvacCatalog } from "./hvac";
import { selectDuctedMachine } from "@/domain/ducted/calculate";

it("finds the numerical maximum in unsorted options and preserves published default", () => {
  const product = structuredClone(
    hvacCatalog.products.find((p) => p.indoorModel === "PEAD-M35JA2")!,
  );
  product.airflowOptions = [
    { label: "Alta", airflowM3h: 840 },
    { label: "Bassa", airflowM3h: 600 },
    { label: "Media", airflowM3h: 720 },
  ];
  product.defaultAirflowIndex = 2;
  expect(maximumAirflowOption(product)).toEqual({
    option: product.airflowOptions[0],
    index: 0,
    airflowM3h: 840,
  });
  expect(product.defaultAirflowIndex).toBe(2);
  product.defaultAirflowIndex = null;
  expect(selectDuctedMachine(2000, product.manufacturer, [product])).toEqual([
    product,
  ]);
});

it("uses the highest historical source flow for each manufacturer", () => {
  for (const [model, maximum, publishedDefault] of [
    ["PEAD-M35JA2", 840, 720],
    ["FBA35A9", 900, 750],
    ["GUD35PS1/A-S", 600, 500],
  ] as const) {
    const product = hvacCatalog.products.find((p) => p.indoorModel === model)!;
    expect(maximumAirflowOption(product)?.airflowM3h).toBe(maximum);
    expect(
      product.airflowOptions[product.defaultAirflowIndex!].airflowM3h,
    ).toBe(publishedDefault);
  }
});

it("returns no flow when published usable options are absent", () => {
  expect(maximumAirflowOption(null)).toBeNull();
  expect(maximumAirflowOption({ airflowOptions: [] })).toBeNull();
  expect(
    maximumAirflowOption({
      airflowOptions: [
        { label: "assente", airflowM3h: NaN },
        { label: "invalid", airflowM3h: Infinity },
        { label: "zero", airflowM3h: 0 },
      ],
    }),
  ).toBeNull();
});
