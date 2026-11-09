import {describe, expect, it} from 'vitest'
import {defaultPrefs, parsePrefs} from '../src/index.ts'

describe('prefs', () => {
  it('defaults to covering and muting', () => {
    expect(defaultPrefs()).toEqual({cover: true, mute: true})
    expect(parsePrefs(undefined)).toEqual({cover: true, mute: true})
    expect(parsePrefs('nope')).toEqual({cover: true, mute: true})
  })
  it('round-trips what was saved', () => {
    for (const prefs of [
      {cover: false, mute: true},
      {cover: true, mute: false},
      {cover: false, mute: false}
    ]) {
      expect(parsePrefs(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs)
    }
  })
  it('drops malformed fields one by one and ignores unknown ones', () => {
    expect(parsePrefs({cover: 'no', mute: false, later: 1})).toEqual({cover: true, mute: false})
    expect(parsePrefs({cover: false, mute: 0})).toEqual({cover: false, mute: true})
  })
})
