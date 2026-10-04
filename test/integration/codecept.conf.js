import path from 'node:path'

const platform = process.env.PLATFORM || 'android'
const data = path.resolve(import.meta.dirname, '../data')

const apps = {
  android: {
    app: 'io.selendroid.testapp',
    installApps: path.join(data, 'selendroid-test-app-0.17.0.apk'),
  },
  ios: {
    app: 'io.appium.TestApp',
    installApps: path.join(data, 'TestApp-iphonesimulator.app'),
  },
}

export const config = {
  tests: `./${platform}_test.js`,
  output: path.resolve(import.meta.dirname, '../../output'),
  helpers: {
    Mobilewright: {
      require: '../../index.js',
      platform,
      ...apps[platform],
      deviceId: process.env.DEVICE_ID,
      actionTimeout: 10000,
      waitForTimeout: 10000,
      appLaunchTimeout: 60000,
      animations: 'off',
    },
  },
  noGlobals: true,
  name: 'mobilewright-integration',
}
