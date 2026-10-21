import assert from 'node:assert/strict';
import test from 'node:test';
import { costLabel, describeSlot, isOpenAt, toiletCardModel } from './model.js';

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
