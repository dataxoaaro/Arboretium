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
import { useAuth } from "./lib/use-auth";

export function App() {
  const { user, logout, loading } = useAuth();

  return (
    <div className="min-h-full">
      <header className="border-b border-black/10 px-4 py-3 flex items-center gap-4">
        <Link to="/" className="font-semibold">
          Arboretum
        </Link>
        <nav className="flex gap-3 text-sm flex-1">
          {user && (
            <>
              <Link to="/properties" className="text-fg/70 hover:text-fg">
                Properties
              </Link>
              <Link to="/admin" className="text-fg/70 hover:text-fg">
                Admin
              </Link>
              <Link to="/settings" className="text-fg/70 hover:text-fg">
                Settings
              </Link>
            </>
          )}
        </nav>
        {!loading && user && (
          <Routes>
            <Route
              path="/properties/:propertyId/*"
              element={<PropertySwitcher />}
            />
            <Route path="*" element={null} />
          </Routes>
        )}
        {!loading && (
          <div className="text-sm text-fg/70">
            {user ? (
              <span className="flex items-center gap-3">
                <span>{user.display_name}</span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="underline"
                >
                  Sign out
                </button>
              </span>
            ) : (
              <span className="flex gap-3">
                <Link to="/login" className="hover:text-fg">
                  Sign in
                </Link>
                <Link to="/register" className="hover:text-fg">
                  Register
                </Link>
              </span>
            )}
          </div>
        )}
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
