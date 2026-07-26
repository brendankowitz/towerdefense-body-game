import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brendankowitz.bodydefense',
  appName: 'Body Defense',
  webDir: 'dist',
  ios: {
    // The app insets itself via env(safe-area-inset-*); letting WKWebView also
    // inset the content would double the padding.
    contentInset: 'never',
    backgroundColor: '#FBF7F0',
  },
};

export default config;
