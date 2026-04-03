import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  analyzeTranslationValue,
  formatRelativeFilePath,
  getNamespaceFromKey,
  getTagFromKey,
  isPlainObject,
  joinKeyPath,
  walkStringLeaves,
} from '../shared/translationUtils.js'

const PACKAGE_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const DEFAULT_CONFIG_PATH = path.join(PACKAGE_ROOT, 'workbench.config.js')

export async function buildWorkbenchState() {
  const config = await loadWorkbenchConfig()
  const datasetStates = await Promise.all(
    config.datasets.map((dataset, index) => loadDataset(config, dataset, index))
  )

  const rows = datasetStates
    .flatMap((datasetState) => datasetState.rows)
    .sort((left, right) => {
      if (left.datasetOrder !== right.datasetOrder) {
        return left.datasetOrder - right.datasetOrder
      }

      return left.key.localeCompare(right.key)
    })

  return {
    title: config.title,
    description: config.description,
    configPath: formatRelativeFilePath(path.relative(config.projectRoot, config.configPath)),
    languageOrder: config.languageOrder,
    languages: config.languages,
    referenceLanguage: config.referenceLanguage,
    datasets: datasetStates.map((datasetState) => datasetState.summary),
    rows,
    updatedAt: new Date().toISOString(),
  }
}

export async function saveWorkbenchChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return {
      savedCount: 0,
      state: await buildWorkbenchState(),
    }
  }

  const state = await buildWorkbenchState()
  const rowLookup = new Map(
    state.rows.map((row) => [`${row.datasetId}::${row.key}`, row])
  )
  const fileUpdates = new Map()

  changes.forEach((change) => {
    const row = rowLookup.get(`${change.datasetId}::${change.key}`)

    if (!row) {
      throw new Error(
        `Could not find translation row for ${change.datasetId}:${change.key}`
      )
    }

    const cell = row.values[change.language]

    if (!cell?.filePath || !Array.isArray(cell.jsonPath)) {
      throw new Error(
        `Could not resolve save target for ${change.datasetId}:${change.key}:${change.language}`
      )
    }

    const pendingUpdates = fileUpdates.get(cell.filePath) ?? []
    pendingUpdates.push({
      jsonPath: cell.jsonPath,
      value: change.value,
    })
    fileUpdates.set(cell.filePath, pendingUpdates)
  })

  await Promise.all(
    [...fileUpdates.entries()].map(async ([filePath, updates]) => {
      const json = JSON.parse(await fs.readFile(filePath, 'utf8'))

      updates.forEach((update) => {
        setNestedValue(json, update.jsonPath, update.value)
      })

      await fs.writeFile(filePath, `${JSON.stringify(json, null, 2)}\n`)
    })
  )

  return {
    savedCount: changes.length,
    state: await buildWorkbenchState(),
  }
}

async function loadWorkbenchConfig() {
  const configuredPath = process.env.TRANSLATION_WORKBENCH_CONFIG
  const configPath = configuredPath
    ? resolveConfigPath(configuredPath)
    : DEFAULT_CONFIG_PATH
  const importedModule = await import(
    `${pathToFileURL(configPath).href}?t=${Date.now()}`
  )
  const config = importedModule.default ?? importedModule.workbenchConfig

  if (!config?.datasets?.length) {
    throw new Error(`No datasets found in ${configPath}`)
  }

  const configDirectory = path.dirname(configPath)
  const projectRoot = config.projectRoot
    ? path.resolve(configDirectory, config.projectRoot)
    : configDirectory
  const languageOrder = Object.keys(config.languages ?? {})

  return {
    title: config.title ?? 'Translation Workbench',
    description: config.description ?? '',
    configPath,
    projectRoot,
    referenceLanguage: config.referenceLanguage ?? languageOrder[0] ?? 'en',
    languageOrder,
    languages: config.languages ?? {},
    datasets: config.datasets.map((dataset) =>
      normalizeDataset(configDirectory, projectRoot, config.referenceLanguage, dataset)
    ),
  }
}

function resolveConfigPath(configuredPath) {
  if (path.isAbsolute(configuredPath)) {
    return configuredPath
  }

  return path.resolve(process.cwd(), configuredPath)
}

