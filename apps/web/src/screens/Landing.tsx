import { color, font, luminance, scene, seal, shape, skyAt, texture, voice, voiceColor, type Seal } from "@bardcast/brand";
import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { campaign, characters, dm, party, speakerColor } from "../fixtures/gawain.js";
import { EpisodeWave, HandNote, HexKey, PlayGlyph, RingStain, SealMark, styles, Waveform } from "../ui.js";

/**
 * The public home page: one night and day at the table, Thursday 8pm to Friday 8pm.
 *
 * It reads bottom-up. You land at the hearth on Thursday night and scroll up
 * through the week's loop (the DM's question, your answer, the rolls, the
 * chapter, your character, the next scene) while the sky turns over and the
 * party's voices rise out of the fire as strands. At the top, Friday night,
 * there is an open seat with your name on it.
 *
 * The page is a fixed column translated by the scroll position, over a spacer
 * that gives the document its height. Scrolling down moves the view up.
 *
 * The candle rule: "Pull up a chair" is the one lit action. It lives in the hero
 * and in the open seat; when neither is on screen, it rides in the bottom bar,
 * so exactly one is ever visible. "Sign in" in the bar is its quiet twin.
 */

/** The hour each anchor (hero, six cards, open seat) sits at. 24+ is Friday. */
const HOURS = [20, 22, 24.5, 27, 30.5, 37, 42.5, 44];
/** How far off-axis each card is set down. */
const TILT = [-1.6, 1.2, -1.1, 1.8, -1.3, 1.5];
/** How wide the strands fan out as they pass each card, as a share of the column. */
const SPREAD = [0.22, 0.4, 0.3, 0.05, 0.26, 0.18];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

const gawain = party.find((p) => p.id === "gawain")!;
const hueOf = (id: string) => party.find((p) => p.id === id)!.hue;

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  cx: number;
  cy: number;
}

interface Geometry {
  W: number;
  H: number;
  heroText: Box;
  fire: Box;
  hero: Box;
  cards: Box[];
  cta: Box;
  /** How much taller the hero is than the viewport (tall heroes on short screens). */
  extra: number;
}

interface Frame {
  /** The column's translateY. */
  T: number;
  scrollY: number;
  hour: number;
  cards: Array<{ transform: string; opacity: number }>;
  /** Both in-page candles are off screen, so the bar carries it. */
  barCandle: boolean;
  vw: number;
  /** Fire scale on short viewports. */
  fireScale: number;
}

interface Strand {
  color: string;
  core: string;
  filaments: [string, string];
}

/**
 * The voice strands: five threads (the DM in bone, then each player) that leave
 * the fire, curl past the hero text, weave between the cards and gather into
 * the open seat at the top.
 */
function buildStrands(g: Geometry): { y0: number; y1: number; strands: Strand[] } {
  const { W, fire, heroText, cards, cta } = g;
  const fx = fire.cx;
  const ft = fire.top + (fire.bottom - fire.top) * 0.22;
  const Wc = Math.min(W, 860);
  const margin = Math.min(W - 10, heroText.right + 28);
  const dx = margin - fx;
  const ym = Math.min(ft - dx, heroText.bottom);

  const rows = [
    { y: ft, c: fx, s: 3 },
    { y: ft - (ft - ym) * 0.4, c: fx + dx * 0.75, s: 12 },
    { y: ym, c: margin, s: 5 },
    { y: heroText.top - 10, c: margin, s: 5 },
  ];
  cards.forEach((cd, i) => {
    rows.push({ y: cd.cy, c: W / 2, s: SPREAD[i]! * Wc });
    const next = cards[i + 1];
    if (next) rows.push({ y: (cd.top + next.bottom) / 2, c: W / 2, s: ((SPREAD[i]! + SPREAD[i + 1]!) / 2) * Wc });
  });
  rows.push({ y: cta.cy + 170, c: W / 2, s: 0.07 * Wc }, { y: cta.cy, c: W / 2, s: 0 });
  const R = rows.filter((r, i) => i === 0 || r.y < rows[i - 1]!.y - 1);

  const at = (y: number) => {
    for (let i = 0; i < R.length - 1; i++) {
      const a = R[i]!;
      const b = R[i + 1]!;
      if (y >= b.y) {
        let t = clamp((a.y - y) / (a.y - b.y));
        t = t * t * (3 - 2 * t);
        return { c: a.c + (b.c - a.c) * t, s: a.s + (b.s - a.s) * t };
      }
    }
    return R[R.length - 1]!;
  };

  const y0 = R[0]!.y;
  const y1 = R[R.length - 1]!.y;
  const colors = [scene.strandBone, ...party.map((p) => scene.strand(p.hue))];
  const strands = colors.map((col, k): Strand => {
    const off = (k - 2) / 2;
    const X = (y: number, f: number) => {
      const { c, s } = at(y);
      const base = c + s * (0.6 * off + 0.4 * Math.sin(y / 150 + k * 1.25));
      const near = clamp(1 - (y0 - y) / 260);
      const amp = 2.5 + 0.035 * s + 9 * near;
      return base + f * amp * Math.sin(y / 55 + k * 2.1 + f * 1.7) + f * 1.2;
    };
    const line = (f: number) => {
      let d = "";
      for (let y = y0; y > y1; y -= 14) d += `${d ? "L" : "M"}${X(y, f).toFixed(1)} ${y.toFixed(1)}`;
      return `${d}L${(W / 2).toFixed(1)} ${y1.toFixed(1)}`;
    };
    return { color: col, core: line(0), filaments: [line(-1), line(1)] };
  });
  return { y0, y1, strands };
}

