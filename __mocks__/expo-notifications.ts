/**
 * Manual mock for expo-notifications, picked up automatically by Jest for every
 * test in the `app` project.
 *
 * The real module is native: outside a simulator it has nothing to bind to, so
 * importing it from a component test throws.
 *
 * This mock keeps a **queue** rather than just recording calls, because the
 * behaviour worth testing is now stateful. Two features share one pool of
 * pending notifications and cancel only their own by tag, so "did rescheduling
 * the timer wipe the standing schedule?" is a question the mock has to be able
 * to answer.
 *
 * Permission defaults to granted; a test wanting the denied path overrides
 * `getPermissionsAsync` and `requestPermissionsAsync` for itself.
 */

export enum SchedulableTriggerInputTypes {
  CALENDAR = 'calendar',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  DATE = 'date',
  TIME_INTERVAL = 'timeInterval',
}

interface ScheduledRequest {
  identifier: string;
  content: { data?: Record<string, unknown>; [key: string]: unknown };
  trigger: Record<string, unknown>;
}

let queue: ScheduledRequest[] = [];

export const granted = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' as const };
export const denied = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' as const };

export const setNotificationHandler = jest.fn();
export const getPermissionsAsync = jest.fn(async () => granted);
export const requestPermissionsAsync = jest.fn(async () => granted);

export const scheduleNotificationAsync = jest.fn(async (request: ScheduledRequest) => {
  // A repeat identifier replaces, as it does on the device.
  queue = [...queue.filter((entry) => entry.identifier !== request.identifier), request];
  return request.identifier;
});

export const getAllScheduledNotificationsAsync = jest.fn(async () => [...queue]);

export const cancelScheduledNotificationAsync = jest.fn(async (identifier: string) => {
  queue = queue.filter((entry) => entry.identifier !== identifier);
});

export const cancelAllScheduledNotificationsAsync = jest.fn(async () => {
  queue = [];
});

/** Test helper: the notifications iOS is currently holding, optionally filtered by tag. */
export function __pending(tag?: string): ScheduledRequest[] {
  return tag === undefined ? [...queue] : queue.filter((entry) => entry.content.data?.tag === tag);
}

/** Test helper: empties the queue. Call alongside `jest.clearAllMocks()`. */
export function __reset(): void {
  queue = [];
}
