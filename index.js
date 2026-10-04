import './lib/env.js'
import fs from 'node:fs'
import path from 'node:path'
import Helper from '@codeceptjs/helper'
import { ios, android, terminateAppIfRunning } from 'mobilewright'
import { LocatorError, sleep } from '@mobilewright/core'
import recorder from 'codeceptjs/lib/recorder'
import { truth } from 'codeceptjs/lib/assert/truth'
import { includes } from 'codeceptjs/lib/assert/include'
import { equals } from 'codeceptjs/lib/assert/equal'
import { toStrategies, build, match, scopeNodes, nodeText, nodeValue, stringify, UnsupportedLocatorError } from './lib/locators.js'

const POLL_INTERVAL = 100

/**
 * Mobile testing helper for iOS and Android built on [mobilewright](https://mobilewright.dev).
 * Runs tests on simulators, emulators and real devices without an Appium server.
 *
 * ## Configuration
 *
 * ```js
 * helpers: {
 *   Mobilewright: {
 *     require: '@codeceptjs/mobilewright',
 *     platform: 'android',
 *     app: 'com.example.app',
 *     installApps: './build/app.apk',
 *   }
 * }
 * ```
 *
 * @typedef MobilewrightConfig
 * @type {object}
 * @prop {'ios'|'android'} platform - target platform.
 * @prop {string} [app] - bundle id (iOS) or package name (Android) of the app under test.
 * @prop {string|string[]} [installApps] - paths to `.apk`, `.app` or `.ipa` files installed before tests.
 * @prop {string} [deviceId] - UDID or serial of the device to use. Defaults to the first booted device.
 * @prop {string|RegExp} [deviceName] - pattern matched against device names.
 * @prop {string} [url] - URL of an already running mobilecli server. When set, the helper does not start one.
 * @prop {'app'|'session'|boolean} [restart='app'] - `app` relaunches the app before every test, `session` launches it once, `false` never launches it.
 * @prop {number} [waitForTimeout=5000] - default timeout for `waitFor*` steps, in ms.
 * @prop {number} [actionTimeout=5000] - timeout for an element to become actionable, in ms.
 * @prop {number} [appLaunchTimeout=20000] - timeout for the app to reach foreground, in ms.
 * @prop {'on'|'off'} [animations] - toggles system animations on the device.
 */
class Mobilewright extends Helper {
  constructor(config) {
    super(config)
    this.device = null
    this.screen = null
    this.driver = null
    this._appLaunched = false
    this._setConfig(config)
  }

  _validateConfig(config) {
    const defaults = {
      restart: 'app',
      waitForTimeout: 5000,
      actionTimeout: 5000,
      appLaunchTimeout: 20000,
    }
    const options = { ...defaults, ...config }
    if (!['ios', 'android'].includes(options.platform)) {
      throw new Error(`Mobilewright: "platform" must be "ios" or "android", got ${JSON.stringify(options.platform)}`)
    }
    if (typeof options.deviceName === 'string') options.deviceName = new RegExp(options.deviceName)
    return options
  }

  static _config() {
    return [
      { name: 'platform', message: 'Platform to test', default: 'android' },
      { name: 'app', message: 'Bundle id or package name of the app', default: '' },
    ]
  }

  get platform() {
    return this.options.platform
  }

  async _beforeSuite() {
    if (!this.device) await this._startDevice()
  }

  async _before() {
    if (!this.device) await this._startDevice()
    const { app, restart } = this.options
    if (!app || !restart) return
    if (restart === 'session' && this._appLaunched) return
    await terminateAppIfRunning(this.device, app)
    await this.device.launchApp(app)
    this._appLaunched = true
  }

  async _finishTest() {
    if (!this.device) return
    await this.device.close()
    this.device = null
    this.screen = null
    this.driver = null
    this._appLaunched = false
  }

  async _startDevice() {
    const launcher = this.platform === 'ios' ? ios : android
    const { url, driver } = this.options
    this.device = await launcher.launch({
      deviceId: this.options.deviceId,
      deviceName: this.options.deviceName,
      url,
      autoStart: url ? false : undefined,
      driver,
      installApps: this.options.installApps,
      bundleId: this.options.app,
      autoAppLaunch: false,
      timeout: this.options.timeout,
      actionTimeout: this.options.actionTimeout,
      appLaunchTimeout: this.options.appLaunchTimeout,
      installTimeout: this.options.installTimeout,
      animations: this.options.animations,
    })
    this.screen = this.device.screen
    this.driver = this.screen.driver
  }

