import { NextRequest, NextResponse } from "next/server"

/**
 * Password protection for the whole app, pages and /api routes alike: anyone with the URL could otherwise read the
 * bot's state and change its controls.
 *
 * HTTP Basic Auth against DASHBOARD_PASSWORD (any username; DASHBOARD_USERNAME too, if set). The browser asks once and
 * remembers it for the session. Without DASHBOARD_PASSWORD the app is open in development, but locked in production,
 * so a deployment that forgot to set it isn't left wide open.
 */
export function middleware(request: NextRequest): NextResponse {
  const password = process.env.DASHBOARD_PASSWORD
  if (!password) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next()
    return new NextResponse("DASHBOARD_PASSWORD is not set on the server.", { status: 503 })
  }

  const credentials = parseBasicAuth(request.headers.get("authorization"))
  const username = process.env.DASHBOARD_USERNAME
  if (
    credentials &&
    safeEqual(credentials.password, password) &&
    (!username || safeEqual(credentials.username, username))
  )
    return NextResponse.next()

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Screeps dashboard", charset="UTF-8"' }
  })
}

export const config = {
  // Everything except Next's static build files, which hold no data.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}

function parseBasicAuth(header: string | null): { username: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null
  try {
    const bytes = Uint8Array.from(atob(header.slice(6)), c => c.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    const colon = decoded.indexOf(":")
    if (colon < 0) return null
    return { username: decoded.slice(0, colon), password: decoded.slice(colon + 1) }
  } catch {
    return null
  }
}

/** Compares in time independent of where the strings differ, so the password can't be guessed a character at a time. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}
