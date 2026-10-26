import type { DuplicateGroup } from "./types";

export const uiThemes = [
  {
    id: "classic",
    name: "Classic",
    description: "The original warm, muted DuplicateFinder look.",
  },
  {
    id: "seventies",
    name: "1970s",
    description:
      "Harvest gold, burnt orange and avocado on retro wallpaper with groovy rounded type.",
  },
  {
    id: "geocities",
    name: "GeoCities",
    description:
      "Welcome to my homepage! Starry tiles, Comic Sans, rainbow headings, bevelled buttons and a visitor counter.",
  },
  {
    id: "retro-future",
    name: "Retro Future",
    description:
      "Wasteland-ready phosphor terminal: glowing green monospace, CRT scanlines and inverted selections.",
  },
  {
    id: "amiga",
    name: "Amiga",
    description:
      "Workbench 2.0's four-colour palette: grey, black, white and blue with bevelled gadgets and window chrome.",
  },
  {
    id: "win311",
    name: "Windows for Workgroups 3.11",
    description:
      "Program Manager chic: navy title bar, white windows, grey push buttons and a menu bar.",
  },
  {
    id: "cottagecore",
    name: "Cottagecore",
    description:
      "Gingham linen, sage and dusty rose, stitched edges, storybook serifs and handwritten labels.",
  },
  {
    id: "win10",
    name: "Windows 10",
    description:
      "Flat Fluent look: Segoe UI, accent blue, Explorer-style selection, live tile and a dark Start-menu panel.",
  },
  {
    id: "high-contrast",
    name: "High contrast",
    description:
      "Black background, white text and bright yellow highlights for maximum legibility.",
  },
] as const;

export type UiTheme = (typeof uiThemes)[number]["id"];

export const motionPreferences = [
  {
    id: "system",
    name: "Follow Windows setting",
    description: "Animations stop when Windows is set to reduce animations.",
  },
  {
    id: "always",
    name: "Always animate",
    description: "Play style animations even if Windows reduces animations.",
  },
  {
    id: "off",
    name: "No animations",
    description: "Turn style animations off everywhere.",
  },
] as const;

export type MotionPreference = (typeof motionPreferences)[number]["id"];

export const filterPresets = {
  Images: ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "tiff"],
  Video: ["mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v"],
  Documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf"],
} as const;

export type FilterPreset = keyof typeof filterPresets;

export const itemsPerPageOptions = [10, 20, 50] as const;

export const demoGroups: DuplicateGroup[] = [
  {
    hash: "demo-1",
    files: [
      {
        path: "/test-images/landscapes/lake-sunrise-alt.jpg",
        name: "lake-sunrise.jpg",
        size: 4820000,
      },
      {
        path: "/test-images/exports/lake-sunrise-copy.jpg",
        name: "lake-sunrise.jpg",
        size: 4820000,
      },
      {
        path: "/test-images/duplicates/morning-lake-backup.jpg",
        name: "lake-sunrise.jpg",
        size: 4820000,
      },
    ],
  },
  {
    hash: "demo-2",
    files: [
      {
        path: "/Documents/Invoices/2024-final.pdf",
        name: "2024-final.pdf",
        size: 1240000,
      },
      {
        path: "/Downloads/2024-final.pdf",
        name: "2024-final.pdf",
        size: 1240000,
      },
    ],
  },
];
