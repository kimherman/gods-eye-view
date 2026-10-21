# Toilet layers (fork)

This fork (`kimherman/gods-eye-view`, branch `toilets`) adds two data layers
built from the Hogenood toilet export: **Public Toilets** and **Semi-public
Toilets**. They live under _Data Layers → Utilities_. Clicking a marker opens a
detail card with address, opening hours, cost, facilities, photos and, where
known, a wheelchair accessibility checklist.

The layers are fork-only. They are not in upstream, carry no share-link token
and are not part of any PR.

## Quick start

```sh
npm ci
npm run toilets:import          # reads ../hogenood-belgium/data by default
npm run dev                     # http://localhost:4173
```

Then open _Data Layers_, scroll to _Utilities_ and switch on a toilet layer.
Without an import the layers load nothing and report a missing-dataset error.

## Data

### Source

The import reads `world_toilets_local.jsonl` plus its `assets/` folder from a
data directory. Use the `_local` export: its image links point at files in
`assets/`, not at remote URLs.

| Source folder                     | Contents                                             |
| --------------------------------- | ---------------------------------------------------- |
| `assets/logo/`                    | Operator logos                                       |
| `assets/toilet/`                  | Toilet photos                                        |
| `assets/accessibility/questions/` | Illustrations for the wheelchair checklist (19 SVGs) |
| `assets/sticker/`                 | Not used                                             |

Snapshot when the layers were built (2026-10-21): 9,955 records, 755 public and
9,200 semi-public. Coverage is Benelux: 8,330 in the Netherlands and 1,302 in
Belgium. The other 323 are spread over 23 countries, mostly the United Kingdom
(93), Germany (70) and Austria (39).

| Field                        | Records with data                |
| ---------------------------- | -------------------------------- |
| Photos                       | 204 (28 public, 176 semi-public) |
| Wheelchair checklist answers | 135                              |
| Wheelchair facility flag     | 5,052                            |
| Sanitary bin, women          | 3,802                            |

### Licence

The export looks scraped from an app API, so its licence is unclear. The import
output is git-ignored (`public/toilets/`) and must never be committed or pushed.
Anyone cloning the fork needs their own copy of the data.

### Updating

The data is refreshed by hand. After updating the source folder, run the import
again and reload the page:

```sh
npm run toilets:import                       # default: ../hogenood-belgium/data
npm run toilets:import -- /path/to/data      # explicit folder
TOILETS_DATA_DIR=/path/to/data npm run toilets:import
```

Each run deletes `public/toilets/` and rewrites it. It prints the counts, for
example `755 public, 9200 semi-public, 1117 assets copied`. Asset links that
don't resolve to a file in the data folder are dropped. Records without
coordinates are skipped and counted.

### Output

`scripts/import-toilets.mjs` writes:

- `public/toilets/public.geojsonl` and `public/toilets/semipublic.geojsonl`:
  one GeoJSON Feature per line, split on `toiletType`.
- `public/toilets/assets/`: only the logos, photos and illustrations the
  features reference.

Feature properties:

| Property                                                               | Source                      | Notes                                                                          |
| ---------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `toiletId`, `name`                                                     | `id`, `name`                | `name` falls back to `Toilet`                                                  |
| `type`                                                                 | `toiletType`                | `Public` or `SemiPublic`                                                       |
| `address`, `zipcode`, `city`, `country`                                | `location.*`                | ISO 3166 alpha-3 country                                                       |
| `note`                                                                 | `note`                      | Free text, usually Dutch                                                       |
| `cost`, `currency`, `cash`, `card`                                     | `payment.*`                 | `card` is `debitCard`                                                          |
| `facilities.male` … `facilities.eurokey`                               | `accessibility.has*`        | Men, Women, Gender-neutral, Wheelchair, Baby changing, Adult changing, Eurokey |
| `facilities.femaleBin`, `maleBin`, `genderNeutralBin`, `wheelchairBin` | `accessibility.has*Bin`     | Sanitary bins                                                                  |
| `wheelchairChecklist`                                                  | `wheelchairAccessibility`   | Answered items only: `{group, question, description, images, answer}`          |
| `hours`                                                                | `openingTimes.openingTimes` | Seven `HH:MM-HH:MM` strings, Sunday first, `null` when unknown                 |
| `closedOnHolidays`                                                     | `closedOnHolidays`          |                                                                                |
| `rating`, `ratingCount`                                                | `rating`, `ratingCount`     | Rating out of 10, `null` without reviews                                       |
| `partner`                                                              | `dataPartners`              | Primary partner name                                                           |
| `logo`, `photos`                                                       | `logo.url`, `images`        | Paths relative to `public/toilets/`                                            |

Opening-hours conventions from the source: `00:00-00:00` means closed that day,
`00:00-23:59` means open 24 hours, and a closing time before the opening time
runs past midnight.

## The card

Built by `src/layers/toilets/card.js` from `toiletCardModel()` in
`src/layers/toilets/model.js`. Top to bottom:

1. Logo, type (Public / Semi-public), name and close button.
2. Address and country.
3. Open now / Closed now badge, today's hours, and cost with payment methods.
   Open status uses the viewer's local clock.
4. Facility tags, including sanitary bins.
5. Photo strip. Clicking a photo opens it full size in a new tab.
6. The source's note.
7. _Opening hours_ (collapsible): the week, today highlighted, and a
   closed-on-holidays line.
8. _Wheelchair accessibility_ (collapsible, only with answers): a
   "14 of 15 criteria met" summary, then the criteria grouped as _Getting in_,
   _Fittings and dimensions_ and _Room to move_. Each has ✓ or ✗, the
   requirement, an explanation and its illustration.
