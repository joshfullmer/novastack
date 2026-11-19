/** A Swiss round is named "Round 4"; anything else (Quarterfinals, Semifinals, Finals) is the playoff. */
export const isPlayoffRound = (name: string): boolean => !/^round\s+\d+$/i.test(name.trim());
