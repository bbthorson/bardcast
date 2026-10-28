import { TID } from "@atproto/common-web";
import {
  ABILITY_SCORES,
  applyBackgroundIncreases,
  attributeOptions,
  attributeQuestion,
  chooseQuestion,
  Collections,
  CREATION_ATTRIBUTES,
  CharacterCard,
  Creation,
  isPersonality,
  isPlayerQuote,
  isStandardArray,
  NAME_QUESTION,
  nextStep,
  OPENER_QUESTION,
  optionLabel,
  placeStandardArray,
  playerQuoteFrom,
  playerSpace,
  playerWords,
  settles,
  unsettledAttributes,
  UNCLEAR_TRAIT_VALUE,
  type AbilityScore,
  type AbilityScores,
  type BackgroundIncreases,
  type CharacterProfile,
  type CharacterSheet,
  type CreationAttribute,
  type CreationStep,
  type CreationTurn,
  type SrdClass,
  type StrongRef,
} from "@bardcast/domain";
import { getClass, getFeature } from "@bardcast/srd";
import type { CoreServices } from "../ports/index.js";
import type { ChoiceQuestion, ScoreQuestion } from "../ports/decision-model.js";
import type { CardLine, CreationConversation } from "../ports/narrative-writer.js";
import { writeSheetVersion } from "./sheets.js";

/**
 * Session zero (docs/character-creation.md, "Session zero, out loud"). The
 * narrator asks one voice prompt at a time in the player's own space; after
 * each answer Clef reads the whole conversation, and code in
 * @bardcast/domain's creation.ts decides what's settled and what to ask next.
 * The NarrativeWriter only phrases questions and writes the card.
 *
 * The creation is saved after every step, so a player can answer over days,
 * and a failure partway (the writer, the voice render, Antiphony) loses
 * nothing: `advanceCreation` picks up from the saved state.
 */

export class CreationError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "conflict" | "invalid",
  ) {
    super(message);
    this.name = "CreationError";
  }
}

type PlayerDid = `did:${string}`;

export interface CreationView {
  id: string;
  creation: Creation;
  /** What happens next: who's waiting on whom. */
  next: CreationStep;
}

const view = (id: string, creation: Creation): CreationView => ({ id, creation, next: nextStep(creation) });

async function load(svc: CoreServices, id: string, did: string): Promise<Creation> {
  const creation = await svc.store.getCreation(id);
  if (!creation) throw new CreationError(`no creation ${id}`, "not_found");
  if (creation.player !== did) throw new CreationError("that creation belongs to another player", "forbidden");
  return creation;
}

async function save(svc: CoreServices, id: string, creation: Creation): Promise<Creation> {
  const valid = Creation.parse({ ...creation, updatedAt: svc.clock().toISOString() });
  await svc.store.putCreation(id, valid);
  return valid;
}

function conversation(creation: Creation): CreationConversation {
  return creation.turns.map((t) => ({
    narrator: t.question,
    ...(t.reply?.transcript ? { player: t.reply.transcript } : {}),
  }));
}

/** Start a character: the first prompt goes into the player's space (made now, if this is their first). */
export async function startCreation(svc: CoreServices, input: { did: PlayerDid }): Promise<CreationView> {
  const now = svc.clock().toISOString();
  const id = `creation.${TID.nextStr()}`;
  await svc.antiphony.ensureSpace(playerSpace(input.did));
  let creation: Creation = {
    player: input.did,
    status: "talking",
    turns: [],
    settled: {},
    name: {},
    createdAt: now,
    updatedAt: now,
  };
  creation = await save(svc, id, await speak(svc, creation, { kind: "opener" }));
  return view(id, creation);
}

export async function getCreation(svc: CoreServices, input: { id: string; did: string }): Promise<CreationView> {
  return view(input.id, await load(svc, input.id, input.did));
}

