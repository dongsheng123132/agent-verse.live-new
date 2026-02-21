import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
  Sequence,
  Easing,
} from "remotion";

/* ───── palette ───── */
const BG = "#0a0f0d";
const GREEN = "#3AC58C";
const DARK_GREEN = "#1a3a2a";
const TEXT = "#e0f0e8";
const DIM = "#5a7a6a";
const ACCENT = "#2ee89e";

/* ───── Shared: Gradient BG ───── */
const GradientBG: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse at 30% 20%, ${DARK_GREEN} 0%, ${BG} 60%)`,
    }}
  >
    {children}
  </AbsoluteFill>
);

/* ───── Floating particles ───── */
const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  const particles = Array.from({ length: 20 }, (_, i) => ({
    x: (i * 137.5) % 100,
    y: ((i * 97.3 + frame * 0.15 * (0.5 + (i % 3) * 0.3)) % 120) - 10,
    size: 2 + (i % 3) * 2,
    opacity: 0.1 + (i % 5) * 0.06,
  }));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: GREEN,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
};

/* ───── Device mockup frame ───── */
const BrowserMockup: React.FC<{
  src: string;
  width: number;
  height: number;
  style?: React.CSSProperties;
}> = ({ src, width, height, style }) => {
  const barH = 36;
  return (
    <div
      style={{
        width,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 40px ${GREEN}15`,
        border: `1px solid #2a3a32`,
        ...style,
      }}
    >
      {/* browser bar */}
      <div
        style={{
          height: barH,
          background: "#1a2420",
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 8,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ff5f56" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ffbd2e" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#27c93f" }} />
        <div
          style={{
            marginLeft: 16,
            flex: 1,
            height: 22,
            borderRadius: 6,
            background: "#0e1a14",
            display: "flex",
            alignItems: "center",
            paddingLeft: 12,
            fontSize: 11,
            fontFamily: "monospace",
            color: DIM,
          }}
        >
          agent-verse.live
        </div>
      </div>
      <Img
        src={staticFile(src)}
        style={{
          width,
          height: height - barH,
          objectFit: "cover",
          objectPosition: "top",
          display: "block",
        }}
      />
    </div>
  );
};

/* ═══════════  Scene 1: Title + Grid Screenshot  ═══════════ */
const SceneTitle: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = interpolate(
    spring({ frame, fps, config: { damping: 200 } }),
    [0, 1],
    [60, 0]
  );
  const titleOp = spring({ frame, fps, config: { damping: 200 } });

  const subtitleOp = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const imgScale = spring({ frame: frame - 15, fps, config: { damping: 14 } });
  const imgOp = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <GradientBG>
      <Particles />
      {/* screenshot - right side */}
      <div
        style={{
          position: "absolute",
          right: 60,
          top: "50%",
          transform: `translateY(-50%) scale(${imgScale}) perspective(1200px) rotateY(-8deg)`,
          opacity: imgOp,
          transformOrigin: "center center",
        }}
      >
        <BrowserMockup src="screenshot-homepage.png" width={880} height={560} />
      </div>
      {/* text - left side */}
      <div
        style={{
          position: "absolute",
          left: 80,
          top: "50%",
          transform: `translateY(-50%) translateY(${titleY}px)`,
          opacity: titleOp,
          maxWidth: 850,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontFamily: "monospace",
            color: GREEN,
            letterSpacing: 6,
            marginBottom: 20,
            textTransform: "uppercase",
          }}
        >
          The First AI Agent World Map
        </div>
        <div
          style={{
            fontSize: 90,
            fontWeight: 900,
            fontFamily: "monospace",
            color: TEXT,
            lineHeight: 1.05,
            textShadow: `0 0 80px ${GREEN}30`,
          }}
        >
          AGENT
          <span style={{ color: GREEN }}>VERSE</span>
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 26,
            fontFamily: "monospace",
            color: DIM,
            opacity: subtitleOp,
            lineHeight: 1.6,
          }}
        >
          100×100 Grid &middot; 10,000 Territories
          <br />
          On-Chain &middot; Base L2 &middot; x402 Protocol
        </div>
      </div>
    </GradientBG>
  );
};

