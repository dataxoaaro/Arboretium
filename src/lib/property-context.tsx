// ARB-093: Context for the currently selected property. Set by PropertyLayout
// once the route param is resolved and the membership check has succeeded.
// Nested routes (map, plant list, settings) read from useCurrentProperty().

import { createContext, useContext } from "react";
import type { Property } from "./api";

export const CurrentPropertyContext = createContext<Property | null>(null);

export function useCurrentProperty(): Property {
  const p = useContext(CurrentPropertyContext);
  if (!p) {
    throw new Error(
      "useCurrentProperty must be used inside a <PropertyLayout> route",
    );
  }
  return p;
}
