import { NextResponse } from "next/server"
import { authConfig, checkCredentials, createSession, safeNext, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/session"

export const dynamic = "force-dynamic"

/** A wrong password waits this long before answering, to slow down guessing. */
const FAILURE_DELAY_MS = 1000

/**
 * The login form's target (see app/login). A plain form post, so password managers see a normal sign-in: on success
 * it sets the session cookie and redirects to where the user was going, otherwise back to the form with an error.
 * Redirects are 303, so the browser follows them with a GET.
 */
export async function POST(request: Request) {
  const form = await request.formData()
  const username = String(form.get("username") ?? "")
  const password = String(form.get("password") ?? "")
  const next = safeNext(String(form.get("next") ?? ""))
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url), 303)

  const config = authConfig()
  if (!config) return to(next)

  if (!checkCredentials(config, username, password)) {
    await new Promise(resolve => setTimeout(resolve, FAILURE_DELAY_MS))
    const params = new URLSearchParams({ error: "1", ...(next !== "/" ? { next } : {}) })
    return to(`/login?${params}`)
  }

  const response = to(next)
  response.cookies.set(SESSION_COOKIE, await createSession(config), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS
  })
  return response
}
