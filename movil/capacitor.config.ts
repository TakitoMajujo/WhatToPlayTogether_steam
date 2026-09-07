import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.whattoplaytogether.mobile',
  appName: 'WhatToPlayTogether',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#07090f'
    }
  },
  android: {
    allowMixedContent: true
  }
}

export default config
