import { color, font, shape } from "@bardcast/brand";
import {
  ABILITY_SCORES,
  optionLabel,
  STANDARD_ARRAY,
  type AbilityScore,
  type AbilityScores,
  type BackgroundIncreases,
} from "@bardcast/domain";
import { getBackground } from "@bardcast/srd";
import { useMemo, useState, type ReactNode } from "react";
import type { CardLine, CreationView } from "../creations.js";
import { styles } from "../ui.js";

const SHORT: Record<AbilityScore, string> = {
  strength: "STR",
  dexterity: "DEX",
  constitution: "CON",
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

const mod = (score: number) => {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : String(m);
};

/**
 * The reveal (docs/character-creation.md, "The reveal"): a vellum card, the
 * story on the front and the 5e backbone on the back. Every line on the front
 * has "not quite". On the back the player places the scores (the narrator only
 * suggests) and picks the background's increases, then keeps the character.
 */
export function RevealCard({
  view,
  busy,
  onRevise,
  onConfirm,
}: {
  view: CreationView;
  busy: string | null;
  onRevise: (line: CardLine) => void;
  onConfirm: (abilities: AbilityScores, increases: BackgroundIncreases) => void;
}) {
  const { creation } = view;
  const card = creation.card!;
  const name = creation.name.confirmed ?? "They";
  const [side, setSide] = useState<"front" | "back">("front");

  const notQuite = (line: CardLine) => (
    <button
      style={{ background: "none", border: "none", padding: 0, fontFamily: font.ui, fontSize: 13, color: color.inkDim, cursor: "pointer", textDecoration: "underline", flex: "none" }}
      disabled={busy === "revise"}
      onClick={() => onRevise(line)}
    >
      not quite
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <article style={{ ...styles.vellum, color: color.ink, padding: "28px 22px", display: "flex", flexDirection: "column", gap: 18, transform: "rotate(-0.6deg)" }}>
        {side === "front" ? (
          <>
            <div>
              <p style={styles.vellumEyebrow}>{name}</p>
              <Line action={notQuite({ field: "concept" })}>
                <span style={{ fontFamily: font.display, fontSize: 24, lineHeight: 1.25 }}>{card.concept}</span>
              </Line>
            </div>
            <Section title="Quirks">
              {card.quirks.map((q, i) => (
                <Line key={i} action={notQuite({ field: "quirk", index: i })}>
                  {q}
                </Line>
              ))}
            </Section>
            <Section title="What drives them">
              {card.drives.map((d, i) => (
                <Line key={i} action={notQuite({ field: "drive", index: i })}>
                  {d}
                </Line>
              ))}
            </Section>
            <figure style={{ margin: 0, background: color.vellumRaised, borderRadius: shape.radius.card, padding: "14px 16px" }}>
              <Line action={notQuite({ field: "quote" })}>
                <blockquote style={{ margin: 0, fontFamily: font.display, fontSize: 18, fontStyle: "italic" }}>“{card.quote}”</blockquote>
              </Line>
              <figcaption style={{ ...styles.vellumEyebrow, marginTop: 6 }}>in your own words</figcaption>
            </figure>
          </>
        ) : (
          <Back view={view} busy={busy === "confirm"} onConfirm={onConfirm} />
        )}
      </article>
      <div style={styles.row}>
        {side === "front" ? (
          <button style={styles.candle} onClick={() => setSide("back")}>
            Turn it over
          </button>
        ) : (
          <button style={styles.quiet} onClick={() => setSide("front")}>
            ‹ The front
          </button>
        )}
      </div>
      {busy === "revise" && <p style={{ ...styles.meta, margin: 0 }}>Trying another way to put it…</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ ...styles.vellumEyebrow, margin: 0 }}>{title}</p>
      {children}
    </section>
  );
}

function Line({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "baseline", justifyContent: "space-between", fontSize: 16, lineHeight: 1.45 }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      {action}
    </div>
  );
}

