import { expect } from 'chai'
import { toStrategies, nearDistance, UnsupportedLocatorError } from '../../lib/locators.js'

describe('toStrategies', () => {
  it('maps ~ to test id then label', () => {
    expect(toStrategies('~login')).to.deep.equal([
      { by: 'testId', value: 'login' },
      { by: 'label', value: 'login' },
    ])
  })

  it('maps # to test id', () => {
    expect(toStrategies('#io.app:id/login')).to.deep.equal([{ by: 'testId', value: 'io.app:id/login' }])
  })

  it('tries button name first for clicks', () => {
    expect(toStrategies('Sign In', { purpose: 'click' }).map(s => s.by)).to.deep.equal(['role', 'testId', 'label', 'text', 'text'])
  })

  it('tries own label, placeholder, nearby label, test id for fields', () => {
    expect(toStrategies('Email', { purpose: 'field' }).map(s => s.by)).to.deep.equal(['label', 'placeholder', 'labelNear', 'testId'])
  })

  it('maps object locators', () => {
    expect(toStrategies({ role: 'button', name: 'OK' })).to.deep.equal([{ by: 'role', role: 'button', name: 'OK' }])
    expect(toStrategies({ role: 'button', text: 'OK' })).to.deep.equal([{ by: 'role', role: 'button', name: 'OK' }])
    expect(toStrategies({ id: 'x' })).to.deep.equal([{ by: 'testId', value: 'x' }])
    expect(toStrategies({ testId: 'x' })).to.deep.equal([{ by: 'testId', value: 'x' }])
    expect(toStrategies({ label: 'x' })).to.deep.equal([{ by: 'label', value: 'x' }])
    expect(toStrategies({ text: /x/ })).to.deep.equal([{ by: 'text', value: /x/ }])
    expect(toStrategies({ type: 'Switch' })).to.deep.equal([{ by: 'type', value: 'Switch' }])
    expect(toStrategies({ placeholder: 'Search' })).to.deep.equal([{ by: 'placeholder', value: 'Search' }])
  })

  it('picks platform-specific locator', () => {
    expect(toStrategies({ android: '#a', ios: '~b' }, { platform: 'ios' })).to.deep.equal([
      { by: 'testId', value: 'b' },
      { by: 'label', value: 'b' },
    ])
  })

  it('rejects XPath and CSS', () => {
    expect(() => toStrategies('//android.widget.Button')).to.throw(UnsupportedLocatorError, /use ~accessibilityId/)
    expect(() => toStrategies('(//a)[1]')).to.throw(UnsupportedLocatorError)
    expect(() => toStrategies({ xpath: '//a' })).to.throw(UnsupportedLocatorError)
    expect(() => toStrategies({ css: 'a' })).to.throw(UnsupportedLocatorError)
    expect(() => toStrategies('android=new UiSelector()')).to.throw(UnsupportedLocatorError)
  })
})

describe('nearDistance', () => {
  const label = { x: 10, y: 100, width: 60, height: 20 }

  it('accepts a field to the right on the same row', () => {
    expect(nearDistance(label, { x: 80, y: 95, width: 200, height: 30 })).to.equal(10)
  })

  it('accepts a field below', () => {
    expect(nearDistance(label, { x: 10, y: 130, width: 300, height: 40 })).to.equal(10)
  })

  it('accepts a label inside the field', () => {
    expect(nearDistance(label, { x: 0, y: 90, width: 300, height: 50 })).to.equal(0)
  })

  it('rejects a field above or to the left', () => {
    expect(nearDistance(label, { x: 10, y: 40, width: 300, height: 40 })).to.equal(null)
    expect(nearDistance({ x: 200, y: 100, width: 60, height: 20 }, { x: 10, y: 100, width: 100, height: 20 })).to.equal(null)
  })
})
