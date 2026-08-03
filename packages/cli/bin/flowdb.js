#!/usr/bin/env node
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const entry = path.resolve(__dirname, "../src/index.ts");

// Bun is required for this monorepo (see engines in package.json).
// Bun natively runs TypeScript so we spawn it directly — no tsx needed.
const child = spawn("bun", [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
