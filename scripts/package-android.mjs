#!/usr/bin/env node
/**
 * Builds public/ogc-android.xpi : zip of `extension/` with
 * `manifest.android.json` used as the active manifest (renamed to
 * `manifest.json` inside the archive). Other files are untouched.
 *
 * Used to ship a Firefox-Android-compatible variant alongside the
 * desktop `ogc.xpi`. Signing for stable Fenix requires AMO submission
 * (manual, out of scope here) — the produced `.xpi` is installable on
 * Firefox Nightly via the "custom add-on collection" flow.
 */
import { execSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, copyFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC  = resolve(ROOT, "extension");
const OUT  = resolve(ROOT, "public/ogc-android.xpi");

const work = mkdtempSync(join(tmpdir(), "ogc-android-"));
try {
  // Copy the whole extension tree
  cpSync(SRC, work, { recursive: true });
  // Swap the manifest
  const androidManifest = join(work, "manifest.android.json");
  const desktopManifest = join(work, "manifest.json");
  if (!existsSync(androidManifest)) {
    throw new Error("manifest.android.json missing in extension/");
  }
  copyFileSync(androidManifest, desktopManifest);
  unlinkSync(androidManifest);

  // Build the .xpi (a regular zip with .xpi extension)
  if (existsSync(OUT)) unlinkSync(OUT);
  execSync(`zip -qr "${OUT}" .`, { cwd: work, stdio: "inherit" });
  console.log(`[android] wrote ${OUT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}