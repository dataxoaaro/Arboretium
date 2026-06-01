// ARB-056 + ARB-057 + ARB-058: Users list, hard-delete (cascades via SQL),
// and password-reset link generation. Mounted at /admin/users.
//
// Reset link is shown once; the worker only stores sha256(token).

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { adminApi, AdminApiError } from "./admin-api";
import type { ResetLinkResult, UserRow } from "./admin-types";

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{
    user: UserRow;
    token: string;
    expires_at: number;
  } | null>(null);

  // The reset row's "issued_by" needs *some* user id. The first user is a
  // sensible default in single-admin local dev; a multi-admin deployment
  // should bind this to the signed-in user instead.
  const issuerId = useMemo(() => users?.[0]?.id ?? null, [users]);

  async function load() {
    try {
      setError(null);
      setUsers(await adminApi.listUsers());
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load users",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(u: UserRow) {
    if (
      !confirm(
        `Permanently delete ${u.display_name} (${u.email})?\n\n` +
          `This cascades to ${u.membership_count} membership(s) and any plants/photos they own.`,
      )
    )
      return;
    setBusyId(u.id);
    try {
      await adminApi.deleteUser(u.id);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function generateLink(u: UserRow) {
    if (!issuerId) {
      setError("No issuer user available — register a user first.");
      return;
    }
    setBusyId(u.id);
    try {
      const res: ResetLinkResult = await adminApi.generateResetLink(
        u.id,
        issuerId,
      );
      setResetLink({ user: u, token: res.token, expires_at: res.expires_at });
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Reset link failed",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-xl font-semibold mb-4">Users</h1>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-800 rounded-md px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {resetLink && (
        <ResetLinkBanner
          user={resetLink.user}
          token={resetLink.token}
          expiresAt={resetLink.expires_at}
          onClose={() => setResetLink(null)}
        />
      )}

      {!users && <p className="text-sm text-fg/60">Loading…</p>}

      {users && users.length === 0 && (
        <div className="border border-dashed border-black/15 rounded-md p-4 text-sm text-fg/60">
          No users yet.{" "}
          <Link className="underline" to="/register">
            Register one
          </Link>{" "}
          or run <code className="font-mono text-xs">pnpm seed</code> to create
          the dev <code>admin@local</code> account.
        </div>
      )}

      {users && users.length > 0 && (
        <div className="overflow-x-auto border border-black/10 rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.03] text-left text-xs uppercase text-fg/60">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Memberships</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-t border-black/5 ${
                    busyId === u.id ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.display_name}</div>
                    <div className="text-[11px] text-fg/50 font-mono">
                      {u.id}
                    </div>
                  </td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">{u.membership_count}</td>
                  <td className="px-3 py-2 text-xs text-fg/70">
                    {new Date(u.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-3 text-xs">
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => void generateLink(u)}
                        className="text-fg/80 hover:text-fg underline disabled:opacity-50"
                      >
                        Reset link
                      </button>
                      <button
                        type="button"
                        disabled={busyId === u.id}
                        onClick={() => void remove(u)}
                        className="text-red-700 hover:text-red-900 underline disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResetLinkBanner({
  user,
  token,
  expiresAt,
  onClose,
}: {
  user: UserRow;
  token: string;
  expiresAt: number;
  onClose: () => void;
}) {
  // Same-origin URL now that admin lives in the SPA.
  const url = `${window.location.origin}/reset/${token}`;
  const expiresHuman = new Date(expiresAt).toLocaleString();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mb-4 border border-amber-200 bg-amber-50 rounded-md p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-amber-900">
            Reset link for {user.display_name} ({user.email})
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            Shown once — copy it now. Expires {expiresHuman}.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-amber-900 hover:text-amber-700 text-xs underline"
        >
          Dismiss
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 border border-amber-300 rounded-md px-2 py-1.5 text-xs font-mono bg-white"
        />
        <button
          type="button"
          onClick={() => void copy()}
          className="px-3 py-1.5 rounded-md bg-amber-900 text-white text-xs hover:opacity-90"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
