import { queryAll } from '@mobilewright/core'

export class UnsupportedLocatorError extends Error {
  constructor(locator) {
    super(`${stringify(locator)} is not supported by Mobilewright: XPath and CSS locators are not available on native apps, use ~accessibilityId, #id, { role, name } or text`)
    this.name = 'UnsupportedLocatorError'
  }
}

export function stringify(locator) {
  if (typeof locator === 'string') return locator
  if (locator instanceof RegExp) return locator.toString()
  return JSON.stringify(locator, (_, v) => (v instanceof RegExp ? v.toString() : v))
}

export function toStrategies(locator, { purpose = 'element', platform } = {}) {
  if (locator instanceof RegExp) return [{ by: 'text', value: locator }]

  if (locator && typeof locator === 'object') return objectStrategies(locator, { purpose, platform })

  if (typeof locator !== 'string' || !locator.length) throw new UnsupportedLocatorError(locator)

  if (isXPath(locator) || /^(android|ios)=/.test(locator)) throw new UnsupportedLocatorError(locator)

  if (locator.startsWith('~')) {
    const value = locator.slice(1)
    return [
      { by: 'testId', value },
      { by: 'label', value },
    ]
  }

  if (locator.startsWith('#')) return [{ by: 'testId', value: locator.slice(1) }]

  if (purpose === 'click') {
    return [
      { by: 'role', role: 'button', name: locator },
      { by: 'testId', value: locator },
      { by: 'label', value: locator },
      { by: 'text', value: locator },
      { by: 'text', value: locator, exact: false },
    ]
  }

  if (purpose === 'field') {
    return [
      { by: 'label', value: locator, field: true },
      { by: 'placeholder', value: locator, field: true },
      { by: 'labelNear', value: locator },
      { by: 'testId', value: locator },
    ]
  }

  return [
    { by: 'testId', value: locator },
    { by: 'label', value: locator },
    { by: 'text', value: locator },
  ]
}

function objectStrategies(locator, { purpose, platform }) {
  if ('android' in locator || 'ios' in locator) {
    if (!(platform in locator)) throw new Error(`Locator ${stringify(locator)} has no value for platform "${platform}"`)
    return toStrategies(locator[platform], { purpose, platform })
  }
  if ('xpath' in locator || 'css' in locator) throw new UnsupportedLocatorError(locator)
  if (locator.role) return [{ by: 'role', role: locator.role, name: locator.name ?? locator.text }]
  if (locator.testId ?? locator.id) return [{ by: 'testId', value: locator.testId ?? locator.id }]
  if (locator.label) return [{ by: 'label', value: locator.label }]
  if (locator.text) return [{ by: 'text', value: locator.text }]
  if (locator.type) return [{ by: 'type', value: locator.type }]
  if (locator.placeholder) return [{ by: 'placeholder', value: locator.placeholder }]
  throw new UnsupportedLocatorError(locator)
}

function isXPath(locator) {
  return locator.startsWith('/') || locator.startsWith('(/') || locator.startsWith('./')
}

export function build(root, strategy) {
  let locator
  switch (strategy.by) {
    case 'testId':
      locator = root.getByTestId(strategy.value)
      break
    case 'label':
      locator = root.getByLabel(strategy.value, { exact: strategy.exact })
      break
    case 'text':
      locator = root.getByText(strategy.value, { exact: strategy.exact })
      break
    case 'role':
      locator = root.getByRole(strategy.role, { name: strategy.name })
      break
    case 'type':
      locator = root.getByType(strategy.value)
      break
    case 'placeholder':
      locator = root.getByPlaceholder(strategy.value, { exact: strategy.exact })
      break
    default:
      throw new Error(`Unknown strategy ${strategy.by}`)
  }
  if (strategy.field) return root.getByRole('textfield').and(locator)
  return locator
}

export function match(roots, root, strategies, { visible = true } = {}) {
  for (const strategy of strategies) {
    const found = strategy.by === 'labelNear' ? matchNearLabel(roots, root, strategy.value) : matchStrategy(roots, root, strategy, visible)
    if (found) return found
  }
  return null
}

function matchStrategy(roots, root, strategy, visible) {
  const locator = build(root, strategy)
  const nodes = queryAll(roots, locator.strategy)
  const candidates = visible ? nodes.filter(n => n.isVisible) : nodes
  if (!candidates.length) return null
  const index = nodes.indexOf(candidates[0])
  return { locator: locator.nth(index), node: candidates[0], nodes: candidates, all: locator }
}

function matchNearLabel(roots, root, text) {
  const fieldsLocator = root.getByRole('textfield')
  const fields = queryAll(roots, fieldsLocator.strategy)
  const visibleFields = fields.filter(n => n.isVisible)
  if (!visibleFields.length) return null

  const texts = queryAll(roots, root.getByText(text, { exact: false }).strategy).filter(n => n.isVisible && !visibleFields.includes(n))
  if (!texts.length) return null

  const normalized = text.trim().toLowerCase()
  const exact = texts.filter(n => labelText(n) === normalized)
  const labels = exact.length ? exact : texts

  let best = null
  for (const label of labels) {
    for (const field of visibleFields) {
      const distance = nearDistance(label.bounds, field.bounds)
      if (distance === null) continue
      if (!best || distance < best.distance) best = { field, distance }
    }
  }
  if (!best) return null
  const index = fields.indexOf(best.field)
  return { locator: fieldsLocator.nth(index), node: best.field, nodes: [best.field], all: fieldsLocator }
}

function labelText(node) {
  return (node.text ?? node.label ?? node.value ?? '').trim().toLowerCase()
}

const TOLERANCE = 4

export function nearDistance(label, field) {
  const labelRight = label.x + label.width
  const labelBottom = label.y + label.height
  const fieldRight = field.x + field.width
  const fieldBottom = field.y + field.height

  const inside = label.x >= field.x - TOLERANCE && labelRight <= fieldRight + TOLERANCE && label.y >= field.y - TOLERANCE && labelBottom <= fieldBottom + TOLERANCE
  if (inside) return 0

  const sameRow = field.y < labelBottom && fieldBottom > label.y
  if (sameRow && field.x >= labelRight - TOLERANCE) return field.x - labelRight

  const overlapsColumn = field.x < labelRight && fieldRight > label.x
  if (overlapsColumn && field.y >= labelBottom - TOLERANCE) return field.y - labelBottom

  return null
}

export function scopeNodes(roots, root) {
  return queryAll(roots, root.child({ kind: 'root' }).strategy)
}

export function nodeText(node) {
  return node.text ?? node.label ?? node.value ?? ''
}

export function nodeValue(node) {
  return node.value ?? node.text ?? ''
}
