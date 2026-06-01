#!/usr/bin/env node
// ARB-060: Local backup of D1 + R2 state.
//
// Produces a timestamped folder under ./backups/ containing:
//   db.sql        — output of `wrangler d1 export DB --local`
//   r2/           — copy of the local R2 bucket directory tree (if any)
//   manifest.json — snapshot metadata
//
// Run with: pnpm admin:backup

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function ts() {
  // ISO without colons or fractional seconds — safe for filenames.
  return new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "Z");
}

function dirSize(path) {
  let total = 0;
  let entries;
  try {
    entries = readdirSync(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

const stamp = ts();
const outDir = join(repoRoot, "backups", stamp);
mkdirSync(outDir, { recursive: true });

console.log(`[backup] writing snapshot → ${outDir}`);

// 1) D1 dump via wrangler. Uses local SQLite file under .wrangler/state.
// We invoke through `pnpm exec wrangler` so it picks up the project's local
// wrangler, not the package.json `wrangler` script (which would run `dev`).
const dbOut = join(outDir, "db.sql");
console.log("[backup] dumping D1 (DB)...");
const d1 = spawnSync(
  "pnpm",
  ["exec", "wrangler", "d1", "export", "DB", "--local", "--output", dbOut],
  { cwd: repoRoot, stdio: "inherit" },
);
if (d1.status !== 0) {
  console.error("[backup] wrangler d1 export failed");
  process.exit(d1.status ?? 1);
}

// 2) R2 — wrangler stores local R2 objects under .wrangler/state/v3/r2/<bucket>/.
// We copy the whole r2/ tree so any bucket(s) are captured.
const r2State = join(repoRoot, ".wrangler", "state", "v3", "r2");
const r2Out = join(outDir, "r2");
let r2Bytes = 0;
if (existsSync(r2State)) {
  console.log(`[backup] copying R2 state from ${r2State}`);
  cpSync(r2State, r2Out, { recursive: true });
  r2Bytes = dirSize(r2Out);
} else {
  console.log(
    "[backup] no local R2 state yet — skipping (upload a photo first)",
  );
}

// 3) Manifest.
const manifest = {
  created_at: new Date().toISOString(),
  repo_root: repoRoot,
  files: {
    "db.sql": existsSync(dbOut) ? statSync(dbOut).size : 0,
    "r2/": r2Bytes,
  },
  versions: {
    node: process.version,
  },
};
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(
  `[backup] done · ${humanBytes(manifest.files["db.sql"])} db, ${humanBytes(r2Bytes)} r2`,
);
console.log(`[backup] folder: ${outDir}`);

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
