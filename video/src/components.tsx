import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT_FAMILY, SCREEN_H, SCREEN_W } from "./theme";

// ------------------------------------------------------------ camera

export type Region = { x: number; y: number; w: number; h: number };
export type CameraKey = { frame: number; focus: Region | null };

type Cam = { cx: number; cy: number; z: number };

const FULL: Cam = { cx: SCREEN_W / 2, cy: SCREEN_H / 2, z: 1 };

const camFor = (focus: Region | null): Cam => {
  if (!focus) return FULL;
  // Fit the region with some breathing room, but never zoom so far that text gets blurry.
  const z = Math.min(Math.max(Math.min(SCREEN_W / focus.w, SCREEN_H / focus.h) * 0.92, 1), 2.3);
  return { cx: focus.x + focus.w / 2, cy: focus.y + focus.h / 2, z };
};

const ease = Easing.bezier(0.65, 0, 0.35, 1);

const cameraAt = (frame: number, keys: CameraKey[]): Cam => {
  if (keys.length === 0) return FULL;
  if (frame <= keys[0].frame) return camFor(keys[0].focus);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame <= b.frame) {
      const t = interpolate(frame, [a.frame, b.frame], [0, 1], { easing: ease });
      const ca = camFor(a.focus);
      const cb = camFor(b.focus);
      // Interpolate zoom in log space so zooming feels even.
      const z = Math.exp(Math.log(ca.z) + (Math.log(cb.z) - Math.log(ca.z)) * t);
      return { cx: ca.cx + (cb.cx - ca.cx) * t, cy: ca.cy + (cb.cy - ca.cy) * t, z };
    }
  }
  return camFor(keys[keys.length - 1].focus);
};

// ------------------------------------------------------------ app window

export type Layer = { src: string; from: number; fade?: number };

/** A piece of the screenshot lifted out and enlarged, so narrow panels stay readable. */
export type Callout = { src: string; region: Region; from: number; to: number; width: number; x?: number; y?: number };

const BAR = 38;

