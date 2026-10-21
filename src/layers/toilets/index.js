import { createLocalGeoJsonLayer } from '../../data/localGeojsonCore.js';
import { formatNumber, t } from '../../i18n/index.js';
import { createToiletCard } from './card.js';
import { isOpenAt, TOILET_LAYERS } from './model.js';
export * from './model.js';

/** Opening status changes by the minute; re-check this often while filtered. */
const OPEN_NOW_REFRESH_MS = 60_000;

/**
 * Add an "Open now" row chip that hides toilets that are closed, or whose
 * hours are unknown, at the current time.
 * @param {object} layer A local GeoJSON layer.
 */
function addOpenNowFilter(layer) {
  let openOnly = false;
  let shown = null;
  let filteredCount = null;
  let timer = null;
  let listener = null;
  const { getStats, destroy } = layer;

  const apply = () => {
    const now = new Date();
    const result = layer.setRecordFilter(
      openOnly ? (props) => isOpenAt(props?.hours, now) === true : null,
    );
    shown = openOnly ? result.shown : null;
    filteredCount = result.total;
    listener?.();
  };

  layer.getRowControls = () => ({
    chips: [
      {
        id: 'open-now',
        label: t('Open now'),
        active: openOnly,
        title: t('Show only toilets that are open right now'),
        onClick: () => {
          openOnly = !openOnly;
          clearInterval(timer);
          timer = openOnly ? setInterval(apply, OPEN_NOW_REFRESH_MS) : null;
          apply();
        },
      },
    ],
  });
  layer.setRowControlsListener = (value) => {
    listener = typeof value === 'function' ? value : null;
  };
  layer.getStats = (...args) => {
    const stats = getStats.apply(layer, args);
    if (!openOnly) return stats;
    // The data loaded (or reloaded) after the chip was set: recount.
    if (stats.count !== filteredCount) apply();
    return {
      ...stats,
      countLabel: t('{count} open now', { count: formatNumber(shown ?? 0) }),
    };
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
    addOpenNowFilter(layer);
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