export async function listCreations(svc: CoreServices, input: { did: string }): Promise<CreationView[]> {
  return (await svc.store.listCreations(input.did)).map(({ id, creation }) => view(id, creation));
}

export interface AnswerCreationInput {
  id: string;
  did: PlayerDid;
  /** The spoken answer. Posted as a reply to the current prompt, in the player's space. */
  audio?: Blob;
  /** A typed answer (the text fallback), or the client's own transcript of the audio. */
  text?: string;
}

/**
 * The player answers the current prompt. The answer is saved before anything
 * reads it, then the conversation moves on as far as it can.
 */
export async function answerCreation(svc: CoreServices, input: AnswerCreationInput): Promise<CreationView> {
  let creation = await load(svc, input.id, input.did);
  if (creation.status !== "talking") throw new CreationError("the conversation is over", "conflict");
  const last = creation.turns.at(-1);
  if (!last || last.reply) throw new CreationError("there's no question waiting for an answer", "conflict");
  const text = input.text?.trim() || undefined;
  if (!input.audio && !text) throw new CreationError("an answer needs audio or text", "invalid");

  let uri: string | undefined;
  if (input.audio) {
    uri = await svc.antiphony.createReply({
      promptUri: last.prompt.uri,
      promptCid: last.prompt.cid,
      audioBlob: input.audio,
      actingDid: input.did,
      ...(text ? { text } : {}),
    });
  }
  const transcript = text ?? (uri ? await transcriptOf(svc, last.prompt.uri, uri) : undefined);
  const reply: NonNullable<CreationTurn["reply"]> = {
    ...(uri ? { uri } : {}),
    ...(transcript ? { transcript } : {}),
    at: svc.clock().toISOString(),
  };
  creation = await save(svc, input.id, replaceLast(creation, { ...last, reply }));
  return advanceCreation(svc, input);
}

/**
 * Move the conversation on as far as it can go without the player: fetch a
 * pending transcript, have Clef read the latest answer, and ask the next
 * question. Safe to call any time; with nothing to do it does nothing.
 */
export async function advanceCreation(svc: CoreServices, input: { id: string; did: string }): Promise<CreationView> {
  let creation = await load(svc, input.id, input.did);
  if (creation.status !== "talking") return view(input.id, creation);

  const last = creation.turns.at(-1);
  if (last?.reply && !last.reply.transcript && last.reply.uri) {
    const transcript = await transcriptOf(svc, last.prompt.uri, last.reply.uri);
    if (!transcript) return view(input.id, creation); // Antiphony hasn't transcribed it yet.
    creation = await save(svc, input.id, replaceLast(creation, { ...last, reply: { ...last.reply, transcript } }));
  }

  const answered = creation.turns.at(-1);
  if (answered?.reply?.transcript && !answered.reading) {
    creation = await save(svc, input.id, await read(svc, creation));
  }

  const step = nextStep(creation);
  switch (step.kind) {
    case "opener":
    case "name":
    case "ask":
    case "choose":
      creation = await save(svc, input.id, await speak(svc, creation, step));
      break;
    case "done":
      creation = await save(svc, input.id, { ...creation, status: "ready" });
      break;
    case "wait":
    case "pick":
      break;
  }
  return view(input.id, creation);
}

/** The player picks an attribute's value: when asked to, or to change what Clef settled. */
export async function pickAttribute(
  svc: CoreServices,
  input: { id: string; did: string; attribute: string; value: string },
): Promise<CreationView> {
  let creation = await load(svc, input.id, input.did);
  if (creation.status === "confirmed") throw new CreationError("this character is already saved", "conflict");
  const attribute = asAttribute(input.attribute);
  if (!(input.value in attributeOptions(attribute))) {
    throw new CreationError(`${input.value} isn't an option for ${attribute}`, "invalid");
  }
  const { card: _card, suggestedAbilities: _abilities, ...rest } = creation;
  creation = await save(svc, input.id, {
    ...rest,
    settled: { ...creation.settled, [attribute]: { value: input.value, by: "player", at: svc.clock().toISOString() } },
  });
  return creation.status === "talking" ? advanceCreation(svc, input) : view(input.id, creation);
}

