import { describe, it, expect } from 'vitest'
import { pickVariant } from '../components/shared/OnboardingModal'

describe('pickVariant', () => {
  it('returns differential when risk is differential regardless of budget', () => {
    expect(pickVariant('premium', 'differential')).toBe('differential')
    expect(pickVariant('balanced', 'differential')).toBe('differential')
    expect(pickVariant('value', 'differential')).toBe('differential')
  })

  it('returns value when budget is value and risk is not differential', () => {
    expect(pickVariant('value', 'safe')).toBe('value')
    expect(pickVariant('value', 'balanced')).toBe('value')
  })

  it('returns max_xp for premium budget + safe risk', () => {
    expect(pickVariant('premium', 'safe')).toBe('max_xp')
  })

  it('returns max_xp for premium budget + balanced risk', () => {
    expect(pickVariant('premium', 'balanced')).toBe('max_xp')
  })

  it('returns max_xp for balanced budget + safe risk', () => {
    expect(pickVariant('balanced', 'safe')).toBe('max_xp')
  })

  it('returns max_xp for balanced budget + balanced risk', () => {
    expect(pickVariant('balanced', 'balanced')).toBe('max_xp')
  })
})
