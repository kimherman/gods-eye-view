import { createLocalGeoJsonLayer } from '../../data/localGeojsonCore.js';
import { msg, t } from '../../i18n/index.js';
import { createToiletCard } from './card.js';
import {
  filterCountLabel,
  TOILET_LAYERS,
  toiletMatchesFilters,
} from './model.js';
export * from './model.js';

/** Opening status changes by the minute; re-check this often while filtered. */
const OPEN_NOW_REFRESH_MS = 60_000;

const FILTER_CHIPS = [
  {
    id: 'open-now',
    key: 'openNow',
    label: msg('Open now'),
    title: msg('Show only toilets that are open right now'),
  },
  {
    id: 'wheelchair',
    key: 'wheelchair',
    label: msg('Wheelchair'),
    title: msg('Show only wheelchair-accessible toilets'),
  },
];

/**
 * Add the "Open now" and "Wheelchair" row chips. Active filters combine: a
 * toilet must pass every one to stay on the map.
 * @param {object} layer A local GeoJSON layer.
 */
function addToiletFilters(layer) {
  const filters = { openNow: false, wheelchair: false };
  let shown = null;
  let filteredCount = null;
  let timer = null;
  let listener = null;
  const { getStats, destroy } = layer;
  const anyActive = () => filters.openNow || filters.wheelchair;

  const apply = () => {
    const now = new Date();
    const active = { ...filters };
    const result = layer.setRecordFilter(
      anyActive() ? (props) => toiletMatchesFilters(props, active, now) : null,
    );
    shown = anyActive() ? result.shown : null;
    filteredCount = result.total;
    listener?.();
  };

  layer.getRowControls = () => ({
    chips: FILTER_CHIPS.map((chip) => ({
      id: chip.id,
      label: t(chip.label),
      active: filters[chip.key],
      title: t(chip.title),
      onClick: () => {
        filters[chip.key] = !filters[chip.key];
        clearInterval(timer);
        timer = filters.openNow
          ? setInterval(apply, OPEN_NOW_REFRESH_MS)
          : null;
        apply();
      },
    })),
  });
  layer.setRowControlsListener = (value) => {
    listener = typeof value === 'function' ? value : null;
  };
  layer.getStats = (...args) => {
    const stats = getStats.apply(layer, args);
    if (!anyActive()) return stats;
    // The data loaded (or reloaded) after a chip was set: recount.
    if (stats.count !== filteredCount) apply();
    return { ...stats, countLabel: filterCountLabel(shown ?? 0, filters) };
  };
  layer.destroy = (...args) => {
    clearInterval(timer);
    timer = null;
    return destroy.apply(layer, args);
  };
}

/**
 * Create the public and semi-public toilet layers from the files written by
 * `npm run toilets:import`. Both draw through the shared local GeoJSON layer
 * and share one detail card, installed while either layer is initialized.
 * @param {object} services Local GeoJSON services; see docs/INFRASTRUCTURE-LAYERS.md.
 * @param {{baseUrl?:string}} [options] Application base URL, ending in `/`.
 * @returns {object[]} Public then semi-public layers.
 */
export function createToiletLayers(services, { baseUrl = '/' } = {}) {
  const dataBase = `${baseUrl}toilets/`;
  let card = null;
  let live = 0;

  return TOILET_LAYERS.map((spec) => {
    const layer = createLocalGeoJsonLayer(
      {
        id: spec.id,
        url: `${dataBase}${spec.file}`,
        name: spec.name,
        color: spec.color,
        icon: '🚻',
        source: 'Hogenood',
        labels: true,
        labelMax: 400,
      },
      services,
    );
    addToiletFilters(layer);
    const { init, destroy } = layer;
    layer.init = (...args) => {
      if (live++ === 0) {
        card = createToiletCard({
          assetBase: dataBase,
          onClose: (layerId) =>
            services.clearSelectedEntityContextForLayer(layerId),
        });
      }
      return init.apply(layer, args);
    };
    layer.destroy = (...args) => {
      const result = destroy.apply(layer, args);
      if (--live === 0) {
        card?.destroy();
        card = null;
      }
      return result;
    };
    return layer;
  });
}
