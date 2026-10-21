import { t } from '../../i18n/index.js';
import { TOILET_LAYER_IDS, toiletCardModel } from './model.js';

/**
 * A detail card for the selected toilet. It follows the shared context
 * selection: `gev:entity-selected` for a toilet record opens it, and any
 * other selection or a clear for a toilet layer closes it. Record text comes
 * from a third-party export, so it is only ever written as textContent.
 * @param {{assetBase:string, onClose?:function(string):void}} options
 */
export function createToiletCard({ assetBase, onClose }) {
  let root = null;
  let shownLayerId = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  function hide() {
    root?.remove();
    root = null;
    shownLayerId = null;
  }

  function show(record) {
    hide();
    const card = toiletCardModel(record.properties, { assetBase });
    shownLayerId = record.layerId;
    root = el('aside', 'toilet-card');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', card.title);
    root.dataset.type = card.isPublic ? 'public' : 'semipublic';

    const header = el('header', 'toilet-card__header');
    if (card.logo) {
      const logo = el('img', 'toilet-card__logo');
      logo.src = card.logo;
      logo.alt = '';
      logo.addEventListener('error', () => logo.remove());
      header.append(logo);
    }
    const heading = el('div', 'toilet-card__heading');
    heading.append(
      el('div', 'toilet-card__type', card.type),
      el('h2', 'toilet-card__title', card.title),
    );
    const close = el('button', 'toilet-card__close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('Close'));
    close.addEventListener('click', () => {
      const layerId = shownLayerId;
      hide();
      onClose?.(layerId);
    });
    header.append(heading, close);
    root.append(header);

    if (card.address) {
      const address = [card.address, card.country].filter(Boolean).join(' · ');
      root.append(el('p', 'toilet-card__address', address));
    }

    const status = el('div', 'toilet-card__status');
    if (card.open !== null) {
      status.append(
        el(
          'span',
          `toilet-card__badge toilet-card__badge--${card.open ? 'open' : 'closed'}`,
          card.open ? t('Open now') : t('Closed now'),
        ),
      );
    }
    status.append(el('span', null, t('Today: {hours}', { hours: card.today })));
    if (card.cost) status.append(el('span', null, card.cost));
    root.append(status);

    if (card.facilities.length) {
      const chips = el('ul', 'toilet-card__chips');
      for (const label of card.facilities) chips.append(el('li', null, label));
      root.append(chips);
    }

    if (card.photos.length) {
      const strip = el('div', 'toilet-card__photos');
      for (const src of card.photos) {
        const link = el('a');
        link.href = src;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const img = el('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => link.remove());
        link.append(img);
        strip.append(link);
      }
      root.append(strip);
    }

    if (card.note) root.append(el('p', 'toilet-card__note', card.note));

    const week = el('details', 'toilet-card__week');
    week.append(el('summary', null, t('Opening hours')));
    const table = el('dl');
    for (const day of card.week) {
      const dt = el('dt', day.today ? 'is-today' : null, day.day);
      const dd = el('dd', day.today ? 'is-today' : null, day.label);
      table.append(dt, dd);
    }
    week.append(table);
    if (card.closedOnHolidays)
      week.append(el('p', 'toilet-card__meta', t('Closed on public holidays')));
    root.append(week);

    const meta = [
      card.rating,
      card.partner,
      t('Data: {source}', { source: 'Hogenood' }),
    ]
      .filter(Boolean)
      .join(' · ');
    root.append(el('p', 'toilet-card__meta', meta));

    document.body.append(root);
  }

  const onSelected = (event) => {
    const record = event.detail;
    if (TOILET_LAYER_IDS.has(record?.layerId)) show(record);
    else hide();
  };
  const onCleared = (event) => {
    const layerId = event.detail?.layerId;
    if (!layerId || layerId === shownLayerId) hide();
  };
  const onKey = (event) => {
    if (event.key === 'Escape' && root) {
      const layerId = shownLayerId;
      hide();
      onClose?.(layerId);
    }
  };

  window.addEventListener('gev:entity-selected', onSelected);
  window.addEventListener('gev:entity-selection-cleared', onCleared);
  window.addEventListener('keydown', onKey);

  return {
    hide,
    destroy() {
      window.removeEventListener('gev:entity-selected', onSelected);
      window.removeEventListener('gev:entity-selection-cleared', onCleared);
      window.removeEventListener('keydown', onKey);
      hide();
    },
  };
}
