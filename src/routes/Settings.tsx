import { type FormEvent, useState } from "react";
import { api, ApiCallError } from "../lib/api";
import { useAuth } from "../lib/use-auth";
import { Button } from "../components/ui/Button";

export function Settings() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setSuccess(true);
    } catch (err) {
      const msg =
        err instanceof ApiCallError ? err.message : "Failed to change password";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-sm space-y-6">
      <header>
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        {user && (
          <p className="text-sm text-fg/70">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        )}
      </header>

      <div>
        <h2 className="font-medium mb-2">Change password</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm text-fg/70">Current password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded border border-black/15 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm text-fg/70">New password (≥10 chars)</span>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded border border-black/15 px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          {success && (
            <p className="text-sm text-green-700">Password updated.</p>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Update password"}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="font-medium mb-2">Session</h2>
        <Button variant="secondary" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}
