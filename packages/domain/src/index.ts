/**
 * @bardcast/domain — the shared model every app and service imports.
 *
 * Zod schemas mirror the lexicons in /lexicons. Runtime code validates against
 * the Zod schemas; the lexicons are the published-record contract.
 */
export * from "./nsid.js";
export * from "./ids.js";
export * from "./identity.js";
export * from "./character.js";
export * from "./campaign.js";
export * from "./voice.js";
export * from "./readiness.js";
export * from "./dice.js";
export * from "./resolution.js";
export * from "./canon.js";