function normalizeDataset(configDirectory, projectRoot, defaultReferenceLanguage, dataset) {
  const referenceLanguage = dataset.referenceLanguage ?? defaultReferenceLanguage
  const languages = dataset.languages ?? []

  if (!dataset.id || !dataset.kind || languages.length === 0) {
    throw new Error(`Invalid dataset configuration: ${JSON.stringify(dataset)}`)
  }

  if (dataset.kind === 'language-files') {
    const directory = path.resolve(configDirectory, dataset.directory ?? '.')
    const languageFiles = Object.fromEntries(
      languages.map((language) => [
        language,
        path.resolve(directory, dataset.filePattern.replace('{lang}', language)),
      ])
    )

    return {
      ...dataset,
      referenceLanguage,
      languages,
      directory,
      languageFiles,
      relativeDirectory: formatRelativeFilePath(path.relative(projectRoot, directory)),
      ignorePaths: new Set(dataset.ignorePaths ?? []),
    }
  }

  if (dataset.kind === 'language-nodes') {
    const filePath = path.resolve(configDirectory, dataset.file)

    return {
      ...dataset,
      referenceLanguage,
      languages,
      filePath,
      relativeFilePath: formatRelativeFilePath(path.relative(projectRoot, filePath)),
    }
  }

  throw new Error(`Unsupported dataset kind: ${dataset.kind}`)
}

async function loadDataset(config, dataset, datasetOrder) {
  const rowMap = new Map()

  if (dataset.kind === 'language-files') {
    await loadLanguageFilesDataset(dataset, rowMap)
  } else {
    await loadLanguageNodesDataset(dataset, rowMap)
  }

  const rows = [...rowMap.values()].map((row) =>
    finalizeRow(config, dataset, datasetOrder, row)
  )

  const summary = {
    id: dataset.id,
    label: dataset.label,
    description: dataset.description ?? '',
    referenceLanguage: dataset.referenceLanguage,
    languages: dataset.languages,
    namespaces: [...new Set(rows.map((row) => row.namespace))].sort((left, right) =>
      left.localeCompare(right)
    ),
    stats: collectDatasetStats(dataset, rows),
  }

  return {
    rows,
    summary,
  }
}

async function loadLanguageFilesDataset(dataset, rowMap) {
  const fileEntries = await Promise.all(
    dataset.languages.map(async (language) => {
      const filePath = dataset.languageFiles[language]
      const json = JSON.parse(await fs.readFile(filePath, 'utf8'))
      return {
        language,
        filePath,
        relativeFilePath: dataset.relativeDirectory
          ? formatRelativeFilePath(
              path.join(dataset.relativeDirectory, path.basename(filePath))
            )
          : path.basename(filePath),
        json,
      }
    })
  )

  fileEntries.forEach(({ language, filePath, relativeFilePath, json }) => {
    walkStringLeaves(json, (pathSegments, value) => {
      const key = joinKeyPath(pathSegments)

      if (dataset.ignorePaths.has(key)) {
        return
      }

      const row = upsertRow(rowMap, dataset, key, {
        kind: 'language-files',
        pathSegments,
      })

      row.values[language] = {
        language,
        value,
        filePath,
        relativeFilePath,
        jsonPath: pathSegments,
      }
    })
  })
}

async function loadLanguageNodesDataset(dataset, rowMap) {
  const json = JSON.parse(await fs.readFile(dataset.filePath, 'utf8'))

  walkLanguageNodeTree({
    node: json,
    dataset,
    rowMap,
    logicalPath: [],
    jsonPath: [],
  })
}

function walkLanguageNodeTree({ node, dataset, rowMap, logicalPath, jsonPath }) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      walkLanguageNodeTree({
        node: item,
        dataset,
        rowMap,
        logicalPath: [...logicalPath, String(index)],
        jsonPath: [...jsonPath, String(index)],
      })
    })
    return
  }

  if (!isPlainObject(node)) {
    return
  }

  if (isLanguageMap(node, dataset.languages)) {
    dataset.languages.forEach((language) => {
      const subtree = node[language]

      if (subtree === undefined) {
        return
      }

      walkStringLeaves(subtree, (leafSegments, value) => {
        const key = joinKeyPath([...logicalPath, ...leafSegments])
        const row = upsertRow(rowMap, dataset, key, {
          kind: 'language-nodes',
          languageNodePath: jsonPath,
          leafPathSegments: leafSegments,
        })

        row.values[language] = {
          language,
          value,
          filePath: dataset.filePath,
          relativeFilePath: dataset.relativeFilePath,
          jsonPath: [...jsonPath, language, ...leafSegments],
        }
      })
    })
    return
  }

  Object.entries(node).forEach(([key, value]) => {
    walkLanguageNodeTree({
      node: value,
      dataset,
      rowMap,
      logicalPath: [...logicalPath, key],
      jsonPath: [...jsonPath, key],
    })
  })
}

