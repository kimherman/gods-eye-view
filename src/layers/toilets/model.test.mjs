import assert from 'node:assert/strict';
import test from 'node:test';
import {
  costLabel,
  describeSlot,
  filterCountLabel,
  isOpenAt,
  toiletCardModel,
  toiletMatchesFilters,
} from './model.js';

// 2026-10-21 is a Wednesday (getDay() === 3).
const at = (hhmm) => new Date(`2026-10-21T${hhmm}:00`);
const week = (slot) => Array(7).fill(slot);

test('describeSlot reads the source conventions for closed and all-day', () => {
  assert.equal(describeSlot('00:00-00:00').closed, true);
  assert.equal(describeSlot('00:00-23:59').label, 'Open 24 h');
  assert.equal(describeSlot('09:00-17:30').label, '09:00–17:30');
  assert.equal(describeSlot(null).known, false);
});

test('isOpenAt follows today, overnight and unknown hours', () => {
  assert.equal(isOpenAt(week('09:00-17:30'), at('10:00')), true);
  assert.equal(isOpenAt(week('09:00-17:30'), at('18:00')), false);
  assert.equal(isOpenAt(week('00:00-00:00'), at('12:00')), false);
  assert.equal(isOpenAt(week('00:00-23:59'), at('23:59')), true);
  assert.equal(isOpenAt(week(null), at('12:00')), null);
  // Tuesday's overnight slot still covers early Wednesday.
  const overnight = week('00:00-00:00');
  overnight[2] = '20:00-02:00';
  assert.equal(isOpenAt(overnight, at('01:30')), true);
  assert.equal(isOpenAt(overnight, at('02:30')), false);
});

test('costLabel formats free, priced and missing costs', () => {
  assert.equal(costLabel(0, 'EUR'), 'Free');
  assert.equal(costLabel(0.5, 'EUR'), '€0.50');
  assert.equal(costLabel(null, 'EUR'), null);
  assert.equal(costLabel(1, 'not-a-code'), '1 not-a-code');
});

test('toiletCardModel builds the card copy and asset URLs', () => {
  const card = toiletCardModel(
    {
      name: 'Station toilet',
      type: 'Public',
      address: 'Kapelstraat 75',
      zipcode: '9100',
      city: 'Sint-Niklaas',
      country: 'BEL',
      cost: 0.5,
      currency: 'EUR',
      card: true,
      facilities: { male: true, wheelchair: true, eurokey: false },
      hours: week('09:00-17:30'),
      rating: 7.94,
      ratingCount: 3,
      partner: 'Onbekend',
      logo: 'assets/logo/a.png',
      photos: ['assets/toilet/1/b.jpg'],
    },
    { assetBase: '/toilets/', now: at('10:00') },
  );
  assert.equal(card.type, 'Public');
  assert.equal(card.address, 'Kapelstraat 75, 9100 Sint-Niklaas');
  assert.equal(card.cost, '€0.50 · card');
  assert.deepEqual(card.facilities, ['Men', 'Wheelchair']);
  assert.equal(card.open, true);
  assert.equal(card.week.find((day) => day.today).day, 'Wed');
  assert.equal(card.rating, '7.9/10 · 3 reviews');
  assert.equal(card.partner, null);
  assert.equal(card.logo, '/toilets/assets/logo/a.png');
  assert.deepEqual(card.photos, ['/toilets/assets/toilet/1/b.jpg']);
});

test('toiletCardModel groups the answered wheelchair checklist', () => {
  const card = toiletCardModel(
    {
      facilities: { femaleBin: true },
      wheelchairChecklist: [
        {
          group: 'Accessibility',
          question: 'Route at least 85 cm wide.',
          description: null,
          images: ['assets/accessibility/questions/accessibility-1.svg'],
          answer: true,
        },
        {
          group: 'MovementWithinToiletSpace',
          question: 'A clear turning circle of 150 cm.',
          images: [],
          answer: false,
        },
        { group: 'Accessibility', question: 'Unanswered', answer: null },
      ],
    },
    { assetBase: '/toilets/', now: at('10:00') },
  );
  assert.deepEqual(card.facilities, ['Sanitary bin: women']);
  assert.deepEqual(
    card.checklist.map((group) => [group.title, group.items.length]),
    [
      ['Getting in', 1],
      ['Room to move', 1],
    ],
  );
  assert.deepEqual(card.checklist[0].items[0].images, [
    '/toilets/assets/accessibility/questions/accessibility-1.svg',
  ]);
  assert.equal(card.checklist[1].items[0].ok, false);
  assert.equal(card.checklistSummary, '1 of 2 criteria met');
  assert.equal(toiletCardModel({}).checklistSummary, null);
});

test('toiletMatchesFilters combines open-now and wheelchair', () => {
  const now = at('10:00');
  const open = {
    hours: week('09:00-17:30'),
    facilities: { wheelchair: false },
  };
  const accessible = {
    hours: week('00:00-00:00'),
    facilities: { wheelchair: true },
  };
  const both = { hours: week('09:00-17:30'), facilities: { wheelchair: true } };
  const none = {};
  const pass = (filters) =>
    [open, accessible, both, none].map((props) =>
      toiletMatchesFilters(props, filters, now),
    );
  assert.deepEqual(pass({}), [true, true, true, true]);
  assert.deepEqual(pass({ openNow: true }), [true, false, true, false]);
  assert.deepEqual(pass({ wheelchair: true }), [false, true, true, false]);
  assert.deepEqual(pass({ openNow: true, wheelchair: true }), [
    false,
    false,
    true,
    false,
  ]);
  assert.equal(filterCountLabel(1383, { openNow: true }), '1,383 open now');
  assert.equal(
    filterCountLabel(5, { wheelchair: true }),
    '5 wheelchair accessible',
  );
  assert.equal(
    filterCountLabel(2, { openNow: true, wheelchair: true }),
    '2 open now, wheelchair accessible',
  );
});