  async _find(locator, { purpose = 'element', context = null, timeout = 0, visible = true } = {}) {
    const strategies = toStrategies(locator, { purpose, platform: this.platform })
    const contextStrategies = context ? toStrategies(context, { platform: this.platform }) : null
    const deadline = Date.now() + timeout
    while (true) {
      const roots = await this.driver.getViewHierarchy()
      const root = this._scope(roots, contextStrategies)
      const found = root && match(roots, root, strategies, { visible })
      if (found) return { ...found, roots, root, deadline }
      if (Date.now() >= deadline) return null
      await sleep(POLL_INTERVAL)
    }
  }

  _scope(roots, contextStrategies) {
    if (!contextStrategies) return this.screen.root
    const found = match(roots, this.screen.root, contextStrategies)
    return found ? found.locator : null
  }

  async _locate(locator, opts = {}) {
    const timeout = opts.timeout ?? this.options.actionTimeout
    const found = await this._find(locator, { ...opts, timeout })
    if (!found) {
      const where = opts.context ? ` inside ${stringify(opts.context)}` : ''
      throw new Error(`Element "${stringify(locator)}"${where} was not found after ${timeout}ms`)
    }
    return found
  }

  _remaining(deadline) {
    return Math.max(deadline - Date.now(), 1000)
  }

  async _act(locator, action, opts = {}) {
    const found = await this._locate(locator, opts)
    try {
      return await action(found.locator, this._remaining(found.deadline), found)
    } catch (err) {
      if (err instanceof LocatorError) throw new Error(`Element "${stringify(locator)}": ${err.message}`)
      throw err
    }
  }

  async _texts(context) {
    const roots = await this.driver.getViewHierarchy()
    const root = this._scope(roots, context ? toStrategies(context, { platform: this.platform }) : null)
    if (!root) return null
    return scopeNodes(roots, root)
      .filter(n => n.isVisible)
      .map(nodeText)
      .filter(Boolean)
  }

  /**
   * Execute code only on iOS.
   *
   * ```js
   * I.runOnIOS(() => {
   *   I.click('~ios-only-button');
   * });
   * ```
   *
   * @param {Function} fn
   */
  async runOnIOS(caps, fn) {
    return this._runOn('ios', caps, fn)
  }

  /**
   * Execute code only on Android.
   *
   * ```js
   * I.runOnAndroid(() => {
   *   I.click('~android-only-button');
   * });
   * ```
   *
   * @param {Function} fn
   */
  async runOnAndroid(caps, fn) {
    return this._runOn('android', caps, fn)
  }

  _runOn(platform, caps, fn) {
    if (this.platform !== platform) return
    if (typeof caps === 'function') fn = caps
    recorder.session.start(`${platform}-only actions`)
    fn()
    recorder.add(`restore from ${platform} session`, () => recorder.session.restore())
    return recorder.promise()
  }

  /**
   * Taps an element. Plain text matches a button by name, then a test id, an accessibility label and visible text.
   *
   * ```js
   * I.click('Sign In');
   * I.click('~login-button');
   * I.click({ role: 'button', name: 'Sign In' });
   * I.click('Delete', '~row-1');
   * ```
   *
   * @param {string|object} locator
   * @param {string|object} [context]
   */
  async click(locator, context = null) {
    await this._act(locator, (loc, timeout) => loc.tap({ timeout }), { purpose: 'click', context })
  }

  /**
   * Alias of `click`.
   *
   * @param {string|object} locator
   * @param {string|object} [context]
   */
  async tap(locator, context = null) {
    return this.click(locator, context)
  }

  /**
   * Double-taps an element.
   *
   * @param {string|object} locator
   * @param {string|object} [context]
   */
  async doubleTap(locator, context = null) {
    await this._act(locator, (loc, timeout) => loc.doubleTap({ timeout }), { purpose: 'click', context })
  }

  /**
   * Presses and holds an element.
   *
   * ```js
   * I.longPress('~photo', 2);
   * ```
   *
   * @param {string|object} locator
   * @param {number} [sec=1] duration in seconds
   */
  async longPress(locator, sec = 1) {
    await this._act(locator, (loc, timeout) => loc.longPress({ timeout, duration: sec * 1000 }), { purpose: 'click' })
  }

  /**
   * Taps the screen at the given coordinates.
   *
   * @param {number} x
   * @param {number} y
   */
  async tapXY(x, y) {
    await this.screen.tap(x, y)
  }

