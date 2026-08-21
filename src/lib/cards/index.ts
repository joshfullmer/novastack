/**
 * The dataset, as the app sees it. Parsed **once, at module scope**.
 *
 * Not in a `load` function: that would run on both the server and the client *and* serialize
 * the whole dataset into the HTML for hydration, shipping it twice. At module scope, Vite
 * code-splits it into the route chunks that import it — which is why `/` imports
 * `./landing.ts` instead, and why this import must stay out of the root layout.
 *
 * The JSON arrives as a *string* (`?raw`) rather than an object import on purpose. It keeps
 * `tsc` from inferring a 277 KB literal type for the snapshot, and `JSON.parse` on one string
 * is cheaper at runtime than evaluating an equivalent object literal.
 */
import cardsJson from './cards.json?raw';
import * as v from 'valibot';
import { createDataset, type Dataset } from './dataset.ts';
import { SnapshotSchema, type Snapshot } from './schema.ts';

export const snapshot: Snapshot = v.parse(SnapshotSchema, JSON.parse(cardsJson));

export const dataset: Dataset = createDataset(snapshot);

export type { Dataset };
