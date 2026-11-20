// The wind Overlay as the registry holds it (design D15, §7.16; Req 13.1, 13.7): its title, what is
// said before the first use, its Source, and the controller it makes. Every fact about the Source
// (host, what the request carries, attribution, terms) comes from the Host list, so that what the
// switch says is what the gate allows.

import { WIND_ENTRY } from '../../../math/network/host-list';
import type { OverlayDefinition } from '../../shared/math/overlay-types';
import { createWindController } from './wind-controller';

export const WIND_DEFINITION: OverlayDefinition = {
  id: 'wind',
  title: 'Wind',
  sends:
    `Switching this on asks ${WIND_ENTRY.sourceName} (${WIND_ENTRY.host}) for the wind. ` +
    `The request carries: ${WIND_ENTRY.carries} ` +
    'It is asked once when you switch it on and once each time you press Refresh, never by itself.',
  sources: [
    {
      name: WIND_ENTRY.sourceName,
      attribution: WIND_ENTRY.attribution,
      termsUrl: WIND_ENTRY.termsUrl,
    },
  ],
  create: createWindController,
};