/** The 5e backbone: what was settled, the scores the player places, the background's increases. */
function Back({
  view,
  busy,
  onConfirm,
}: {
  view: CreationView;
  busy: boolean;
  onConfirm: (abilities: AbilityScores, increases: BackgroundIncreases) => void;
}) {
  const { creation } = view;
  const name = creation.name.confirmed ?? "them";
  const cls = creation.settled.class?.value;
  const species = creation.settled.species?.value;
  const background = creation.settled.background?.value;
  const bg = background ? getBackground(background) : undefined;

  const [abilities, setAbilities] = useState<AbilityScores>(
    () =>
      creation.suggestedAbilities ??
      (Object.fromEntries(ABILITY_SCORES.map((a, i) => [a, STANDARD_ARRAY[i]])) as AbilityScores),
  );
  const [mode, setMode] = useState<"two-one" | "ones">("two-one");
  const [plusTwo, setPlusTwo] = useState<AbilityScore | undefined>(bg?.abilityScores[0] as AbilityScore | undefined);
  const [plusOne, setPlusOne] = useState<AbilityScore | undefined>(bg?.abilityScores[1] as AbilityScore | undefined);

  // Placing a value swaps it with whichever ability held it, so the array is always used once each.
  function place(ability: AbilityScore, value: number) {
    const holder = ABILITY_SCORES.find((a) => abilities[a] === value)!;
    setAbilities({ ...abilities, [holder]: abilities[ability], [ability]: value });
  }

  const increases = useMemo<BackgroundIncreases>(() => {
    if (!bg) return {};
    if (mode === "ones") return Object.fromEntries(bg.abilityScores.map((a) => [a, 1]));
    return plusTwo && plusOne && plusTwo !== plusOne ? { [plusTwo]: 2, [plusOne]: 1 } : {};
  }, [bg, mode, plusTwo, plusOne]);
  const ready = Object.keys(increases).length > 0;
  const final = (a: AbilityScore) => Math.min(20, abilities[a] + (increases[a] ?? 0));

  const select = { ...styles.input, height: 36, padding: "0 8px", background: color.vellumRaised, color: color.ink, border: `1px solid ${color.vellumLine}` };

  return (
    <>
      <div>
        <p style={styles.vellumEyebrow}>Level 1</p>
        <p style={{ fontFamily: font.display, fontSize: 22, margin: "4px 0 0" }}>
          {[species && optionLabel("species", species), cls && optionLabel("class", cls)].filter(Boolean).join(" ")}
        </p>
        {background && <p style={{ margin: "2px 0 0", color: color.inkDim }}>{optionLabel("background", background)}</p>}
      </div>

      <Section title={creation.suggestedAbilities ? "Abilities · the narrator's guess, yours to move" : "Abilities"}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {ABILITY_SCORES.map((a) => (
            <label key={a} style={{ border: `1px solid ${color.vellumLine}`, borderRadius: shape.radius.well, padding: "8px 8px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <span style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: "0.06em", color: color.inkDim }}>{SHORT[a]}</span>
              <span style={{ fontFamily: font.display, fontSize: 22 }}>{mod(final(a))}</span>
              <select aria-label={`${a} score`} value={abilities[a]} onChange={(e) => place(a, Number(e.target.value))} style={select}>
                {STANDARD_ARRAY.map((v) => (
                  <option key={v} value={v}>
                    {v}
                    {increases[a] ? ` +${increases[a]}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </Section>

      {bg && (
        <Section title={`What ${bg.name.toLowerCase()} years gave ${name}`}>
          <div style={{ display: "flex", gap: 16, fontSize: 15 }}>
            <label>
              <input type="radio" checked={mode === "two-one"} onChange={() => setMode("two-one")} /> +2 and +1
            </label>
            <label>
              <input type="radio" checked={mode === "ones"} onChange={() => setMode("ones")} /> +1 to all three
            </label>
          </div>
          {mode === "two-one" && (
            <div style={{ display: "flex", gap: 10 }}>
              <select aria-label="+2 to" value={plusTwo} onChange={(e) => setPlusTwo(e.target.value as AbilityScore)} style={select}>
                {bg.abilityScores.map((a) => (
                  <option key={a} value={a}>
                    +2 {a}
                  </option>
                ))}
              </select>
              <select aria-label="+1 to" value={plusOne} onChange={(e) => setPlusOne(e.target.value as AbilityScore)} style={select}>
                {bg.abilityScores.map((a) => (
                  <option key={a} value={a}>
                    +1 {a}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode === "two-one" && plusTwo === plusOne && <span style={{ fontSize: 13, color: color.inkDim }}>Pick two different ones.</span>}
        </Section>
      )}

      <button style={{ ...styles.candle, alignSelf: "flex-start" }} disabled={busy || !ready} onClick={() => onConfirm(abilities, increases)}>
        {busy ? "Sealing it…" : `Keep ${name}`}
      </button>
    </>
  );
}
