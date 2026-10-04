export function node(props) {
  return {
    type: 'Other',
    isVisible: true,
    isEnabled: true,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    children: [],
    ...props,
  }
}

export function fakeDriver(tree = []) {
  const driver = {
    tree,
    calls: [],
    focused: null,
    apps: [{ bundleId: 'com.example.app', name: 'Example' }],
    foreground: 'com.example.app',
    orientation: 'portrait',
    async listDevices() {
      return [{ id: 'fake-1', name: 'Fake Phone', platform: 'android', type: 'emulator', state: 'online' }]
    },
    async connect(config) {
      driver.calls.push(['connect', config.deviceId])
      return { deviceId: config.deviceId, platform: config.platform }
    },
    async disconnect() {
      driver.calls.push(['disconnect'])
    },
    async getViewHierarchy() {
      return typeof driver.tree === 'function' ? driver.tree() : driver.tree
    },
    async tap(x, y) {
      driver.calls.push(['tap', x, y])
      driver.focused = findAt(driver, x, y)
    },
    async doubleTap(x, y) {
      driver.calls.push(['doubleTap', x, y])
    },
    async longPress(x, y, duration) {
      driver.calls.push(['longPress', x, y, duration])
    },
    async typeText(text) {
      driver.calls.push(['typeText', text])
      if (driver.focused) driver.focused.value = (driver.focused.value ?? '') + text
    },
    async clearText() {
      driver.calls.push(['clearText'])
      if (driver.focused) driver.focused.value = ''
    },
    async pressKeys() {},
    async swipe(direction, opts) {
      driver.calls.push(['swipe', direction, opts])
    },
    async gesture() {},
    async pressButton(button) {
      driver.calls.push(['pressButton', button])
    },
    async screenshot() {
      return Buffer.from('png')
    },
    async getScreenSize() {
      return { width: 400, height: 800, scale: 1 }
    },
    async getOrientation() {
      return driver.orientation
    },
    async setOrientation(o) {
      driver.orientation = o
    },
    async setGeolocation() {},
    async setFoldState() {},
    async launchApp(bundleId) {
      driver.calls.push(['launchApp', bundleId])
      driver.foreground = bundleId
    },
    async terminateApp(bundleId) {
      driver.calls.push(['terminateApp', bundleId])
    },
    async listApps() {
      return driver.apps
    },
    async getForegroundApp() {
      return { bundleId: driver.foreground }
    },
    async installApp(path) {
      driver.calls.push(['installApp', path])
    },
    async uninstallApp(bundleId) {
      driver.calls.push(['uninstallApp', bundleId])
    },
    async openUrl(url) {
      driver.calls.push(['openUrl', url])
    },
    async startRecording() {},
    async stopRecording() {
      return {}
    },
    async allocate() {
      return { deviceId: 'fake-1', platform: 'android' }
    },
    async release() {},
  }
  return driver
}

function flatten(nodes, out = []) {
  for (const n of nodes) {
    out.push(n)
    flatten(n.children, out)
  }
  return out
}

function findAt(driver, x, y) {
  const tree = typeof driver.tree === 'function' ? driver.tree() : driver.tree
  const hits = flatten(tree).filter(n => x >= n.bounds.x && x <= n.bounds.x + n.bounds.width && y >= n.bounds.y && y <= n.bounds.y + n.bounds.height)
  return hits.at(-1) ?? null
}
