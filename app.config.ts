import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Dynamic Expo config.
 *
 * Everything environment-specific is read from env vars with a safe default, so
 * the same source tree builds a dev, preview or production app without edits
 * and without any identifier or credential being committed. See .env.example.
 */

type Variant = 'development' | 'preview' | 'production';

const VARIANT = (process.env.APP_VARIANT ?? 'production') as Variant;

/**
 * Your own reverse-DNS identifier. Must be globally unique across the App
 * Store, and must match the App ID registered in your Apple Developer account.
 */
const BASE_BUNDLE_ID = process.env.IOS_BUNDLE_IDENTIFIER ?? 'com.example.lifetimer';

const VARIANT_SUFFIX: Record<Variant, string> = {
  development: '.dev',
  preview: '.preview',
  production: '',
};

const VARIANT_NAME: Record<Variant, string> = {
  development: 'Gentle Task Timer (Dev)',
  preview: 'Gentle Task Timer (Preview)',
  production: 'Gentle Task Timer',
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: VARIANT_NAME[VARIANT],
  slug: 'gentle-task-timer',
  // CI derives the marketing version from the release tag (v1.2.3 -> 1.2.3).
  version: process.env.APP_VERSION || '0.4.3',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'gentletasktimer',
  userInterfaceStyle: 'dark',

  // iPhone only, for now. Listing a single platform keeps `expo start` from
  // offering targets that are not actually supported or tested.
  platforms: ['ios'],

  plugins: [
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        // Matches colors.background, so launch does not flash white into a dark UI.
        backgroundColor: '#0B0F14',
      },
    ],
    [
      // Present for exactly one reason: `sounds` copies these files into the app
      // bundle, and a custom notification sound has to be a file in the bundle.
      // There is no other supported way to make a local notification play
      // something other than the system sound.
      //
      // The cost, and it is a real one: this plugin also writes an
      // `aps-environment` entitlement, which means the App ID **must** have the
      // Push Notifications capability enabled at developer.apple.com — even
      // though this app sends no remote push and never will. Without it, cloud
      // signing cannot issue a provisioning profile and the release workflow
      // fails at `-exportArchive`. See docs/DEPLOYMENT.md § 3.
      //
      // The files themselves are synthesised by scripts/make-alert-sounds.py,
      // so they carry no licence and nothing to declare at App Review.
      'expo-notifications',
      {
        // EVERY file `ALERT_SOUNDS` can name, both lengths of each voice. A
        // notification asking for a file that is not in the bundle is delivered
        // *silently* — no error, no fallback — so a voice missing from this
        // list looks exactly like a broken alert. v0.4.0 shipped with the four
        // `-10s` files generated, committed, and absent from here, which is why
        // the long ring made no sound at all.
        //
        // `src/services/__tests__/bundledSounds.test.ts` fails if this list and
        // the catalogue ever disagree again.
        sounds: [
          './assets/sounds/chime.wav',
          './assets/sounds/chime-10s.wav',
          './assets/sounds/bell.wav',
          './assets/sounds/bell-10s.wav',
          './assets/sounds/marimba.wav',
          './assets/sounds/marimba-10s.wav',
          './assets/sounds/pulse.wav',
          './assets/sounds/pulse-10s.wav',
        ],
      },
    ],
  ],

  ios: {
    bundleIdentifier: `${BASE_BUNDLE_ID}${VARIANT_SUFFIX[VARIANT]}`,
    // Must be unique and strictly increasing per marketing version for every
    // TestFlight upload; CI supplies the workflow run number.
    buildNumber: process.env.IOS_BUILD_NUMBER || '1',
    supportsTablet: false,
    infoPlist: {
      // The app is entirely offline: no analytics, no telemetry, no remote
      // config, no crash reporting upload. Declaring no exception domains means
      // App Transport Security stays fully enforced, and there is nothing for
      // it to permit anyway.
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
      // Declares we use no non-exempt encryption, which skips the export
      // compliance questionnaire on every single upload.
      ITSAppUsesNonExemptEncryption: false,
    },
  },

  extra: {
    variant: VARIANT,
    eas: {
      // Populated by `eas init`. Not a secret — it is a public project handle.
      projectId: process.env.EAS_PROJECT_ID ?? undefined,
    },
  },

  experiments: {
    typedRoutes: false,
  },
});
