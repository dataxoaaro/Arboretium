import { type FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/use-auth";
import { Button } from "../components/ui/Button";
import { t } from "../lib/strings";

export function Register() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sitePassword, setSitePassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const user = await api.register({
        email,
        password,
        site_password: sitePassword,
      });
      setUser(user);
      navigate("/properties", { replace: true });
    } catch {
      setError(t.registerFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-sm">
      <h1 className="text-3xl font-semibold mb-1 font-[family-name:var(--font-display)]">
        {t.registerTitle}
      </h1>
      <p className="text-sm text-fg/70 mb-4">{t.registerIntro}</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-fg/70">{t.email}</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          />
        </label>
        <label className="block">
          <span className="text-sm text-fg/70">{t.passwordWithRule}</span>
          <input
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          />
        </label>
        <label className="block">
          <span className="text-sm text-fg/70">{t.sitePassword}</span>
          <input
            type="password"
            required
            value={sitePassword}
            onChange={(e) => setSitePassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          />
        </label>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? t.registerSubmitting : t.registerSubmit}
        </Button>
      </form>
      <p className="text-sm text-fg/70 mt-4">
        {t.registerHaveAccount}{" "}
        <Link to="/login" className="underline">
          {t.registerSignInLink}
        </Link>
      </p>
    </section>
  );
}
