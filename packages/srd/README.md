# @bardcast/srd

A typed subset of the D&D **System Reference Document 5.2** (the 2024 rules, CC-BY-4.0): the
12 classes with their level tables and starting kits, the 9 species and their lineages, the 4
backgrounds, feats, equipment (weapons with damage, properties and mastery; armor with AC, Dex cap,
Strength minimum and stealth), skills and conditions. Spells, monsters and magic items aren't in it
yet.

```ts
import { getArmor, getClass, classFeaturesAt } from "@bardcast/srd";
getClass("fighter")?.hitDie; // 10
getArmor("chain-mail");      // { category: "heavy", baseAc: 16, strMinimum: 13, … }
```

**`src/generated` is generated. Never edit it.** `scripts/import.ts` reads the JSON compilation in
[5e-bits/5e-srd-api](https://github.com/5e-bits/5e-srd-api) at the commit pinned in
`src/source.ts`, validates every entry with Zod, keeps the fields we use, checks every reference
resolves, and writes the modules. To update:

1. Change `commit` in `src/source.ts`.
2. `npm run import -w @bardcast/srd` (or `-- --from DIR` to read local `5e-SRD-*.json` files).
3. Review the diff, and run `npm test -w @bardcast/srd`. The spot checks compare values against the
   SRD 5.2 itself.

Where the compilation disagrees with the SRD, `CORRECTIONS` in the importer fixes it, with a test
pinning each one. The importer refuses a correction that no longer changes anything, so a fix
upstream shows up as a failed import, not a silent no-op.

**Attribution.** Anything that shows SRD material to people must also show `SRD_ATTRIBUTION`
(importable from `@bardcast/srd/source` without pulling in the data). See `NOTICE`.
