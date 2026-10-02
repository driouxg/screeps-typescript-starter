import { NextResponse } from "next/server"
import { SESSION_COOKIE } from "@/lib/session"

export const dynamic = "force-dynamic"

/** Sign out: drop the session cookie and go back to the login page. */
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303)
  response.cookies.delete(SESSION_COOKIE)
  return response
}
