import { MAX_RUN_ALERTS, NOTIFICATION_LIMIT, ONEOFF_BUDGET, REMINDER_BUDGET, runAlertBudget } from '../budget';

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

  it('charges pending one-off notes against the same ceiling', () => {
    expect(runAlertBudget(0, 5)).toBe(NOTIFICATION_LIMIT - 5);
    expect(runAlertBudget(20, 5)).toBe(NOTIFICATION_LIMIT - 25);
    expect(runAlertBudget(0, -3)).toBe(MAX_RUN_ALERTS);
    expect(runAlertBudget(0, Number.NaN)).toBe(MAX_RUN_ALERTS);
  });

  /**
   * The worst case, spelled out: a schedule at its ceiling and every one-off
   * slot taken. Runs still get something, and they are the only feature that
   * can recover from a small share — they re-plan on every foreground, while a
   * schedule repeats forever and a one-off gets exactly one chance.
   */
  it('leaves runs a workable share even when both fixed allowances are full', () => {
    const left = runAlertBudget(REMINDER_BUDGET, ONEOFF_BUDGET);

    expect(REMINDER_BUDGET + ONEOFF_BUDGET + left).toBeLessThanOrEqual(NOTIFICATION_LIMIT);
    expect(left).toBeGreaterThan(0);
  });
});
