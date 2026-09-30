"use strict"

// Bundles the base planner for the layout test: `npm run test-layout`.
import commonjs from "@rollup/plugin-commonjs"
import resolve from "@rollup/plugin-node-resolve"
import typescript from "rollup-plugin-typescript2"

export default {
  input: "bench/planner/entry.ts",
  output: { file: "bench/build/planner.js", format: "cjs" },
  plugins: [
    resolve({ rootDir: "src" }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json", include: ["**/*.ts"], exclude: [] })
  ]
}
