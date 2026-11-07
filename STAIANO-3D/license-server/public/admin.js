"use strict";
(() => {
  const $ = (id) => document.getElementById(id);
  let token = "",
    licenses = [],
    products = [],
    editing = null,
    busy = false;
  const date = (value) =>
    value ? new Date(value).toLocaleString("it-IT") : "—";
  function message(value, error = false) {
    $("message").textContent = value;
    $("message").classList.toggle("error", error);
  }
  async function api(path, method = "GET", body) {
    const response = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
    });
    const data = await response.json();
    if (response.status === 401) logout();
    if (!response.ok)
      throw new Error(data.message || "Operazione non riuscita. Riprovare.");
    return data;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    document
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    message("");
    $("workspace").setAttribute("aria-busy", "true");
    try {
      await action();
    } catch (error) {
      message(error.message || "Connessione interrotta. Riprovare.", true);
    } finally {
      busy = false;
      $("workspace").setAttribute("aria-busy", "false");
      document
        .querySelectorAll("button")
        .forEach((button) => (button.disabled = false));
    }
  }
  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function button(label, action, className = "secondary") {
    const node = element("button", label, className);
    node.type = "button";
    node.addEventListener("click", () => run(action));
    return node;
  }
  function showKey(key) {
    $("new-key").textContent = key;
    $("key-panel").hidden = false;
    $("key-panel").scrollIntoView({ block: "center" });
  }
  function render() {
    const productNames = new Map(
      products.map((product) => [product.id, product.name]),
    );
    const needle = $("search").value.toLocaleLowerCase("it"),
      filter = $("filter").value;
    const list = licenses.filter(
      (item) =>
        ($("product-filter").value === "all" ||
          item.productId === $("product-filter").value) &&
        (filter === "all" || item.status === filter) &&
        `${item.customer} ${item.id} ${item.plan} ${productNames.get(item.productId) || item.productId}`
          .toLocaleLowerCase("it")
          .includes(needle),
    );
    $("summary").textContent =
      `${licenses.length} licenze · ${licenses.filter((x) => x.status === "active").length} attive · ${licenses.reduce((n, x) => n + x.activations.filter((a) => !a.released_at).length, 0)} postazioni occupate`;
    $("visible-count").textContent =
      `${list.length} ${list.length === 1 ? "licenza mostrata" : "licenze mostrate"}`;
    const fragment = document.createDocumentFragment();
    if (!list.length)
      fragment.append(
        element(
          "p",
          licenses.length
            ? "Nessuna licenza corrisponde alla ricerca."
            : "Nessuna licenza. Crea la prima per attivare una postazione.",
          "empty",
        ),
      );
    for (const item of list) {
      const article = element("article", undefined, "license"),
        head = element("div", undefined, "license-head"),
        title = element("div", undefined, "license-identity");
      title.append(element("h2", item.customer));
      const identifier = element("p", item.id, "meta");
      identifier.title = item.id;
      title.append(identifier);
      const product = element(
        "div",
        productNames.get(item.productId) || item.productId,
        "license-product",
      );
      const occupied = item.activations.filter(
        (seat) => !seat.released_at,
      ).length;
      const usage = element(
        "span",
        `${occupied}/${item.seats} postazioni`,
        "license-seats",
      );
      const status = element(
        "span",
        item.status === "active" ? "Attiva" : "Revocata",
        `status ${item.status}`,
      );
      const actions = element("div", undefined, "license-actions");
      actions.append(
        button("Modifica", () => edit(item)),
        button(
          item.status === "active" ? "Revoca" : "Ripristina",
          async () => {
            if (
              !confirm(
                `${item.status === "active" ? "Revocare" : "Ripristinare"} la licenza di ${item.customer}?`,
              )
            )
              return;
            await api(
              `/admin/licenses/${item.id}/${item.status === "active" ? "revoke" : "restore"}`,
              "POST",
            );
            await load();
            message("Stato della licenza aggiornato.");
          },
          item.status === "active" ? "secondary danger" : "secondary",
        ),
        button("Rigenera chiave", async () => {
          if (
            !confirm(
              `La chiave precedente di ${item.customer} smetterà di funzionare. Dovrai consegnare la nuova chiave alle postazioni. Continuare?`,
            )
          )
            return;
          const data = await api(`/admin/licenses/${item.id}/rotate`, "POST");
          showKey(data.key);
          message("Chiave rigenerata. Consegnala al cliente.");
        }),
      );
      head.append(title, product, usage, status, actions);
      article.append(head);
      const details = element("details", undefined, "license-details");
      details.append(
        element("summary", `Postazioni (${item.activations.length})`),
      );
      details.addEventListener("toggle", function mountSeats() {
        if (!details.open) return;
        details.removeEventListener("toggle", mountSeats);
        details.append(
          element(
            "p",
            `${item.id} · Creata il ${date(item.createdAt)}`,
            "meta",
          ),
        );
        if (item.notes) details.append(element("p", item.notes));
        if (!item.activations.length)
          details.append(element("p", "Nessuna attivazione registrata."));
        else {
          const wrap = element("div", undefined, "table-wrap"),
            table = element("table"),
            thead = element("thead"),
            tr = element("tr");
          for (const label of [
            "Postazione",
            "Ultimo contatto",
            "Versione",
            "Stato",
            "Azione",
          ]) {
            const th = element("th", label);
            th.scope = "col";
            tr.append(th);
          }
          thead.append(tr);
          table.append(thead);
          const tbody = element("tbody");
          for (const seat of item.activations) {
            const row = element("tr"),
              name = element("td", seat.hostname || "Postazione senza nome");
            name.append(element("span", seat.machine_id, "machine-id"));
            const action = element("td");
            if (!seat.released_at)
              for (const [label, hostAction, warning] of [
                ["Riavvia AnyDesk", "anydesk", "La connessione AnyDesk cade per qualche secondo."],
                ["Riavvia PC", "reboot", "Il computer si spegne e riparte: i programmi aperti si chiudono."],
              ])
                action.append(
                  button(label, async () => {
                    if (!confirm(`${label} su ${seat.hostname || seat.machine_id}? ${warning} Parte entro 5 minuti.`))
                      return;
                    await api(`/admin/licenses/${item.id}/host`, "POST", {
                      machineId: seat.machine_id,
                      action: hostAction,
                    });
                    message("Richiesta in coda: parte entro 5 minuti.");
                  }),
                );
            if (!seat.released_at)
              action.append(
                button("Libera posto", async () => {
                  if (
                    !confirm(
                      `Liberare ${seat.hostname || seat.machine_id}? La postazione dovrà essere riattivata.`,
                    )
                  )
                    return;
                  await api(`/admin/licenses/${item.id}/release`, "POST", {
                    machineId: seat.machine_id,
                  });
                  await load();
                  message("Postazione liberata.");
                }),
              );
            row.append(
              name,
              element("td", date(seat.last_seen)),
              element("td", seat.app_version || "—", "machine-version"),
              element("td", seat.released_at ? "Liberata" : "Attiva"),
              action,
            );
            tbody.append(row);
          }
          table.append(tbody);
          wrap.append(table);
          details.append(wrap);
        }
      });
      article.append(details);
      fragment.append(article);
    }
    $("licenses").replaceChildren(fragment);
  }
  async function load() {
    const [registered, data, releaseResult] = await Promise.all([
      api("/admin/products"),
      api("/admin/licenses"),
      api("/admin/releases")
        .then((value) => ({ value }))
        .catch(() => ({ error: true })),
    ]);
    products = registered.products;
    const selected = $("product-filter").value;
    const licenseProduct = $("license-product").value;
    $("product-filter").replaceChildren(new Option("Tutti i software", "all"));
    $("license-product").replaceChildren();
    for (const product of products) {
      $("product-filter").append(new Option(product.name, product.id));
      $("license-product").append(new Option(product.name, product.id));
    }
    if (products.some((product) => product.id === licenseProduct))
      $("license-product").value = licenseProduct;
    $("product-filter").value = products.some(
      (product) => product.id === selected,
    )
      ? selected
      : "all";
    $("products-list").textContent = products
      .map((product) => `${product.name} (${product.id})`)
      .join(" · ");
    licenses = data.licenses;
    render();
    try {
      if (releaseResult.error) throw new Error("Pacchetto non disponibile");
      const { release } = releaseResult.value;
      $("release-status").textContent = release
        ? `Pacchetto ${release.sequence} · revisione ${release.commit_sha.slice(0, 12)} · pubblicato il ${date(release.created_at)}`
        : "Nessun pacchetto pubblicato nel canale Staiano HVAC.";
    } catch {
      $("release-status").textContent =
        "Stato dei pacchetti non disponibile. Aggiorna l’elenco per riprovare.";
    }
  }
  async function showWorkspace() {
    await load();
    $("login").hidden = true;
    $("workspace").hidden = false;
    $("logout").hidden = false;
    $("session-tools").hidden = false;
    $("session-method").textContent = token
      ? "Sessione amministratore"
      : "Sessione con passkey";
    document.body.classList.add("authenticated");
  }
  function edit(item = null) {
    editing = item?.id || null;
    $("editor-title").textContent = item
      ? `Modifica licenza · ${item.customer}`
      : "Nuova licenza";
    $("license-product").value = item?.productId || products[0]?.id || "";
    $("license-product").disabled = Boolean(item);
    for (const [name, fallback] of Object.entries({
      customer: "",
      plan: "standard",
      seats: 1,
      features: "configurator",
      notes: "",
    }))
      $("license-form").elements.namedItem(name).value =
        item?.[name] ?? fallback;
    $("editor").hidden = false;
    $("editor").scrollIntoView({ block: "center" });
    $("license-form").elements.namedItem("customer").focus();
  }
  function logout() {
    token = "";
    licenses = [];
    editing = null;
    $("workspace").hidden = true;
    $("login").hidden = false;
    $("logout").hidden = true;
    $("session-tools").hidden = true;
    document.body.classList.remove("authenticated");
    $("editor").hidden = true;
    $("products-panel").hidden = true;
    $("manage-products").setAttribute("aria-expanded", "false");
    $("key-panel").hidden = true;
    $("new-key").textContent = "";
    $("licenses").replaceChildren();
    $("admin-token").value = "";
  }
  $("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      token = $("admin-token").value.trim();
      $("admin-token").value = "";
      await showWorkspace();
    });
  });
  $("license-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      const form = new FormData($("license-form")),
        body = Object.fromEntries(form);
      body.seats = Number(body.seats);
      const data = await api(
        editing ? `/admin/licenses/${editing}` : "/admin/licenses",
        editing ? "PATCH" : "POST",
        body,
      );
      $("editor").hidden = true;
      if (data.key) showKey(data.key);
      await load();
      message(editing ? "Licenza aggiornata." : "Licenza creata.");
    });
  });
  $("new-license").addEventListener("click", () => edit());
  $("manage-products").addEventListener("click", () => {
    $("products-panel").hidden = !$("products-panel").hidden;
    $("manage-products").setAttribute(
      "aria-expanded",
      String(!$("products-panel").hidden),
    );
    if (!$("products-panel").hidden)
      $("products-panel").scrollIntoView({ block: "start" });
  });
  $("product-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await api(
        "/admin/products",
        "POST",
        Object.fromEntries(new FormData($("product-form"))),
      );
      $("product-form").reset();
      await load();
      message("Software registrato. Puoi creare le sue licenze.");
    });
  });
  $("cancel-edit").addEventListener("click", () => {
    $("editor").hidden = true;
  });
  $("search").addEventListener("input", render);
  $("filter").addEventListener("change", render);
  $("product-filter").addEventListener("change", render);
  $("refresh").addEventListener("click", () => run(load));
  $("copy-key").addEventListener("click", () =>
    run(async () => {
      await navigator.clipboard.writeText($("new-key").textContent);
      message("Chiave copiata.");
    }),
  );
  $("dismiss-key").addEventListener("click", () => {
    $("new-key").textContent = "";
    $("key-panel").hidden = true;
  });
  $("logout").addEventListener("click", () => {
    run(async () => {
      await api("/auth/logout", "POST");
      logout();
      message("Accesso chiuso.");
    });
  });
  $("passkey-login").addEventListener("click", () =>
    run(async () => {
      const { options, challengeId } = await api("/auth/login/options", "POST");
      const response = await window.LicensePasskeys.startAuthentication({
        optionsJSON: options,
      });
      await api("/auth/login/verify", "POST", { challengeId, response });
      token = "";
      await showWorkspace();
    }),
  );
  $("register-passkey").addEventListener("click", () =>
    run(async () => {
      const { options, challengeId } = await api(
        "/admin/passkeys/register/options",
        "POST",
      );
      const response = await window.LicensePasskeys.startRegistration({
        optionsJSON: options,
      });
      await api("/admin/passkeys/register/verify", "POST", {
        challengeId,
        response,
      });
      message(
        "Passkey registrata. Dal prossimo accesso puoi usare il pulsante Accedi con passkey.",
      );
    }),
  );
  api("/auth/session", "POST")
    .then((result) => {
      $("token-recovery").hidden = !result.tokenLoginEnabled;
      return result.authenticated ? showWorkspace() : undefined;
    })
    .catch(() => {});
  addEventListener("pagehide", logout);
})();
