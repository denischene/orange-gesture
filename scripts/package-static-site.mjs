#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const client = resolve(root, "dist/client");
const output = resolve(root, "public/ogc-site-static.zip");
if (!existsSync(resolve(client, "index.html"))) {
  throw new Error("Le site statique n’existe pas encore. Lancez d’abord npm run build.");
}
mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });
execFileSync("zip", ["-qr", output, "."], { cwd: client, stdio: "inherit" });
console.log(`[site] wrote ${output}`);
