import { describe, expect, it } from 'vitest'

import {
  analyzeTranslationValue,
  createCellId,
  isSafeSharedLiteral,
  parseCellId,
} from './translationUtils.js'

describe('analyzeTranslationValue', () => {
  it('flags identical non-reference strings as same as reference', () => {
    const analysis = analyzeTranslationValue({
      value: 'Continue',
      referenceValue: 'Continue',
      language: 'sv',
      referenceLanguage: 'en',
    })

    expect(analysis.sameAsReference).toBe(true)
    expect(analysis.likelyUntranslated).toBe(true)
  })

  it('flags placeholder mismatches', () => {
    const analysis = analyzeTranslationValue({
      value: 'Hello {{name}}',
      referenceValue: 'Hello {{partner}}',
      language: 'fr',
      referenceLanguage: 'en',
    })

    expect(analysis.placeholderMismatch).toBe(true)
    expect(analysis.expectedPlaceholders).toEqual(['partner'])
    expect(analysis.actualPlaceholders).toEqual(['name'])
  })

  it('finds likely untranslated shared words', () => {
    const analysis = analyzeTranslationValue({
      value: 'Start challenge right now',
      referenceValue: 'Start challenge right now',
      language: 'pl',
      referenceLanguage: 'en',
    })

    expect(analysis.sharedReferenceWords).toContain('challenge')
    expect(analysis.likelyUntranslated).toBe(true)
  })

  it('does not flag safe shared literals as same as reference', () => {
    const analysis = analyzeTranslationValue({
      value: 'Leak Finder',
      referenceValue: 'Leak Finder',
      language: 'es',
      referenceLanguage: 'en',
    })

    expect(analysis.sameAsReference).toBe(false)
    expect(analysis.likelyUntranslated).toBe(false)
  })

  it('does not treat low-signal bridge terms as untranslated overlap', () => {
    const analysis = analyzeTranslationValue({
      value: 'Robots premium',
      referenceValue: 'Robots premium',
      language: 'sv',
      referenceLanguage: 'en',
    })

    expect(analysis.sharedReferenceWords).toEqual([])
    expect(analysis.likelyUntranslated).toBe(false)
  })

  it('still flags mixed long strings with multiple shared English tokens', () => {
    const analysis = analyzeTranslationValue({
      value: 'Empieza challenge right now con tu partner',
      referenceValue: 'Start challenge right now with your partner',
      language: 'es',
      referenceLanguage: 'en',
    })

    expect(analysis.sharedReferenceWords).toEqual(['challenge', 'right', 'partner'])
    expect(analysis.likelyUntranslated).toBe(true)
  })
})

describe('isSafeSharedLiteral', () => {
  it('accepts short domain literals and platform labels', () => {
    expect(isSafeSharedLiteral('Top 10')).toBe(true)
    expect(isSafeSharedLiteral('50 Tickets')).toBe(true)
    expect(isSafeSharedLiteral('App Store')).toBe(true)
  })

  it('rejects normal UI copy that should be translated', () => {
    expect(isSafeSharedLiteral('Continue with Google')).toBe(false)
    expect(isSafeSharedLiteral('Delete this session')).toBe(false)
  })
})

describe('cell ids', () => {
  it('round-trips cell identifiers', () => {
    const cellId = createCellId('web', 'components.chat.send', 'sv')

    expect(parseCellId(cellId)).toEqual({
      datasetId: 'web',
      key: 'components.chat.send',
      language: 'sv',
    })
  })
})
