import { type FormEvent, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { t } from "../lib/strings";

export function ResetPassword() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.resetPassword({ token, new_password: newPassword });
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 2000);
    } catch {
      setError(t.resetFailed);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <section>
        <h1 className="text-xl font-semibold mb-2 font-[family-name:var(--font-display)]">
          {t.resetDoneTitle}
        </h1>
        <p className="text-sm">
          {t.resetDoneBody}{" "}
          <Link to="/login" className="underline">
            {t.login}
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="max-w-sm">
      <h1 className="text-3xl font-semibold mb-4 font-[family-name:var(--font-display)]">
        {t.resetTitle}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-fg/70">{t.resetNewPassword}</span>
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
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? t.resetSubmitting : t.resetSubmit}
        </Button>
      </form>
    </section>
  );
}
