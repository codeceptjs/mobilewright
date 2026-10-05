import path from 'node:path'

const platform = process.env.PLATFORM || 'android'
const apps = path.resolve(import.meta.dirname, '../data')

export const config = {
  tests: './*_test.js',
  output: path.resolve(import.meta.dirname, '../../output'),
  noGlobals: true,
  helpers: {
    Mobilewright: {
      require: '../../index.js',
      platform,
      app: 'com.saucelabs.mydemoapp.rn',
      installApps: path.join(apps, platform === 'ios' ? 'MyRNDemoApp.zip' : 'MyRNDemoApp.apk'),
      deviceId: process.env.DEVICE_ID,
      actionTimeout: 10000,
      waitForTimeout: 10000,
      appLaunchTimeout: 60000,
      animations: 'off',
    },
  },
  name: 'mobilewright-integration',
}
