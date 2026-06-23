import { Routes, Route, Link, Navigate } from "react-router-dom";
import { Home } from "./routes/Home";
import { Login } from "./routes/Login";
import { Register } from "./routes/Register";
import { ResetPassword } from "./routes/ResetPassword";
import { Properties } from "./routes/Properties";
import { PropertyLayout } from "./routes/PropertyLayout";
import { PropertyMap } from "./routes/PropertyMap";
import { PropertyPlants } from "./routes/PropertyPlants";
import { Settings } from "./routes/Settings";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminProperties } from "./admin/AdminProperties";
import { AdminPropertyForm } from "./admin/AdminPropertyForm";
import { AdminUsers } from "./admin/AdminUsers";
import { AdminBackups } from "./admin/AdminBackups";
import { AuthGuard } from "./components/AuthGuard";
import { PropertySwitcher } from "./components/PropertySwitcher";
import { HeaderMenu } from "./components/HeaderMenu";
import { OfflineBanner } from "./components/OfflineBanner";
import { useAuth } from "./lib/use-auth";
import { t } from "./lib/strings";

export function App() {
  const { user, logout, loading } = useAuth();

  return (
    <div className="min-h-full">
      <OfflineBanner />
      <header className="h-14 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 flex items-center gap-3">
        <div className="flex items-baseline gap-1.5 shrink-0">
          <Link
            to={user ? "/properties" : "/"}
            className="text-xl font-semibold text-[var(--color-accent)] font-[family-name:var(--font-display)]"
          >
            {t.brand}
          </Link>
          <span
            className="font-mono text-[11px] leading-none text-fg/50"
            title={`${__APP_VERSION__} · ${__BUILD_TIME__}`}
          >
            {__APP_VERSION__}
          </span>
        </div>
        {!loading && user && (
          <Routes>
            <Route
              path="/properties/:propertyId/*"
              element={<PropertySwitcher />}
            />
            <Route path="*" element={null} />
          </Routes>
        )}
        <div className="flex-1" />
        {!loading &&
          (user ? (
            <HeaderMenu user={user} logout={() => void logout()} />
          ) : (
            <nav className="flex items-center gap-2">
              <Link
                to="/login"
                className="min-h-11 px-3 inline-flex items-center rounded-xl hover:bg-black/5"
              >
                {t.navSignIn}
              </Link>
              <Link
                to="/register"
                className="min-h-11 px-4 inline-flex items-center rounded-xl bg-[var(--color-accent)] text-white font-medium"
              >
                {t.navRegister}
              </Link>
            </nav>
          ))}
      </header>
      <Routes>
        {/* Admin routes get the rail layout (no main padding). */}
        <Route
          path="/admin"
          element={
            <AuthGuard>
              <AdminLayout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="properties" replace />} />
          <Route path="properties" element={<AdminProperties />} />
          <Route
            path="properties/new"
            element={<AdminPropertyForm mode="create" />}
          />
          <Route
            path="properties/:id/edit"
            element={<AdminPropertyForm mode="edit" />}
          />
          <Route path="users" element={<AdminUsers />} />
          <Route path="backups" element={<AdminBackups />} />
        </Route>

        {/* Everything else uses the standard padded main area. */}
        <Route
          path="*"
          element={
            <main className="p-4">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/reset/:token" element={<ResetPassword />} />
                <Route
                  path="/properties"
                  element={
                    <AuthGuard>
                      <Properties />
                    </AuthGuard>
                  }
                />
                <Route
                  path="/properties/:propertyId"
                  element={
                    <AuthGuard>
                      <PropertyLayout />
                    </AuthGuard>
                  }
                >
                  <Route index element={<PropertyMap />} />
                  <Route path="plants" element={<PropertyPlants />} />
                </Route>
                <Route
                  path="/settings"
                  element={
                    <AuthGuard>
                      <Settings />
                    </AuthGuard>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          }
        />
      </Routes>
    </div>
  );
}