  /**
   * Fills a text field. Plain text matches the field's accessibility label, its placeholder,
   * then the text label displayed next to the field (to its left, above it, or inside it).
   *
   * ```js
   * I.fillField('Email', 'user@example.com');
   * I.fillField('~email-input', 'user@example.com');
   * I.fillField('Password', secret('123456'));
   * ```
   *
   * @param {string|object} field
   * @param {string|object} value
   */
  async fillField(field, value) {
    await this._act(field, (loc, timeout) => loc.fill(value.toString(), { timeout }), { purpose: 'field' })
  }

  /**
   * Appends text to a field.
   *
   * @param {string|object} field
   * @param {string} value
   */
  async appendField(field, value) {
    await this._act(field, (loc, timeout, found) => loc.fill(nodeValue(found.node) + value.toString(), { timeout }), { purpose: 'field' })
  }

  /**
   * Clears a text field.
   *
   * @param {string|object} field
   */
  async clearField(field) {
    await this._act(field, (loc, timeout) => loc.clear({ timeout }), { purpose: 'field' })
  }

  /**
   * Checks that the text is visible on screen or inside the context element. Does not wait.
   *
   * ```js
   * I.see('Welcome');
   * I.see('user@example.com', '~profile');
   * ```
   *
   * @param {string} text
   * @param {string|object} [context]
   */
  async see(text, context = null) {
    const texts = await this._texts(context)
    if (!texts) throw new Error(`Context element "${stringify(context)}" was not found`)
    const jar = context ? `text in ${stringify(context)}` : 'screen text'
    includes(jar).assert(text, texts.join('\n'))
  }

  /**
   * Checks that the text is not visible on screen or inside the context element. Does not wait.
   *
   * @param {string} text
   * @param {string|object} [context]
   */
  async dontSee(text, context = null) {
    const texts = await this._texts(context)
    if (!texts) return
    const jar = context ? `text in ${stringify(context)}` : 'screen text'
    includes(jar).negate(text, texts.join('\n'))
  }

  /**
   * Checks that an element is visible. Does not wait.
   *
   * @param {string|object} locator
   * @param {string|object} [context]
   */
  async seeElement(locator, context = null) {
    const found = await this._find(locator, { context })
    truth(`element ${stringify(locator)}`, 'to be seen').assert(!!found)
  }

  /**
   * Checks that an element is not visible. Does not wait.
   *
   * @param {string|object} locator
   * @param {string|object} [context]
   */
  async dontSeeElement(locator, context = null) {
    const found = await this._find(locator, { context })
    truth(`element ${stringify(locator)}`, 'to be seen').negate(!!found)
  }

  /**
   * Checks the value of a text field.
   *
   * @param {string|object} field
   * @param {string} value
   */
  async seeInField(field, value) {
    const found = await this._locate(field, { purpose: 'field', timeout: 0 })
    equals(`value of field ${stringify(field)}`).assert(value.toString(), nodeValue(found.node))
  }

  /**
   * Checks that a text field does not have the value.
   *
   * @param {string|object} field
   * @param {string} value
   */
  async dontSeeInField(field, value) {
    const found = await this._locate(field, { purpose: 'field', timeout: 0 })
    equals(`value of field ${stringify(field)}`).negate(value.toString(), nodeValue(found.node))
  }

  /**
   * Checks that a checkbox or switch is checked.
   *
   * @param {string|object} locator
   */
  async seeCheckboxIsChecked(locator) {
    const found = await this._locate(locator, { purpose: 'click', timeout: 0 })
    truth(`checkbox ${stringify(locator)}`, 'to be checked').assert(found.node.isChecked === true)
  }

  /**
   * Checks that a checkbox or switch is not checked.
   *
   * @param {string|object} locator
   */
  async dontSeeCheckboxIsChecked(locator) {
    const found = await this._locate(locator, { purpose: 'click', timeout: 0 })
    truth(`checkbox ${stringify(locator)}`, 'to be checked').negate(found.node.isChecked === true)
  }

  /**
   * Returns the text of an element.
   *
   * @param {string|object} locator
   * @returns {Promise<string>}
   */
  async grabTextFrom(locator) {
    const found = await this._locate(locator)
    return nodeText(found.node)
  }

  /**
   * Returns the texts of all matching visible elements.
   *
   * @param {string|object} locator
   * @returns {Promise<string[]>}
   */
  async grabTextFromAll(locator) {
    const found = await this._find(locator)
    return found ? found.nodes.map(nodeText) : []
  }

  /**
   * Returns the value of a text field.
   *
   * @param {string|object} field
   * @returns {Promise<string>}
   */
  async grabValueFrom(field) {
    const found = await this._locate(field, { purpose: 'field' })
    return nodeValue(found.node)
  }

