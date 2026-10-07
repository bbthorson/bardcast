/**
 * Where the data in src/generated comes from. The importer reads exactly this
 * commit; to update the data, change the commit, run `npm run import -w
 * @bardcast/srd`, and review the diff.
 */
export const SRD_SOURCE = {
  repo: "5e-bits/5e-srd-api",
  commit: "05c109ea1f6b5445960b645ded48ad9c6a8df7b0",
  path: "packages/5e-database/src/2024/en",
} as const;

/**
 * The attribution CC-BY-4.0 requires. Shown in NOTICE and on the app's credits
 * line. The SRD is Wizards'; the JSON compilation is 5e-bits' (MIT).
 */
export const SRD_ATTRIBUTION =
  "This work includes material from the System Reference Document 5.2 (\"SRD 5.2\") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.";
