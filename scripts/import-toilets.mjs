#!/usr/bin/env node
/**
 * Convert the Hogenood world toilet export into the GeoJSON Lines files the
 * toilet layers load, and copy the logos, photos and accessibility
 * illustrations those files reference.
 *
 * Usage: npm run toilets:import -- [data-dir]
 *   data-dir defaults to $TOILETS_DATA_DIR, then ../hogenood-belgium/data.
 *   It must hold world_toilets_local.jsonl and its assets/ folder.
 *
 * Output (ignored by git): public/toilets/{public,semipublic}.geojsonl and
 * public/toilets/assets/. Re-running replaces the previous import.
 * See docs/TOILETS.md.
 */
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'toilets');
const SOURCE_FILE = 'world_toilets_local.jsonl';
const ASSET_PREFIX = 'assets/';

const text = (value) => {
  const t = String(value ?? '').trim();
  return t && t !== 'null' && t !== 'undefined' ? t : null;
};

/** Seven `HH:MM-HH:MM` strings, Sunday first; null where the day is unknown. */
export function weeklyHours(openingTimes) {
  const days = Array(7).fill(null);
  for (const slot of openingTimes?.openingTimes || []) {
    const day = Number(slot?.dayOfWeek);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const opens = text(slot.opens);
    const closes = text(slot.closes);
    if (opens && closes) days[day] = `${opens}-${closes}`;
  }
  return days;
}

/** Keep an `assets/...` link only when the file exists in the data folder. */
function assetLink(link, dataDir, assets) {
  const rel = text(link);
  if (!rel || !rel.startsWith(ASSET_PREFIX) || rel.includes('..')) return null;
  if (!existsSync(path.join(dataDir, rel))) return null;
  assets.add(rel);
  return rel;
}

/**
 * The answered items of a record's wheelchair checklist, in question order.
 * Every record lists all questions; most leave every answer null.
 */
export function wheelchairChecklist(items, dataDir, assets = new Set()) {
  return (items || [])
    .filter((item) => typeof item?.answer === 'boolean' && item.question)
    .sort((a, b) => (a.question.id ?? 0) - (b.question.id ?? 0))
    .map(({ question, answer }) => ({
      group: text(question.groupName),
      question: text(question.question),
      description: text(question.description),
      images: (question.images || [])
        .map((image) => assetLink(image?.path, dataDir, assets))
        .filter(Boolean),
      answer,
    }))
    .filter((item) => item.question);
}

/**
 * Map one Hogenood record to a GeoJSON Feature, or null without coordinates.
 * @param {object} record Raw world_toilets record.
 * @param {string} dataDir Folder the record's asset links resolve against.
 * @param {Set<string>} assets Collects every asset link kept.
 */
export function toiletFeature(record, dataDir, assets = new Set()) {
  const location = record?.location || {};
  const lat = Number(location.latLong?.latitude);
  const lon = Number(location.latLong?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const access = record.accessibility || {};
  const payment = record.payment || {};
  const photos = [...(record.images || [])]
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .map((image) => assetLink(image?.url, dataDir, assets))
    .filter(Boolean);
  const partner =
    (record.dataPartners || []).find((p) => p?.isPrimary) ||
    record.dataPartners?.[0];
  return {
    type: 'Feature',
    id: `toilet-${record.id}`,
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      toiletId: record.id,
      name: text(record.name) || 'Toilet',
      type: record.toiletType === 'Public' ? 'Public' : 'SemiPublic',
      address: text(location.address),
      zipcode: text(location.zipcode),
      city: text(location.city),
      country: text(location.countryCode),
      note: text(record.note),
      cost: Number.isFinite(payment.cost) ? payment.cost : null,
      currency: text(payment.currency),
      cash: payment.cash === true,
      card: payment.debitCard === true,
      facilities: {
        male: access.hasMale === true,
        female: access.hasFemale === true,
        genderNeutral: access.hasGenderNeutral === true,
        wheelchair: access.hasWheelchair === true,
        baby: access.hasBabyCleaningTable === true,
        adultChanging: access.hasAdultCleaningTable === true,
        eurokey: access.hasEurokey === true,
        femaleBin: access.hasFemaleBin === true,
        maleBin: access.hasMaleBin === true,
        genderNeutralBin: access.hasGenderNeutralBin === true,
        wheelchairBin: access.hasWheelchairBin === true,
      },
      wheelchairChecklist: wheelchairChecklist(
        record.wheelchairAccessibility,
        dataDir,
        assets,
      ),
      hours: weeklyHours(record.openingTimes),
      closedOnHolidays: record.closedOnHolidays === true,
      rating: record.ratingCount > 0 ? record.rating : null,
      ratingCount: record.ratingCount || 0,
      partner: text(partner?.name),
      logo: assetLink(record.logo?.url, dataDir, assets),
      photos,
    },
  };
}

async function main() {
  const dataDir = path.resolve(
    process.argv[2] ||
      process.env.TOILETS_DATA_DIR ||
      path.join(ROOT, '..', 'hogenood-belgium', 'data'),
  );
  const sourcePath = path.join(dataDir, SOURCE_FILE);
  if (!existsSync(sourcePath)) {
    console.error(`[toilets] ${sourcePath} not found`);
    process.exit(1);
  }

  const assets = new Set();
  const lines = { Public: [], SemiPublic: [] };
  let skipped = 0;
  const input = readline.createInterface({
    input: createReadStream(sourcePath, 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const line of input) {
    if (!line.trim()) continue;
    const feature = toiletFeature(JSON.parse(line), dataDir, assets);
    if (!feature) {
      skipped += 1;
      continue;
    }
    lines[feature.properties.type].push(JSON.stringify(feature));
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(
    path.join(OUT_DIR, 'public.geojsonl'),
    `${lines.Public.join('\n')}\n`,
  );
  await writeFile(
    path.join(OUT_DIR, 'semipublic.geojsonl'),
    `${lines.SemiPublic.join('\n')}\n`,
  );
  for (const rel of assets) {
    const target = path.join(OUT_DIR, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(dataDir, rel), target);
  }

  console.log(
    `[toilets] ${lines.Public.length} public, ${lines.SemiPublic.length} semi-public` +
      `, ${assets.size} assets copied${skipped ? `, ${skipped} skipped without coordinates` : ''}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
