import { expect, it } from "vitest";
import { roomTone } from "./room-tone";

it("riconosce la famiglia dell'ambiente da nome e destinazione", () => {
  expect(roomTone("Cucina")).toBe("kitchen");
  expect(roomTone("Bagno padronale")).toBe("bath");
  expect(roomTone("Camera")).toBe("bedroom");
  expect(roomTone("Soggiorno")).toBe("living");
  expect(roomTone("Studio")).toBe("study");
  expect(roomTone("Corridoio")).toBe("passage");
  expect(roomTone("Locale 7", "Zona notte")).toBe("bedroom");
  expect(roomTone("Locale 7")).toBe("other");
});