  /**
   * Returns the number of visible elements matching the locator.
   *
   * @param {string|object} locator
   * @returns {Promise<number>}
   */
  async grabNumberOfVisibleElements(locator) {
    const found = await this._find(locator)
    return found ? found.nodes.length : 0
  }

  /**
   * Returns the accessibility tree of the screen as JSON.
   *
   * @returns {Promise<string>}
   */
  async grabSource() {
    return JSON.stringify(await this.screen.viewTree(), null, 2)
  }

  /**
   * Waits for an element to be present in the accessibility tree.
   *
   * @param {string|object} locator
   * @param {number} [sec] seconds to wait
   */
  async waitForElement(locator, sec = null) {
    const timeout = this._timeout(sec)
    const found = await this._find(locator, { timeout, visible: false })
    if (!found) throw new Error(`Element "${stringify(locator)}" still not present after ${timeout / 1000} sec`)
  }

  /**
   * Waits for an element to be visible.
   *
   * @param {string|object} locator
   * @param {number} [sec] seconds to wait
   */
  async waitForVisible(locator, sec = null) {
    const timeout = this._timeout(sec)
    const found = await this._find(locator, { timeout })
    if (!found) throw new Error(`Element "${stringify(locator)}" still not visible after ${timeout / 1000} sec`)
  }

  /**
   * Waits for an element to become hidden or disappear.
   *
   * @param {string|object} locator
   * @param {number} [sec] seconds to wait
   */
  async waitForInvisible(locator, sec = null) {
    const timeout = this._timeout(sec)
    const deadline = Date.now() + timeout
    while (await this._find(locator)) {
      if (Date.now() >= deadline) throw new Error(`Element "${stringify(locator)}" still visible after ${timeout / 1000} sec`)
      await sleep(POLL_INTERVAL)
    }
  }

  /**
   * Waits for text to appear on screen or inside the context element.
   *
   * @param {string} text
   * @param {number} [sec] seconds to wait
   * @param {string|object} [context]
   */
  async waitForText(text, sec = null, context = null) {
    const timeout = this._timeout(sec)
    const deadline = Date.now() + timeout
    while (true) {
      const texts = await this._texts(context)
      if (texts && texts.join('\n').includes(text)) return
      if (Date.now() >= deadline) throw new Error(`Text "${text}" was not found${context ? ` in ${stringify(context)}` : ''} after ${timeout / 1000} sec`)
      await sleep(POLL_INTERVAL)
    }
  }

  /**
   * Waits for an element to become enabled.
   *
   * @param {string|object} locator
   * @param {number} [sec] seconds to wait
   */
  async waitForEnabled(locator, sec = null) {
    const timeout = this._timeout(sec)
    const deadline = Date.now() + timeout
    while (true) {
      const found = await this._find(locator)
      if (found && found.node.isEnabled) return
      if (Date.now() >= deadline) throw new Error(`Element "${stringify(locator)}" still not enabled after ${timeout / 1000} sec`)
      await sleep(POLL_INTERVAL)
    }
  }

  /**
   * Waits for the given number of seconds.
   *
   * @param {number} sec
   */
  async wait(sec) {
    await sleep(sec * 1000)
  }

  _timeout(sec) {
    return sec === null || sec === undefined ? this.options.waitForTimeout : sec * 1000
  }

  async _swipe(direction, locator, distance, duration) {
    if (!locator) return this.screen.swipe(direction, { distance, duration })
    await this._act(locator, (loc, timeout) => loc.swipe({ direction, timeout }))
  }

  /**
   * Swipes up on the screen or on an element.
   *
   * @param {string|object} [locator]
   * @param {number} [distance] in points
   * @param {number} [duration] in ms
   */
  async swipeUp(locator = null, distance, duration) {
    await this._swipe('up', locator, distance, duration)
  }

  /**
   * Swipes down on the screen or on an element.
   *
   * @param {string|object} [locator]
   * @param {number} [distance] in points
   * @param {number} [duration] in ms
   */
  async swipeDown(locator = null, distance, duration) {
    await this._swipe('down', locator, distance, duration)
  }

  /**
   * Swipes left on the screen or on an element.
   *
   * @param {string|object} [locator]
   * @param {number} [distance] in points
   * @param {number} [duration] in ms
   */
  async swipeLeft(locator = null, distance, duration) {
    await this._swipe('left', locator, distance, duration)
  }

  /**
   * Swipes right on the screen or on an element.
   *
   * @param {string|object} [locator]
   * @param {number} [distance] in points
   * @param {number} [duration] in ms
   */
  async swipeRight(locator = null, distance, duration) {
    await this._swipe('right', locator, distance, duration)
  }

