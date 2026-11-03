export type Penalty = 'none' | 'plus2' | 'dnf';

export interface Scramble {
  id: string;
  scramble: string;
  createdAt: number;
  /** Display number in "Scramble #n"; assigned once and kept when other scrambles are deleted. */
  number: number;
  favorite: boolean;
  /** Optional user-given name; falls back to "Scramble #n" in the UI. */
  title?: string;
  notes?: string;
}

/** A scramble before the store has given it its number. */
export type NewScramble = Omit<Scramble, 'number'>;

/**
 * A competition-style set of scrambles (typically five for an Ao5). Each
 * scramble belongs to at most one set; `scrambleIds` keeps the set's order.
 * The set's averages are computed per round: the k-th solve of every
 * scramble in the set together forms round k.
 */
export interface ScrambleSet {
  id: string;
  createdAt: number;
  /** Display number in "Set #n"; assigned once and kept when other sets are deleted. */
  number: number;
  scrambleIds: string[];
  /** Optional user-given name; falls back to "Set #n" in the UI. */
  title?: string;
  notes?: string;
}

/** A set before the store has given it its number. */
export type NewScrambleSet = Omit<ScrambleSet, 'number'>;

export interface Solve {
  id: string;
  scrambleId: string;
  timeMs: number;
  penalty: Penalty;
  createdAt: number;
  notes?: string;
}

export interface AppData {
  scrambles: Scramble[];
  solves: Solve[];
  sets: ScrambleSet[];
}
