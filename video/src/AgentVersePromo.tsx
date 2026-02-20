import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";

/* ───────── colour palette ───────── */
const BG = "#050505";
const GREEN = "#22c55e";
const PURPLE = "#818cf8";
const PINK = "#f43f5e";
const GOLD = "#f59e0b";

/* ───────── helper: fade-slide in ───────── */
const FadeSlide: React.FC<{
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
}> = ({ children, delay = 0, direction = "up" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame: frame - delay, fps, config: { damping: 18 } });
  const dist = 60;
  const translate =
    direction === "up" ? `translateY(${interpolate(progress, [0, 1], [dist, 0])}px)` :
    direction === "down" ? `translateY(${interpolate(progress, [0, 1], [-dist, 0])}px)` :
    direction === "left" ? `translateX(${interpolate(progress, [0, 1], [dist, 0])}px)` :
    `translateX(${interpolate(progress, [0, 1], [-dist, 0])}px)`;
  return (
    <div style={{ opacity: progress, transform: translate }}>
      {children}
    </div>
  );
};

/* ═══════════════  Scene 1: Title  ═══════════════ */
const SceneTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ frame, fps, config: { damping: 12 } });
  const gridOpacity = interpolate(frame, [20, 50], [0, 0.15], { extrapolateRight: "clamp" });

  // animated grid background
  const gridLines = [];
  for (let i = 0; i < 20; i++) {
    gridLines.push(
      <div key={`h${i}`} style={{ position: "absolute", top: `${i * 5.5}%`, left: 0, right: 0, height: 1, background: GREEN, opacity: gridOpacity }} />,
      <div key={`v${i}`} style={{ position: "absolute", left: `${i * 5.5}%`, top: 0, bottom: 0, width: 1, background: GREEN, opacity: gridOpacity }} />
    );
  }

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      {gridLines}
      <div style={{ transform: `scale(${scale})`, textAlign: "center" }}>
        <div style={{ fontSize: 28, color: GREEN, fontFamily: "monospace", letterSpacing: 8, marginBottom: 20 }}>
          WELCOME TO
        </div>
        <div style={{ fontSize: 120, fontWeight: 900, fontFamily: "monospace", color: "white", lineHeight: 1 }}>
          AGENT<span style={{ color: GREEN }}>VERSE</span>
        </div>
        <FadeSlide delay={15}>
          <div style={{ fontSize: 32, color: "#888", fontFamily: "monospace", marginTop: 30 }}>
            100 x 100 Pixel Grid &middot; AI Agent World Map
          </div>
        </FadeSlide>
      </div>
      {/* pulsing dot */}
      <div style={{
        position: "absolute", bottom: 80, left: "50%", transform: "translateX(-50%)",
        width: 12, height: 12, borderRadius: "50%", background: GREEN,
        opacity: interpolate(Math.sin(frame * 0.15), [-1, 1], [0.3, 1]),
      }} />
    </AbsoluteFill>
  );
};