/** A browser-like window showing real app screenshots, with an animated camera. */
export const AppWindow: React.FC<{
  layers: Layer[];
  camera?: CameraKey[];
  width?: number;
  top?: number;
  enter?: number; // frame the window starts appearing
  callouts?: Callout[];
}> = ({ layers, camera = [], width = 1440, top = 196, enter = 0, callouts = [] }) => {
  const frame = useCurrentFrame();
  const contentH = (width * SCREEN_H) / SCREEN_W;
  const base = width / SCREEN_W;
  const cam = cameraAt(frame, camera);
  const k = base * cam.z;
  const imgW = SCREEN_W * k;
  const imgH = SCREEN_H * k;
  const tx = Math.min(0, Math.max(width - imgW, width / 2 - cam.cx * k));
  const ty = Math.min(0, Math.max(contentH - imgH, contentH / 2 - cam.cy * k));

  const appear = interpolate(frame, [enter, enter + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        position: "absolute",
        left: (1920 - width) / 2,
        top,
        width,
        height: contentH + BAR,
        borderRadius: 16,
        overflow: "hidden",
        background: "#0b0b0c",
        border: `1px solid ${COLORS.border}`,
        boxShadow: "0 40px 120px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.6)",
        opacity: appear,
        transform: `translateY(${(1 - appear) * 40}px) scale(${0.97 + appear * 0.03})`,
      }}
    >
      <div
        style={{
          height: BAR,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 16px",
          background: "#151517",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c }} />
        ))}
        <div
          style={{
            margin: "0 auto",
            transform: "translateX(-30px)",
            fontFamily: FONT_FAMILY,
            fontSize: 14,
            color: COLORS.muted,
            background: "#0d0d0f",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "4px 60px",
          }}
        >
          127.0.0.1:5001
        </div>
      </div>
      <div style={{ position: "relative", width, height: contentH, overflow: "hidden" }}>
        {layers.map((layer, i) => {
          const fade = layer.fade ?? 12;
          const next = layers[i + 1];
          const opacity =
            i === 0
              ? 1
              : interpolate(frame, [layer.from, layer.from + fade], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
          const visible = !next || frame < next.from + (next.fade ?? 12);
          if (!visible || frame < layer.from) return null;
          return (
            <Img
              key={layer.src}
              src={layer.src}
              style={{
                position: "absolute",
                left: tx,
                top: ty,
                width: imgW,
                height: imgH,
                opacity,
              }}
            />
          );
        })}
        {callouts.length > 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              opacity: Math.max(
                0,
                ...callouts.map((c) =>
                  Math.min(
                    interpolate(frame, [c.from, c.from + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                    interpolate(frame, [c.to - 6, c.to + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                  ),
                ),
              ),
            }}
          />
        ) : null}
        {callouts.map((c) => {
          const fadeIn = interpolate(frame, [c.from, c.from + 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const fadeOut = interpolate(frame, [c.to - 10, c.to], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const shown = Math.min(fadeIn, fadeOut);
          if (shown <= 0) return null;
          const s = c.width / c.region.w;
          const h = c.region.h * s;
          const left = c.x ?? (width - c.width) / 2;
          const topPos = c.y ?? (contentH - h) / 2;
          return (
            <React.Fragment key={`${c.src}-${c.from}`}>
              <div
                style={{
                  position: "absolute",
                  left,
                  top: topPos,
                  width: c.width,
                  height: h,
                  borderRadius: 18,
                  overflow: "hidden",
                  opacity: shown,
                  transform: `translateY(${(1 - fadeIn) * 30}px) scale(${0.94 + fadeIn * 0.06})`,
                  boxShadow: "0 30px 90px rgba(0,0,0,0.75), 0 0 0 1px rgba(110,160,255,0.35)",
                }}
              >
                <Img
                  src={c.src}
                  style={{
                    position: "absolute",
                    left: -c.region.x * s,
                    top: -c.region.y * s,
                    width: SCREEN_W * s,
                    height: SCREEN_H * s,
                  }}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ------------------------------------------------------------ background & captions

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 60;
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1200px 700px at ${50 + drift / 20}% -10%, rgba(110,160,255,0.22), transparent 60%),
                       radial-gradient(900px 600px at ${90 - drift / 30}% 110%, rgba(142,45,168,0.14), transparent 60%)`,
        }}
      />
    </AbsoluteFill>
  );
};

const rise = (frame: number, start: number) => ({
  opacity: interpolate(frame, [start, start + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateY(${interpolate(frame, [start, start + 18], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  })}px)`,
});

export const Caption: React.FC<{ eyebrow: string; title: string; sub?: string; start?: number }> = ({
  eyebrow,
  title,
  sub,
  start = 0,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 240, right: 240, top: 44, fontFamily: FONT_FAMILY }}>
      <div
        style={{
          ...rise(frame, start),
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: 3,
          color: COLORS.accent,
          marginBottom: 10,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 24, flexWrap: "wrap" }}>
        <div
          style={{
            ...rise(frame, start + 4),
            fontSize: 52,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: -1.2,
          }}
        >
          {title}
        </div>
        {sub ? (
          <div style={{ ...rise(frame, start + 10), fontSize: 24, fontWeight: 500, color: COLORS.muted }}>
            {sub}
          </div>
        ) : null}
      </div>
    </div>
  );
};

/** Fades a whole scene in and out so scenes can overlap slightly. */
export const SceneFade: React.FC<{ duration: number; children: React.ReactNode; inFrames?: number; outFrames?: number }> = ({
  duration,
  children,
  inFrames = 10,
  outFrames = 10,
}) => {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [0, inFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [duration - outFrames, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

export const Logo: React.FC<{ size: number; color?: string }> = ({ size, color = COLORS.accent }) => (
  // The same graduation-cap icon the app uses in its sidebar (templates/index.html).
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14z" />
    <path d="M6.5 11.5V16c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.5" />
    <path d="M21.5 9.5v4.6" />
  </svg>
);
