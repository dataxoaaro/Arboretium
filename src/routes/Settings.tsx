import { type FormEvent, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/use-auth";
import { Button } from "../components/ui/Button";
import { t } from "../lib/strings";

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
    } catch {
      setError(t.settingsChangeFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-sm space-y-6">
      <header>
        <h1 className="text-3xl font-semibold mb-1 font-[family-name:var(--font-display)]">
          {t.settingsTitle}
        </h1>
        {user && (
          <p className="text-sm text-fg/70">
            {t.settingsSignedInAs}{" "}
            <span className="font-medium">{user.email}</span>
          </p>
        )}
      </header>

      <div>
        <h2 className="font-medium mb-2">{t.settingsChangePassword}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-sm text-fg/70">
              {t.settingsCurrentPassword}
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
            />
          </label>
          <label className="block">
            <span className="text-sm text-fg/70">{t.settingsNewPassword}</span>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
            />
          </label>
          {error && (
            <p className="text-sm text-[var(--color-danger)]">{error}</p>
          )}
          {success && (
            <p className="text-sm text-[var(--color-accent)]">
              {t.settingsUpdated}
            </p>
          )}
          <Button type="submit" disabled={submitting}>
            {submitting ? t.saving : t.settingsUpdate}
          </Button>
        </form>
      </div>

      <div>
        <h2 className="font-medium mb-2">{t.settingsSession}</h2>
        <Button variant="secondary" onClick={() => void logout()}>
          {t.signOut}
        </Button>
      </div>
    </section>
  );
}
