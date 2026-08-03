import type { ConfigContext, ExpoConfig } from 'expo/config';

import { ALERT_SOUNDS } from '@/core/alerts';

import appConfig from '../../../app.config';

/**
 * The catalogue and the bundle must agree.
 *
 * This exists because v0.4.0 shipped without it. The four `-10s.wav` files were
 * generated, committed, and referenced by `soundFileFor` — but never added to
 * the `expo-notifications` plugin's `sounds` array in app.config.ts, so they
 * were not copied into the app bundle. iOS resolves a missing sound filename by
 * delivering the notification **silently**: no error, no fallback, no log. The
 * ten-second ring simply made no noise, and nothing in the type system, the
 * linter or 317 other tests noticed.
 *
 * The real config function is evaluated rather than the file read as text, so
 * this keeps working if the list is ever built rather than written out.
 */

function bundledSounds(): string[] {
  const config = appConfig({ config: {} } as ConfigContext) as ExpoConfig;

  const entry = (config.plugins ?? []).find(
    (plugin): plugin is [string, { sounds?: string[] }] => Array.isArray(plugin) && plugin[0] === 'expo-notifications',
  );
  if (!entry) throw new Error('No expo-notifications plugin entry — has it been removed from app.config.ts?');

  return (entry[1]?.sounds ?? []).map((path) => path.replace(/^.*\//, ''));
}

/** Every filename the app can ask a notification to play. */
function catalogueFiles(): string[] {
  return ALERT_SOUNDS.flatMap((sound) => [sound.shortFile, sound.longFile]).filter(
    (file): file is string => file !== null,
  );
}

describe('bundled alert sounds', () => {
  it('bundles every file the catalogue can ask for, at both lengths', () => {
    const bundled = new Set(bundledSounds());
    const wanted = catalogueFiles();

    expect(wanted.length).toBeGreaterThan(0);
    for (const file of wanted) {
      expect(bundled).toContain(file);
    }
  });

  it('bundles nothing the catalogue cannot ask for', () => {
    // Dead weight in the binary, and a sign the catalogue and the config have
    // drifted in the other direction.
    const wanted = new Set(catalogueFiles());

    for (const file of bundledSounds()) {
      expect(wanted).toContain(file);
    }
  });
});
