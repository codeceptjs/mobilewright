import { expect } from 'chai'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import Mobilewright from '../../index.js'
import { fakeDriver, node } from './fakeDriver.js'

const box = (x, y, width, height) => ({ x, y, width, height })

async function start(tree, config = {}) {
  const driver = fakeDriver(tree)
  const I = new Mobilewright({ platform: 'android', app: 'com.example.app', driver, actionTimeout: 300, waitForTimeout: 300, ...config })
  await I._beforeSuite()
  return { I, driver }
}

function registrationForm() {
  return [
    node({
      type: 'FrameLayout',
      bounds: box(0, 0, 400, 800),
      children: [
        node({ type: 'TextView', text: 'Email:', bounds: box(10, 100, 60, 20) }),
        node({ type: 'EditText', identifier: 'io.app:id/email', bounds: box(80, 95, 300, 30) }),
        node({ type: 'TextView', text: 'Password', bounds: box(10, 150, 80, 20) }),
        node({ type: 'EditText', identifier: 'io.app:id/password', bounds: box(10, 175, 300, 30) }),
        node({ type: 'TextView', text: 'Name', bounds: box(10, 230, 80, 20) }),
        node({ type: 'EditText', label: 'Full name', bounds: box(10, 255, 300, 30) }),
        node({ type: 'EditText', placeholder: 'Search', bounds: box(10, 320, 300, 30) }),
        node({ type: 'TextView', text: 'Sign In', bounds: box(10, 400, 100, 20) }),
        node({ type: 'Button', text: 'Sign In', bounds: box(10, 500, 200, 40) }),
        node({ type: 'CheckBox', text: 'Remember me', isChecked: true, bounds: box(10, 560, 200, 30) }),
      ],
    }),
  ]
}

const field = (driver, id) => {
  const walk = nodes => nodes.flatMap(n => [n, ...walk(n.children)])
  return walk(driver.tree).find(n => n.identifier === id || n.label === id || n.placeholder === id)
}

