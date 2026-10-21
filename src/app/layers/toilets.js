import { createToiletLayers } from '../../layers/toilets/index.js';
import { localGeoJsonServices } from '../localGeojsonServices.js';
/** Wire the imported toilet datasets to the application's local layer services. */
export function createApplicationToilets() {
  return createToiletLayers(localGeoJsonServices, {
    baseUrl: import.meta.env?.BASE_URL || '/',
  });
}
