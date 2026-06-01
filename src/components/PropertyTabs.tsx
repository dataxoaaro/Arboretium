// Sub-navigation inside a property: Map (default) and Plants (list view).

import { NavLink, useParams } from "react-router-dom";

export function PropertyTabs() {
  const { propertyId } = useParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return (
    <nav className="flex gap-1 border-b border-black/10 px-2 py-1 text-sm">
      <Tab to={`/properties/${propertyId}`} end>
        Map
      </Tab>
      <Tab to={`/properties/${propertyId}/plants`}>Plants</Tab>
    </nav>
  );
}

function Tab({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `px-3 py-1.5 rounded-md ${
          isActive
            ? "bg-black/10 font-medium text-fg"
            : "text-fg/70 hover:bg-black/5 hover:text-fg"
        }`
      }
    >
      {children}
    </NavLink>
  );
}
