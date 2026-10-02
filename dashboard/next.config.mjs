import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The snapshot types live in the bot's source (../src/dashboard/snapshot.ts), outside this app.
  experimental: { externalDir: true },
  outputFileTracingRoot: path.join(here, ".."),
  webpack: config => {
    config.resolve.alias["@bot/snapshot"] = path.join(here, "../src/dashboard/snapshot.ts")
    return config
  }
}

export default nextConfig
