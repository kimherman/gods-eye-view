import { createLocalGeoJsonLayer } from '../../data/localGeojsonCore.js';
import { createToiletCard } from './card.js';
import { TOILET_LAYERS } from './model.js';
export * from './model.js';

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
