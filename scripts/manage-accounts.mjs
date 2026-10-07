import { randomBytes, scryptSync } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const action = args[0] || "--bootstrap";
const username = (args[1] || "").trim().toLowerCase();
if (
  !["--bootstrap", "--reset", "--disable", "--enable"].includes(action) ||
  (action === "--bootstrap"
    ? args.length > 1
    : args.length !== 2 || !/^[a-z0-9][a-z0-9._-]{1,39}$/.test(username))
) {
  console.error(
    "Uso: node scripts/manage-accounts.mjs --bootstrap | --reset nome | --disable nome | --enable nome",
  );
  process.exit(1);
}

const file = resolve(process.env.AUTH_FILE || ".cache/app-auth.json");
const credentialsFile = resolve(file, "..", "initial-user-credentials.json");

function protect(path) {
  if (process.platform !== "win32") return;
  const output = execFileSync("whoami.exe", ["/user", "/fo", "csv", "/nh"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const sid = output.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error("permissions");
  execFileSync(
    "icacls.exe",
    [
      path,
      "/inheritance:r",
      "/grant:r",
      `*${sid}:(F)`,
      "*S-1-5-18:(F)",
      "*S-1-5-32-544:(F)",
    ],
    { stdio: "ignore", windowsHide: true },
  );
}

function writePrivate(path, value) {
  mkdirSync(resolve(path, ".."), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    protect(temporary);
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function freshUser(username, displayName, role, revision = 1) {
  const password = randomBytes(24).toString("base64url");
  const salt = randomBytes(32).toString("hex");
  const passwordHash = scryptSync(password, Buffer.from(salt, "hex"), 64, {
    N: 16384,
    r: 8,
    p: 1,
  }).toString("hex");
  return {
    user: {
      username,
      displayName,
      role,
      salt,
      passwordHash,
      revision,
      disabled: false,
      mustChangePassword: true,
    },
    password,
  };
}

try {
  let config = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (
    config &&
    (config.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(config.salt) ||
      !/^[a-f0-9]{128}$/.test(config.passwordHash) ||
      !/^[a-f0-9]{64}$/.test(config.sessionSecret))
  )
    throw new Error("config");
  const generated = [];
  let modified = false;
  if (action === "--bootstrap") {
    if (!config) {
      const admin = freshUser("admin", "Ivan", "admin");
      config = {
        version: 1,
        salt: admin.user.salt,
        passwordHash: admin.user.passwordHash,
        sessionSecret: randomBytes(32).toString("hex"),
        users: [admin.user],
      };
      generated.push({
        username: "admin",
        displayName: "Ivan",
        password: admin.password,
      });
      modified = true;
    }
    if (!config.users) {
      config.users = [
        {
          username: "admin",
          displayName: "Ivan",
          role: "admin",
          salt: config.salt,
          passwordHash: config.passwordHash,
          revision: 1,
          disabled: false,
          mustChangePassword: false,
        },
      ];
      modified = true;
    }
    for (const [username, displayName] of [
      ["samuele", "Samuele"],
      ["gionathan", "Gionathan"],
      ["marco", "Marco"],
    ]) {
      if (config.users.some((user) => user.username === username)) continue;
      const entry = freshUser(username, displayName, "operator");
      config.users.push(entry.user);
      generated.push({ username, displayName, password: entry.password });
      modified = true;
    }
  } else {
    const user = config?.users?.find(
      (candidate) => candidate.username === username,
    );
    if (!user) throw new Error("missing account");
    if (
      action === "--disable" &&
      user.role === "admin" &&
      !config.users.some(
        (candidate) =>
          candidate.username !== username &&
          candidate.role === "admin" &&
          !candidate.disabled,
      )
    )
      throw new Error("last admin");
    if (action === "--reset") {
      const entry = freshUser(
        username,
        user.displayName,
        user.role,
        user.revision + 1,
      );
      Object.assign(user, entry.user);
      generated.push({
        username,
        displayName: user.displayName,
        password: entry.password,
      });
      if (username === "admin") {
        config.salt = user.salt;
        config.passwordHash = user.passwordHash;
      }
    } else {
      user.disabled = action === "--disable";
      user.revision += 1;
    }
    modified = true;
  }
  if (generated.length) {
    const previous = existsSync(credentialsFile)
      ? JSON.parse(readFileSync(credentialsFile, "utf8"))
      : { accounts: [] };
    // Persist recoverable credentials before publishing their password hashes.
    writePrivate(credentialsFile, {
      createdAt: new Date().toISOString(),
      instructions:
        "Password iniziali personali: consegnare solo al rispettivo utente. Cambio obbligatorio al primo accesso. Rimuovere questo file dopo la consegna.",
      accounts: [
        ...previous.accounts.filter(
          (account) =>
            !generated.some((entry) => entry.username === account.username),
        ),
        ...generated,
      ],
    });
  }
  if (modified) writePrivate(file, config);
  console.log(
    modified
      ? "Account aggiornati. Password iniziali salvate nel file privato accanto alla configurazione, mai mostrate in console."
      : "Account già configurati. Nessuna password modificata.",
  );
} catch {
  console.error(
    "Gestione account fallita: verificare configurazione, nome utente, permessi privati; l'ultimo admin non può essere disabilitato.",
  );
  process.exitCode = 1;
}
