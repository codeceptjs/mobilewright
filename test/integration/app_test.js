import fs from 'node:fs'
import path from 'node:path'
import { secret } from 'codeceptjs'

Feature('My Demo App')

After(async ({ I }) => {
  const source = await I.grabSource()
  fs.mkdirSync(global.output_dir, { recursive: true })
  fs.writeFileSync(path.join(global.output_dir, `source-${Date.now()}.json`), source)
})

Scenario('shows the catalog', ({ I }) => {
  I.waitForText('Products', 30)
  I.see('Sauce Labs Backpack')
  I.dontSee('Login')
  I.seeAppIsInstalled('com.saucelabs.mydemoapp.rn')
})

Scenario('logs in by the labels next to the fields', ({ I }) => {
  I.waitForText('Products', 30)
  I.amOnPage('mydemoapprn://login')
  I.waitForElement('~Username input field', 15)
  I.fillField('Username', 'alice@example.com')
  I.fillField('Password', '10203040')
  I.scrollIntoView('~Login button')
  I.click('~Login button')
  I.waitForText('Sorry, this user has been locked out.', 15)
  I.fillField('Username', 'bob')
  I.appendField('Username', '@example.com')
  I.fillField('Password', secret('10203040'))
  I.seeInField('~Username input field', 'bob@example.com')
  I.scrollIntoView('~Login button')
  I.click('~Login button')
  I.waitForInvisible('~Login button', 15)
})

Scenario('opens a product', ({ I }) => {
  I.waitForText('Products', 30)
  I.click('Sauce Labs Backpack')
  I.waitForElement('~Add To Cart button', 15)
  I.click('~Add To Cart button')
  I.saveScreenshot('product.png')
})

Scenario('rotates the device', ({ I }) => {
  I.waitForText('Products', 30)
  I.setOrientation('LANDSCAPE')
  I.seeOrientationIs('LANDSCAPE')
  I.setOrientation('PORTRAIT')
  I.seeOrientationIs('PORTRAIT')
})
