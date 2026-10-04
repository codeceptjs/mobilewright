# @codeceptjs/mobilewright

> Experimental. Try it and [report issues](https://github.com/codeceptjs/mobilewright/issues).

[CodeceptJS](https://codecept.io) helper for testing iOS and Android apps with [mobilewright](https://mobilewright.dev). It runs on simulators, emulators and real devices without an Appium server.

```js
I.click('~startUserRegistrationCD')
I.fillField('Username', 'davert')
I.fillField('Password', secret('123456'))
I.click('Register User (verify)')
I.see('davert', '#label_username_data')
```

## Requirements

- Node.js 22.12 or newer
- CodeceptJS 4
- A booted simulator or emulator, or a connected device. Follow the [mobilewright setup guide](https://mobilewright.dev) and run `npx mobilewright doctor` to check your machine.

## Installation

```
npm i @codeceptjs/mobilewright --save-dev
```

## Configuration

```js
export const config = {
  helpers: {
    Mobilewright: {
      require: '@codeceptjs/mobilewright',
      platform: 'android',
      app: 'com.example.app',
      installApps: './build/app.apk',
    },
  },
}
```

| Option | Default | Description |
| --- | --- | --- |
| `platform` | required | `ios` or `android` |
| `app` | — | bundle id (iOS) or package name (Android) of the app under test |
| `installApps` | — | path or list of paths to `.apk`, `.app` or `.ipa` files installed before tests |
| `deviceId` | first booted device | UDID or serial of the device |
| `deviceName` | — | string or RegExp matched against device names |
| `url` | — | URL of a running mobilecli server; when set, the helper does not start one |
| `restart` | `'app'` | `'app'` relaunches the app before every test, `'session'` launches it once, `false` never launches it |
| `waitForTimeout` | `5000` | default timeout of `waitFor*` steps, ms |
| `actionTimeout` | `5000` | how long an action waits for its element to be actionable, ms |
| `appLaunchTimeout` | `20000` | how long to wait for the app to reach foreground, ms |
| `animations` | unchanged | `'off'` disables system animations |

## Locators

Mobilewright reads the accessibility tree. Locators follow the [Appium helper](https://codecept.io/mobile) conventions, so most tests move between the two helpers unchanged.

| Locator | Finds |
| --- | --- |
| `'~login'` | test id (iOS `accessibilityIdentifier`, Android resource id), then accessibility label (Android `content-desc`) |
| `'#login'` | test id; on Android `#login` also matches `com.app:id/login` |
| `{ role: 'button', name: 'Sign In' }` | element by role and accessible name; roles: `button`, `textfield`, `text`, `image`, `switch`, `checkbox`, `slider`, `list`, `listitem`, `header`, `link`, `tab` |
| `{ id }`, `{ testId }`, `{ label }`, `{ text }`, `{ type }`, `{ placeholder }` | the matching attribute; `text` accepts a RegExp |
| `{ android: '#a', ios: '~b' }` | a different locator per platform |

Plain text depends on the action:

- **click, tap**: a button with that name, then a test id, an accessibility label, exact visible text, and finally visible text containing it.
- **fillField, appendField, clearField, seeInField, grabValueFrom**: a text field with that accessibility label, then that placeholder, then the **text label displayed next to the field** (to its left on the same row, above it, or inside it), then a test id.
- **anything else**: a test id, an accessibility label, then exact visible text.

Each strategy is tried in order and the first one that matches a visible element wins. When nothing matches, the step fails with the locator in the message.

XPath and CSS are not supported. They fail with an error that suggests a supported locator.

A second argument scopes the search to another element:

```js
I.click('Delete', '~row-2')
I.see('Welcome', { role: 'header' })
```

## Actions

| Group | Methods |
| --- | --- |
| Interaction | `click`, `tap`, `doubleTap`, `longPress`, `tapXY`, `fillField`, `appendField`, `clearField` |
| Assertions | `see`, `dontSee`, `seeElement`, `dontSeeElement`, `seeInField`, `dontSeeInField`, `seeCheckboxIsChecked`, `dontSeeCheckboxIsChecked`, `seeAppIsInstalled`, `seeAppIsNotInstalled`, `seeOrientationIs` |
| Grabbers | `grabTextFrom`, `grabTextFromAll`, `grabValueFrom`, `grabNumberOfVisibleElements`, `grabOrientation`, `grabSource` |
| Waits | `waitForElement`, `waitForVisible`, `waitForInvisible`, `waitForText`, `waitForEnabled`, `wait` |
| Gestures | `swipeUp`, `swipeDown`, `swipeLeft`, `swipeRight`, `scrollIntoView` |
| Device and app | `installApp`, `removeApp`, `launchApp`, `closeApp`, `amOnPage` / `openUrl` (deep links), `setOrientation`, `pressButton`, `goBack`, `saveScreenshot`, `saveElementScreenshot`, `runOnIOS`, `runOnAndroid` |

`see*` and `dontSee*` check the screen once and never wait. Use `waitFor*` when the UI is still changing.

`grabSource` returns the accessibility tree as JSON. It shows the labels, test ids and types to use in locators.

## Not supported

Appium contexts and web views, settings, network connection, activities, touch actions, file transfer, clipboard, device lock and notification shade.

## Telemetry

The mobilewright library sends no telemetry; only its own CLI does. The helper still sets `MOBILEWRIGHT_DISABLE_TELEMETRY=1` so the mobilecli server it starts inherits it.

## Development

```
npm test
```

Unit tests run against a fake driver, with no device. Acceptance tests for Android and iOS run in GitHub Actions, using the sample apps from `test/data`.

## License

MIT
