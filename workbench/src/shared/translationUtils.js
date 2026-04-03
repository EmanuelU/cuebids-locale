const CELL_ID_SEPARATOR = '\u0000'
const CONTENT_TOKEN_REGEX = /\p{L}[\p{L}\p{M}'-]{3,}/gu
const STOP_WORDS = new Set(['http', 'https', 'www', 'cuebids'])

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

export function analyzeTranslationValue({
  value = '',
  referenceValue = '',
  language,
  referenceLanguage,
}) {
  const normalizedValue = normalizeComparisonValue(value)
  const normalizedReferenceValue = normalizeComparisonValue(referenceValue)
  const missing = normalizedValue.length === 0
  const sameAsReference =
    language !== referenceLanguage &&
    normalizedValue.length > 0 &&
    normalizedValue === normalizedReferenceValue

  const expectedPlaceholders = extractPlaceholders(referenceValue)
  const actualPlaceholders = extractPlaceholders(value)
  const placeholderMismatch =
    language !== referenceLanguage &&
    expectedPlaceholders.join('|') !== actualPlaceholders.join('|')

  const referenceTokens = extractMeaningfulTokens(referenceValue)
  const valueTokens = extractMeaningfulTokens(value)
  const sharedReferenceWords =
    language === referenceLanguage
      ? []
      : valueTokens.filter((token) => referenceTokens.includes(token))
  const overlapRatio = referenceTokens.length
    ? sharedReferenceWords.length / referenceTokens.length
    : 0
  const likelyUntranslated =
    language !== referenceLanguage &&
    !missing &&
    (sameAsReference ||
      sharedReferenceWords.length >= 2 ||
      (sharedReferenceWords.length >= 1 && overlapRatio >= 0.5))

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