/** The hearth: three layers of flickering flame bars on crossed logs, with smoke and embers. */
function Fire({ motion }: { motion: boolean }) {
  return useMemo(() => {
    let seed = 0x9e3779b9;
    const r = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const e = createElement;
    const smoke = [scene.strandBone, ...party.map((p) => scene.strand(p.hue, 0.45)), scene.strandBone].map((c, i) =>
      e("circle", {
        key: `p${i}`,
        cx: 92 + r() * 16,
        cy: 40,
        r: 11,
        fill: c,
        style: motion
          ? ({ filter: "blur(7px)", transformBox: "fill-box", transformOrigin: "center", "--dx": `${((r() - 0.3) * 70).toFixed(0)}px`, animation: `bcPuff ${(5 + r() * 3).toFixed(2)}s ease-out ${(-r() * 8).toFixed(2)}s infinite` } as CSSProperties)
          : { filter: "blur(8px)", opacity: 0.25, transform: `translate(${i * 9 - 20}px,${-i * 22}px) scale(${1 + i * 0.3})`, transformBox: "fill-box", transformOrigin: "center" },
      }),
    );
    const flames: ReactNode[] = [];
    [
      { n: 17, bw: 8, p: 9, hm: 150 },
      { n: 13, bw: 7, p: 8, hm: 118 },
      { n: 9, bw: 5, p: 7, hm: 74 },
    ].forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        const off = i - (L.n - 1) / 2;
        const env = Math.exp(-((off / (L.n / 3.4)) ** 2));
        const h = Math.max(10, L.hm * env * (0.7 + 0.3 * r()));
        const x = 100 + off * L.p + (r() - 0.5) * 2;
        const dur = (0.32 + r() * 0.5).toFixed(2);
        const del = (-r()).toFixed(2);
        flames.push(
          e("rect", {
            key: `f${li}-${i}`,
            x: (x - L.bw / 2).toFixed(1),
            y: (178 - h).toFixed(1),
            width: L.bw,
            height: h.toFixed(1),
            rx: L.bw / 2,
            fill: scene.flame[li],
            style: motion ? { transformBox: "fill-box", transformOrigin: "50% 100%", animation: `bcFlick ${dur}s ease-in-out ${del}s infinite alternate` } : undefined,
          }),
        );
      }
    });
    const embers = motion
      ? Array.from({ length: 7 }, (_, i) =>
          e("circle", {
            key: `e${i}`,
            cx: 82 + r() * 36,
            cy: 120 + r() * 20,
            r: 1.6,
            fill: scene.ember,
            style: { "--dx": `${((r() - 0.5) * 50).toFixed(0)}px`, animation: `bcEmber ${(2.6 + r() * 2).toFixed(2)}s ease-out ${(-r() * 4).toFixed(2)}s infinite` } as CSSProperties,
          }),
        )
      : [];
    return (
      <svg viewBox="0 0 200 220" width="100%" height="100%" aria-hidden style={{ overflow: "visible", display: "block" }}>
        <defs>
          <radialGradient id="bcGlow">
            <stop offset="0%" stopColor={scene.flame[1]} stopOpacity={0.55} />
            <stop offset="100%" stopColor={scene.flame[0]} stopOpacity={0} />
          </radialGradient>
        </defs>
        <ellipse cx={100} cy={184} rx={110} ry={34} fill="url(#bcGlow)" />
        {smoke}
        {flames}
        <rect x={30} y={176} width={140} height={13} rx={6.5} fill={scene.logs[0]} transform="rotate(-9 100 182)" />
        <rect x={30} y={176} width={140} height={13} rx={6.5} fill={scene.logs[1]} transform="rotate(9 100 182)" />
        {embers}
      </svg>
    );
  }, [motion]);
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** Measures the column and turns the scroll position into the hour, the climb and the card motion. */
function useNight(reduce: boolean) {
  const wrap = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLElement>(null);
  const heroText = useRef<HTMLDivElement>(null);
  const fire = useRef<HTMLDivElement>(null);
  const heroBtn = useRef<HTMLButtonElement>(null);
  const ctaSeat = useRef<HTMLDivElement>(null);
  const ctaBtn = useRef<HTMLButtonElement>(null);
  const cardRefs = useRef<Array<HTMLLIElement | null>>([]);

  const [geo, setGeo] = useState<Geometry | null>(null);
  const [frame, setFrame] = useState<Frame | null>(null);
  const geoRef = useRef<Geometry | null>(null);

  const measure = useCallback(() => {
    const w = wrap.current;
    const cards = cardRefs.current;
    if (!w || !hero.current || !heroText.current || !fire.current || !ctaSeat.current || cards.length < 6 || cards.some((c) => !c)) return;
    const wr = w.getBoundingClientRect();
    const rel = (el: Element): Box => {
      const r = el.getBoundingClientRect();
      return { top: r.top - wr.top, bottom: r.bottom - wr.top, left: r.left - wr.left, right: r.right - wr.left, cx: (r.left + r.right) / 2 - wr.left, cy: (r.top + r.bottom) / 2 - wr.top };
    };
    const heroBox = rel(hero.current);
    const g: Geometry = {
      W: w.clientWidth,
      H: w.offsetHeight,
      heroText: rel(heroText.current),
      fire: rel(fire.current),
      hero: heroBox,
      cards: cards.map((c) => rel(c!)),
      cta: rel(ctaSeat.current),
      extra: Math.max(0, heroBox.bottom - heroBox.top - innerHeight),
    };
    geoRef.current = g;
    setGeo(g);
  }, []);

  const update = useCallback(() => {
    const g = geoRef.current;
    if (!g || !heroBtn.current || !ctaBtn.current) return;
    const vh = innerHeight;
    const sy = scrollY;
    const T = sy - (g.H - vh) + g.extra;
    // Move the column now, not on the next render, so the rects read below are this frame's.
    if (wrap.current) wrap.current.style.transform = `translate3d(0,${T}px,0)`;

    // The hour: interpolate between the anchors as they pass the middle of the screen.
    const u = vh * 0.5 - T;
    const A = [(g.hero.top + g.hero.bottom) / 2, ...g.cards.map((c) => c.cy), g.cta.cy];
    let hour = HOURS[0]!;
    if (u <= A[A.length - 1]!) hour = HOURS[HOURS.length - 1]!;
    else
      for (let i = 0; i < A.length - 1; i++) {
        if (u <= A[i]! && u > A[i + 1]!) {
          hour = HOURS[i]! + ((HOURS[i + 1]! - HOURS[i]!) * (A[i]! - u)) / (A[i]! - A[i + 1]!);
          break;
        }
      }

    const cards = cardRefs.current.map((el, i) => {
      const r = el!.getBoundingClientRect();
      const e = reduce ? 1 : clamp((r.bottom - vh * 0.02) / (vh * 0.42));
      const k = 1 - Math.pow(1 - e, 3);
      const b = TILT[i]!;
      return { transform: `translateY(${(-(1 - k) * 80).toFixed(1)}px) rotate(${(b + (1 - k) * (b > 0 ? 5 : -5)).toFixed(2)}deg)`, opacity: 0.15 + 0.85 * k };
    });

    const hb = heroBtn.current.getBoundingClientRect();
    const cb = ctaBtn.current.getBoundingClientRect();
    setFrame({
      T,
      scrollY: sy,
      hour,
      cards,
      barCandle: hb.top > vh - 60 && cb.bottom < 60,
      vw: innerWidth,
      fireScale: clamp((vh - 520) / 320, 0.6, 1),
    });
  }, [reduce]);

  useLayoutEffect(() => {
    measure();
    update();
    let raf = 0;
    const onScroll = () => {
      if (document.hidden) return update();
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          update();
        });
    };
    const onResize = () => {
      measure();
      update();
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    if (wrap.current) ro.observe(wrap.current);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [measure, update]);

  return { refs: { wrap, hero, heroText, fire, heroBtn, ctaSeat, ctaBtn, cardRefs }, geo, frame };
}

