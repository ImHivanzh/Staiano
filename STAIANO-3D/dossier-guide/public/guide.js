const status = document.querySelector("#snapshot-status");
const text = (id, value) => {
  document.getElementById(id).textContent = value;
};
const number = (value, decimals = 1) =>
  new Intl.NumberFormat("it-IT", { maximumFractionDigits: decimals }).format(
    value,
  );

async function loadProject() {
  const payload = location.hash.slice(1);
  document.querySelector("#snapshot").hidden = true;
  document.querySelector("#measures").replaceChildren();
  status.textContent =
    "Apri il QR della copertina per vedere il riepilogo del tuo progetto.";
  if (!payload) return;
  try {
    if (
      payload.length > 3000 ||
      !/^1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(payload)
    )
      throw new Error("link");
    status.textContent = "Apertura protetta del riepilogo…";
    const response = await fetch("/api/dossier", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: payload,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("decrypt");
    const data = await response.json();
    if (payload !== location.hash.slice(1)) return;
    if (
      data.v !== 1 ||
      typeof data.n !== "string" ||
      data.n.length > 120 ||
      typeof data.d !== "string" ||
      !Number.isFinite(Date.parse(data.d)) ||
      !["complete", "summary"].includes(data.k) ||
      !Array.isArray(data.m) ||
      data.m.length !== 10 ||
      !data.m.every((n) => Number.isFinite(n) && n >= 0) ||
      !Array.isArray(data.r) ||
      data.r.length > 12 ||
      !data.r.every((n) => typeof n === "string" && n.length <= 50)
    )
      throw new Error("data");
    text("project-name", data.n);
    text(
      "project-date",
      `${data.k === "summary" ? "Dossier sintetico" : "Dossier completo"} · esportato il ${new Date(data.d).toLocaleDateString("it-IT")}`,
    );
    const [
      rooms,
      area,
      volume,
      load,
      hvac,
      radiators,
      terminals,
      fanCoils,
      invalid,
      warnings,
    ] = data.m;
    for (const [label, value] of [
      ["Ambienti", number(rooms, 0)],
      ["Superficie netta", `${number(area)} m²`],
      ["Volume netto", `${number(volume)} m³`],
      ["Fabbisogno stimato", `${number(load / 1000, 2)} kW`],
    ]) {
      const group = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      group.append(dt, dd);
      document.querySelector("#measures").append(group);
    }
    text(
      "rooms",
      data.r.length
        ? `${data.r.join(" · ")}${rooms > data.r.length ? ` · e altri ${rooms - data.r.length} ambienti nel PDF` : ""}`
        : `${rooms} ambienti; nomi e dettagli nel PDF.`,
    );
    text(
      "systems",
      `${hvac} sistemi HVAC · ${radiators} radiatori · ${terminals} terminali · ${fanCoils} ventilconvettori`,
    );
    text(
      "checks",
      invalid || warnings
        ? `Da leggere con il tecnico: ${invalid} errori e ${warnings} avvisi nel documento.`
        : "I controlli automatici non riportano errori o avvisi sui dati disponibili.",
    );
    text(
      "variant-note",
      data.k === "summary"
        ? "Hai il dossier sintetico. Per tavole A3, percorsi, schede complete e provenienze richiedi il dossier completo."
        : "Hai il dossier completo. Usa l’indice del PDF per raggiungere le tavole e le schede disponibili nel progetto.",
    );
    status.textContent = "Riepilogo decifrato dal servizio Staiano.";
    document.querySelector("#snapshot").hidden = false;
  } catch {
    if (payload !== location.hash.slice(1)) return;
    status.textContent =
      "Il riepilogo nel collegamento non è leggibile su questo dispositivo. Consulta i dati nel PDF; la guida qui sotto resta disponibile.";
  }
}
void loadProject();
window.addEventListener("hashchange", loadProject);
// Section navigation must preserve the encrypted fragment needed to reopen the dossier.
document.querySelectorAll('a[href^="#"]').forEach((link) =>
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
    if (link.classList.contains("skip")) target.focus({ preventScroll: true });
  }),
);