describe('Mobilewright helper', () => {
  describe('#fillField', () => {
    it('fills the field to the right of a text label', async () => {
      const { I, driver } = await start(registrationForm())
      await I.fillField('Email', 'user@example.com')
      expect(field(driver, 'io.app:id/email').value).to.equal('user@example.com')
    })

    it('fills the field below a text label, not the one above it', async () => {
      const { I, driver } = await start(registrationForm())
      await I.fillField('Password', 'secret')
      expect(field(driver, 'io.app:id/password').value).to.equal('secret')
      expect(field(driver, 'io.app:id/email').value).to.equal(undefined)
    })

    it('prefers the field own accessibility label over a nearby text', async () => {
      const { I, driver } = await start(registrationForm())
      await I.fillField('Full name', 'Davert')
      expect(field(driver, 'Full name').value).to.equal('Davert')
    })

    it('matches a placeholder', async () => {
      const { I, driver } = await start(registrationForm())
      await I.fillField('Search', 'phones')
      expect(field(driver, 'Search').value).to.equal('phones')
    })

    it('matches by resource id', async () => {
      const { I, driver } = await start(registrationForm())
      await I.fillField('#password', '123')
      expect(field(driver, 'io.app:id/password').value).to.equal('123')
    })

    it('appends and checks value', async () => {
      const { I } = await start(registrationForm())
      await I.fillField('Email', 'user')
      await I.appendField('Email', '@example.com')
      await I.seeInField('Email', 'user@example.com')
      await I.dontSeeInField('Email', 'user')
      expect(await I.grabValueFrom('Email')).to.equal('user@example.com')
    })

    it('fails with the locator in the message', async () => {
      const { I } = await start(registrationForm())
      let error
      await I.fillField('Phone', '1').catch(e => (error = e))
      expect(error.message).to.contain('"Phone" was not found')
    })
  })

  describe('#click', () => {
    it('taps the button rather than a text earlier on screen', async () => {
      const { I, driver } = await start(registrationForm())
      await I.click('Sign In')
      expect(driver.calls.filter(c => c[0] === 'tap').at(-1)).to.deep.equal(['tap', 110, 520])
    })

    it('rejects XPath with a readable error', async () => {
      const { I } = await start(registrationForm())
      let error
      await I.click('//android.widget.Button').catch(e => (error = e))
      expect(error.name).to.equal('UnsupportedLocatorError')
    })

    it('taps inside a context', async () => {
      const tree = [
        node({ type: 'Cell', identifier: 'row-1', bounds: box(0, 0, 400, 50), children: [node({ type: 'Button', text: 'Delete', bounds: box(300, 10, 80, 30) })] }),
        node({ type: 'Cell', identifier: 'row-2', bounds: box(0, 50, 400, 50), children: [node({ type: 'Button', text: 'Delete', bounds: box(300, 60, 80, 30) })] }),
      ]
      const { I, driver } = await start(tree)
      await I.click('Delete', '~row-2')
      expect(driver.calls.filter(c => c[0] === 'tap').at(-1)).to.deep.equal(['tap', 340, 75])
    })
  })

  describe('assertions', () => {
    it('sees text on screen and in context', async () => {
      const { I } = await start(registrationForm())
      await I.see('Remember')
      await I.dontSee('Welcome')
      let error
      await I.see('Welcome').catch(e => (error = e))
      expect(error.inspect()).to.contain('expected screen text to include "Welcome"')
    })

    it('does not wait in dontSee', async () => {
      const { I } = await start(registrationForm(), { actionTimeout: 5000, waitForTimeout: 5000 })
      const started = Date.now()
      await I.dontSee('Welcome')
      await I.dontSeeElement('~missing')
      expect(Date.now() - started).to.be.below(100)
    })

    it('ignores invisible elements', async () => {
      const { I } = await start([node({ type: 'TextView', text: 'Hidden', isVisible: false })])
      await I.dontSee('Hidden')
      await I.dontSeeElement({ text: 'Hidden' })
      await I.waitForElement({ text: 'Hidden' })
    })

    it('checks elements and checkboxes', async () => {
      const { I } = await start(registrationForm())
      await I.seeElement('#email')
      await I.seeElement({ role: 'button', name: 'Sign In' })
      await I.seeCheckboxIsChecked('Remember me')
      expect(await I.grabNumberOfVisibleElements({ type: 'EditText' })).to.equal(4)
      expect(await I.grabTextFrom({ role: 'button' })).to.equal('Sign In')
    })

    it('picks platform locators', async () => {
      const { I } = await start(registrationForm())
      await I.seeElement({ android: '#email', ios: '~email' })
    })
  })

  describe('waits', () => {
    it('waits for an element to appear', async () => {
      let polls = 0
      const late = node({ type: 'Button', text: 'Done' })
      const { I } = await start(() => (++polls > 3 ? [late] : []))
      await I.waitForVisible('Done', 1)
      await I.waitForText('Done', 1)
    })

    it('fails after timeout', async () => {
      const { I } = await start([])
      let error
      await I.waitForElement('~missing', 0.2).catch(e => (error = e))
      expect(error.message).to.contain('still not present after 0.2 sec')
    })

    it('waits for an element to disappear', async () => {
      let polls = 0
      const { I } = await start(() => (++polls > 3 ? [] : [node({ type: 'ProgressBar', identifier: 'spinner' })]))
      await I.waitForInvisible('~spinner', 1)
    })
  })

  describe('lifecycle and device', () => {
    it('relaunches the app before each test', async () => {
      const { I, driver } = await start([])
      await I._before()
      await I._before()
      expect(driver.calls.filter(c => c[0] === 'launchApp')).to.have.length(2)
      expect(driver.calls.filter(c => c[0] === 'terminateApp')).to.have.length(2)
    })

    it('launches the app even when terminate fails', async () => {
      const { I, driver } = await start([])
      driver.terminateApp = async () => {
        throw new Error('exit status 3')
      }
      await I._before()
      expect(driver.calls.filter(c => c[0] === 'launchApp')).to.have.length(1)
    })

    it('scrolls to an element that is only known by its label', async () => {
      const button = node({ type: 'Button', label: 'Login button', bounds: box(10, 300, 100, 40) })
      const { I, driver } = await start(() => (driver.calls.some(c => c[0] === 'swipe') ? [button] : []))
      await I.scrollIntoView('~Login button')
      await I.seeElement('~Login button')
    })

    it('launches the app once with restart: session', async () => {
      const { I, driver } = await start([], { restart: 'session' })
      await I._before()
      await I._before()
      expect(driver.calls.filter(c => c[0] === 'launchApp')).to.have.length(1)
    })

    it('installs apps after connecting and disconnects when install fails', async () => {
      const driver = fakeDriver([])
      driver.installApp = async () => {
        throw new Error('bad app')
      }
      const I = new Mobilewright({ platform: 'android', driver, installApps: ['/tmp/a.apk'] })
      let error
      await I._beforeSuite().catch(e => (error = e))
      expect(error.message).to.equal('bad app')
      expect(driver.calls.at(-1)).to.deep.equal(['disconnect'])
      expect(I.device).to.equal(null)
    })

    it('disconnects at the end', async () => {
      const { I, driver } = await start([])
      await I._finishTest()
      expect(driver.calls.at(-1)).to.deep.equal(['disconnect'])
      expect(I.device).to.equal(null)
    })

    it('manages apps', async () => {
      const { I, driver } = await start([])
      await I.seeAppIsInstalled('com.example.app')
      await I.seeAppIsNotInstalled('com.other.app')
      await I.installApp('/tmp/app.apk')
      await I.removeApp('com.example.app')
      await I.amOnPage('myapp://settings')
      expect(driver.calls.map(c => c[0])).to.include.members(['installApp', 'uninstallApp', 'openUrl'])
    })

    it('handles orientation and buttons', async () => {
      const { I, driver } = await start([])
      await I.setOrientation('LANDSCAPE')
      await I.seeOrientationIs('landscape')
      expect(await I.grabOrientation()).to.equal('LANDSCAPE')
      await I.pressButton('back')
      await I.swipeUp()
      expect(driver.calls).to.deep.include(['pressButton', 'BACK'])
      expect(driver.calls.find(c => c[0] === 'swipe')[1]).to.equal('up')
    })

    it('saves screenshots to output dir', async () => {
      global.output_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mw-'))
      const { I } = await start(registrationForm())
      await I.saveScreenshot('screen.png')
      expect(fs.existsSync(path.join(global.output_dir, 'screen.png'))).to.equal(true)
    })

    it('returns the view tree as source', async () => {
      const { I } = await start(registrationForm())
      expect(JSON.parse(await I.grabSource())[0].type).to.equal('FrameLayout')
    })

    it('rejects an unknown platform', () => {
      expect(() => new Mobilewright({ platform: 'web' })).to.throw(/platform/)
    })
  })
})
