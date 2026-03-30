import {
  formatRoomCodeInput,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '@/app/utils/roomCode'
import { describe, expect, it } from 'vitest'

describe('roomCode utils', () => {
  it('generates strict room code format', () => {
    const code = generateRoomCode()
    expect(code).toMatch(/^[a-z]{3}-[a-z]{3}-[a-z]{3}$/)
  })

  it('formats typed room code input', () => {
    expect(formatRoomCodeInput('ABC123def!ghi')).toBe('abc-def-ghi')
    expect(formatRoomCodeInput('ab')).toBe('ab')
    expect(formatRoomCodeInput('abcdef')).toBe('abc-def')
  })

  it('normalizes only full valid letter payloads', () => {
    expect(normalizeRoomCode('ABC def GHI')).toBe('abc-def-ghi')
    expect(normalizeRoomCode('abc-def')).toBeNull()
    expect(normalizeRoomCode('123456789')).toBeNull()
  })

  it('validates strict formatted room code', () => {
    expect(isValidRoomCode('abc-def-ghi')).toBe(true)
    expect(isValidRoomCode('ABC-DEF-GHI')).toBe(false)
    expect(isValidRoomCode('abcde-fgh')).toBe(false)
  })
})