/** The player confirms their character's name: what they said, or a corrected spelling. */
export async function confirmName(
  svc: CoreServices,
  input: { id: string; did: string; name: string },
): Promise<CreationView> {
  let creation = await load(svc, input.id, input.did);
  if (creation.status === "confirmed") throw new CreationError("this character is already saved", "conflict");
  const name = input.name.trim();
  if (!name) throw new CreationError("a name can't be empty", "invalid");
  creation = await save(svc, input.id, { ...creation, name: { ...creation.name, confirmed: name } });
  return creation.status === "talking" ? advanceCreation(svc, input) : view(input.id, creation);
}

/**
 * Once everything is settled: the card's front (the NarrativeWriter, from the
 * whole conversation) and Clef's suggested placement of the standard array.
 */
export async function proposeCharacter(svc: CoreServices, input: { id: string; did: string }): Promise<CreationView> {
  let creation = await load(svc, input.id, input.did);
  if (creation.status !== "ready") throw new CreationError("the conversation isn't finished", "conflict");
  const name = creation.name.confirmed;
  if (!name) throw new CreationError("confirm the character's name first", "conflict");

  const written = CharacterCard.parse(
    await svc.narrative.writeCard({ conversation: conversation(creation), name, settled: settledLabels(creation) }),
  );
  const card = isPlayerQuote(creation, written.quote)
    ? written
    : { ...written, quote: playerQuoteFrom(playerWords(creation)) };
  creation = await save(svc, input.id, { ...creation, card, suggestedAbilities: await suggestAbilities(svc, creation) });
  return view(input.id, creation);
}

/** "Not quite": a new take on one line of the card, and only that line. */
export async function reviseLine(
  svc: CoreServices,
  input: { id: string; did: string; line: CardLine },
): Promise<CreationView> {
  let creation = await load(svc, input.id, input.did);
  const { card } = creation;
  const name = creation.name.confirmed;
  if (!card || !name || creation.status !== "ready") throw new CreationError("there's no card to revise", "conflict");
  const { line } = input;
  if (line.field === "quirk" || line.field === "drive") {
    const list = line.field === "quirk" ? card.quirks : card.drives;
    if (!Number.isInteger(line.index) || line.index < 0 || line.index >= list.length) {
      throw new CreationError(`no ${line.field} ${line.index}`, "invalid");
    }
  }

  const text = (
    await svc.narrative.reviseCardLine({
      conversation: conversation(creation),
      name,
      settled: settledLabels(creation),
      card,
      line,
    })
  ).trim();
  const next = { ...card };
  if (line.field === "concept") next.concept = text;
  if (line.field === "quote") {
    // Still the player's own words, or the card keeps the quote it had.
    if (isPlayerQuote(creation, text)) next.quote = text;
  }
  if (line.field === "quirk") next.quirks = card.quirks.map((q, i) => (i === line.index ? text : q));
  if (line.field === "drive") next.drives = card.drives.map((d, i) => (i === line.index ? text : d));
  creation = await save(svc, input.id, { ...creation, card: CharacterCard.parse(next) });
  return view(input.id, creation);
}

export interface ConfirmCharacterInput {
  id: string;
  did: PlayerDid;
  /** The standard array as the player placed it. */
  abilities: AbilityScores;
  /** The background's +2/+1 or +1/+1/+1, as the player chose. */
  backgroundIncreases: BackgroundIncreases;
}

/**
 * Save the character: a profile and its first sheet version (through
 * sheets.ts, the only sheet writer). The creation is kept, marked confirmed.
 */
