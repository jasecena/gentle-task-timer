import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const TAG = 'gentle-task-timer-run';

/**
 * Holds the screen on only while `active` is true.
 *
 * `useKeepAwake` from expo-keep-awake locks for the whole lifetime of the
 * component, which would keep the screen lit on an idle or paused timer and
 * flatten the battery. This acquires and releases around the running state
 * instead, and always releases on unmount.
 */
export function useKeepAwakeWhile(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    let released = false;
    void activateKeepAwakeAsync(TAG).catch(() => {
      // Not being able to hold the screen on is a degraded experience, not a
      // failure: the timer itself is unaffected, so there is nothing to report.
    });

    return () => {
      if (released) return;
      released = true;
      void deactivateKeepAwake(TAG).catch(() => {});
    };
  }, [active]);
}
