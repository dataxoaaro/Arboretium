// Shared basemap toggle used by both AdminMap and the property MapView.
// Three options: Street, Sat (MML), Sat (Esri). Defaults are decided by the
// parent — this component is purely presentational.
//
// `fellBack` (set by the worker when MML was requested but no key is
// configured) shows a small amber hint pointing the user at the README.

import type { BasemapLayer } from "@/lib/api-map";
import { t } from "@/lib/strings";

interface BasemapToggleProps {
  value: BasemapLayer;
  onChange: (next: BasemapLayer) => void;
  fellBack?: boolean;
}

const OPTIONS: ReadonlyArray<{
  id: BasemapLayer;
  label: string;
}> = [
  { id: "street", label: t.basemapStreet },
  { id: "satellite-mml", label: t.basemapSatMml },
  { id: "satellite-esri", label: t.basemapSatEsri },
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
          className={`min-h-11 px-4 ${
            b.id === value ? "bg-black/10 font-medium" : "hover:bg-black/5"
          }`}
        >
          {b.label}
          {b.id === "satellite-mml" && fellBack && (
            <span
              aria-label={t.basemapFellBack}
              title={t.basemapFellBack}
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
