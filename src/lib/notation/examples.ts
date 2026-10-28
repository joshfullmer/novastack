// Valid: a full game. WE ends turn 9 with 8 dice and wins at the start of turn 11. Deliberately
// no Reaction: cards can be played in the React Step, but none in the current pool changes a die
// there, so the front door and the checker's "match" preset should not teach it. Reactions have their
// own examples.
//
//   T1  WE    A4 -A1          WE: A1
//   T2  THEY  A'4             THEY: A'4
//   T3  WE    B4 -B2          WE: A1 B2
//   T4  THEY  B'1             THEY: A'4 B'1
//   T5  WE    C8 -B1          WE: A1 B1 C8        THEY: A'4 B'1
//   T6  THEY  C'3 xC          WE: A1 B1           THEY: A'4 B'1 C'3 C8
//   T7  WE    D6 -D4 xB' xA'  WE: A1 B1 D4 B'1 A'4  THEY: C'3 C8
//   T8  THEY  D'4             THEY: C'3 C8 D'4
//   T9  WE    E12 -E7 xC' xD'  WE: A1 B1 D4 B'1 A'4 E7 C'3 D'4 (8)  THEY: C8
//   T10 THEY  E'12            THEY: C8 E'12
//   → WE starts turn 11 with 8 dice: win.
export const VALID_GAME = `\
first: WE
1| A4 -A1
2| A'4
3| B4 -B2
4| B'1
5| C8 -B1
6| C'3 xC
7| D6 -D4 xB' xA'
8| D'4
9| E12 -E7 xC' xD'
10| E'12`;

// Invalid: eight errors, one per numbered note. State keeps threading past each.
//   T3  B'3    roll of THEY's die on WE's turn
//   T5  C9     value out of range for a d8
//   T6  xC     steal of a die that never left WE's fixer (C9 failed)
//   T7  xD'    steal of a die still in THEY's fixer
//   T8  (A5)   roll inside a reaction
//   T9  xC'2   steal checksum disagrees with the die's value (3)
//   T10        blank line where a pass should be written as .. (THEY's turn)
//   T11 12|    turn number does not match position (C8 is a legal roll: C9 failed)
export const INVALID_GAME = `\
first: WE
1| A4 -A1
2| A'4
3| B4 -B2 B'3
4| B'1
5| C9 -B1
6| C'3 xC
7| D6 -D4 xB' xD'
8| D'4 (A5)
9| E12 xC'2

12| C8`;
