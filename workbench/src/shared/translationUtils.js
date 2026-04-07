const CELL_ID_SEPARATOR = '\u0000'
const CONTENT_TOKEN_REGEX = /\p{L}[\p{L}\p{M}'-]{3,}/gu
const WORD_TOKEN_REGEX = /\p{L}[\p{L}\p{M}'-]*/gu
const STOP_WORDS = new Set(['http', 'https', 'www', 'cuebids'])
const LOW_SIGNAL_SHARED_TOKENS = new Set([
  'avatar',
  'bam',
  'checkback',
  'cuebids',
  'discord',
  'ev',
  'finder',
  'fit',
  'fits',
  'gazzilli',
  'global',
  'hcp',
  'jacoby',
  'leak',
  'marmic',
  'matchpoints',
  'misfit',
  'multi',
  'nt',
  'par',
  'premium',
  'pro',
  'pros',
  'robot',
  'robots',
  'rubber',
  'splinter',
  'tickets',
  'top',
  'web',
])
const SAFE_SHARED_LITERAL_PATTERNS = [
  /^(?:https?:\/\/|www\.)\S+$/i,
  /^[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}$/u,
  /^[\d\s.,:;!?()[\]{}+%/\\#@*&=-]+$/u,
  /^(?:[A-Z0-9!/+_-]{1,5})(?:\s+[A-Z0-9!/+_-]{1,5})*$/u,
  /^app store$/i,
  /^google play(?: store)?$/i,
  /^\d+(?:-\d+)?\s*(?:nt|hcp|ev)$/i,
  /^\d+\s+(?:tickets?|stars?)$/i,
  /^top\s+\d+$/i,
]

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function walkStringLeaves(node, visit, pathSegments = []) {
  if (typeof node === 'string') {
    visit(pathSegments, node)
    return
  }

  if (Array.isArray(node)) {
    node.forEach((value, index) => {
      walkStringLeaves(value, visit, [...pathSegments, String(index)])
    })
    return
  }

  if (!isPlainObject(node)) {
    return
  }

  Object.entries(node).forEach(([key, value]) => {
    walkStringLeaves(value, visit, [...pathSegments, key])
  })
}

export function joinKeyPath(pathSegments) {
  return pathSegments.join('.')
}

export function splitKeyPath(key) {
  return key ? key.split('.') : []
}

export function getNamespaceFromKey(key) {
  const segments = splitKeyPath(key)

  if (segments.length <= 1) {
    return 'root'
  }

  return segments.slice(0, -1).join('.')
}

export function getTagFromKey(key) {
  const segments = splitKeyPath(key)
  return segments.at(-1) ?? key
}

export function normalizeComparisonValue(value = '') {
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function extractPlaceholders(value = '') {
  return [...value.matchAll(/{{\s*([^}]+?)\s*}}/g)]
    .map((match) => match[1].trim())
    .sort((left, right) => left.localeCompare(right))
}

export function extractMeaningfulTokens(value = '') {
  const matches = value.match(CONTENT_TOKEN_REGEX) ?? []
  return [...new Set(matches.map((token) => token.toLowerCase()).filter((token) => !STOP_WORDS.has(token)))]
}

export function extractWordTokens(value = '') {
  const matches = value.match(WORD_TOKEN_REGEX) ?? []
  return [...new Set(matches.map((token) => token.toLowerCase()))]
}

export function isSafeSharedLiteral(value = '') {
  const normalizedValue = normalizeComparisonValue(value)

  if (normalizedValue.length === 0) {
    return true
  }

  if (SAFE_SHARED_LITERAL_PATTERNS.some((pattern) => pattern.test(value.trim()))) {
    return true
  }

  const signalTokens = extractWordTokens(value)
    .filter((token) => token.length > 1)
    .filter((token) => !STOP_WORDS.has(token))

  if (signalTokens.length === 0) {
    return true
  }

  return signalTokens.length <= 3 &&
    signalTokens.every((token) => LOW_SIGNAL_SHARED_TOKENS.has(token))
}

export function analyzeTranslationValue({
  value = '',
  referenceValue = '',
  language,
  referenceLanguage,
}) {
  const normalizedValue = normalizeComparisonValue(value)
  const normalizedReferenceValue = normalizeComparisonValue(referenceValue)
  const missing = normalizedValue.length === 0
  const sameAsReferenceRaw =
    language !== referenceLanguage &&
    normalizedValue.length > 0 &&
    normalizedValue === normalizedReferenceValue
  const sameAsReference = sameAsReferenceRaw && !isSafeSharedLiteral(value)

  const expectedPlaceholders = extractPlaceholders(referenceValue)
  const actualPlaceholders = extractPlaceholders(value)
  const placeholderMismatch =
    language !== referenceLanguage &&
    expectedPlaceholders.join('|') !== actualPlaceholders.join('|')

  const referenceTokens = extractMeaningfulTokens(referenceValue)
    .filter((token) => !LOW_SIGNAL_SHARED_TOKENS.has(token))
  const valueTokens = extractMeaningfulTokens(value)
    .filter((token) => !LOW_SIGNAL_SHARED_TOKENS.has(token))
  const sharedReferenceWords =
    language === referenceLanguage
      ? []
      : valueTokens.filter((token) => referenceTokens.includes(token))
  const overlapRatio = referenceTokens.length
    ? sharedReferenceWords.length / referenceTokens.length
    : 0
  const likelyUntranslatedByOverlap =
    referenceTokens.length >= 3 &&
    (sharedReferenceWords.length >= 3 ||
      (sharedReferenceWords.length >= 2 && overlapRatio >= 0.6))
  const likelyUntranslated =
    language !== referenceLanguage &&
    !missing &&
    (sameAsReference || likelyUntranslatedByOverlap)

  return {
    missing,
    sameAsReference,
    placeholderMismatch,
    sharedReferenceWords,
    overlapRatio,
    likelyUntranslated,
    expectedPlaceholders,
    actualPlaceholders,
  }
}

export function createCellId(datasetId, key, language) {
  return [datasetId, key, language].join(CELL_ID_SEPARATOR)
}

export function parseCellId(cellId) {
  const [datasetId, key, language] = cellId.split(CELL_ID_SEPARATOR)
  return {
    datasetId,
    key,
    language,
  }
}

export function summarizeRowIssues(row, selectedLanguages) {
  let missingCount = 0
  let sameAsReferenceCount = 0
  let placeholderMismatchCount = 0
  let likelyUntranslatedCount = 0

  selectedLanguages.forEach((language) => {
    const cell = row.values[language]

    if (!cell) {
      return
    }

    if (cell.missing) {
      missingCount += 1
    }

    if (cell.sameAsReference) {
      sameAsReferenceCount += 1
    }

    if (cell.placeholderMismatch) {
      placeholderMismatchCount += 1
    }

    if (cell.likelyUntranslated) {
      likelyUntranslatedCount += 1
    }
  })

  return {
    missingCount,
    sameAsReferenceCount,
    placeholderMismatchCount,
    likelyUntranslatedCount,
    issueCount:
      missingCount +
      sameAsReferenceCount +
      placeholderMismatchCount +
      likelyUntranslatedCount,
  }
}

export function formatRelativeFilePath(filePath) {
  return filePath.replace(/\\/g, '/')
}
