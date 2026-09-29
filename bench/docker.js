/*
 * Host-side launcher for `npm run bench`: builds the bench image (cached after the first run) and runs it with
 * dist/ and bench/results/ mounted. Any arguments are passed through to run.js, e.g.
 *
 *   npm run bench -- --ticks 30000 --until-rcl 4 --label extensions-first
 */
const { execSync, spawnSync } = require("child_process")
const fs = require("fs")
const path = require("path")

const ROOT = path.resolve(__dirname, "..")
const RESULTS = path.join(__dirname, "results")
const IMAGE = "screeps-bench"

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    return ""
  }
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit" })
  if (res.error) throw res.error
  if (res.status !== 0) process.exit(res.status ?? 1)
}

const commit = git("rev-parse --short HEAD")
const dirty = git("status --porcelain -- src") !== ""
const args = process.argv.slice(2)
const env = [`BENCH_COMMIT=${commit}`, `BENCH_DIRTY=${dirty ? 1 : 0}`]
if (!args.includes("--label")) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  env.push(`BENCH_LABEL=${commit || "nogit"}${dirty ? "-dirty" : ""}_${stamp}`)
}

fs.mkdirSync(RESULTS, { recursive: true })

console.log("Building bench image (cached after the first run)...")
run("docker", ["build", "-q", "-t", IMAGE, __dirname])

run("docker", [
  "run",
  "--rm",
  "-v",
  `${path.join(ROOT, "dist")}:/bench/dist:ro`,
  "-v",
  `${RESULTS}:/bench/results`,
  ...env.flatMap(e => ["-e", e]),
  IMAGE,
  ...args
])
