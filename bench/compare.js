/*
 * Compares ticks-to-milestone across bench runs. The first run is the baseline; later columns show the delta
 * (negative = reached sooner = faster).
 *
 *   npm run bench:compare                          # two most recent runs
 *   npm run bench:compare -- baseline candidate    # labels in bench/results, or paths to .json files
 */
const fs = require("fs")
const path = require("path")

const RESULTS = path.join(__dirname, "results")

function resolve(arg) {
  if (fs.existsSync(arg)) return arg
  const byLabel = path.join(RESULTS, arg.endsWith(".json") ? arg : `${arg}.json`)
  if (fs.existsSync(byLabel)) return byLabel
  throw new Error(`No result found for "${arg}"`)
}

function mostRecent(n) {
  if (!fs.existsSync(RESULTS)) return []
  return fs
    .readdirSync(RESULTS)
    .filter(f => f.endsWith(".json"))
    .map(f => path.join(RESULTS, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs)
    .slice(-n)
}

const files = process.argv.length > 2 ? process.argv.slice(2).map(resolve) : mostRecent(2)
if (files.length < 2) {
  console.error("Need at least two results to compare. Run `npm run bench` twice, or pass result labels/paths.")
  process.exit(1)
}

const runs = files.map(f => JSON.parse(fs.readFileSync(f, "utf8")))
const [base] = runs

// Milestones in the order the baseline reached them, then any only later runs reached.
const keys = [...new Set(runs.flatMap(r => Object.keys(r.milestones)))].sort(
  (a, b) => (base.milestones[a] ?? Infinity) - (base.milestones[b] ?? Infinity)
)

const COL = 24
const cell = s => String(s).padStart(COL)
const label = r => `${r.meta.label}`.slice(-COL + 1)

console.log("milestone".padEnd(22) + runs.map(r => cell(label(r))).join(""))
console.log("".padEnd(22) + runs.map(r => cell(`${r.meta.ticksRun} ticks run`)).join(""))

for (const key of keys) {
  const cols = runs.map((r, i) => {
    const tick = r.milestones[key]
    if (tick === undefined) return cell("—")
    if (i === 0 || base.milestones[key] === undefined) return cell(tick)
    const delta = tick - base.milestones[key]
    const pct = ((delta / base.milestones[key]) * 100).toFixed(1)
    return cell(`${tick} (${delta > 0 ? "+" : ""}${delta}, ${delta > 0 ? "+" : ""}${pct}%)`)
  })
  console.log(key.padEnd(22) + cols.join(""))
}

const avgCpu = r => r.samples.reduce((sum, s) => sum + s.cpuAvg, 0) / (r.samples.length || 1)
console.log("")
console.log("harvested total".padEnd(22) + runs.map(r => cell(r.harvested)).join(""))
for (const activity of ["spawn", "upgrade", "build", "repair"])
  console.log(`spent on ${activity}`.padEnd(22) + runs.map(r => cell(r.spent?.[activity] ?? "—")).join(""))
console.log("avg cpu/tick".padEnd(22) + runs.map(r => cell(avgCpu(r).toFixed(2))).join(""))
console.log("errors logged".padEnd(22) + runs.map(r => cell(r.errors.logged)).join(""))
