import fs from 'node:fs'
import path from 'node:path'
import { secret } from 'codeceptjs'

Feature('Android')

Before(async ({ I }) => {
  await I.waitForElement('~buttonTestCD', 30)
})

After(async ({ I }) => {
  const source = await I.grabSource()
  fs.mkdirSync(global.output_dir, { recursive: true })
  fs.writeFileSync(path.join(global.output_dir, `source-${Date.now()}.json`), source)
})

Scenario('sees home screen', ({ I }) => {
  I.see('Hello Default Locale')
  I.seeElement('~buttonTestCD')
  I.see('EN Button', '~buttonTestCD')
  I.dontSee('Welcome to register a new User')
  I.seeAppIsInstalled('io.selendroid.testapp')
})

Scenario('fills fields by the label next to them', ({ I }) => {
  I.click('~startUserRegistrationCD')
  I.waitForText('Welcome to register a new User')
  I.fillField('Username', 'davert')
  I.fillField('E-Mail', 'davert@codecept.io')
  I.fillField('Password', secret('123456'))
  I.fillField('Name', 'Michael')
  I.seeInField('Username', 'davert')
  I.seeInField('~email of the customer', 'davert@codecept.io')
  I.seeInField('Name', 'Michael')
  I.click('I accept adds')
  I.seeCheckboxIsChecked('I accept adds')
  I.click('Register User (verify)')
  I.waitForText('Verify user')
  I.see('davert', '#label_username_data')
  I.see('Michael', '#label_name_data')
})

Scenario('appends and clears fields', ({ I }) => {
  I.click('~startUserRegistrationCD')
  I.fillField('~email of the customer', 'Nothing special')
  I.appendField('~email of the customer', ' at all')
  I.seeInField('E-Mail', 'Nothing special at all')
  I.clearField('#inputName')
  I.dontSeeInField('Name', 'Mr. Burns')
})

Scenario('waits for elements', ({ I }) => {
  I.click('~waitingButtonTestCD')
  I.waitForVisible('#inputUsername', 30)
  I.waitForEnabled('Register User (verify)')
})

Scenario('device controls', async ({ I }) => {
  I.setOrientation('LANDSCAPE')
  I.seeOrientationIs('LANDSCAPE')
  I.setOrientation('PORTRAIT')
  I.click('~startUserRegistrationCD')
  I.waitForText('Welcome to register a new User')
  I.goBack()
  I.waitForElement('~buttonTestCD')
  I.saveScreenshot('home.png')
})
