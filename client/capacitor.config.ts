import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.pulsedate.app",
  appName: "PulseDate",
  // Points at the Vite production build output
  webDir: "dist",
  server: {
    // Required for Android WebView HTTPS scheme
    androidScheme: "https",
    // In development, point at your local server instead of bundled files:
    // url: "http://YOUR_LOCAL_IP:5173",
    // cleartext: true,
  },
};

export default config;