export async function confirmCharacter(
  svc: CoreServices,
  input: ConfirmCharacterInput,
): Promise<CreationView & { characterId: string; sheet: StrongRef }> {
  let creation = await load(svc, input.id, input.did);
  const { card } = creation;
  const name = creation.name.confirmed;
  if (creation.status !== "ready" || !card || !name) {
    throw new CreationError("the card isn't ready to confirm", "conflict");
  }
  if (!isStandardArray(input.abilities)) {
    throw new CreationError("ability scores must be the standard array, each used once", "invalid");
  }
  const cls = creation.settled.class?.value as SrdClass;
  const background = creation.settled.background!.value;
  let abilities: AbilityScores;
  try {
    abilities = applyBackgroundIncreases(input.abilities, background, input.backgroundIncreases);
  } catch (err) {
    throw new CreationError((err as Error).message, "invalid");
  }

  const now = svc.clock().toISOString();
  const rkey = TID.nextStr();
  const characterId = `char.${rkey}`;
  const profile: CharacterProfile = {
    player: input.did,
    displayName: name,
    concept: card.concept,
    drives: card.drives,
    createdAt: now,
  };
  await svc.store.putCharacter(characterId, profile);

  const sheet: CharacterSheet = {
    character: `at://${input.did}/${Collections.characterProfile}/${rkey}`,
    class: cls,
    species: creation.settled.species!.value,
    background,
    abilities,
    features: levelOneFeatures(cls),
    advancements: [],
    traits: CREATION_ATTRIBUTES.filter(isPersonality).flatMap((axis) => {
      const s = creation.settled[axis];
      return s ? [{ name: axis, value: s.value }] : [];
    }),
    quirks: card.quirks,
    // TODO(bardcast): the class and background starting kits, and the background's origin feat.
    equipment: [],
    createdAt: now,
  };
  const ref = await writeSheetVersion(svc, characterId, sheet);
  creation = await save(svc, input.id, { ...creation, status: "confirmed", character: characterId });
  return { ...view(input.id, creation), characterId, sheet: ref };
}

// --- internals ---------------------------------------------------------------

function replaceLast(creation: Creation, turn: CreationTurn): Creation {
  return { ...creation, turns: [...creation.turns.slice(0, -1), turn] };
}

async function transcriptOf(svc: CoreServices, promptUri: string, replyUri: string): Promise<string | undefined> {
  const replies = await svc.antiphony.listReplies(promptUri as `at://${string}`);
  return replies.find((r) => r.uri === replyUri)?.transcript?.trim() || undefined;
}

/** Say the next thing: write it (or take the fixed line), voice it, and post it as a prompt in the player's space. */
async function speak(
  svc: CoreServices,
  creation: Creation,
  step: Extract<CreationStep, { kind: "opener" | "name" | "ask" | "choose" }>,
): Promise<Creation> {
  let question: string;
  switch (step.kind) {
    case "opener":
      question = OPENER_QUESTION;
      break;
    case "name":
      question = NAME_QUESTION;
      break;
    case "choose":
      question = chooseQuestion(step.attribute, step.candidates);
      break;
    case "ask": {
      const options = attributeOptions(step.attribute);
      const [a, b] = step.candidates;
      question = await svc.narrative.writeQuestion({
        conversation: conversation(creation),
        ...(creation.name.confirmed ? { name: creation.name.confirmed } : {}),
        attribute: step.attribute,
        candidates: [
          { key: a, meaning: options[a] ?? a },
          { key: b, meaning: options[b] ?? b },
        ],
      });
      break;
    }
  }
  question = question.trim().slice(0, 1000);

  const { audio } = await svc.audio.renderLine({ text: question });
  const prompt = await svc.antiphony.createPrompt({
    title: question,
    audio,
    // The space is the player's own and Bardcast's DID is its author segment;
    // the player is the only DID this conversation has.
    actingDid: creation.player as PlayerDid,
    space: playerSpace(creation.player as PlayerDid),
  });
  const turn: CreationTurn = {
    kind: step.kind,
    ...(step.kind === "ask" || step.kind === "choose" ? { attribute: step.attribute, candidates: step.candidates } : {}),
    question,
    prompt: { uri: prompt.uri, cid: prompt.cid },
    askedAt: svc.clock().toISOString(),
  };
  return { ...creation, turns: [...creation.turns, turn] };
}

