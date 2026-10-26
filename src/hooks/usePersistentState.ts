import { useEffect, useState } from "react";
import { readJson, writeJson } from "../lib/storage";

/** useState backed by a validated localStorage JSON entry. */
export function usePersistentState<T>(
  key: string,
  fallback: () => T,
  isValid: (value: unknown) => value is T,
) {
  const [value, setValue] = useState<T>(() => {
    const saved = readJson(key);
    return isValid(saved) ? saved : fallback();
  });

  useEffect(() => {
    writeJson(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
