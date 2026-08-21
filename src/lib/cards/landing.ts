/**
 * The landing page's data, in its own module on purpose.
 *
 * `/` must not import the dataset — a search box does not need 133 cards — and Vite only
 * code-splits along module boundaries. Keeping this separate from `index.ts` is the whole
 * mechanism: importing `landing` pulls in 1.7 KB, not 277 KB.
 */
import landingJson from './landing.json?raw';
import * as v from 'valibot';
import { LandingSchema, type Landing } from './schema.ts';

export const landing: Landing = v.parse(LandingSchema, JSON.parse(landingJson));
