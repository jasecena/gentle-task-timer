/**
 * Public surface of the timer engine.
 *
 * UI code should import from `@/core/timer` and never reach into the individual
 * modules, so the internals stay free to move.
 */
export type { Phase, PhaseKind, Schedule, TimerConfig, TimerProjection, TimerState, TimerStatus } from './types';

export { DEFAULT_CONFIG, LIMITS, isValidConfig, normalizeConfig, validateConfig } from './config';
export type { ValidationIssue } from './config';

export { buildSchedule, completedCyclesAt, findPhaseAt, phasesEndingBetween } from './schedule';

export { createTimer, elapsedMsAt, isComplete, pause, project, reset, resume, settle, start, toggle } from './machine';

export { DURATION_UNITS, formatDuration, formatDurationLabel, fromParts, toParts } from './format';
