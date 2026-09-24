#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidates = [resolve(root, "dist/client"), resolve(root, ".output/public")];
const client = candidates.find((dir) => existsSync(resolve(dir, "index.html")));
const output = resolve(root, "public/ogc-site-static.zip");
if (!client) {
  throw new Error("Le site statique n’existe pas encore. Lancez d’abord npm run build.");
}
mkdirSync(dirname(output), { recursive: true });
rmSync(output, { force: true });
execFileSync("zip", ["-qr", output, "."], { cwd: client, stdio: "inherit" });
console.log(`[site] wrote ${output}`);
