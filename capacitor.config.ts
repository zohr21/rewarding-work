import type { CapacitorConfig } from '@capacitor/cli';

// The Android app: the built site (dist/, from `npm run build:app`) packed into a native shell.
const config: CapacitorConfig = {
  appId: 'app.rewardingwork',
  appName: 'Rewarding Work',
  webDir: 'dist',
  // Light clock and icons in the status bar: the page behind it is always dark at the top.
  plugins: { SystemBars: { style: 'DARK' } },
};

export default config;
