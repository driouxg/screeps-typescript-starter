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
    return execSync(`git ${args}`, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
  } catch {
    return ""
  }
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit" })
  if (res.error) throw res.error
  if (res.status !== 0) process.exit(res.status ?? 1)
}

console.log("Building bench image (cached after the first run)...")
run("docker", ["build", "-q", "-t", IMAGE, __dirname])

// `--movement-test`: run movement-scenarios.js against bench/build/movement.js (see `npm run test-movement`).
if (process.argv[2] === "--movement-test") {
  run("docker", [
    "run",
    "--rm",
    "-v",
    `${path.join(__dirname, "build")}:/bench/build:ro`,
    "--entrypoint",
    "node",
    IMAGE,
    "movement-scenarios.js"
  ])
  process.exit(0)
}

// `--layout-test [args]`: run layout-test.js against bench/build/planner.js (see `npm run test-layout`).
if (process.argv[2] === "--layout-test") {
  fs.mkdirSync(RESULTS, { recursive: true })
  run("docker", [
    "run",
    "--rm",
    "-v",
    `${path.join(__dirname, "build")}:/bench/build:ro`,
    "-v",
    `${RESULTS}:/bench/results`,
    "--entrypoint",
    "node",
    IMAGE,
    "layout-test.js",
    ...process.argv.slice(3)
  ])
  process.exit(0)
}

const commit = git("rev-parse --short HEAD")
const dirty = git("status --porcelain -- src") !== ""
const args = process.argv.slice(2)
// `--bot-dist <dir>`: run another bot's built code (a folder with main.js and any other modules) instead of dist/.
const botDistAt = args.indexOf("--bot-dist")
const dist = botDistAt < 0 ? path.join(ROOT, "dist") : path.resolve(args.splice(botDistAt, 2)[1])
const env = [`BENCH_COMMIT=${commit}`, `BENCH_DIRTY=${dirty ? 1 : 0}`]
if (!args.includes("--label")) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  env.push(`BENCH_LABEL=${commit || "nogit"}${dirty ? "-dirty" : ""}_${stamp}`)
}

fs.mkdirSync(RESULTS, { recursive: true })

run("docker", [
  "run",
  "--rm",
  "-v",
  `${dist}:/bench/dist:ro`,
  "-v",
  `${RESULTS}:/bench/results`,
  ...env.flatMap(e => ["-e", e]),
  IMAGE,
  ...args
])
