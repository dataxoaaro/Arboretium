// ARB-060: Backups page. The actual backup runs as a CLI script
// (`pnpm admin:backup` — see scripts/backup.mjs) because it needs filesystem
// access to dump D1 and copy R2's local state directory. The UI just
// displays current DB stats and instructions.

import { useEffect, useState } from "react";
import { adminApi, AdminApiError } from "./admin-api";
import type { AdminStats } from "./admin-types";

export function AdminBackups() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .stats()
      .then(setStats)
      .catch((err: unknown) =>
        setError(
          err instanceof AdminApiError ? err.message : "Failed to load stats",
        ),
      );
  }, []);

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-xl font-semibold mb-4">Backups</h1>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      <section className="mb-6">
        <h2 className="text-sm font-medium text-fg/70 mb-2">
          Current state (local D1)
        </h2>
        {!stats && <p className="text-sm text-fg/60">Loading…</p>}
        {stats && (
          <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Stat label="Users" value={stats.users} />
            <Stat label="Properties (active)" value={stats.properties_active} />
            <Stat
              label="Properties (archived)"
              value={stats.properties_archived}
            />
            <Stat label="Plants" value={stats.plants} />
            <Stat label="Photos" value={stats.photos} />
          </dl>
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-fg/70 mb-2">Run a backup</h2>
        <div className="border border-black/10 rounded-md p-4 bg-black/[0.02] text-sm space-y-3">
          <p>From the project root:</p>
          <pre className="bg-fg text-bg rounded-md p-3 text-xs font-mono overflow-x-auto">
            {`pnpm admin:backup`}
          </pre>
          <p className="text-fg/70 text-xs">
            Produces a timestamped folder under{" "}
            <code className="font-mono">backups/</code> containing:
          </p>
          <ul className="list-disc pl-5 text-xs text-fg/70 space-y-1">
            <li>
              <code className="font-mono">db.sql</code> — full local D1 dump
              (via <code className="font-mono">wrangler d1 export</code>).
            </li>
            <li>
              <code className="font-mono">r2/</code> — copy of the local R2
              bucket directory from{" "}
              <code className="font-mono">.wrangler/state/v3/r2/</code> (created
              once you upload your first photo).
            </li>
            <li>
              <code className="font-mono">manifest.json</code> — snapshot
              metadata (timestamp, file sizes, versions).
            </li>
          </ul>
          <p className="text-fg/60 text-[11px]">
            The <code className="font-mono">backups/</code> folder is
            git-ignored — copy it off-machine for real disaster recovery.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-black/10 rounded-md p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-fg/60 mt-1">{label}</div>
    </div>
  );
}
