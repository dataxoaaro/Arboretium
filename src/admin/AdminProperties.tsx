// ARB-052 + ARB-055: Properties list with active / archived sections and
// archive / restore actions. Mounted at /admin/properties.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "./admin-api";
import type { PropertyRow } from "./admin-types";
import { t } from "../lib/strings";

export function AdminProperties() {
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const data = await adminApi.listProperties();
      setRows(data);
    } catch {
      setError(t.adminLoadPropertiesFailed);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function archive(p: PropertyRow) {
    if (!confirm(t.adminArchiveConfirm(p.name))) return;
    setBusyId(p.id);
    try {
      await adminApi.archiveProperty(p.id);
      await load();
    } catch {
      setError(t.adminArchiveFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function restore(p: PropertyRow) {
    setBusyId(p.id);
    try {
      await adminApi.restoreProperty(p.id);
      await load();
    } catch {
      setError(t.adminRestoreFailed);
    } finally {
      setBusyId(null);
    }
  }

  const active = rows?.filter((r) => r.archived_at === null) ?? [];
  const archived = rows?.filter((r) => r.archived_at !== null) ?? [];

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">{t.adminNavProperties}</h1>
        <Link
          to="/admin/properties/new"
          className="rounded-md bg-fg text-bg px-3 py-2 text-sm font-medium hover:opacity-90"
        >
          {t.adminNewProperty}
        </Link>
      </div>
      {error && <Banner kind="error">{error}</Banner>}
      {!rows && <p className="text-sm text-fg/60">{t.loading}</p>}
      {rows && (
        <>
          <Section title={t.adminActive(active.length)}>
            {active.length === 0 ? (
              <Empty text={t.adminNoActive} />
            ) : (
              <Table
                rows={active}
                busyId={busyId}
                renderActions={(p) => (
                  <>
                    <Link
                      to={`/admin/properties/${p.id}/edit`}
                      className="text-fg/80 hover:text-fg underline"
                    >
                      {t.adminEdit}
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === p.id}
                      onClick={() => void archive(p)}
                      className="text-red-700 hover:text-red-900 underline disabled:opacity-50"
                    >
                      {t.adminArchiveAction}
                    </button>
                  </>
                )}
              />
            )}
          </Section>
          <Section title={t.adminArchived(archived.length)}>
            {archived.length === 0 ? (
              <Empty text={t.adminNoArchived} />
            ) : (
              <Table
                rows={archived}
                busyId={busyId}
                renderActions={(p) => (
                  <button
                    type="button"
                    disabled={busyId === p.id}
                    onClick={() => void restore(p)}
                    className="text-emerald-700 hover:text-emerald-900 underline disabled:opacity-50"
                  >
                    {t.adminRestoreAction}
                  </button>
                )}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-fg/70 mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Table({
  rows,
  busyId,
  renderActions,
}: {
  rows: PropertyRow[];
  busyId: string | null;
  renderActions: (row: PropertyRow) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto border border-black/10 rounded-md">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.03] text-left text-xs uppercase text-fg/60">
          <tr>
            <th className="px-3 py-2">{t.adminColName}</th>
            <th className="px-3 py-2">{t.adminColHexes}</th>
            <th className="px-3 py-2">{t.adminColCentre}</th>
            <th className="px-3 py-2">{t.adminColUpdated}</th>
            <th className="px-3 py-2 text-right">{t.adminColActions}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className={`border-t border-black/5 ${
                busyId === p.id ? "opacity-50" : ""
              }`}
            >
              <td className="px-3 py-2">
                <div className="font-medium">{p.name}</div>
                <div className="text-[11px] text-fg/50 font-mono">{p.id}</div>
              </td>
              <td className="px-3 py-2">{hexCount(p.included_hexes)}</td>
              <td className="px-3 py-2 text-xs text-fg/70">
                {p.center_lat != null && p.center_lng != null
                  ? `${p.center_lat.toFixed(4)}, ${p.center_lng.toFixed(4)}`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-fg/70">
                {new Date(p.updated_at).toLocaleString()}
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end gap-3 text-xs">
                  {renderActions(p)}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function hexCount(json: string): number {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-black/15 rounded-md p-4 text-sm text-fg/60">
      {text}
    </div>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "error" | "info";
  children: React.ReactNode;
}) {
  const cls =
    kind === "error"
      ? "bg-red-50 border-red-200 text-red-800"
      : "bg-blue-50 border-blue-200 text-blue-800";
  return (
    <div className={`mb-4 border rounded-md px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  );
}
