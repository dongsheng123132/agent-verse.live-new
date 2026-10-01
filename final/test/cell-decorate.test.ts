import { describe, expect, it } from 'vitest'
import { appliedMismatches, describeUpdateFailure, diffValues, validateChanges, valuesFromCell } from '../lib/cell-decorate'

const owned = { title: 'Old', summary: 'old sum', color: '#10b981', image_url: null, iframe_url: 'https://keep.example', service_url: null, service_method: null }

describe('valuesFromCell / diffValues', () => {
  it('reads the cell (color -> fill_color, null -> "", missing method -> GET)', () => {
    expect(valuesFromCell(owned)).toMatchObject({ title: 'Old', fill_color: '#10b981', image_url: '', iframe_url: 'https://keep.example', service_method: 'GET' })
    expect(valuesFromCell({ service_method: 'post' }).service_method).toBe('POST')
    expect(valuesFromCell(null).title).toBe('')
  })

  it('sends only what changed — untouched fields (e.g. the existing iframe) are never sent, so never wiped', () => {
    const initial = valuesFromCell(owned)
    const changed = diffValues(initial, { ...initial, title: 'New title', fill_color: '#7c3aed' })
    expect(changed).toEqual({ title: 'New title', fill_color: '#7c3aed' })
  })

  it('emptying a field on purpose is sent as "" (clears it)', () => {
    const initial = valuesFromCell(owned)
    expect(diffValues(initial, { ...initial, iframe_url: '' })).toEqual({ iframe_url: '' })
  })

  it('whitespace-only differences are not changes; values are trimmed', () => {
    const initial = valuesFromCell(owned)
    expect(diffValues(initial, { ...initial, title: ' Old ' })).toEqual({})
    expect(diffValues(initial, { ...initial, title: '  X  ' })).toEqual({ title: 'X' })
  })

  it('a newly listed service travels with its method', () => {
    const initial = valuesFromCell(owned)
    expect(diffValues(initial, { ...initial, service_url: 'https://api.example.com/p' })).toEqual({ service_url: 'https://api.example.com/p', service_method: 'GET' })
    expect(diffValues(initial, { ...initial, service_url: 'https://api.example.com/p', service_method: 'POST' })).toEqual({ service_url: 'https://api.example.com/p', service_method: 'POST' })
  })
})

describe('validateChanges (client-side mirror of the server rules)', () => {
  it('nothing changed', () => expect(validateChanges({})).toContain('没有改动'))
  it('accepts valid input', () => {
    expect(validateChanges({ title: 'x', fill_color: '#AbCdEf', iframe_url: 'https://a.b', service_url: 'https://svc.example/p', image_url: 'https://i.example/a.png' })).toBeNull()
    expect(validateChanges({ iframe_url: '', service_url: '', fill_color: '' })).toBeNull() // clearing is fine
  })
  it('iframe_url must be https', () => expect(validateChanges({ iframe_url: 'http://a.b' })).toContain('https://'))
  it('service_url must be https', () => expect(validateChanges({ service_url: 'http://svc' })).toContain('https://'))
  it('colour must be #RRGGBB', () => {
    expect(validateChanges({ fill_color: 'red' })).toContain('#RRGGBB')
    expect(validateChanges({ fill_color: '#fff' })).toContain('#RRGGBB')
  })
  it('image_url must look like a web address', () => expect(validateChanges({ image_url: 'javascript:alert(1)' })).toContain('https://'))
})

describe('describeUpdateFailure (Chinese wording for PUT /api/cells/update errors)', () => {
  it('403 not_owner', () => {
    const m = describeUpdateFailure(403, { ok: false, error: 'not_owner' })
    expect(m).toContain('not_owner')
    expect(m).toContain('key')
  })
  it('401 / 400 / 503 / unknown', () => {
    expect(describeUpdateFailure(401, { error: 'unauthorized' })).toContain('401')
    expect(describeUpdateFailure(400, { error: 'invalid_iframe_url' })).toContain('https://')
    expect(describeUpdateFailure(400, { error: 'service_url_rejected', message: 'private address' })).toContain('private address')
    expect(describeUpdateFailure(503, { error: 'database_unavailable' })).toContain('稍后')
    expect(describeUpdateFailure(500, { error: 'server_error', message: 'boom' })).toContain('boom')
    expect(describeUpdateFailure(418, null)).toContain('418')
    expect(describeUpdateFailure(403, null)).toContain('403')
  })
})

describe('appliedMismatches — did the save land on THIS cell?', () => {
  const sent = { title: 'New', fill_color: '#7C3AED' }
  it('empty when the re-read cell shows what was sent (colour compared case-insensitively)', () => {
    expect(appliedMismatches(sent, { title: 'New', color: '#7c3aed' })).toEqual([])
  })
  it('lists the fields that did not change (key belonged to another cell)', () => {
    expect(appliedMismatches(sent, { title: 'Old', color: '#10b981' })).toEqual(['title', 'fill_color'])
  })
  it('a failed re-read counts as unverified', () => {
    expect(appliedMismatches(sent, null)).toEqual(['title', 'fill_color'])
  })
  it('service method NULL reads back as GET', () => {
    expect(appliedMismatches({ service_url: 'https://s.example/p', service_method: 'GET' }, { service_url: 'https://s.example/p', service_method: null })).toEqual([])
  })
})