/** "Thu · 10:00 pm", to the nearest five minutes. */
function clockOf(hour: number): string {
  const hh = ((hour % 24) + 24) % 24;
  let h = Math.floor(hh);
  let m = Math.round(((hh % 1) * 60) / 5) * 5;
  if (m === 60) {
    h += 1;
    m = 0;
  }
  return `${hour < 24 ? "Thu" : "Fri"} · ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h % 24 >= 12 ? "pm" : "am"}`;
}

export function Landing({ onOpenLogin, onOpenData }: { onOpenLogin: () => void; onOpenData: () => void }) {
  const reduce = useReducedMotion();
  const { refs, geo, frame } = useNight(reduce);
  const paths = useMemo(() => (geo ? buildStrands(geo) : null), [geo]);
  const seals = useMemo(
    () => ({
      dm: seal(dm.seed, { bone: true, bars: 30 }),
      dmSmall: seal(dm.seed, { bone: true, bars: 22 }),
      gawainSmall: seal("gawain", { hue: gawain.hue, bars: 28 }),
      logo: seal("bardcast", { bone: true, bars: 24 }),
      party: Object.fromEntries(party.map((p) => [p.id, seal(p.id, { hue: p.hue, bars: { gawain: 48, ysolde: 40, cadoc: 40, morwen: 36 }[p.id] ?? 40 })])) as Record<string, Seal>,
    }),
    [],
  );

  // Sky and ink for the current hour.
  const hour = frame?.hour ?? HOURS[0]!;
  const hh = ((hour % 24) + 24) % 24;
  const rgb = skyAt(hh);
  const L = luminance(rgb);
  const dark = L < 0.3;
  const sky = `rgb(${rgb.join(",")})`;
  const ink = dark ? color.chalk : color.ink;
  const chip = dark ? "rgba(236,231,219,0.12)" : "rgba(30,26,21,0.08)";
  const isSun = hh >= 6 && hh < 18;
  const arc = isSun ? (hh - 6) / 12 : ((hh - 18 + 24) % 24) / 12;
  const sy = frame?.scrollY ?? 0;

  const climb = paths && frame ? clamp((paths.y0 - (innerHeight * 0.22 - frame.T)) / (paths.y0 - paths.y1)) : 0;
  const barCandle = frame?.barCandle ?? false;
  const hideWordmark = barCandle && (frame?.vw ?? 390) < 560;
  const fireScale = frame?.fireScale ?? 1;

  const heroSeals: Array<{ seal: Seal; size: number; left: string; top: string; rotate: number }> = [
    { seal: seals.dm, size: 58, left: "10%", top: "40%", rotate: -9 },
    { seal: seals.party.morwen!, size: 62, left: "90%", top: "36%", rotate: 12 },
    { seal: seals.party.cadoc!, size: 74, left: "15%", top: "76%", rotate: -14 },
    { seal: seals.party.ysolde!, size: 74, left: "85%", top: "78%", rotate: 6 },
    { seal: seals.party.gawain!, size: 88, left: "50%", top: "96%", rotate: -4 },
  ];

  const card = (i: number) => frame?.cards[i] ?? { transform: `rotate(${TILT[i]}deg)`, opacity: 1 };
  const cardRef = (i: number) => (el: HTMLLIElement | null) => {
    refs.cardRefs.current[i] = el;
  };

  return (
    <>
      {/* The sky, its stars, the felt weave over everything, and the sun or moon on its arc. */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundColor: sky }} />
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          opacity: clamp((0.1 - L) / 0.08),
          backgroundImage: "radial-gradient(rgba(236,231,219,0.7) 1px, transparent 1.6px), radial-gradient(rgba(236,231,219,0.45) 0.8px, transparent 1.2px)",
          backgroundSize: "97px 89px, 53px 61px",
          backgroundPositionX: "11px, 31px",
          backgroundPositionY: `${(7 + sy * 0.18).toFixed(1)}px, ${(23 + sy * 0.32).toFixed(1)}px`,
        }}
      />
      {/* The felt weave, lighter than texture.felt so it stays quiet over the daytime sky. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundImage: "radial-gradient(rgba(236,231,219,0.05) 1px, transparent 1.3px), radial-gradient(rgba(0,0,0,0.12) 1px, transparent 1.3px)",
          backgroundSize: "9px 9px, 9px 9px",
          backgroundPosition: "0 0, 4.5px 4.5px",
        }}
      />
      <div
        aria-hidden
        style={{ position: "fixed", zIndex: 0, pointerEvents: "none", left: `${(6 + 88 * arc).toFixed(2)}%`, top: `${(10 + (1 - Math.sin(Math.PI * arc)) * 30).toFixed(2)}vh`, opacity: Math.min(1, Math.sin(Math.PI * arc) * 3), transform: "translate(-50%,-50%)" }}
      >
        {isSun ? (
          <div style={{ width: 64, height: 64, borderRadius: 999, background: scene.sun, boxShadow: `0 0 70px 26px ${scene.sunGlow}` }} />
        ) : (
          <div style={{ position: "relative", width: 42, height: 42, borderRadius: 999, background: scene.moon, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 13, top: -6, width: 42, height: 42, borderRadius: 999, backgroundColor: sky }} />
          </div>
        )}
      </div>

      {/* Gives the document its scroll height; the column itself is fixed. */}
      <div style={{ height: geo ? geo.H - geo.extra : "600vh" }} />

      <div
        ref={refs.wrap}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          top: 0,
          zIndex: 1,
          fontFamily: font.ui,
          color: color.chalk,
          overflowX: "clip",
          display: "flex",
          flexDirection: "column-reverse",
          willChange: "transform",
          transform: frame ? `translate3d(0,${frame.T}px,0)` : "translateY(calc(100vh - 100%))",
        }}
      >
        {paths && geo && (
          <svg width={geo.W} height={geo.H} viewBox={`0 0 ${geo.W} ${geo.H}`} aria-hidden style={{ position: "absolute", left: 0, top: 0, zIndex: 1, pointerEvents: "none", overflow: "visible" }}>
            {paths.strands.map((s, k) => {
              const dash = { pathLength: 1, strokeDasharray: "1 1", strokeDashoffset: (1 - climb).toFixed(4) };
              return (
                <g key={k} fill="none" strokeLinecap="round" strokeLinejoin="round" stroke={s.color}>
                  <path d={s.core} strokeWidth={6} opacity={0.035} />
                  <path d={s.core} strokeWidth={18} opacity={0.045} {...dash} />
                  <path d={s.core} strokeWidth={8} opacity={0.07} {...dash} />
                  <path d={s.filaments[0]} strokeWidth={0.9} opacity={0.45} {...dash} />
                  <path d={s.core} strokeWidth={1.5} opacity={0.7} {...dash} />
                  <path d={s.filaments[1]} strokeWidth={0.9} opacity={0.45} {...dash} />
                </g>
              );
            })}
          </svg>
        )}

        {/* Thursday, 8pm: the hearth. */}
        <section
          ref={refs.hero}
          style={{
            position: "relative",
            zIndex: 2,
            minHeight: "100svh",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "clamp(12px,3vh,40px)",
            padding: "clamp(64px,12vh,110px) 24px clamp(56px,13vh,120px)",
            textAlign: "center",
          }}
        >
          <div ref={refs.heroText} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 560, position: "relative", zIndex: 2 }}>
            <h1 style={{ ...styles.h1, fontSize: "clamp(36px,6vw,60px)", lineHeight: 1.06, margin: 0 }}>{voice.tagline}</h1>
            <p style={styles.lede}>
              Your character, in your words, told back as a podcast for the whole party. Answer out loud whenever you have thirty seconds. Nobody has to find a free Saturday.
            </p>
            <button ref={refs.heroBtn} style={{ ...styles.candle, marginTop: 6, padding: "0 40px" }} onClick={onOpenLogin}>
              {voice.cta}
            </button>
            <SignInHint />
          </div>
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "-20%",
              right: "-20%",
              bottom: 0,
              height: 150,
              borderRadius: "50% 50% 0 0 / 70px 70px 0 0",
              ...texture.room,
              backgroundColor: scene.hill,
              backgroundSize: "9px 9px",
              zIndex: 0,
            }}
          />
          <div aria-hidden style={{ position: "relative", zIndex: 1, width: "min(100%,380px)", height: Math.round(300 * fireScale), marginBottom: -10 }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: 300, transformOrigin: "50% 0", transform: `scale(${fireScale.toFixed(3)})` }}>
              <div style={{ position: "absolute", left: "50%", top: 120, width: 420, height: 240, transform: "translateX(-50%)", background: `radial-gradient(ellipse at center, ${scene.glow}, transparent 65%)`, pointerEvents: "none" }} />
              <div ref={refs.fire} style={{ position: "absolute", left: "50%", top: 20, width: 200, height: 220, transform: "translateX(-50%)" }}>
                <Fire motion={!reduce} />
              </div>
              {heroSeals.map((s, i) => (
                <div key={i} style={{ position: "absolute", left: s.left, top: s.top, transform: "translate(-50%,-50%)" }}>
                  <SealMark seal={s.seal} size={s.size} rotate={s.rotate} shadow={s.size > 80 ? "0 4px 6px rgba(0,0,0,0.55)" : "0 3px 4px rgba(0,0,0,0.5)"} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The week, Thursday night to Friday evening. Listed in reading order; shown bottom-up. */}
        <ol
          aria-label="How a week at the table works"
          style={{ position: "relative", zIndex: 2, maxWidth: 860, margin: "0 auto", padding: "0 20px 22vh", width: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column-reverse", gap: "34vh", listStyle: "none" }}
        >
          <Step i={0} n="01" when="Thu · 10:00 pm" title="The DM sets the scene" body="Some questions go to the whole party. Some are just for you. Either way, your answers become the spine of the story." motion={card(0)} liRef={cardRef(0)}>
            <div style={{ border: `1px solid ${color.vellumLine}`, borderRadius: shape.radius.well, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <SealMark seal={seals.dmSmall} size={30} shadow="0 2px 2px rgba(0,0,0,0.3)" />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{voice.promptNotification(gawain.shortName)}</span>
              </div>
              <span style={{ fontFamily: font.display, fontSize: 19, lineHeight: 1.3, textWrap: "pretty" }}>
                The green stranger has lifted his own head from the floor. It is looking at you. What do you say?
              </span>
            </div>
          </Step>

          <Step i={1} n="02" when="Fri · 12:30 am" title="You answer, in character" body="Thirty seconds, from bed, at half past midnight. What you say becomes who they are. How you say it becomes how they sound." motion={card(1)} liRef={cardRef(1)}>
            <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 12, background: color.vellumLine, borderRadius: shape.radius.well, padding: "8px 14px 8px 8px", alignSelf: "flex-start" }}>
              <span style={{ width: 32, height: 32, background: color.hearth, clipPath: shape.hex, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: color.vellum }} />
              </span>
              <Waveform seed="rec" bars={24} height={24} fill={voiceColor(gawain.hue, "vellum")} />
              <span style={{ fontFamily: font.mono, fontSize: 13 }}>0:18</span>
            </div>
          </Step>

          <Step i={2} n="03" when="Fri · 3:00 am" title="The dice fall where they fall" body="Bold choices get rolled. The story keeps every result, even the ones you'd rather it forgot." motion={card(2)} liRef={cardRef(2)}>
            <div style={{ display: "flex", gap: 18, padding: "6px 0 2px" }}>
              <ThrownDie value={3} tone="fail" label="Cadoc · sneak" rotate={-6} />
              <ThrownDie value={14} tone="success" label="Ysolde · charm" rotate={4} />
              <ThrownDie value={20} tone="crit" label="Gawain · nerve" rotate={-2} />
            </div>
            <HandNote ground="vellum" style={{ fontSize: 18, alignSelf: "flex-end" }}>
              Cadoc, I'm so sorry about that 3.
            </HandNote>
          </Step>

          <Step i={3} n="04" when="Fri · 6:30 am" title="The chapter is told" body="Bardcast builds the session around your answers: the road between, the stranger's reply, the roll that went wrong. It's waiting with your coffee, voiced by the people who lived it." motion={card(3)} liRef={cardRef(3)} stain>
            <EpisodeSample />
          </Step>

          <Step
            i={4}
            n="05"
            when="Fri · 1:00 pm"
            title="Your character keeps the scars"
            body="Every answer leaves a mark on who they are, and who they are is yours. When this campaign ends, they follow you to the next table."
            motion={card(4)}
            liRef={cardRef(4)}
            mark={<SealMark seal={seals.gawainSmall} size={56} shadow="0 2px 3px rgba(0,0,0,0.3)" />}
          >
            <TraitBars />
          </Step>

          <Step i={5} n="06" when="Fri · 6:30 pm" title="The DM starts plotting" body="Your answers and rolls decide the next scene. The DM decides how much you'll regret them." motion={card(5)} liRef={cardRef(5)}>
            <div style={{ display: "grid", gridTemplateColumns: "14px 1fr", columnGap: 12, rowGap: 14, alignItems: "center" }}>
              {campaign.chapters.slice(0, 2).map((ch, i) => (
                <ChapterRow key={ch.numeral} n={i + 1} title={ch.title} state={i === 0 ? "told" : "next Thu"} told={i === 0} />
              ))}
            </div>
          </Step>
        </ol>

        {/* Friday, 8pm: the open seat. */}
        <section
          style={{ position: "relative", zIndex: 2, minHeight: "100svh", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "120px 24px 26vh", textAlign: "center" }}
        >
          <div ref={refs.ctaSeat} aria-hidden style={{ width: 128, height: 128, borderRadius: 999, border: `2px dashed ${scene.seat}`, display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
            <span style={{ fontFamily: font.mono, fontSize: 11, color: color.chalkDim, background: scene.seatLabel, padding: "3px 6px", borderRadius: shape.radius.chip }}>your seal</span>
          </div>
          <h2 style={{ fontFamily: font.display, fontWeight: 400, fontSize: "clamp(32px,5vw,48px)", lineHeight: 1.08, margin: "8px 0 0", maxWidth: 520, textWrap: "pretty" }}>There's an open seat at the table.</h2>
          <p style={{ ...styles.lede, maxWidth: 440 }}>Bring a character, or just a name and a bad idea. The party gathers again Thursday night.</p>
          <button ref={refs.ctaBtn} style={{ ...styles.candle, marginTop: 6, padding: "0 40px" }} onClick={onOpenLogin}>
            {voice.cta}
          </button>
          <SignInHint />
          <OwnershipNote onOpen={onOpenData} />
        </section>
      </div>

      {/* The clock, so you know where in the night you are. */}
      <div aria-hidden style={{ position: "fixed", top: 14, right: 16, zIndex: 20, fontFamily: font.mono, fontSize: 12, letterSpacing: "0.04em", padding: "6px 10px", borderRadius: shape.radius.chip, color: ink, background: chip, backdropFilter: "blur(6px)" }}>
        {clockOf(hour)}
      </div>

      <nav
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          padding: "22px 16px calc(10px + env(safe-area-inset-bottom))",
          fontFamily: font.ui,
          color: ink,
          background: `linear-gradient(to top, rgba(${rgb.join(",")},0.92) 0%, rgba(${rgb.join(",")},0.92) 42%, transparent 100%)`,
        }}
      >
        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SealMark seal={seals.logo} size={30} rotate={-8} />
            <span style={{ fontFamily: font.display, fontSize: 21, whiteSpace: "nowrap", overflow: "hidden", transition: "max-width .3s ease, opacity .3s ease", maxWidth: hideWordmark ? 0 : 120, opacity: hideWordmark ? 0 : 1 }}>bardcast</span>
          </span>
          {/* The candle, carried here only while neither in-page candle is on screen. */}
          <button
            tabIndex={barCandle ? 0 : -1}
            aria-hidden={!barCandle}
            onClick={onOpenLogin}
            style={{
              ...styles.candle,
              position: "absolute",
              left: "50%",
              top: 4,
              height: 48,
              padding: "0 26px",
              fontSize: 15,
              whiteSpace: "nowrap",
              clipPath: shape.bevel(14),
              transition: "opacity .3s ease, transform .3s ease",
              opacity: barCandle ? 1 : 0,
              transform: `translate(-50%, ${barCandle ? "0px" : "14px"})`,
              pointerEvents: barCandle ? "auto" : "none",
            }}
          >
            {voice.cta}
          </button>
          <button style={{ ...styles.compact, color: ink, background: chip }} onClick={onOpenLogin}>
            Sign in
          </button>
        </div>
      </nav>
    </>
  );
}

/** The short version of /your-data, under the open seat. */
function OwnershipNote({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ marginTop: 36, maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: color.chalkDim, margin: 0, textWrap: "pretty" }}>
        Your character lives in your own AT Protocol account, not ours. Your voice is only cloned if you say yes. The episodes stay with your party.
      </p>
      <button style={{ ...styles.quiet, color: color.chalk, textDecoration: "underline", textUnderlineOffset: 3 }} onClick={onOpen}>
        What's yours, and what belongs to the table
      </button>
    </div>
  );
}

