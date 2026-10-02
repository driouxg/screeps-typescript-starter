/**
 * Dashboard sign-in: the login page (app/login) checks DASHBOARD_USERNAME / DASHBOARD_PASSWORD and hands out a session
 * cookie, which middleware.ts checks on every request.
 *
 * The cookie is `<expiry>.<HMAC-SHA256 of the expiry>`, signed with DASHBOARD_SESSION_SECRET (or the password if
 * that's not set, so changing the password signs everyone out). Nothing is stored on the server, which suits
 * serverless hosting. Web Crypto only, so it runs in the middleware's edge runtime as well as in route handlers.
 */

export const SESSION_COOKIE = "dashboard_session"
/** How long a sign-in lasts. */
export const SESSION_SECONDS = 30 * 24 * 60 * 60

export interface AuthConfig {
  username: string | null
  password: string
  secret: string
}

/**
 * The credentials from the environment. Null without DASHBOARD_PASSWORD: the app is then open in development, and
 * locked in production so a deployment that forgot to set it isn't left wide open.
 */
export function authConfig(): AuthConfig | null {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) return null
  return {
    username: process.env.DASHBOARD_USERNAME || null,
    password,
    secret: process.env.DASHBOARD_SESSION_SECRET || password
  }
}

export function checkCredentials(config: AuthConfig, username: string, password: string): boolean {
  // Both are compared, whatever the first gives, so timing doesn't tell which was wrong.
  const userOk = config.username === null || safeEqual(username, config.username)
  const passwordOk = safeEqual(password, config.password)
  return userOk && passwordOk
}

export async function createSession(config: AuthConfig): Promise<string> {
  const expires = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS)
  return `${expires}.${await sign(config.secret, expires)}`
}

export async function verifySession(config: AuthConfig, cookie: string | undefined): Promise<boolean> {
  if (!cookie) return false
  const [expires, signature] = cookie.split(".")
  if (!expires || !signature || !/^\d+$/.test(expires)) return false
  if (Number(expires) < Date.now() / 1000) return false
  return safeEqual(signature, await sign(config.secret, expires))
}

/** Where to go after signing in: only paths on this site, so the login page can't be used to redirect elsewhere. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/"
}

async function sign(secret: string, value: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)))
  return Array.from(signature, b => b.toString(16).padStart(2, "0")).join("")
}

/** Compares in time independent of where the strings differ, so a secret can't be guessed a character at a time. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
