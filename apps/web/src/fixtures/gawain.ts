import { DEFAULT_THRESHOLDS, type Register, type VoiceStatus } from "@bardcast/domain";
import { color, voiceColor, type SpeakerSegment } from "@bardcast/brand";

/**
 * The sample table: Sir Gawain and the Green Knight
 * (content/campaigns/sir-gawain-and-the-green-knight), played by four friends.
 * These are VIEW models for the campaign-progress and character-sheet screens,
 * shaped after the domain types they will be derived from.
 *
 * TODO(bardcast): replace with orchestrator reads — Campaign + Chapter records,
 * each character's profile/sheet/behavior/voice (CharacterSignal), and the
 * CharacterStateEvent timeline — once the web app has endpoints for them.
 */

export interface PartyMember {
  id: string;
  name: string;
  /** Short name used in copy ("Answer as Gawain"). */
  shortName: string;
  handle: string;
  hue: number;
  /** Readiness counts against DEFAULT_THRESHOLDS (sheet traits, behavior exemplars). */
  confidentTraits: number;
  exemplars: number;
  voice: VoiceStatus;
}

export interface ReadinessView {
  /** 0..1 progress per axis: sheet, behavior, voice. */
  axes: [number, number, number];
  ready: boolean;
  /** The first missing axis, said plainly: "sheet 3/5", "needs voice". */
  status: string;
}

/** Summarise a party member the way the readiness gate would (packages/domain/src/readiness.ts). */
export function readinessOf(p: PartyMember): ReadinessView {
  const { minConfidentTraits: needTraits, minBehaviorExemplars: needExemplars } = DEFAULT_THRESHOLDS;
  const sheet = Math.min(1, p.confidentTraits / needTraits);
  const behavior = Math.min(1, p.exemplars / needExemplars);
  const voice = p.voice === "unlinked" ? 0 : 1;
  const status =
    sheet < 1
      ? `sheet ${p.confidentTraits}/${needTraits}`
      : behavior < 1
        ? `behavior ${p.exemplars}/${needExemplars}`
        : voice < 1
          ? "needs voice"
          : "ready";
  return { axes: [sheet, behavior, voice], ready: status === "ready", status };
}

export const party: PartyMember[] = [
  { id: "gawain", name: "Gawain", shortName: "Gawain", handle: "@theo", hue: 35, confidentTraits: 5, exemplars: 8, voice: "pvc" },
  { id: "ysolde", name: "Ysolde the herald", shortName: "Ysolde", handle: "@priya", hue: 250, confidentTraits: 5, exemplars: 6, voice: "ivc" },
  { id: "cadoc", name: "Brother Cadoc", shortName: "Cadoc", handle: "@sam", hue: 180, confidentTraits: 3, exemplars: 8, voice: "ivc" },
  { id: "morwen", name: "Morwen", shortName: "Morwen", handle: "@jules", hue: 320, confidentTraits: 5, exemplars: 8, voice: "unlinked" },
];

export const dm = { handle: "@wren", seed: "dm-wren" };

/** Voice colour for a speaker on the given ground; the narrator (the DM) is chalk on felt, ink on vellum. */
export function speakerColor(ground: "felt" | "vellum"): (speaker: string) => string {
  return (speaker) => {
    const member = party.find((p) => p.id === speaker);
    if (!member) return ground === "felt" ? color.chalk : color.ink;
    return voiceColor(member.hue, ground);
  };
}

export type Roll = { value: number; tone: "fail" | "success" | "crit"; label: string; rotate: number };
export interface Beat {
  /** Who the beat happened to — its dot is in their voice colour. */
  who: string;
  text: string;
  roll?: Roll;
}

export interface ChapterView {
  numeral: string;
  title: string;
  state: "told" | "gathering" | "sealed";
  /** Mono eyebrow after the state word: in-world dates and runtime. */
  when: string;
  minutes?: number;
  /** Who speaks when, for the speaker-tinted waveform. */
  segments?: SpeakerSegment[];
  /** Fraction already listened to. */
  played?: number;
  beats?: Beat[];
  /** The DM's margin note, in chalk. */
  dmNote?: string;
}

const CH1_SEGMENTS: SpeakerSegment[] = [["narrator", 5], ["gawain", 3], ["narrator", 2], ["ysolde", 3], ["narrator", 2], ["cadoc", 2], ["gawain", 3], ["morwen", 3], ["narrator", 3]];