function isLanguageMap(node, languages) {
  const keys = Object.keys(node)
  return keys.length > 0 && keys.every((key) => languages.includes(key))
}

function upsertRow(rowMap, dataset, key, saveTarget) {
  const existingRow = rowMap.get(key)

  if (existingRow) {
    return existingRow
  }

  const row = {
    id: `${dataset.id}:${key}`,
    datasetId: dataset.id,
    datasetLabel: dataset.label,
    key,
    saveTarget,
    values: {},
  }

  rowMap.set(key, row)
  return row
}

function finalizeRow(config, dataset, datasetOrder, row) {
  const namespace = getNamespaceFromKey(row.key)
  const referenceValue = row.values[dataset.referenceLanguage]?.value ?? ''
  const completedValues = {}

  dataset.languages.forEach((language) => {
    const existingCell = row.values[language]
    const cell =
      existingCell ??
      createMissingCell(config, dataset, row.saveTarget, language)
    const analysis = analyzeTranslationValue({
      value: cell.value,
      referenceValue,
      language,
      referenceLanguage: dataset.referenceLanguage,
    })

    completedValues[language] = {
      ...cell,
      ...analysis,
    }
  })

  return {
    id: row.id,
    datasetId: row.datasetId,
    datasetLabel: row.datasetLabel,
    datasetOrder,
    key: row.key,
    namespace,
    tag: getTagFromKey(row.key),
    referenceLanguage: dataset.referenceLanguage,
    referenceValue,
    values: completedValues,
    hasIssues: dataset.languages.some((language) => {
      const cell = completedValues[language]
      return (
        cell.missing ||
        cell.sameAsReference ||
        cell.placeholderMismatch ||
        cell.likelyUntranslated
      )
    }),
  }
}

function createMissingCell(config, dataset, saveTarget, language) {
  if (saveTarget.kind === 'language-files') {
    const filePath = dataset.languageFiles[language]

    return {
      language,
      value: '',
      filePath,
      relativeFilePath: formatRelativeFilePath(
        path.relative(config.projectRoot, filePath)
      ),
      jsonPath: saveTarget.pathSegments,
    }
  }

  return {
    language,
    value: '',
    filePath: dataset.filePath,
    relativeFilePath: dataset.relativeFilePath,
    jsonPath: [
      ...saveTarget.languageNodePath,
      language,
      ...saveTarget.leafPathSegments,
    ],
  }
}

function collectDatasetStats(dataset, rows) {
  const languageStats = Object.fromEntries(
    dataset.languages.map((language) => [
      language,
      {
        missing: 0,
        sameAsReference: 0,
        likelyUntranslated: 0,
        placeholderMismatch: 0,
      },
    ])
  )

  rows.forEach((row) => {
    dataset.languages.forEach((language) => {
      const cell = row.values[language]
      const stats = languageStats[language]

      if (cell.missing) {
        stats.missing += 1
      }

      if (cell.sameAsReference) {
        stats.sameAsReference += 1
      }

      if (cell.likelyUntranslated) {
        stats.likelyUntranslated += 1
      }

      if (cell.placeholderMismatch) {
        stats.placeholderMismatch += 1
      }
    })
  })

  return {
    rows: rows.length,
    issueRows: rows.filter((row) => row.hasIssues).length,
    languages: languageStats,
  }
}

function setNestedValue(target, pathSegments, value) {
  let current = target

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = toContainerKey(pathSegments[index])
    const nextSegment = pathSegments[index + 1]

    if (current[segment] === undefined) {
      current[segment] = isArrayIndex(nextSegment) ? [] : {}
    }

    current = current[segment]
  }

  current[toContainerKey(pathSegments.at(-1))] = value
}

function toContainerKey(segment) {
  return isArrayIndex(segment) ? Number(segment) : segment
}

function isArrayIndex(segment) {
  return /^\d+$/.test(segment)
}
