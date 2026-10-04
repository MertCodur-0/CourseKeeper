import { staticFile } from "remotion";

export const FPS = 30;

// Colors taken from the app's dark theme (static/stil.css).
export const COLORS = {
  bg: "#050505",
  bgSoft: "#0d0f14",
  accent: "#6ea0ff",
  text: "#f5f6f8",
  muted: "#9aa1ad",
  border: "rgba(255, 255, 255, 0.09)",
};

// Inter is bundled locally (public/fonts) so rendering works offline.
export const FONT_FAMILY = "Inter";

// Screenshots are 3840x2160 (2x). Coordinates in this project are in 1920x1080 "app pixels".
export const SCREEN_W = 1920;
export const SCREEN_H = 1080;

export const screen = (name: string) => staticFile(`screens/${name}.png`);
