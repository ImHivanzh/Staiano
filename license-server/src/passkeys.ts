import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { base64ToBytes, base64UrlEncode } from "../../src/domain/license/token";
import type { Env } from "./index";

const COOKIE = "__Host-licenses-admin";
const json = (
  value: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
const hash = async (value: string) =>
  base64UrlEncode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
type Passkey = {
  id: string;
  public_key: string;
  counter: number;
  name: string;
  created_at: number;
};
function cookie(request: Request) {
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1) ?? ""
  );
}
export async function passkeySession(
  env: Env,
  request: Request,
): Promise<boolean> {
  const value = cookie(request);
  if (!/^[a-f0-9]{64}$/.test(value)) return false;
  return Boolean(
    await env.DB.prepare(
      "SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?",
    )
      .bind(await hash(value), Date.now())
      .first(),
  );
}
const randomToken = () =>
  [...crypto.getRandomValues(new Uint8Array(32))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
async function challenge(env: Env, kind: string, value: string) {
  await env.DB.prepare("DELETE FROM passkey_challenges WHERE expires_at <= ?")
    .bind(Date.now())
    .run();
  const id = randomToken();
  await env.DB.prepare(
    "INSERT INTO passkey_challenges (id, kind, challenge, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(id, kind, value, Date.now() + 120000)
    .run();
  return id;
}
async function consume(env: Env, id: unknown, kind: string) {
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) return null;
  return env.DB.prepare(
    "DELETE FROM passkey_challenges WHERE id = ? AND kind = ? AND expires_at > ? RETURNING challenge",
  )
    .bind(id, kind, Date.now())
    .first<{ challenge: string }>();
}

export async function handlePasskeys(
  request: Request,
  env: Env,
  body: Record<string, unknown>,
  authorized: boolean,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const origin = env.PASSKEY_ORIGIN || "https://licenses.ivanbuonocore.dev";
  const rpID = new URL(origin).hostname;
  if (request.method !== "POST")
    return json({ message: "Metodo non consentito." }, 405);
  if (request.headers.get("Origin") !== origin)
    return json({ message: "Origine non consentita." }, 403);
  if (path.startsWith("/admin/passkeys/") && !authorized)
    return json(
      {
        message: "Accesso amministratore richiesto per registrare una passkey.",
      },
      401,
    );
  if (path === "/auth/session")
    return json({
      authenticated: await passkeySession(env, request),
      tokenLoginEnabled: Boolean(env.ADMIN_TOKEN),
      passkeyConfigured: Boolean(
        await env.DB.prepare("SELECT id FROM admin_passkeys LIMIT 1").first(),
      ),
    });
  if (path === "/auth/logout") {
    if (cookie(request))
      await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?")
        .bind(await hash(cookie(request)))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": `${COOKIE}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
    });
  }
  if (path === "/admin/passkeys/register/options") {
    const existing =
      (
        await env.DB.prepare("SELECT id FROM admin_passkeys").all<{
          id: string;
        }>()
      ).results ?? [];
    const options = await generateRegistrationOptions({
      rpName: "Licenses",
      rpID,
      userID: new TextEncoder().encode("licenses-administrator"),
      userName: "Amministratore Licenses",
      attestationType: "none",
      excludeCredentials: existing.map((key) => ({ id: key.id })),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
      supportedAlgorithmIDs: [-7, -257],
    });
    return json({
      options,
      challengeId: await challenge(env, "register", options.challenge),
    });
  }
  if (path === "/auth/login/options") {
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
    });
    return json({
      options,
      challengeId: await challenge(env, "login", options.challenge),
    });
  }
  try {
    if (path === "/admin/passkeys/register/verify") {
      const pending = await consume(env, body.challengeId, "register");
      if (!pending)
        return json(
          {
            message:
              "Richiesta scaduta o già usata. Ricominciare la registrazione.",
          },
          400,
        );
      const verified = await verifyRegistrationResponse({
        response: body.response as RegistrationResponseJSON,
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
      if (!verified.verified || !verified.registrationInfo)
        return json({ message: "Passkey non verificata." }, 400);
      const key = verified.registrationInfo.credential;
      const name =
        typeof body.name === "string"
          ? body.name.trim().slice(0, 100)
          : "Passkey amministratore";
      await env.DB.prepare(
        "INSERT INTO admin_passkeys (id, public_key, counter, name, created_at) VALUES (?, ?, ?, ?, ?)",
      )
        .bind(
          key.id,
          base64UrlEncode(key.publicKey),
          key.counter,
          name || "Passkey amministratore",
          Date.now(),
        )
        .run();
      return json({
        ok: true,
        message: "Passkey registrata. Puoi usarla per accedere a Licenses.",
      });
    }
    if (path === "/auth/login/verify") {
      const pending = await consume(env, body.challengeId, "login");
      if (!pending)
        return json(
          { message: "Richiesta scaduta o già usata. Riprovare l'accesso." },
          400,
        );
      const response = body.response as AuthenticationResponseJSON;
      if (typeof response?.id !== "string")
        return json({ message: "Risposta passkey non valida." }, 400);
      const key = await env.DB.prepare(
        "SELECT * FROM admin_passkeys WHERE id = ?",
      )
        .bind(response.id)
        .first<Passkey>();
      if (!key) return json({ message: "Passkey non riconosciuta." }, 401);
      const verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: pending.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: key.id,
          publicKey: base64ToBytes(key.public_key),
          counter: key.counter,
        },
      });
      if (!verified.verified)
        return json({ message: "Passkey non verificata." }, 401);
      const changed = await env.DB.prepare(
        "UPDATE admin_passkeys SET counter = ? WHERE id = ? AND counter = ? RETURNING id",
      )
        .bind(verified.authenticationInfo.newCounter, key.id, key.counter)
        .first();
      if (!changed)
        return json(
          { message: "Richiesta concorrente. Riprovare l'accesso." },
          409,
        );
      await env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?")
        .bind(Date.now())
        .run();
      const session = randomToken();
      await env.DB.prepare(
        "INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)",
      )
        .bind(await hash(session), Date.now() + 8 * 3600000)
        .run();
      return json({ ok: true }, 200, {
        "Set-Cookie": `${COOKIE}=${session}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
      });
    }
  } catch {
    return json(
      { message: "Verifica passkey non riuscita. Riprovare dall'inizio." },
      400,
    );
  }
  return json({ message: "Operazione passkey non riconosciuta." }, 404);
}
