import { useAudioRecorder } from "@antiphony/capture-kit";
import { color, font, voiceColor } from "@bardcast/brand";
import { isPersonality, optionLabel, type CreationAttribute, type CreationTurn } from "@bardcast/domain";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { creations, type CreationView } from "../creations.js";
import { Dot, HexKey, PlayGlyph, styles } from "../ui.js";
import { RevealCard } from "./RevealCard.js";

/** How often to check back while the narrator listens to an answer. */
const POLL_MS = 4000;
/** Long enough for a real answer, short enough to stay a conversation. */
const MAX_ANSWER_MS = 3 * 60_000;

/**
 * Session zero (docs/character-creation.md): the narrator asks, the player
 * answers out loud (or types), one question at a time, until who they are is
 * settled. Then the card. It can take as long as the player likes: everything
 * is saved after each answer, and this screen picks up wherever it was left.
 */
export function SessionZero({
  did,
  id,
  hue,
  voiceConsent,
  onBack,
  onVoice,
}: {
  did: string;
  id: string;
  /** The player's voice hue: their words are drawn in it. */
  hue: number;
  voiceConsent: boolean;
  onBack: () => void;
  onVoice: () => void;
}) {
  const [view, setView] = useState<CreationView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (label: string, step: () => Promise<CreationView>) => {
      setBusy(label);
      setError(null);
      try {
        setView(await step());
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  useEffect(() => {
    void run("loading", () => creations.get(did, id));
  }, [did, id, run]);

  const creation = view?.creation;
  const last = creation?.turns.at(-1);
  // An answer is in but not read yet (transcribing, or the narrator thinking): check back.
  const listening = creation?.status === "talking" && Boolean(last?.reply) && !last?.reading;
  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => {
      creations.advance(did, id).then(setView, () => undefined);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [listening, did, id]);

  if (!view || !creation) {
    return (
      <div style={styles.page}>
        <BackLink onBack={onBack} />
        <p style={styles.muted}>{error ?? "Pulling up a chair…"}</p>
      </div>
    );
  }

  const name = creation.name.confirmed;
  const ink = voiceColor(hue);
  const done = creation.turns.filter((t) => t !== last);

  return (
    <div style={styles.page}>
      <BackLink onBack={onBack} />
      <p style={styles.eyebrow}>Session zero</p>
      <h1 style={{ ...styles.h1, marginBottom: 4 }}>{name ?? "Someone new"}</h1>
      <Settled creation={creation} />

      {done.length > 0 && creation.status === "talking" && (
        <details style={{ marginTop: 20 }}>
          <summary style={{ ...styles.meta, cursor: "pointer" }}>So far · {done.length} {done.length === 1 ? "answer" : "answers"}</summary>
          <ol style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexDirection: "column", gap: 14 }}>
            {done.map((t, i) => (
              <li key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ ...styles.muted, fontSize: 14 }}>{t.question}</span>
                {t.reply?.transcript && <span style={{ fontSize: 15, color: ink }}>“{t.reply.transcript}”</span>}
              </li>
            ))}
          </ol>
        </details>
      )}

      <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        {creation.name.heard && !name && creation.status !== "confirmed" && (
          <NameCheck heard={creation.name.heard} busy={busy === "name"} onConfirm={(n) => run("name", () => creations.name(did, id, n))} />
        )}

        {creation.status === "confirmed" ? (
          <Sealed name={name ?? "They"} voiceConsent={voiceConsent} onVoice={onVoice} onDone={onBack} />
        ) : creation.status === "ready" ? (
          creation.card ? (
            <RevealCard
              view={view}
              busy={busy}
              onRevise={(line) => run("revise", () => creations.revise(did, id, line))}
              onConfirm={(abilities, increases) => run("confirm", () => creations.confirm(did, id, abilities, increases))}
            />
          ) : name ? (
            <article style={styles.card}>
              <h2 style={styles.h2}>That's enough to go on.</h2>
              <p style={{ ...styles.muted, marginTop: 0 }}>The narrator has a fair idea who {name} is. Time to see if they're right.</p>
              <button style={{ ...styles.candle, marginTop: 8 }} disabled={busy === "propose"} onClick={() => run("propose", () => creations.propose(did, id))}>
                {busy === "propose" ? "Writing it down…" : `Meet ${name}`}
              </button>
            </article>
          ) : (
            <p style={styles.muted}>One last thing: tell us their name above.</p>
          )
        ) : view.next.kind === "pick" ? (
          <Pick
            question={last?.question ?? ""}
            attribute={view.next.attribute}
            candidates={view.next.candidates}
            busy={busy === "pick"}
            onPick={(value) => run("pick", () => creations.pick(did, id, view.next.kind === "pick" ? view.next.attribute : "", value))}
          />
        ) : listening ? (
          <article style={styles.card}>
            <p style={{ ...styles.muted, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
              <Dot tone={color.chalkDim} /> The narrator is listening back. This can take a moment.
            </p>
          </article>
        ) : last && !last.reply ? (
          <Question
            // A fresh recorder and text box for every question.
            key={creation.turns.length}
            did={did}
            id={id}
            index={creation.turns.length - 1}
            turn={last}
            ink={ink}
            busy={busy === "answer"}
            onAnswer={(answer) => run("answer", () => creations.answer(did, id, answer))}
            onPick={(attribute, value) => run("pick", () => creations.pick(did, id, attribute, value))}
          />
        ) : (
          <article style={styles.card}>
            <p style={{ ...styles.muted, margin: 0 }}>The narrator lost their place.</p>
            <button style={{ ...styles.compact, marginTop: 12 }} onClick={() => run("advance", () => creations.advance(did, id))}>
              Try again
            </button>
          </article>
        )}

        {error && <p style={{ ...styles.muted, color: color.hearthSoft, margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button style={{ ...styles.back, marginLeft: -10 }} onClick={onBack}>
      ‹ You
    </button>
  );
}

/** What's settled so far, as the character takes shape. Shown, not hidden: the card is where it changes. */
function Settled({ creation }: { creation: CreationView["creation"] }) {
  const entries = Object.entries(creation.settled);
  if (!entries.length) return <p style={{ ...styles.meta, margin: 0 }}>Nothing settled yet. Just talk.</p>;
  return (
    <div style={{ ...styles.row, gap: 6, marginTop: 6 }}>
      {entries.map(([attribute, s]) => (
        <span key={attribute} style={styles.chip}>
          {chipLabel(attribute as CreationAttribute, s!.value)}
        </span>
      ))}
    </div>
  );
}

/** A trait is one word ("bold"); species, class and background go by their names. */
function chipLabel(attribute: CreationAttribute, value: string): string {
  return isPersonality(attribute) ? value.replace(/_/g, " ") : optionLabel(attribute, value);
}

/** The narrator's question, a way to hear it, and the answer: spoken, or typed. */
function Question({
  did,
  id,
  index,
  turn,
  ink,
  busy,
  onAnswer,
  onPick,
}: {
  did: string;
  id: string;
  index: number;
  turn: CreationTurn;
  ink: string;
  busy: boolean;
  onAnswer: (answer: { audio?: Blob; text?: string }) => void;
  onPick: (attribute: string, value: string) => void;
}) {
  const recorder = useAudioRecorder({ maxDurationMs: MAX_ANSWER_MS });
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [hearing, setHearing] = useState<"idle" | "loading" | "playing" | "none">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => audio.current?.pause(), []);

  // The link is signed and short-lived, so it's fetched each time it's played.
  async function hear() {
    setHearing("loading");
    try {
      const url = await creations.questionAudio(did, id, index);
      audio.current?.pause();
      audio.current = new Audio(url);
      audio.current.onended = () => setHearing("idle");
      await audio.current.play();
      setHearing("playing");
    } catch {
      setHearing("none");
    }
  }

  const seconds = Math.floor(recorder.elapsedMs / 1000);
  const choose = turn.kind === "choose" && turn.attribute && turn.candidates?.length === 2;

  return (
    <article style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <HexKey size={44} background={color.feltLine} label="Hear the narrator ask" onClick={() => void hear()}>
          <PlayGlyph size={40} fill={color.chalk} />
        </HexKey>
        <p style={{ fontFamily: font.display, fontSize: 22, lineHeight: 1.3, margin: 0 }}>{turn.question}</p>
      </div>
      {hearing === "none" && <p style={{ ...styles.meta, margin: 0 }}>The narrator's voice isn't here yet. Read it out to yourself.</p>}

      {choose && (
        <div style={{ ...styles.row }}>
          {turn.candidates!.map((value) => (
            <button key={value} style={styles.compact} onClick={() => onPick(turn.attribute!, value)}>
              {optionLabel(turn.attribute!, value)}
            </button>
          ))}
        </div>
      )}

      {typing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Say it how they'd say it."
            style={{ ...styles.input, height: "auto", padding: 12, resize: "vertical", color: ink }}
          />
          <div style={styles.row}>
            <button style={styles.candle} disabled={busy || !text.trim()} onClick={() => onAnswer({ text })}>
              {busy ? "Sending…" : "Answer"}
            </button>
            <button style={styles.quiet} onClick={() => setTyping(false)}>
              Speak instead
            </button>
          </div>
        </div>
      ) : recorder.status === "recording" ? (
        <div style={styles.row}>
          <button style={{ ...styles.candle, background: color.hearth, color: color.chalk }} onClick={recorder.stop}>
            ■ Stop · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </button>
        </div>
      ) : recorder.status === "recorded" && recorder.recording ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <audio src={recorder.recording.previewUrl} controls style={{ width: "100%" }} />
          <div style={styles.row}>
            <button style={styles.candle} disabled={busy} onClick={() => onAnswer({ audio: recorder.recording!.blob })}>
              {busy ? "Sending…" : "Send it"}
            </button>
            <button style={styles.quiet} disabled={busy} onClick={recorder.reset}>
              Say it again
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={styles.row}>
            <button style={styles.candle} onClick={() => void recorder.start()}>
              ● Answer out loud
            </button>
            <button style={styles.quiet} onClick={() => setTyping(true)}>
              Type instead
            </button>
          </div>
          {recorder.status === "error" && (
            <p style={{ ...styles.meta, color: color.hearthSoft, margin: 0 }}>
              {recorder.errorKind === "permission-denied"
                ? "Your browser said no to the microphone. Allow it in your settings, or type instead."
                : recorder.errorKind === "no-device"
                  ? "There's no microphone here. Type instead, or try on your phone."
                  : "The microphone wouldn't open. Type instead, or try again."}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/** The narrator couldn't tell from the answers: the player picks, with a tap. */
function Pick({
  question,
  attribute,
  candidates,
  busy,
  onPick,
}: {
  question: string;
  attribute: CreationAttribute;
  candidates: [string, string];
  busy: boolean;
  onPick: (value: string) => void;
}) {
  return (
    <article style={styles.card}>
      <p style={{ fontFamily: font.display, fontSize: 22, lineHeight: 1.3, margin: "0 0 16px" }}>{question}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {candidates.map((value) => (
          <button key={value} style={{ ...styles.secondary, justifyContent: "flex-start" }} disabled={busy} onClick={() => onPick(value)}>
            {optionLabel(attribute, value)}
          </button>
        ))}
      </div>
    </article>
  );
}

/** Names are never guessed: the player confirms what the narrator heard, or spells it right. */
function NameCheck({ heard, busy, onConfirm }: { heard: string; busy: boolean; onConfirm: (name: string) => void }) {
  const [name, setName] = useState(heard.replace(/[.!?]+$/, ""));
  return (
    <article style={{ ...styles.card, display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={styles.label} htmlFor="character-name">
        Did we hear that right?
      </label>
      <input id="character-name" value={name} onChange={(e) => setName(e.target.value)} style={styles.input as CSSProperties} />
      <div style={styles.row}>
        <button style={styles.compact} disabled={busy || !name.trim()} onClick={() => onConfirm(name.trim())}>
          {busy ? "Saving…" : "That's their name"}
        </button>
      </div>
    </article>
  );
}

/** Saved. The seal is pressed from their voice, once they lend it. */
function Sealed({ name, voiceConsent, onVoice, onDone }: { name: string; voiceConsent: boolean; onVoice: () => void; onDone: () => void }) {
  return (
    <article style={styles.card}>
      <h2 style={styles.h2}>{name} is yours.</h2>
      <p style={{ ...styles.muted, marginTop: 0 }}>
        {voiceConsent
          ? `Bring ${name} to any table. They'll sit down at the table's level, and come home with what they earn.`
          : `What you said is who ${name} is. How you said it can be how they sound, if you'd like.`}
      </p>
      <div style={{ ...styles.row, marginTop: 8 }}>
        {voiceConsent ? (
          <button style={styles.candle} onClick={onDone}>
            Done
          </button>
        ) : (
          <>
            <button style={styles.candle} onClick={onVoice}>
              Lend {name} your voice
            </button>
            <button style={styles.quiet} onClick={onDone}>
              Not now
            </button>
          </>
        )}
      </div>
    </article>
  );
}
