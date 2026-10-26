import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import {
  loadLocalSettings,
  parseSettings,
  storageKeys,
  writeJson,
  type PersistedSettings,
} from "../lib/storage";

type SettingsUpdate =
  | Partial<PersistedSettings>
  | ((current: PersistedSettings) => Partial<PersistedSettings>);

/**
 * User preferences, applied to the document and saved on every change to
 * localStorage (instant startup) and the backend settings file (durable).
 */
export function useSettings() {
  const [settings, setSettings] =
    useState<PersistedSettings>(loadLocalSettings);
  const [hasLoadedFile, setHasLoadedFile] = useState(false);

  const updateSettings = useCallback((update: SettingsUpdate) => {
    setSettings((current) => ({
      ...current,
      ...(typeof update === "function" ? update(current) : update),
    }));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.motion = settings.motion;
  }, [settings.theme, settings.motion]);

  useEffect(() => {
    api
      .loadSettings()
      .then((saved) => updateSettings(parseSettings(saved)))
      .catch(() => {
        // Not running in the desktop app; localStorage still applies.
      })
      .finally(() => setHasLoadedFile(true));
  }, [updateSettings]);

  useEffect(() => {
    writeJson(storageKeys.settings, settings);
    // Wait for the file to load so defaults don't overwrite it.
    if (!hasLoadedFile) return;
    const timer = window.setTimeout(() => {
      api.saveSettings(settings).catch(() => {});
    }, 300);
    return () => window.clearTimeout(timer);
  }, [hasLoadedFile, settings]);

  return { settings, updateSettings };
}
