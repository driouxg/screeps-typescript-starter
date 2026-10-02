import { NextRequest, NextResponse } from "next/server"
import { authConfig, SESSION_COOKIE, verifySession } from "@/lib/session"

/**
 * Sign-in for the whole app, pages and /api routes alike: anyone with the URL could otherwise read the bot's state
 * and change its controls. Without a valid session (see lib/session), pages go to the login page and API calls get
 * a 401. The login page and its form handler are the only ways in.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next()

  const config = authConfig()
  if (!config) {
    if (process.env.NODE_ENV !== "production") return NextResponse.next()
    return new NextResponse("DASHBOARD_PASSWORD is not set on the server.", { status: 503 })
  }

  if (await verifySession(config, request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()

  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Signed out: reload to sign in" }, { status: 401 })
  const login = new URL("/login", request.url)
  if (pathname !== "/") login.searchParams.set("next", pathname + search)
  return NextResponse.redirect(login)
}

export const config = {
  // Everything except Next's static build files, which hold no data.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}
