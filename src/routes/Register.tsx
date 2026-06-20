import { type FormEvent, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, ApiCallError } from "../lib/api";
import { useAuth } from "../lib/use-auth";
import { Button } from "../components/ui/Button";

export function Register() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
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
        display_name: displayName,
        site_password: sitePassword,
      });
      setUser(user);
      navigate("/properties", { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiCallError ? err.message : "Registration failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-sm">
      <h1 className="text-3xl font-semibold mb-1 font-[family-name:var(--font-display)]">
        Register
      </h1>
      <p className="text-sm text-fg/70 mb-4">
        Ask the admin for the site password if you don't have it.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block">
          <span className="text-sm text-fg/70">Email</span>
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
          <span className="text-sm text-fg/70">Display name</span>
          <input
            type="text"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          />
        </label>
        <label className="block">
          <span className="text-sm text-fg/70">Password (≥10 chars)</span>
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
          <span className="text-sm text-fg/70">Site password</span>
          <input
            type="password"
            required
            value={sitePassword}
            onChange={(e) => setSitePassword(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3"
          />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="text-sm text-fg/70 mt-4">
        Already have an account?{" "}
        <Link to="/login" className="underline">
          Sign in
        </Link>
      </p>
    </section>
  );
}