9. Rating, data partner (hidden when `Onbekend`) and `Data: Hogenood`.

The card closes with ×, Escape, or when another entity is selected.
Third-party text is written with `textContent` only, never as HTML. Images that
fail to load are removed. On screens under 900 px wide the card becomes a
bottom sheet.

Translations: card labels go through `t()` / `tn()` / `msg()`, with Spanish and
Russian in `src/i18n/locales/`. Text from the data (names, notes, checklist
questions) is shown as-is. `npm run i18n` must report both locales complete.

## Open now filter

With a toilet layer switched on, its row in the panel shows an **Open now**
chip. Turning it on hides every toilet that is closed at this moment, using the
viewer's local clock and the same rules as the card's Open now badge, including
overnight slots. The row count changes to "1,383 open now" (or similar).

- Each layer has its own chip, and the setting resets on reload.
- Open status is re-checked every minute while the chip is on.
- Hidden toilets can't be clicked, and their share of the 420-stem and label
  budgets goes to toilets that are open.

The filter uses `setRecordFilter(filter)` on the shared local GeoJSON layer:
`filter` gets a record's properties and returns whether to show it, and `null`
shows everything.

## Code map

| File                                           | Role                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `scripts/import-toilets.mjs`                   | Import; exports `weeklyHours`, `wheelchairChecklist` and `toiletFeature`         |
| `src/layers/toilets/model.js`                  | Layer specs (`TOILET_LAYERS`) and pure card helpers                              |
| `src/layers/toilets/card.js`                   | Card DOM and selection events                                                    |
| `src/layers/toilets/index.js`                  | `createToiletLayers()`: two `createLocalGeoJsonLayer` instances sharing one card |
| `src/layers/toilets/model.test.mjs`            | Tests for hours, open status, cost and the card model                            |
| `src/app/layers/toilets.js`                    | Application wiring (base URL)                                                    |
| `src/app/constructCatalog.js`                  | Adds the layers; `LOCAL_ONLY_LAYER_METADATA` entries                             |
| `src/ui/layerNames.js`, `src/ui/layerPanel.js` | Panel names; Utilities group                                                     |
| `src/voice/layerManifest.js`                   | Voice aliases ("public toilets", "restrooms", …)                                 |
| `src/ui/styles/toilets.css`                    | Card styles, imported from `style.css`                                           |

| Layer id             | File                  | Colour    |
| -------------------- | --------------------- | --------- |
| `toilets-public`     | `public.geojsonl`     | `#39ff88` |
| `toilets-semipublic` | `semipublic.geojsonl` | `#ffb347` |

Both use the shared local GeoJSON layer (`src/data/localGeojsonCore.js`) with
labels on (`labelMax: 400`). They get its stems, globe LOD, overlay labels and
click handling.

### Adding a layer to the catalog

Every catalog layer needs entries in several places, or tests fail:

- `LOCAL_ONLY_LAYER_METADATA` (or a `LAYER_STATE_REGISTRY` token) in
  `constructCatalog.js`
- A name in `src/ui/layerNames.js`
- An entry in `src/voice/layerManifest.js`
- Translations for every new UI string

Pinned values in tests then need updating:

- The layer count in `constructCatalog.test.mjs` and `sourceComposition.test.mjs`
- The voice schema hash in `src/voice/actionSchemas.test.mjs`
- The schema length and hash in `src/firstRunExperience.test.mjs`

## Performance changes to shared code

With 9,200 points the semi-public layer froze the app. Two fixes in
`src/data/localGeojsonCore.js` help every local GeoJSON layer:

1. **No hidden pin billboards.** Cesium's `GeoJsonDataSource` gives each point a
   ground-clamped pin. The layer draws its own point and stem, so the pin was
   invisible but still ran a terrain pick on load and as tiles streamed in.
   Removing it cut the load freeze from about 8.5 s to 0.6 s.
2. **Budgeted ground sampling.** Each `scene.sampleHeight` re-renders the scene
   for picking and reads it back from the GPU. A walk now samples at most 4
   records (`GROUND_SAMPLES_PER_WALK`). A record that keeps failing backs off
   2 s, 4 s … up to 64 s, and camera movement resets the backoff. Over 18 s this
   took sampling from 2,030 calls (23.5 s of main thread) to 48 (1.3 s). Stems
   near the camera now settle onto the ground over a few seconds.

These fixes are not offered upstream (decided 2026-10-22). The same file also
gained `setRecordFilter()` for the Open now filter.

## Maintaining the fork

- Remotes: `origin` is the fork, `upstream` is `bilawalsidhu/gods-eye-view`.
- To update: `git fetch upstream && git merge upstream/main` on `toilets`.
  Expect conflicts in the pinned test values above. If upstream changes
  `localGeojsonCore.js`, re-apply the two performance fixes and check that the
  semi-public layer still loads without freezing.
- Before pushing: `npm test`, `npm run format:check`, `npm run i18n`, and
  `git ls-files public/toilets` must print nothing.

## Troubleshooting

| Symptom                                                                                    | Fix                                                                                                             |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Stuck on "Initializing photorealistic world…"; console shows `504 (Outdated Optimize Dep)` | Vite's dependency cache is stale. Stop the dev server, run `npx vite --force`, then hard-reload (Cmd+Shift+R).  |
| Layer shows an error chip / no markers                                                     | `public/toilets/` is missing or empty: run `npm run toilets:import`.                                            |
| Changes to the data don't show                                                             | Re-run the import, then hard-reload.                                                                            |
| Photos or checklist illustrations missing                                                  | The source asset file is missing, or the import ran from a non-`_local` export. Check the import's asset count. |
