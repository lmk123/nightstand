import {describe, expect, it} from 'vitest'
import {defaultPrefs, IDLE_MINUTES, parsePrefs} from '../src/index.ts'

const defaults = {cover: false, mute: true, idleMinutes: 1}

describe('prefs', () => {
  it('defaults to not covering (muting once covering is turned on), and to a minute without input', () => {
    expect(defaultPrefs()).toEqual(defaults)
    expect(parsePrefs(undefined)).toEqual(defaults)
    expect(parsePrefs('nope')).toEqual(defaults)
  })
  it('reads prefs an older build saved, without the idle time', () => {
    expect(parsePrefs({cover: false, mute: true})).toEqual({cover: false, mute: true, idleMinutes: 1})
  })
  it('round-trips what was saved', () => {
    for (const prefs of [
      {cover: false, mute: true, idleMinutes: 1},
      {cover: true, mute: false, idleMinutes: 2},
      {cover: false, mute: false, idleMinutes: 5}
    ]) {
      expect(parsePrefs(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs)
    }
    for (const idleMinutes of IDLE_MINUTES) {
      expect(parsePrefs({...defaults, idleMinutes}).idleMinutes).toBe(idleMinutes)
    }
  })
  it('drops malformed fields one by one and ignores unknown ones', () => {
    expect(parsePrefs({cover: 'no', mute: false, later: 1})).toEqual({cover: false, mute: false, idleMinutes: 1})
    expect(parsePrefs({cover: true, mute: 0})).toEqual({cover: true, mute: true, idleMinutes: 1})
    expect(parsePrefs({cover: false, mute: 0})).toEqual({cover: false, mute: true, idleMinutes: 1})
    for (const idleMinutes of [0, 3, -1, 1.5, '5', null, Infinity]) {
      expect(parsePrefs({cover: false, mute: false, idleMinutes})).toEqual({cover: false, mute: false, idleMinutes: 1})
    }
  })
})
