// Shared basemap toggle used by both AdminMap and the property MapView.
// Three options: Street, Sat (MML), Sat (Esri). Defaults are decided by the
// parent — this component is purely presentational.
//
// `fellBack` (set by the worker when MML was requested but no key is
// configured) shows a small amber hint pointing the user at the README.

import type { BasemapLayer } from "@/lib/api-map";

interface BasemapToggleProps {
  value: BasemapLayer;
  onChange: (next: BasemapLayer) => void;
  fellBack?: boolean;
}

const OPTIONS: ReadonlyArray<{
  id: BasemapLayer;
  label: string;
  title: string;
}> = [
  { id: "street", label: "Street", title: "Topographic / street tiles" },
  {
    id: "satellite-mml",
    label: "Sat (MML)",
    title: "MML ortokuva — high-res Finland, capped at z=18 (~60 cm)",
  },
  {
    id: "satellite-esri",
    label: "Sat (Esri)",
    title: "Esri World Imagery — global, can be sharper past z=18",
  },
];

export function BasemapToggle({
  value,
  onChange,
  fellBack,
}: BasemapToggleProps) {
  return (
    <div className="bg-white/95 border border-black/10 rounded shadow flex text-xs">
      {OPTIONS.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => onChange(b.id)}
          title={b.title}
          className={`px-3 py-2 ${
            b.id === value ? "bg-black/10 font-medium" : "hover:bg-black/5"
          }`}
        >
          {b.label}
          {b.id === "satellite-mml" && fellBack && (
            <span
              aria-label="Falling back to Esri"
              title="MML key not configured — falling back to Esri. See README."
              className="ml-1 text-amber-600"
            >
              !
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
