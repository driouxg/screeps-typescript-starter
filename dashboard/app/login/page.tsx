import type { Metadata } from "next"

export const metadata: Metadata = { title: "Sign in · Screeps dashboard" }

/**
 * The sign-in form. A plain HTML form posting to /api/login, with the standard autocomplete names, so password
 * managers recognise it, fill both fields and can submit it themselves. It works without JavaScript.
 */
export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next, error } = await searchParams
  return (
    <main className="login">
      <form className="panel login-form" method="post" action="/api/login">
        <h1>Screeps dashboard</h1>
        {error && (
          <p className="error" role="alert">
            Wrong username or password.
          </p>
        )}
        <label htmlFor="username">Username</label>
        <input id="username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        {next && <input type="hidden" name="next" value={next} />}
        <button className="button primary" type="submit">
          Sign in
        </button>
      </form>
    </main>
  )
}
