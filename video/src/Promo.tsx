import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AppWindow, Background, Caption, Logo, SceneFade } from "./components";
import { COLORS, FONT_FAMILY, screen } from "./theme";

// ------------------------------------------------------------ scenes

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const textIn = interpolate(frame, [8, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tagIn = interpolate(frame, [22, 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT_FAMILY }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, transform: `scale(${0.9 + pop * 0.1})` }}>
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 30,
            background: "rgba(110,160,255,0.12)",
            border: "1px solid rgba(110,160,255,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: pop,
          }}
        >
          <Logo size={76} />
        </div>
        <div
          style={{
            fontSize: 112,
            fontWeight: 700,
            letterSpacing: -3,
            color: COLORS.text,
            opacity: textIn,
            transform: `translateX(${(1 - textIn) * -20}px)`,
          }}
        >
          CourseKeeper
        </div>
      </div>
      <div
        style={{
          marginTop: 36,
          fontSize: 34,
          fontWeight: 500,
          color: COLORS.muted,
          opacity: tagIn,
          transform: `translateY(${(1 - tagIn) * 16}px)`,
        }}
      >
        Your whole semester, on one screen.
      </div>
    </AbsoluteFill>
  );
};

const CalendarScene: React.FC = () => (
  <>
    <Caption eyebrow="WEEKLY SCHEDULE" title="Your week at a glance." sub="Courses, labs and exams in one calendar." />
    <AppWindow
      enter={2}
      layers={[{ src: screen("takvim"), from: 0 }]}
      camera={[
        { frame: 10, focus: null },
        { frame: 105, focus: { x: 272, y: 140, w: 1205, h: 915 } },
      ]}
    />
  </>
);

const SyllabusScene: React.FC = () => (
  <>
    <Caption
      eyebrow="ADD COURSES WITH AI"
      title="Drop in a syllabus."
      sub="Gemini fills the form. Unsure values are flagged, nothing is made up."
    />
    <AppWindow
      layers={[
        { src: screen("syllabus-yukle"), from: 0 },
        { src: screen("syllabus-form"), from: 64, fade: 10 },
      ]}
      camera={[
        { frame: 0, focus: null },
        { frame: 30, focus: { x: 700, y: 380, w: 770, h: 330 } },
        { frame: 58, focus: { x: 700, y: 380, w: 770, h: 330 } },
        { frame: 86, focus: { x: 735, y: 60, w: 700, h: 960 } },
        { frame: 122, focus: { x: 745, y: 115, w: 680, h: 290 } },
        { frame: 152, focus: { x: 745, y: 115, w: 680, h: 290 } },
        { frame: 190, focus: { x: 745, y: 530, w: 680, h: 420 } },
      ]}
    />
  </>
);

const GradesScene: React.FC = () => (
  <>
    <Caption eyebrow="GRADE CALCULATOR" title="Know what you need." sub="Pick a target grade, see what's left to earn." />
    <AppWindow
      layers={[{ src: screen("ders-not-hesabi"), from: 0 }]}
      callouts={[
        { src: screen("ders-not-hesabi"), region: { x: 1508, y: 322, w: 372, h: 278 }, from: 22, to: 76, width: 760 },
        { src: screen("ders-not-hesabi"), region: { x: 1508, y: 626, w: 372, h: 270 }, from: 78, to: 160, width: 760 },
      ]}
    />
  </>
);

const AttendanceScene: React.FC = () => (
  <>
    <Caption eyebrow="ATTENDANCE" title="Hour-by-hour attendance." sub="Get warned before you hit the limit." />
    <AppWindow
      layers={[
        { src: screen("yoklama-bekleyen"), from: 0 },
        { src: screen("ders-devamsizlik"), from: 70, fade: 12 },
      ]}
      camera={[
        { frame: 0, focus: null },
        { frame: 26, focus: { x: 705, y: 360, w: 760, h: 362 } },
        { frame: 62, focus: { x: 705, y: 360, w: 760, h: 362 } },
        { frame: 84, focus: null },
      ]}
      callouts={[
        { src: screen("ders-devamsizlik"), region: { x: 1508, y: 322, w: 372, h: 292 }, from: 98, to: 190, width: 760 },
      ]}
    />
  </>
);

const GpaScene: React.FC = () => (
  <>
    <Caption eyebrow="GPA PLANNER" title="Plan your GPA." sub="Your projected cumulative GPA, from your target grades." />
    <AppWindow
      layers={[{ src: screen("gpa"), from: 0 }]}
      camera={[
        { frame: 0, focus: null },
        { frame: 34, focus: { x: 555, y: 180, w: 1060, h: 560 } },
        { frame: 120, focus: { x: 555, y: 190, w: 1000, h: 530 } },
      ]}
    />
  </>
);

const ThemeScene: React.FC = () => (
  <>
    <Caption eyebrow="LIGHT & DARK" title="Easy on the eyes." sub="Light and dark themes." />
    <AppWindow
      layers={[
        { src: screen("takvim"), from: 0 },
        { src: screen("takvim-acik"), from: 26, fade: 18 },
      ]}
    />
  </>
);

const Pill: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 24,
      fontWeight: 500,
      color: COLORS.text,
      padding: "10px 22px",
      borderRadius: 999,
      border: `1px solid ${COLORS.border}`,
      background: "rgba(255,255,255,0.04)",
    }}
  >
    {children}
  </div>
);