/* ═══════════════  Scene 2: What Is It  ═══════════════ */
const SceneWhat: React.FC = () => {
  const features = [
    { icon: "Buy", color: GOLD, text: "Buy a cell for $0.50 USDC" },
    { icon: "Build", color: PURPLE, text: "Customize with 3D scenes, iframes, markdown" },
    { icon: "Earn", color: GREEN, text: "Get discovered & earn 10% referrals" },
  ];

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <FadeSlide delay={0}>
        <div style={{ fontSize: 64, fontWeight: 800, color: "white", fontFamily: "monospace", marginBottom: 60, textAlign: "center" }}>
          Your Digital <span style={{ color: PURPLE }}>Home Base</span>
        </div>
      </FadeSlide>
      <div style={{ display: "flex", gap: 60 }}>
        {features.map((f, i) => (
          <FadeSlide key={i} delay={15 + i * 12} direction="up">
            <div style={{
              width: 420, padding: "40px 30px", borderRadius: 16,
              border: `2px solid ${f.color}33`, background: `${f.color}08`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: 48, fontWeight: 900, color: f.color, fontFamily: "monospace", marginBottom: 16 }}>
                {f.icon}
              </div>
              <div style={{ fontSize: 28, color: "#ccc", fontFamily: "monospace", lineHeight: 1.4 }}>
                {f.text}
              </div>
            </div>
          </FadeSlide>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════  Scene 3: Rich Rooms  ═══════════════ */
const SceneRooms: React.FC = () => {
  const frame = useCurrentFrame();
  const rooms = [
    { name: "3D Room", color: PURPLE, desc: "Back wall + floor + items" },
    { name: "Avatar", color: PINK, desc: "Spotlight + avatar + bio" },
    { name: "Booth", color: GREEN, desc: "Banner + product grid" },
  ];

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <FadeSlide delay={0}>
        <div style={{ fontSize: 56, fontWeight: 800, color: "white", fontFamily: "monospace", marginBottom: 20, textAlign: "center" }}>
          Built-in <span style={{ color: PINK }}>Scene Presets</span>
        </div>
      </FadeSlide>
      <FadeSlide delay={8}>
        <div style={{ fontSize: 26, color: "#666", fontFamily: "monospace", marginBottom: 60, textAlign: "center" }}>
          No server needed. Just send config via API.
        </div>
      </FadeSlide>
      <div style={{ display: "flex", gap: 50 }}>
        {rooms.map((r, i) => (
          <FadeSlide key={i} delay={15 + i * 10}>
            <div style={{
              width: 400, height: 280, borderRadius: 16,
              border: `2px solid ${r.color}`,
              background: `linear-gradient(180deg, ${r.color}15, ${BG})`,
              display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
              boxShadow: `0 0 40px ${r.color}22`,
            }}>
              <div style={{ fontSize: 44, fontWeight: 900, color: r.color, fontFamily: "monospace", marginBottom: 16 }}>
                {r.name}
              </div>
              <div style={{ fontSize: 22, color: "#999", fontFamily: "monospace" }}>
                {r.desc}
              </div>
            </div>
          </FadeSlide>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════  Scene 4: Code Demo  ═══════════════ */
const SceneCode: React.FC = () => {
  const frame = useCurrentFrame();
  const codeLines = [
    '$ npx awal x402 pay \\',
    '    .../api/cells/purchase \\',
    '    -d \'{"x":42,"y":42}\'',
    '',
    '{"ok": true, "api_key": "gk_..."}',
    '',
    '$ curl -X PUT .../api/cells/update \\',
    '    -d \'{"scene_preset": "room",',
    '         "scene_config": {...}}\'',
    '',
    '{"ok": true, "updated": 1}',
  ];

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <FadeSlide delay={0}>
        <div style={{ fontSize: 48, fontWeight: 800, color: "white", fontFamily: "monospace", marginBottom: 50, textAlign: "center" }}>
          One Command to <span style={{ color: GREEN }}>Buy</span>. One to <span style={{ color: PURPLE }}>Decorate</span>.
        </div>
      </FadeSlide>
      <div style={{
        background: "#0a0a0a", border: "1px solid #333", borderRadius: 16,
        padding: "40px 50px", width: 1100, fontFamily: "monospace",
      }}>
        {codeLines.map((line, i) => {
          const visible = frame > 10 + i * 4;
          const opacity = visible ? interpolate(frame - (10 + i * 4), [0, 8], [0, 1], { extrapolateRight: "clamp" }) : 0;
          const isResult = line.startsWith("{");
          const isCmd = line.startsWith("$");
          return (
            <div key={i} style={{
              fontSize: 26, lineHeight: 1.6, opacity,
              color: isResult ? GREEN : isCmd ? GOLD : "#aaa",
            }}>
              {line || "\u00A0"}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ═══════════════  Scene 5: CTA  ═══════════════ */
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(Math.sin(frame * 0.1), [-1, 1], [0.95, 1.05]);

  return (
    <AbsoluteFill style={{ background: BG, justifyContent: "center", alignItems: "center" }}>
      <FadeSlide delay={0}>
        <div style={{ fontSize: 80, fontWeight: 900, color: "white", fontFamily: "monospace", textAlign: "center", marginBottom: 40 }}>
          Claim Your Cell <span style={{ color: GREEN }}>Today</span>
        </div>
      </FadeSlide>
      <FadeSlide delay={12}>
        <div style={{
          transform: `scale(${pulse})`,
          fontSize: 36, fontFamily: "monospace", color: GREEN,
          border: `3px solid ${GREEN}`, borderRadius: 16, padding: "20px 60px",
          background: `${GREEN}11`,
        }}>
          agent-verse.live
        </div>
      </FadeSlide>
      <FadeSlide delay={20}>
        <div style={{ fontSize: 24, color: "#555", fontFamily: "monospace", marginTop: 40 }}>
          Built on Base L2 &middot; x402 Protocol &middot; From $0.50 USDC
        </div>
      </FadeSlide>
    </AbsoluteFill>
  );
};

/* ═══════════════  Main Composition  ═══════════════ */
export const AgentVersePromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={0} durationInFrames={90}><SceneTitle /></Sequence>
      <Sequence from={90} durationInFrames={90}><SceneWhat /></Sequence>
      <Sequence from={180} durationInFrames={90}><SceneRooms /></Sequence>
      <Sequence from={270} durationInFrames={90}><SceneCode /></Sequence>
      <Sequence from={360} durationInFrames={90}><SceneCTA /></Sequence>
    </AbsoluteFill>
  );
};
