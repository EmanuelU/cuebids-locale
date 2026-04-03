import { describe, expect, it } from 'vitest'

import {
  analyzeTranslationValue,
  createCellId,
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
      value: 'Start challenge now',
      referenceValue: 'Start challenge now',
      language: 'pl',
      referenceLanguage: 'en',
    })

    expect(analysis.sharedReferenceWords).toContain('challenge')
    expect(analysis.likelyUntranslated).toBe(true)
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
