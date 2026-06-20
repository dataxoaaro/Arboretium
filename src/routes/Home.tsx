import { Link } from "react-router-dom";
import { useAuth } from "../lib/use-auth";
import { t } from "../lib/strings";

export function Home() {
  const { user } = useAuth();
  return (
    <section className="max-w-lg">
      <h1 className="text-3xl font-semibold mb-2 font-[family-name:var(--font-display)]">
        {t.brand}
      </h1>
      <p className="text-muted mb-6">{t.homeTagline}</p>
      <Link
        to={user ? "/properties" : "/login"}
        className="inline-flex items-center min-h-12 px-6 rounded-2xl bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-strong)]"
      >
        {user ? t.homeOpen : t.navSignIn}
      </Link>
    </section>
  );
}