function SignInHint() {
  return (
    <span style={{ fontSize: 13, color: color.chalkDim }}>
      Sign in with your <span style={{ fontFamily: font.mono, color: color.chalk }}>AT Protocol</span> handle
    </span>
  );
}

/** One step of the week: a sheet of vellum set down on alternating sides, easing in as it rises into view. */
function Step({
  i,
  n,
  when,
  title,
  body,
  mark,
  stain,
  motion,
  liRef,
  children,
}: {
  i: number;
  n: string;
  when: string;
  title: string;
  body: string;
  mark?: ReactNode;
  stain?: boolean;
  motion: { transform: string; opacity: number };
  liRef: (el: HTMLLIElement | null) => void;
  children: ReactNode;
}) {
  const heading = <h2 style={{ fontFamily: font.display, fontWeight: 400, fontSize: 26, lineHeight: 1.15, margin: 0 }}>{title}</h2>;
  return (
    <li ref={liRef} style={{ display: "flex", justifyContent: i % 2 ? "flex-end" : "flex-start" }}>
      <div
        style={{
          ...styles.vellum,
          width: "min(100%,440px)",
          boxSizing: "border-box",
          padding: 22,
          boxShadow: "0 16px 36px rgba(0,0,0,0.36)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          transform: motion.transform,
          opacity: motion.opacity,
        }}
      >
        {/* The one stain on this screen: a cup ring on the morning's episode, clear of the text. */}
        {stain && <RingStain seed="cup-3" tone="tea" style={{ right: -50, bottom: -56, width: 170, height: 170 }} />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: font.mono, fontSize: 12, color: color.inkDim }}>
          <span>{n}</span>
          <span>{when}</span>
        </div>
        {mark ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {mark}
            {heading}
          </div>
        ) : (
          heading
        )}
        <p style={{ fontSize: 16, lineHeight: 1.5, color: color.inkDim, margin: 0, textWrap: "pretty" }}>{body}</p>
        {children}
      </div>
    </li>
  );
}

