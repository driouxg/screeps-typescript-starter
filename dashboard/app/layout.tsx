import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Screeps dashboard",
  description: "State, plans and controls of the bot"
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