export const campaign = {
  id: "gawain-green-knight",
  title: "Sir Gawain and the Green Knight",
  eyebrow: "Christmas to Christmas · Arthurian",
  currentChapter: 3,
  /** How far along the trail the party has walked (0..1). */
  walked: 0.64,
  prompt: {
    to: "gawain",
    asked: "asked 2 days ago · 1:04 listen",
    text: "On the third morning the lady offers you a green silk girdle. She says whoever wears it cannot be killed. What do you tell her?",
    seconds: 30,
  },
  chapters: [
    {
      numeral: "I",
      title: "The Beheading Game",
      state: "told",
      when: "New Year's Day",
      minutes: 22,
      segments: CH1_SEGMENTS,
      played: 1,
      beats: [
        { who: "gawain", text: "Gawain takes up the axe for his uncle.", roll: { value: 20, tone: "crit", label: "nat", rotate: -10 } },
        { who: "ysolde", text: "Ysolde swears to ride north with him." },
      ],
    },
    {
      numeral: "II",
      title: "The Journey North",
      state: "told",
      when: "All Saints to Christmas Eve",
      minutes: 18,
      segments: [["narrator", 3], ["morwen", 3], ["cadoc", 3], ["narrator", 2], ["gawain", 2], ["ysolde", 3], ["narrator", 2]],
      played: 0.6,
      beats: [
        { who: "cadoc", text: "Cadoc fails a Wisdom save in the Wirral and loses the road.", roll: { value: 7, tone: "fail", label: "wis", rotate: 8 } },
        { who: "morwen", text: "Morwen finds the castle through the snow.", roll: { value: 18, tone: "success", label: "srv", rotate: -6 } },
      ],
    },
    {
      numeral: "III",
      title: "The Exchange of Winnings",
      state: "gathering",
      when: "Christmas at Hautdesert",
      dmNote: "lady asks tonight. don't warn him.",
    },
    { numeral: "IV", title: "The Green Chapel", state: "sealed", when: "a year and a day" },
  ] satisfies ChapterView[],
  /** A released chapter to offer signed-out visitors on the home page. */
  sample: { chapter: "Chapter One: The Beheading Game", minutes: 22, segments: CH1_SEGMENTS, played: 0.38 },
};

export interface ArcEvent {
  date: string;
  state: string;
  register: Register;
}

export interface CharacterView {
  id: string;
  name: string;
  concept: string;
  pronouns: string;
  player: string;
  voice: { status: VoiceStatus; sampledMinutes: number };
  stats: { level: number; ac: number; hp: [number, number]; abilities: Array<[string, number]> };
  drives: string[];
  dmNote: string;
  /** Trait name → confidence (0..100). */
  traits: Array<[string, number]>;
  exemplars: Array<{ quote: string; chapter: string; rotate: number }>;
  arc: ArcEvent[];
}

export const characters: Record<string, CharacterView> = {
  gawain: {
    id: "gawain",
    name: "Sir Gawain",
    concept: "Arthur's nephew, sworn to keep a bargain he doesn't understand.",
    pronouns: "he/him",
    player: "@theo.bsky.social",
    voice: { status: "pvc", sampledMinutes: 31 },
    stats: { level: 4, ac: 17, hp: [38, 42], abilities: [["STR", 14], ["DEX", 12], ["CON", 13], ["INT", 11], ["WIS", 15], ["CHA", 17]] },
    drives: ["Keep his word, even to a monster.", "Be worthy of the pentangle on his shield.", "Get through the year without anyone seeing him afraid."],
    dmNote: "he'll break this one first. — DM",
    traits: [["Courteous to a fault", 92], ["Afraid, and hides it", 78], ["Proud of his name", 71], ["Quick to confess", 64], ["Tempted by comfort", 48]],
    exemplars: [
      { quote: "If a man asks for a blow and names his price, you pay it. That is the whole of it.", chapter: "ch. I", rotate: -1.2 },
      { quote: "I'd rather freeze on the road than arrive late to my own death.", chapter: "ch. II", rotate: 1 },
    ],
    arc: [
      { date: "New Year's", state: "Takes the Green Knight’s bargain in front of the whole court.", register: "public" },
      { date: "All Saints", state: "Leaves Camelot. Tells no one he has stopped sleeping.", register: "private" },
      { date: "Christmas Eve", state: "Prays for shelter and finds a castle.", register: "under-pressure" },
    ],
  },
};