const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const step = (start: number) => ({
    opacity: interpolate(frame, [start, start + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    transform: `translateY(${interpolate(frame, [start, start + 18], [20, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    })}px)`,
  });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily: FONT_FAMILY }}>
      <div style={{ ...step(0), display: "flex", alignItems: "center", gap: 22 }}>
        <Logo size={72} />
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -2.5, color: COLORS.text }}>CourseKeeper</div>
      </div>
      <div style={{ ...step(8), marginTop: 22, fontSize: 30, color: COLORS.muted, fontWeight: 500 }}>
        A personal academic tracker that runs locally on your Mac.
      </div>
      <div style={{ ...step(16), display: "flex", gap: 14, marginTop: 44 }}>
        <Pill>Python · Flask</Pill>
        <Pill>SQLite</Pill>
        <Pill>Vanilla JS</Pill>
        <Pill>Gemini API</Pill>
      </div>
      <div style={{ ...step(26), marginTop: 56, fontSize: 30, fontWeight: 600, color: COLORS.accent }}>
        github.com/MertCodur-0/CourseKeeper
      </div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------ timeline

const OVERLAP = 0;
const FADE = 8;
const SCENES: { id: string; duration: number; Component: React.FC }[] = [
  { id: "intro", duration: 70, Component: Intro },
  { id: "calendar", duration: 100, Component: CalendarScene },
  { id: "syllabus", duration: 210, Component: SyllabusScene },
  { id: "grades", duration: 150, Component: GradesScene },
  { id: "attendance", duration: 170, Component: AttendanceScene },
  { id: "gpa", duration: 105, Component: GpaScene },
  { id: "theme", duration: 72, Component: ThemeScene },
  { id: "end", duration: 110, Component: EndCard },
];

const starts: number[] = [];
SCENES.reduce((at, scene) => {
  starts.push(at);
  return at + scene.duration - OVERLAP;
}, 0);

// Narration: one line per scene (public/audio/narration/<scene>.wav, made by demo/anlatim.py),
// starting NARRATION_DELAY frames after the scene begins. Lengths in seconds, used for music ducking.
const NARRATION_DELAY = 12;
const NARRATION: Record<string, number> = {
  intro: 1.28,
  calendar: 2.5,
  syllabus: 6.29,
  grades: 4.2,
  attendance: 4.74,
  gpa: 2.01,
  theme: 1.49,
  end: 2.73,
};
const VOICE_VOLUME = 1.4; // narration lines are normalized to -18 LUFS; this brings the mix to about -16 LUFS
const MUSIC_VOLUME = 0.58; // music alone
const MUSIC_UNDER_VOICE = 0.22; // music while the narrator speaks

export const PROMO_DURATION = starts[starts.length - 1] + SCENES[SCENES.length - 1].duration;

const useFonts = () => {
  const [handle] = useState(() => delayRender("Loading Inter"));
  useEffect(() => {
    const files: [string, string][] = [
      ["Inter-Regular.otf", "400"],
      ["Inter-Medium.otf", "500"],
      ["Inter-SemiBold.otf", "600"],
      ["Inter-Bold.otf", "700"],
    ];
    Promise.all(
      files.map(([file, weight]) => {
        const face = new FontFace(FONT_FAMILY, `url(${staticFile(`fonts/${file}`)})`, { weight });
        return face.load().then((loaded) => document.fonts.add(loaded));
      }),
    )
      .then(() => continueRender(handle))
      .catch((err) => {
        console.error(err);
        continueRender(handle);
      });
  }, [handle]);
};

const voiceWindows = () =>
  SCENES.map(({ id }, i) => {
    const start = starts[i] + NARRATION_DELAY;
    return [start, start + Math.ceil((NARRATION[id] ?? 0) * 30)] as const;
  });

/** Music volume at a frame: lowered smoothly while the narrator speaks. */
const musicVolume = (frame: number) => {
  const ramp = 10;
  let duck = 0;
  for (const [a, b] of voiceWindows()) {
    const d = Math.min(
      interpolate(frame, [a - ramp, a], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      interpolate(frame, [b, b + ramp * 2], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    );
    duck = Math.max(duck, d);
  }
  return MUSIC_VOLUME + (MUSIC_UNDER_VOICE - MUSIC_VOLUME) * duck;
};

export const Promo: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{ background: COLORS.bg }}>
      <Background />
      <Audio src={staticFile("audio/music.wav")} volume={musicVolume} />
      {SCENES.map(({ id }, i) =>
        NARRATION[id] ? (
          <Sequence key={`voice-${id}`} from={starts[i] + NARRATION_DELAY} name={`voice: ${id}`}>
            <Audio src={staticFile(`audio/narration/${id}.wav`)} volume={VOICE_VOLUME} />
          </Sequence>
        ) : null,
      )}
      {SCENES.map(({ id, duration, Component }, i) => (
        <Sequence key={id} from={starts[i]} durationInFrames={duration} name={id}>
          <SceneFade duration={duration} inFrames={i === 0 ? 1 : FADE} outFrames={i === SCENES.length - 1 ? 20 : FADE}>
            <Component />
          </SceneFade>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