/** A thrown die on vellum: hearth for a failure, felt for a success, moss for a natural 20. */
function ThrownDie({ value, tone, label, rotate }: { value: number; tone: "fail" | "success" | "crit"; label: string; rotate: number }) {
  const face = tone === "fail" ? { background: color.hearth, color: color.vellum } : tone === "crit" ? { background: color.moss, color: color.felt } : { background: color.feltLine, color: color.chalk };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <span
        style={{ width: 58, height: 52, clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)", ...face, fontFamily: font.display, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", transform: `rotate(${rotate}deg)` }}
      >
        {value}
      </span>
      <span style={{ fontFamily: font.mono, fontSize: 11, color: color.inkDim }}>{label}</span>
    </div>
  );
}

/** Chapter One, ready to play, its waveform tinted by who is speaking. */
function EpisodeSample() {
  const s = campaign.sample;
  const ink = speakerColor("vellum");
  const speakers: Array<[string, string]> = [["Narrator", "narrator"], ...party.map((p): [string, string] => [p.shortName, p.id])];
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
        <span style={{ fontSize: 14, color: color.inkDim }}>
          {campaign.title} · {s.minutes} min
        </span>
        <span style={{ fontFamily: font.display, fontSize: 21, lineHeight: 1.15 }}>{s.chapter}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* TODO(bardcast): play the released chapter's audioRef once a public sample is rendered. */}
        <HexKey size={48} background={color.ink} label={`Play ${s.chapter}`}>
          <PlayGlyph size={48} fill={color.vellum} />
        </HexKey>
        <EpisodeWave seed="ch1" bars={52} step={5} barWidth={3} height={36} segments={s.segments} played={s.played} colorOf={ink} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {speakers.map(([name, id]) => (
          <span key={id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: color.inkDim }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: ink(id) }} />
            {name}
          </span>
        ))}
      </div>
    </>
  );
}

