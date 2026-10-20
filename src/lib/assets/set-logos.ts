/** A Main Set's logo, by Set id. Derivative and Misc Sets have no comparable asset. */
import wncLogo from './wnc-logo.png';
import bbrLogo from './bbr-logo.png';

export const MAIN_SET_LOGOS: Readonly<Record<string, string>> = {
	'MS01-WNC': wncLogo,
	'MS02-BBR': bbrLogo
};
