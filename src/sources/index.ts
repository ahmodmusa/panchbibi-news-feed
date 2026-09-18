import { SourceAdapter } from '../types.js';
import { dhakapostAdapter } from './dhakapost.js';
import { prothomaloAdapter } from './prothomalo.js';
import { silkcitynewsAdapter } from './silkcitynews.js';
import { dailykaratoaAdapter } from './dailykaratoa.js';
import { ajkerpatrikaAdapter } from './ajkerpatrika.js';
import { dailybangladeshAdapter } from './dailybangladesh.js';
import { kalbelaAdapter } from './kalbela.js';

export const ALL_ADAPTERS: SourceAdapter[] = [
  dhakapostAdapter,
  prothomaloAdapter,
  silkcitynewsAdapter,
  dailykaratoaAdapter,
  ajkerpatrikaAdapter,
  dailybangladeshAdapter,
  kalbelaAdapter
];
