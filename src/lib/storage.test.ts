import { afterEach, describe, expect, it } from "vitest";
import {
  defaultSettings,
  loadLocalSettings,
  loadSavedGroups,
  parseSettings,
  readPositiveNumber,
  storageKeys,
} from "./storage";

afterEach(() => window.localStorage.clear());

describe("parseSettings", () => {
  it("ignores non-object input", () => {
    expect(parseSettings(null)).toEqual({});
    expect(parseSettings("classic")).toEqual({});
  });

  it("keeps valid fields and drops invalid ones", () => {
    expect(
      parseSettings({
        theme: "amiga",
        motion: "sideways",
        matchMode: "filename",
        itemsPerPage: 25,
        fileExtensions: "jpg, png",
        filterPresets: ["Images", "Spreadsheets"],
        moveSource: "folders",
        folderOrder: ["C:\\a", 3],
        unknown: true,
      }),
    ).toEqual({
      theme: "amiga",
      matchMode: "filename",
      fileExtensions: "jpg, png",
      filterPresets: ["Images"],
      moveSource: "folders",
    });
  });
});

describe("loadLocalSettings", () => {
  it("returns defaults when nothing is saved", () => {
    expect(loadLocalSettings()).toEqual(defaultSettings);
  });

  it("migrates legacy keys and lets the combined settings win", () => {
    window.localStorage.setItem("duplicate-finder.theme", "win10");
    window.localStorage.setItem("duplicate-finder.items-per-page", "50");
    window.localStorage.setItem(
      storageKeys.settings,
      JSON.stringify({ theme: "cottagecore" }),
    );
    expect(loadLocalSettings()).toMatchObject({
      theme: "cottagecore",
      itemsPerPage: 50,
    });
  });

  it("survives corrupt JSON", () => {
    window.localStorage.setItem(storageKeys.settings, "{not json");
    expect(loadLocalSettings()).toEqual(defaultSettings);
  });
});

describe("loadSavedGroups", () => {
  it("returns null when nothing is saved", () => {
    expect(loadSavedGroups()).toBeNull();
  });

  it("keeps only well-formed groups", () => {
    window.localStorage.setItem(
      storageKeys.groups,
      JSON.stringify([
        { hash: "ok", files: [{ path: "a", name: "a", size: 1 }] },
        { hash: "bad", files: [{ path: "a" }] },
        "nonsense",
      ]),
    );
    expect(loadSavedGroups()?.map((group) => group.hash)).toEqual(["ok"]);
  });
});

describe("readPositiveNumber", () => {
  it("returns 0 for missing, invalid or negative values", () => {
    expect(readPositiveNumber(storageKeys.totalFiles)).toBe(0);
    window.localStorage.setItem(storageKeys.totalFiles, "abc");
    expect(readPositiveNumber(storageKeys.totalFiles)).toBe(0);
    window.localStorage.setItem(storageKeys.totalFiles, "-4");
    expect(readPositiveNumber(storageKeys.totalFiles)).toBe(0);
    window.localStorage.setItem(storageKeys.totalFiles, "42");
    expect(readPositiveNumber(storageKeys.totalFiles)).toBe(42);
  });
});
