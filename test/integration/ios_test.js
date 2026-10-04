import fs from 'node:fs'
import path from 'node:path'

Feature('iOS')

Before(async ({ I }) => {
  await I.waitForElement('~ComputeSumButton', 30)
})

After(async ({ I }) => {
  const source = await I.grabSource()
  fs.mkdirSync(global.output_dir, { recursive: true })
  fs.writeFileSync(path.join(global.output_dir, `source-${Date.now()}.json`), source)
})

Scenario('computes a sum', ({ I }) => {
  I.fillField('~IntegerA', '2')
  I.fillField('~IntegerB', '3')
  I.click('~ComputeSumButton')
  I.see('5', '~Answer')
  I.seeInField('~IntegerA', '2')
})

Scenario('sees elements', ({ I }) => {
  I.seeElement('~ComputeSumButton')
  I.dontSeeElement('~NoSuchElement')
  I.seeAppIsInstalled('io.appium.TestApp')
})
