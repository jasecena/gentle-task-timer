import { MAX_RUN_ALERTS, NOTIFICATION_LIMIT, REMINDER_BUDGET, runAlertBudget } from '../budget';

describe('notification budget', () => {
  it('leaves room for an interval run even when a schedule is at its maximum', () => {
    expect(REMINDER_BUDGET).toBeLessThan(NOTIFICATION_LIMIT);
    expect(runAlertBudget(REMINDER_BUDGET)).toBeGreaterThan(0);
  });

  it('gives a run the full allowance when no schedule is armed', () => {
    expect(runAlertBudget(0)).toBe(MAX_RUN_ALERTS);
    expect(runAlertBudget()).toBe(MAX_RUN_ALERTS);
  });

  it('hands a run whatever the schedule left behind', () => {
    expect(runAlertBudget(20)).toBe(NOTIFICATION_LIMIT - 20);
    expect(runAlertBudget(48)).toBe(NOTIFICATION_LIMIT - 48);
  });

  it('never promises more than the platform ceiling', () => {
    expect(runAlertBudget(0) + REMINDER_BUDGET).toBeGreaterThan(NOTIFICATION_LIMIT);
    // ...which is fine only because a full schedule shrinks the run's share:
    expect(runAlertBudget(REMINDER_BUDGET) + REMINDER_BUDGET).toBeLessThanOrEqual(NOTIFICATION_LIMIT);
  });

  it('never goes negative, whatever it is told', () => {
    expect(runAlertBudget(1_000)).toBe(0);
    expect(runAlertBudget(-5)).toBe(MAX_RUN_ALERTS);
    expect(runAlertBudget(Number.NaN)).toBe(MAX_RUN_ALERTS);
  });
});