  /**
   * Scrolls until the element is on screen.
   *
   * @param {string|object} locator
   * @param {number} [maxSwipes=10]
   */
  async scrollIntoView(locator, maxSwipes = 10) {
    const found = await this._find(locator, { visible: false })
    const strategy = toStrategies(locator, { platform: this.platform }).find(s => s.by !== 'labelNear')
    const target = found ? found.locator : build(this.screen.root, strategy)
    try {
      await target.scrollIntoViewIfNeeded({ maxSwipes })
    } catch (err) {
      if (err instanceof LocatorError) throw new Error(`Element "${stringify(locator)}" was not scrolled into view after ${maxSwipes} swipes`)
      throw err
    }
  }

  /**
   * Saves a screenshot of the screen to the output directory.
   *
   * @param {string} fileName
   */
  async saveScreenshot(fileName) {
    const outputFile = this._outputPath(fileName)
    this.debug(`Screenshot is saving to ${outputFile}`)
    await this.screen.screenshot({ path: outputFile })
  }

  /**
   * Saves a screenshot of an element to the output directory.
   *
   * @param {string|object} locator
   * @param {string} fileName
   */
  async saveElementScreenshot(locator, fileName) {
    const outputFile = this._outputPath(fileName)
    const buffer = await this._act(locator, (loc, timeout) => loc.screenshot({ timeout }))
    fs.mkdirSync(path.dirname(outputFile), { recursive: true })
    fs.writeFileSync(outputFile, buffer)
  }

  _outputPath(fileName) {
    return path.isAbsolute(fileName) ? fileName : path.join(global.output_dir || 'output', fileName)
  }

  /**
   * Installs an app from an `.apk`, `.app` or `.ipa` file.
   *
   * @param {string} path
   */
  async installApp(path) {
    await this.device.installApp(path)
  }

  /**
   * Removes an app from the device.
   *
   * @param {string} appId bundle id or package name
   */
  async removeApp(appId) {
    await this.device.uninstallApp(appId)
  }

  /**
   * Checks that an app is installed.
   *
   * @param {string} appId bundle id or package name
   */
  async seeAppIsInstalled(appId) {
    const apps = await this.device.listApps()
    truth(`app ${appId}`, 'to be installed').assert(apps.some(a => a.bundleId === appId))
  }

  /**
   * Checks that an app is not installed.
   *
   * @param {string} appId bundle id or package name
   */
  async seeAppIsNotInstalled(appId) {
    const apps = await this.device.listApps()
    truth(`app ${appId}`, 'to be installed').negate(apps.some(a => a.bundleId === appId))
  }

  /**
   * Launches an app and waits until it is in the foreground. Defaults to the configured `app`.
   *
   * @param {string} [appId]
   */
  async launchApp(appId = this.options.app) {
    await this.device.launchApp(appId)
  }

  /**
   * Terminates an app. Defaults to the configured `app`.
   *
   * @param {string} [appId]
   */
  async closeApp(appId = this.options.app) {
    await terminateAppIfRunning(this.device, appId)
  }

  /**
   * Opens a URL or deep link on the device.
   *
   * ```js
   * I.amOnPage('myapp://settings');
   * ```
   *
   * @param {string} url
   */
  async amOnPage(url) {
    await this.device.openUrl(url)
  }

  /**
   * Alias of `amOnPage`.
   *
   * @param {string} url
   */
  async openUrl(url) {
    await this.device.openUrl(url)
  }

  /**
   * Sets device orientation.
   *
   * @param {'PORTRAIT'|'LANDSCAPE'} orientation
   */
  async setOrientation(orientation) {
    await this.device.setOrientation(orientation.toLowerCase())
  }

  /**
   * Returns device orientation, `PORTRAIT` or `LANDSCAPE`.
   *
   * @returns {Promise<string>}
   */
  async grabOrientation() {
    return (await this.device.getOrientation()).toUpperCase()
  }

  /**
   * Checks device orientation.
   *
   * @param {'PORTRAIT'|'LANDSCAPE'} orientation
   */
  async seeOrientationIs(orientation) {
    equals('orientation').assert(orientation.toUpperCase(), await this.grabOrientation())
  }

  /**
   * Presses a hardware button: `HOME`, `BACK`, `ENTER`, `VOLUME_UP`, `VOLUME_DOWN`, `POWER`, `APP_SWITCH`, `LOCK` or a `DPAD_*` key.
   *
   * @param {string} button
   */
  async pressButton(button) {
    await this.screen.pressButton(button.toUpperCase())
  }

  /**
   * Navigates back.
   */
  async goBack() {
    await this.screen.goBack()
  }
}

export { UnsupportedLocatorError }
export default Mobilewright
