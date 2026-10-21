/**
 * Pure presentation helpers for the toilet layers: no Cesium, no DOM, so the
 * card copy is testable under Node.
 */
import { formatDate, formatNumber, msg, t, tn } from '../../i18n/index.js';

export const TOILET_LAYERS = Object.freeze([
  Object.freeze({
    id: 'toilets-public',
    file: 'public.geojsonl',
    name: 'Public Toilets',
    color: '#39ff88',
  }),
  Object.freeze({
    id: 'toilets-semipublic',
    file: 'semipublic.geojsonl',
    name: 'Semi-public Toilets',
    color: '#ffb347',
  }),
]);

export const TOILET_LAYER_IDS = new Set(TOILET_LAYERS.map((layer) => layer.id));

const FACILITY_LABELS = [
  ['male', msg('Men')],
  ['female', msg('Women')],
  ['genderNeutral', msg('Gender-neutral')],
  ['wheelchair', msg('Wheelchair')],
  ['baby', msg('Baby changing')],
  ['adultChanging', msg('Adult changing')],
  ['eurokey', msg('Eurokey')],
  ['femaleBin', msg('Sanitary bin: women')],
  ['maleBin', msg('Sanitary bin: men')],
  ['genderNeutralBin', msg('Sanitary bin: gender-neutral')],
  ['wheelchairBin', msg('Sanitary bin: wheelchair')],
];

// The source's checklist groups; unknown groups keep the source name.
const CHECKLIST_GROUPS = {
  Accessibility: msg('Getting in'),
  LocationAndDimensions: msg('Fittings and dimensions'),
  MovementWithinToiletSpace: msg('Room to move'),
};

/**
 * Group the answered wheelchair checklist for display, in source order.
 * Question text comes from the source in English and is shown as-is.
 * @param {Array<object>} items `wheelchairChecklist` from the import.
 * @param {function(string):string|null} asset Resolves an asset path.
 */
export function checklistGroups(items, asset = (rel) => rel) {
  const groups = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item?.answer !== 'boolean' || !item.question) continue;
    const key = item.group || '';
    if (!groups.has(key)) {
      groups.set(key, {
        title: CHECKLIST_GROUPS[key] ? t(CHECKLIST_GROUPS[key]) : key,
        items: [],
      });
    }
    groups.get(key).items.push({
      question: item.question,
      description: item.description || null,
      ok: item.answer,
      images: (item.images || []).map(asset).filter(Boolean),
    });
  }
  return [...groups.values()];
}

const minutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/**
 * Describe one `HH:MM-HH:MM` day slot.
 * `00:00-00:00` is a closed day and `00:00-23:59` is open around the clock,
 * the source's own conventions.
 * @param {string|null} slot
 * @returns {{label:string, closed:boolean, allDay:boolean, known:boolean}}
 */
export function describeSlot(slot) {
  if (!slot) {
    return {
      label: t('Hours unknown'),
      closed: false,
      allDay: false,
      known: false,
    };
  }
  const [opens, closes] = slot.split('-');
  if (opens === '00:00' && closes === '00:00') {
    return { label: t('Closed'), closed: true, allDay: false, known: true };
  }
  if (opens === '00:00' && closes === '23:59') {
    return { label: t('Open 24 h'), closed: false, allDay: true, known: true };
  }
  return {
    label: `${opens}–${closes}`,
    closed: false,
    allDay: false,
    known: true,
  };
}

/**
 * Whether the toilet is open at `now`, in the viewer's local time; null when
 * the hours are unknown. Overnight slots (closing before opening) count.
 * @param {Array<string|null>} hours Seven slots, Sunday first.
 * @param {Date} now
 * @returns {boolean|null}
 */
export function isOpenAt(hours, now) {
  const today = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const slotOpen = (slot, at, fromYesterday) => {
    const day = describeSlot(slot);
    if (!day.known) return null;
    if (day.closed) return false;
    if (day.allDay) return !fromYesterday;
    const [opens, closes] = slot.split('-').map(minutes);
    if (opens == null || closes == null) return null;
    if (closes > opens) return !fromYesterday && at >= opens && at < closes;
    // Overnight: today's part runs from opening to midnight, and the part
    // after midnight belongs to yesterday's slot.
    return fromYesterday ? at < closes : at >= opens;
  };
  const todayOpen = slotOpen(hours?.[today], nowMin, false);
  if (todayOpen) return true;
  const yesterdayOpen = slotOpen(hours?.[(today + 6) % 7], nowMin, true);
  if (yesterdayOpen) return true;
  return todayOpen === null ? null : false;
}

/** `Free`, a formatted price, or null when the source gives no cost. */
export function costLabel(cost, currency) {
  if (!Number.isFinite(cost)) return null;
  if (cost === 0) return t('Free');
  try {
    return formatNumber(cost, {
      style: 'currency',
      currency: currency || 'EUR',
    });
  } catch {
    return `${cost} ${currency || ''}`.trim();
  }
}

/**
 * Build the card's display model from a feature's properties.
 * @param {object} props Feature properties written by scripts/import-toilets.mjs.
 * @param {{assetBase?:string, now?:Date}} [options]
 */
export function toiletCardModel(
  props = {},
  { assetBase = '', now = new Date() } = {},
) {
  const asset = (rel) => (rel ? `${assetBase}${rel}` : null);
  const hours = Array.isArray(props.hours) ? props.hours : [];
  const today = describeSlot(hours[now.getDay()] ?? null);
  // Any date's weekday names will do; step back to the Sunday of this week.
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  const price = costLabel(props.cost, props.currency);
  const checklist = checklistGroups(props.wheelchairChecklist, asset);
  const answered = checklist.flatMap((group) => group.items);
  const payment = [props.cash && t('cash'), props.card && t('card')]
    .filter(Boolean)
    .join(' / ');
  return {
    title: props.name || t('Toilet'),
    type: props.type === 'Public' ? t('Public') : t('Semi-public'),
    isPublic: props.type === 'Public',
    address: [
      props.address,
      [props.zipcode, props.city].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(', '),
    country: props.country || null,
    today: today.label,
    open: isOpenAt(hours, now),
    week: Array.from({ length: 7 }, (_, index) => {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + index);
      return {
        day: formatDate(day, { weekday: 'short' }),
        label: describeSlot(hours[index] ?? null).label,
        today: index === now.getDay(),
      };
    }),
    closedOnHolidays: props.closedOnHolidays === true,
    cost: payment && props.cost > 0 ? `${price} · ${payment}` : price,
    facilities: FACILITY_LABELS.filter(([key]) => props.facilities?.[key]).map(
      ([, label]) => t(label),
    ),
    rating:
      Number.isFinite(props.rating) && props.ratingCount > 0
        ? tn(
            props.ratingCount,
            '{rating}/10 · {count} review',
            '{rating}/10 · {count} reviews',
            {
              rating: formatNumber(props.rating, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }),
              count: props.ratingCount,
            },
          )
        : null,
    checklist,
    checklistSummary: answered.length
      ? t('{met} of {total} criteria met', {
          met: answered.filter((item) => item.ok).length,
          total: answered.length,
        })
      : null,
    note: props.note || null,
    partner:
      props.partner && props.partner !== 'Onbekend' ? props.partner : null,
    logo: asset(props.logo),
    photos: (props.photos || []).map(asset),
  };
}