/** Three of Gawain's traits as heard; below the 60% line a trait is still being learned. */
function TraitBars() {
  const shown = ["Courteous to a fault", "Afraid, and hides it", "Tempted by comfort"];
  const traits = characters.gawain!.traits.filter(([name]) => shown.includes(name));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {traits.map(([name, v]) => (
        <div key={name} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span>{name}</span>
            <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkDim }}>{v >= 60 ? `${v}%` : `${v}% · learning`}</span>
          </div>
          <div style={{ height: 4, background: color.vellumLine, borderRadius: 2 }}>
            <div style={{ height: 4, borderRadius: 2, width: `${v}%`, background: v >= 60 ? voiceColor(hueOf("gawain"), "vellum") : color.learning }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function ChapterRow({ n, title, state, told }: { n: number; title: string; state: string; told: boolean }) {
  return (
    <>
      <span style={{ width: 10, height: 10, borderRadius: 999, boxSizing: "border-box", justifySelf: "center", ...(told ? { background: color.ink } : { border: `1.5px solid ${color.ink}` }) }} />
      <span style={{ fontSize: 15, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>
          Ch. {n} · {title}
        </span>
        <span style={{ fontFamily: font.mono, fontSize: 12, color: color.inkDim }}>{state}</span>
      </span>
    </>
  );
}

