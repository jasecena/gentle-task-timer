/**
 * Public surface of the one-off domain: a note, a day, a time, delivered once.
 */
export type { OneOff, OneOffSlot } from './types';

export {
  DEFAULT_ONEOFF,
  isValidOneOff,
  nextOneOffId,
  normalizeOneOff,
  normalizeOneOffs,
  ONEOFF_LIMITS,
  validateOneOff,
} from './config';
export type { OneOffIssue } from './config';

export { describeOneOff, minutesUntilOneOff, oneOffKey, planOneOff, planOneOffs, pruneFired } from './plan';
export type { ClockNow } from './plan';
