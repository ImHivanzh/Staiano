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
const sessionOnly = args.includes("--rotate-session-only");
if (
  args.some(
    (arg) => !["--stdin", "--rotate", "--rotate-session-only"].includes(arg),
  ) ||
  (sessionOnly && args.length !== 1)
) {
  console.error(
    "Opzioni non valide. Usare --stdin e --rotate, oppure solo --rotate-session-only.",
  );
  process.exit(1);
}

const file = resolve(process.env.AUTH_FILE || ".cache/app-auth.json");
if (existsSync(file) && !args.includes("--rotate") && !sessionOnly) {
  console.log(`Accesso già configurato: ${file}`);
  process.exit(0);
}
if (!args.includes("--stdin") && !sessionOnly) {
  console.error(
    "Fornire la password tramite standard input: node scripts/configure-access.mjs --stdin. Non inserirla negli argomenti.",
  );
  process.exit(1);
}

async function readPassword() {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    console.log("Inserire password (input nascosto):");
    try {
      return await new Promise((accept, reject) => {
        let input = Buffer.alloc(0);
        const cleanup = () => {
          process.stdin.removeListener("data", onData);
          process.stdin.removeListener("end", onEnd);
        };
        const onEnd = () => {
          cleanup();
          reject(new Error("input"));
        };
        const onData = (chunk) => {
          if (chunk.includes(3) || chunk.includes(4)) {
            onEnd();
            return;
          }
          input = Buffer.concat([input, chunk]);
          if (input.length > 2048) {
            onEnd();
            return;
          }
          const delimiter = input.findIndex(
            (byte) => byte === 10 || byte === 13,
          );
          if (delimiter < 0) return;
          cleanup();
          const password = input.subarray(0, delimiter).toString("utf8");
          if (
            !password ||
            password.length > 256 ||
            /[\x00-\x1f\x7f]/.test(password)
          ) {
            reject(new Error("input"));
          } else {
            accept(password);
          }
        };
        process.stdin.on("data", onData);
        process.stdin.on("end", onEnd);
      });
    } finally {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 2048) throw new Error("input");
    chunks.push(chunk);
    // One line permits pipe-based setup without waiting for terminal EOF.
    if (chunk.includes(10)) break;
  }
  const input = Buffer.concat(chunks).toString("utf8");
  const password = input.replace(/\r?\n$/, "");
  if (!password || password.length > 256 || /[\r\n]/.test(password))
    throw new Error("input");
  return password;
}

function restrictFile(path) {
  if (process.platform !== "win32") return;
  const user = execFileSync(
    `${process.env.SystemRoot ?? "C:/Windows"}/System32/whoami.exe`,
    ["/user", "/fo", "csv", "/nh"],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  const sid = user.match(/S-1-\d+(?:-\d+)+/)?.[0];
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

let temporary;
try {
  let config;
  if (sessionOnly) {
    config = JSON.parse(readFileSync(file, "utf8"));
    if (
      config.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(config.salt) ||
      !/^[a-f0-9]{128}$/.test(config.passwordHash) ||
      !/^[a-f0-9]{64}$/.test(config.sessionSecret)
    )
      throw new Error("config");
    config.sessionSecret = randomBytes(32).toString("hex");
  } else {
    const password = await readPassword();
    const salt = randomBytes(32);
    config = {
      version: 1,
      salt: salt.toString("hex"),
      passwordHash: scryptSync(password, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
      }).toString("hex"),
      sessionSecret: randomBytes(32).toString("hex"),
    };
    // An admin-password rotation preserves operators and changes only the admin.
    if (existsSync(file)) {
      const previous = JSON.parse(readFileSync(file, "utf8"));
      if (previous.users)
        config.users = previous.users.map((user) =>
          user.username === "admin"
            ? {
                ...user,
                salt: config.salt,
                passwordHash: config.passwordHash,
                revision: user.revision + 1,
                mustChangePassword: false,
              }
            : user,
        );
    }
  }
  mkdirSync(resolve(file, ".."), { recursive: true, mode: 0o700 });
  temporary = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(config)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  restrictFile(temporary);
  renameSync(temporary, file);
  console.log(
    `${sessionOnly ? "Sessioni precedenti revocate; password invariata" : args.includes("--rotate") ? "Password aggiornata; sessioni precedenti revocate" : "Accesso configurato"}: ${file}`,
  );
} catch {
  if (temporary) rmSync(temporary, { force: true });
  console.error(
    "Configurazione fallita. Verificare input (una password, massimo 256 caratteri) e permessi della cartella privata.",
  );
  process.exitCode = 1;
}