/**
 * Clef reads the whole conversation against every unsettled attribute. Its
 * reading goes on the latest turn; anything it now reads clearly is settled.
 * The answer to the name question becomes the name the player is asked to
 * confirm.
 */
async function read(svc: CoreServices, creation: Creation): Promise<Creation> {
  const attributes = unsettledAttributes(creation);
  const questions: Record<string, ChoiceQuestion> = {};
  for (const attribute of attributes) {
    questions[attribute] = {
      type: "choice",
      instructions:
        `The player is describing the character they are about to play, answering a narrator's questions. ` +
        `${attributeQuestion(attribute)} Answer "${UNCLEAR_TRAIT_VALUE}" if their answers don't clearly say.`,
      criteria: { ...attributeOptions(attribute), [UNCLEAR_TRAIT_VALUE]: "Their answers don't say" },
    };
  }
  const answers = attributes.length
    ? await svc.decisions.decide({ state: { conversation: conversation(creation) }, questions })
    : {};

  const now = svc.clock().toISOString();
  const reading: Record<string, Record<string, number>> = {};
  const settled = { ...creation.settled };
  for (const attribute of attributes) {
    const answer = answers[attribute];
    if (!answer) continue;
    const allowed = questions[attribute]!.criteria;
    const probabilities = Object.fromEntries(
      Object.entries(answer.probabilities).filter(([k, p]) => k in allowed && Number.isFinite(p)).map(([k, p]) => [k, clamp01(p)]),
    );
    reading[attribute] = probabilities;
    const settledNow = settles(probabilities);
    if (settledNow) settled[attribute] = { ...settledNow, by: "clef", at: now };
  }

  const last = creation.turns.at(-1)!;
  const name =
    last.kind === "name" && last.reply?.transcript ? { ...creation.name, heard: last.reply.transcript.slice(0, 200) } : creation.name;
  return { ...replaceLast(creation, { ...last, reading }), settled, name };
}

const LEANING = ["not at all", "a little", "a fair amount", "a lot", "above all else"];

/** Clef's suggestion for the standard array: how much the character leans on each ability. */
async function suggestAbilities(svc: CoreServices, creation: Creation): Promise<AbilityScores> {
  const cls = creation.settled.class?.value;
  const primary = cls ? getClass(cls)?.primaryAbility.description : undefined;
  const questions = Object.fromEntries(
    ABILITY_SCORES.map((ability): [AbilityScore, ScoreQuestion] => [
      ability,
      {
        type: "score",
        instructions: `From the player's answers, how much does this character rely on ${ability}?`,
        criteria: LEANING,
      },
    ]),
  ) as Record<AbilityScore, ScoreQuestion>;
  const answers = await svc.decisions.decide({
    state: {
      conversation: conversation(creation),
      ...(cls ? { class: optionLabel("class", cls) } : {}),
      ...(primary ? { classPrimaryAbility: primary } : {}),
    },
    questions,
  });
  return placeStandardArray(Object.fromEntries(ABILITY_SCORES.map((a) => [a, answers[a].score])));
}

function settledLabels(creation: Creation): Record<string, string> {
  return Object.fromEntries(
    Object.entries(creation.settled).map(([attribute, s]) => [attribute, optionLabel(attribute as CreationAttribute, s!.value)]),
  );
}

function levelOneFeatures(cls: SrdClass): string[] {
  const level1 = getClass(cls)?.levels[0]?.features ?? [];
  return level1.map((index) => getFeature(index)?.name ?? index);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function asAttribute(value: string): CreationAttribute {
  if (!(CREATION_ATTRIBUTES as readonly string[]).includes(value)) {
    throw new CreationError(`${value} isn't something session zero settles`, "invalid");
  }
  return value as CreationAttribute;
}
