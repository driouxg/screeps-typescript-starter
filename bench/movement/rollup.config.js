"use strict"

// Bundles the movement code for the movement scenarios: `npm run test-movement`.
import commonjs from "@rollup/plugin-commonjs"
import resolve from "@rollup/plugin-node-resolve"
import typescript from "rollup-plugin-typescript2"

export default {
  input: "bench/movement/entry.ts",
  output: { file: "bench/build/movement.js", format: "cjs" },
  plugins: [
    resolve({ rootDir: "src" }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json", include: ["**/*.ts"], exclude: [] })
  ]
}