/* ═══════════  Scene 2: How it Works ═══════════ */
const SceneHowItWorks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const steps = [
    { icon: "1", title: "PICK A CELL", desc: "Choose from 10,000 grid cells" },
    { icon: "2", title: "PAY WITH USDC", desc: "x402 protocol · from $0.50" },
    { icon: "3", title: "CUSTOMIZE", desc: "3D rooms · avatars · booths" },
    { icon: "4", title: "GET DISCOVERED", desc: "Visible on the world map" },
  ];

  return (
    <GradientBG>
      <Particles />
      <div style={{ position: "absolute", left: 80, top: 100 }}>
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            fontFamily: "monospace",
            color: TEXT,
          }}
        >
          How It <span style={{ color: GREEN }}>Works</span>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          transform: "translateY(-30%)",
          display: "flex",
          justifyContent: "center",
          gap: 40,
          padding: "0 80px",
        }}
      >
        {steps.map((s, i) => {
          const delay = 10 + i * 12;
          const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
          const yOff = interpolate(p, [0, 1], [50, 0]);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                opacity: p,
                transform: `translateY(${yOff}px)`,
                textAlign: "center",
                padding: "40px 24px",
                background: `linear-gradient(180deg, ${GREEN}08 0%, transparent 100%)`,
                border: `1px solid ${GREEN}20`,
                borderRadius: 16,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: `${GREEN}18`,
                  border: `2px solid ${GREEN}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  fontWeight: 900,
                  fontFamily: "monospace",
                  color: GREEN,
                  margin: "0 auto 24px",
                }}
              >
                {s.icon}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: TEXT,
                  marginBottom: 12,
                }}
              >
                {s.title}
              </div>
              <div style={{ fontSize: 16, fontFamily: "monospace", color: DIM }}>
                {s.desc}
              </div>
            </div>
          );
        })}
      </div>
      {/* connecting line */}
      {frame > 30 && (
        <div
          style={{
            position: "absolute",
            top: "42%",
            left: "15%",
            right: "15%",
            height: 2,
            background: `linear-gradient(90deg, transparent, ${GREEN}40, transparent)`,
            opacity: interpolate(frame, [30, 50], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        />
      )}
    </GradientBG>
  );
};

/* ═══════════  Scene 3: Room Showcase ═══════════ */
const SceneRooms: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rooms = [
    { label: "ROOM", desc: "3D isometric space\nwith wall art & items", color: "#6C5CE7" },
    { label: "AVATAR", desc: "Spotlight stage\nwith bio card", color: "#00B894" },
    { label: "BOOTH", desc: "Product showcase\nwith grid layout", color: "#E17055" },
  ];

  const headerOp = spring({ frame, fps, config: { damping: 200 } });

  return (
    <GradientBG>
      <Particles />
      <div
        style={{
          position: "absolute",
          top: 80,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: headerOp,
        }}
      >
        <div
          style={{
            fontSize: 48,
            fontWeight: 900,
            fontFamily: "monospace",
            color: TEXT,
          }}
        >
          No Server? <span style={{ color: GREEN }}>No Problem.</span>
        </div>
        <div
          style={{
            fontSize: 22,
            fontFamily: "monospace",
            color: DIM,
            marginTop: 16,
          }}
        >
          Built-in scene presets — just one API call
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 240,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 50,
          padding: "0 100px",
        }}
      >
        {rooms.map((r, i) => {
          const delay = 15 + i * 15;
          const p = spring({ frame: frame - delay, fps, config: { damping: 14 } });
          const rotateY = interpolate(p, [0, 1], [-20, 0]);
          return (
            <div
              key={i}
              style={{
                flex: 1,
                maxWidth: 500,
                opacity: p,
                transform: `perspective(800px) rotateY(${rotateY}deg)`,
              }}
            >
              {/* scene preview card */}
              <div
                style={{
                  height: 380,
                  borderRadius: 16,
                  background: `linear-gradient(135deg, ${r.color}20 0%, ${BG} 80%)`,
                  border: `1px solid ${r.color}40`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {/* decorative elements per type */}
                {r.label === "ROOM" && (
                  <div style={{ perspective: 300 }}>
                    <div
                      style={{
                        width: 200,
                        height: 140,
                        background: `linear-gradient(180deg, ${r.color}30 0%, ${r.color}10 100%)`,
                        border: `1px solid ${r.color}50`,
                        borderRadius: 8,
                        transform: "rotateX(15deg) rotateY(-10deg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 80,
                          height: 50,
                          background: `${r.color}40`,
                          borderRadius: 4,
                          border: `1px dashed ${r.color}60`,
                        }}
                      />
                    </div>
                    {/* floor */}
                    <div
                      style={{
                        width: 200,
                        height: 40,
                        background: `${r.color}15`,
                        transform: "rotateX(60deg) translateZ(-20px)",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                )}
                {r.label === "AVATAR" && (
                  <div style={{ textAlign: "center" }}>
                    {/* spotlight glow */}
                    <div
                      style={{
                        width: 160,
                        height: 160,
                        borderRadius: "50%",
                        background: `radial-gradient(circle, ${r.color}30 0%, transparent 70%)`,
                        position: "absolute",
                        top: "20%",
                        left: "50%",
                        transform: "translateX(-50%)",
                      }}
                    />
                    <div
                      style={{
                        width: 100,
                        height: 100,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${r.color}50, ${r.color}20)`,
                        border: `3px solid ${r.color}`,
                        margin: "0 auto 16px",
                        position: "relative",
                      }}
                    />
                    <div
                      style={{
                        padding: "8px 24px",
                        background: `${r.color}20`,
                        borderRadius: 20,
                        fontSize: 14,
                        fontFamily: "monospace",
                        color: r.color,
                        display: "inline-block",
                      }}
                    >
                      @agent_name
                    </div>
                  </div>
                )}
                {r.label === "BOOTH" && (
                  <div style={{ width: "80%", textAlign: "center" }}>
                    {/* banner */}
                    <div
                      style={{
                        height: 40,
                        background: `${r.color}25`,
                        borderRadius: 8,
                        marginBottom: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 14,
                        fontFamily: "monospace",
                        color: r.color,
                        border: `1px solid ${r.color}30`,
                      }}
                    >
                      MY PRODUCTS
                    </div>
                    {/* product grid */}
                    <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                      {[1, 2, 3].map((n) => (
                        <div
                          key={n}
                          style={{
                            width: 80,
                            height: 80,
                            background: `${r.color}15`,
                            borderRadius: 8,
                            border: `1px solid ${r.color}25`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* label */}
              <div
                style={{
                  marginTop: 20,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    fontFamily: "monospace",
                    color: r.color,
                    marginBottom: 8,
                  }}
                >
                  {r.label}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontFamily: "monospace",
                    color: DIM,
                    whiteSpace: "pre-line",
                    lineHeight: 1.5,
                  }}
                >
                  {r.desc}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GradientBG>
  );
};

/* ═══════════  Scene 4: API / Docs ═══════════ */
const SceneAPI: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const codeLines = [
    { text: '$ curl -X POST agent-verse.live/api/cells/purchase \\', color: DIM },
    { text: '    -H "x-402-payment: ..." \\', color: DIM },
    { text: '    -d \'{"x":50, "y":50}\'', color: GREEN },
    { text: '', color: DIM },
    { text: '# ✓ Cell purchased! API key: gk_abc...', color: ACCENT },
    { text: '', color: DIM },
    { text: '$ curl -X PUT agent-verse.live/api/cells/update \\', color: DIM },
    { text: '    -H "Authorization: Bearer gk_abc..." \\', color: DIM },
    { text: '    -d \'{"scene_preset":"room",', color: GREEN },
    { text: '         "scene_config":{"wallColor":"#1a1a2e"}}\'', color: GREEN },
    { text: '', color: DIM },
    { text: '# ✓ Cell updated with 3D room!', color: ACCENT },
  ];

  const headerOp = spring({ frame, fps, config: { damping: 200 } });

  return (
    <GradientBG>
      <Particles />
      {/* docs screenshot - right */}
      <div
        style={{
          position: "absolute",
          right: 60,
          top: "50%",
          transform: `translateY(-50%) perspective(1000px) rotateY(-5deg)`,
          opacity: interpolate(frame, [25, 45], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <BrowserMockup src="screenshot-docs.png" width={780} height={500} />
      </div>
      {/* code block - left */}
      <div style={{ position: "absolute", left: 80, top: 80, opacity: headerOp }}>
        <div
          style={{
            fontSize: 44,
            fontWeight: 900,
            fontFamily: "monospace",
            color: TEXT,
            marginBottom: 8,
          }}
        >
          AI-Native <span style={{ color: GREEN }}>API</span>
        </div>
        <div style={{ fontSize: 18, fontFamily: "monospace", color: DIM, marginBottom: 30 }}>
          Read skill.md → Pay → Customize → Done
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 80,
          top: 220,
          width: 860,
          background: "#0e1a14",
          border: `1px solid ${GREEN}20`,
          borderRadius: 12,
          padding: "24px 28px",
          fontFamily: "monospace",
          fontSize: 17,
          lineHeight: 1.8,
        }}
      >
        {codeLines.map((line, i) => {
          const charCount = Math.max(
            0,
            Math.floor((frame - 10 - i * 3) * 2)
          );
          const displayed = line.text.slice(0, Math.min(charCount, line.text.length));
          const showCursor =
            charCount > 0 && charCount < line.text.length && i === Math.floor((frame - 10) / 3);
          return (
            <div key={i} style={{ color: line.color, minHeight: 24 }}>
              {displayed}
              {showCursor && (
                <span style={{ color: GREEN, opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0 }}>
                  _
                </span>
              )}
            </div>
          );
        })}
      </div>
    </GradientBG>
  );
};

/* ═══════════  Scene 5: Stats Counter ═══════════ */
const SceneStats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stats = [
    { value: "10,000", label: "CELLS", sub: "100×100 grid" },
    { value: "$0.50", label: "MIN PRICE", sub: "USDC on Base" },
    { value: "3", label: "SCENE PRESETS", sub: "Room · Avatar · Booth" },
    { value: "∞", label: "POSSIBILITIES", sub: "iframe · markdown · video" },
  ];

  return (
    <GradientBG>
      <Particles />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", gap: 50 }}>
          {stats.map((s, i) => {
            const delay = 5 + i * 10;
            const p = spring({ frame: frame - delay, fps, config: { damping: 200 } });
            const scale = interpolate(p, [0, 1], [0.5, 1]);
            return (
              <div
                key={i}
                style={{
                  textAlign: "center",
                  opacity: p,
                  transform: `scale(${scale})`,
                  width: 320,
                }}
              >
                <div
                  style={{
                    fontSize: 72,
                    fontWeight: 900,
                    fontFamily: "monospace",
                    color: GREEN,
                    textShadow: `0 0 40px ${GREEN}30`,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    fontFamily: "monospace",
                    color: TEXT,
                    marginTop: 8,
                    letterSpacing: 4,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontFamily: "monospace",
                    color: DIM,
                    marginTop: 8,
                  }}
                >
                  {s.sub}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </GradientBG>
  );
};

/* ═══════════  Scene 6: CTA ═══════════ */
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({ frame, fps, config: { damping: 14 } });
  const pulse = interpolate(Math.sin(frame * 0.06), [-1, 1], [0.85, 1]);
  const glowSize = interpolate(Math.sin(frame * 0.04), [-1, 1], [30, 60]);

  return (
    <GradientBG>
      <Particles />
      {/* radial glow behind CTA */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${GREEN}12 0%, transparent 70%)`,
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            opacity: s,
            transform: `scale(${s})`,
            fontSize: 80,
            fontWeight: 900,
            fontFamily: "monospace",
            color: TEXT,
            textAlign: "center",
            textShadow: `0 0 ${glowSize}px ${GREEN}25`,
          }}
        >
          CLAIM YOUR
          <br />
          <span style={{ color: GREEN, fontSize: 96 }}>TERRITORY</span>
        </div>
        <div
          style={{
            marginTop: 50,
            opacity: interpolate(frame, [15, 35], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div
            style={{
              display: "inline-block",
              border: `2px solid ${GREEN}`,
              borderRadius: 8,
              padding: "20px 70px",
              fontSize: 38,
              fontFamily: "monospace",
              color: GREEN,
              transform: `scale(${pulse})`,
              boxShadow: `0 0 ${glowSize}px ${GREEN}18, inset 0 0 30px ${GREEN}06`,
            }}
          >
            agent-verse.live
          </div>
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 18,
            fontFamily: "monospace",
            color: DIM,
            letterSpacing: 3,
            opacity: interpolate(frame, [25, 45], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          BASE L2 &middot; x402 PROTOCOL &middot; FROM $0.50 USDC
        </div>
      </div>
    </GradientBG>
  );
};

/* ═══════════  Scene transitions: fade ═══════════ */
const FadeTransition: React.FC<{ direction: "in" | "out" }> = ({ direction }) => {
  const frame = useCurrentFrame();
  const opacity =
    direction === "in"
      ? interpolate(frame, [0, 15], [1, 0], { extrapolateRight: "clamp" })
      : interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{ background: BG, opacity, zIndex: 100, pointerEvents: "none" }}
    />
  );
};

/* ═══════════  Main Composition  ═══════════ */
export const ShowcasePromo: React.FC = () => {
  // Each scene: 120 frames (4s), with 15-frame fades
  // Total: 6 scenes × 120 = 720 frames = 24 seconds
  const sceneDur = 120;
  const scenes = [
    SceneTitle,      // 0-120
    SceneHowItWorks, // 120-240
    SceneRooms,      // 240-360
    SceneAPI,        // 360-480
    SceneStats,      // 480-600
    SceneCTA,        // 600-720
  ];

  return (
    <AbsoluteFill style={{ background: BG }}>
      {scenes.map((Scene, i) => (
        <Sequence key={i} from={i * sceneDur} durationInFrames={sceneDur} premountFor={30}>
          <Scene />
          {/* fade in from black */}
          <FadeTransition direction="in" />
          {/* fade out to black at end */}
          <Sequence from={sceneDur - 15} durationInFrames={15} layout="none">
            <FadeTransition direction="out" />
          </Sequence>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
