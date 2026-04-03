import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useState,
} from 'react'

import {
  analyzeTranslationValue,
  createCellId,
  parseCellId,
  summarizeRowIssues,
} from './shared/translationUtils.js'

const ISSUE_FILTER_FIELDS = [
  {
    id: 'missing',
    label: 'Missing',
    predicate: (cell) => cell.missing,
  },
  {
    id: 'sameAsReference',
    label: 'Same as reference',
    predicate: (cell) => cell.sameAsReference,
  },
  {
    id: 'likelyUntranslated',
    label: 'Likely untranslated',
    predicate: (cell) => cell.likelyUntranslated,
  },
  {
    id: 'placeholderMismatch',
    label: 'Placeholder mismatch',
    predicate: (cell) => cell.placeholderMismatch,
  },
]

const ROW_BATCH_SIZE = 200

export function App() {
  const [workbench, setWorkbench] = useState(null)
  const [selectedDatasetIds, setSelectedDatasetIds] = useState([])
  const [selectedLanguages, setSelectedLanguages] = useState([])
  const [namespaceFilter, setNamespaceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [issueFilters, setIssueFilters] = useState({
    missing: false,
    sameAsReference: false,
    likelyUntranslated: false,
    placeholderMismatch: false,
    dirtyOnly: false,
  })
  const [drafts, setDrafts] = useState({})
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [visibleRowCount, setVisibleRowCount] = useState(ROW_BATCH_SIZE)

  const deferredSearchQuery = useDeferredValue(searchQuery)

  useEffect(() => {
    void loadWorkbench()
  }, [])

  useEffect(() => {
    if (!workbench) {
      return
    }

    setSelectedDatasetIds((current) => {
      if (current.length === 0) {
        return workbench.datasets.map((dataset) => dataset.id)
      }

      const next = current.filter((datasetId) =>
        workbench.datasets.some((dataset) => dataset.id === datasetId)
      )

      return next.length === 0 ? workbench.datasets.map((dataset) => dataset.id) : next
    })

    setSelectedLanguages((current) => {
      if (current.length === 0) {
        return workbench.languageOrder
      }

      const next = current.filter((language) =>
        workbench.languageOrder.includes(language)
      )

      return next.length === 0 ? workbench.languageOrder : next
    })
  }, [workbench])

  useEffect(() => {
    setVisibleRowCount(ROW_BATCH_SIZE)
  }, [
    deferredSearchQuery,
    issueFilters.dirtyOnly,
    issueFilters.likelyUntranslated,
    issueFilters.missing,
    issueFilters.placeholderMismatch,
    issueFilters.sameAsReference,
    namespaceFilter,
    selectedDatasetIds,
    selectedLanguages,
  ])

  const saveWithKeyboardShortcut = useEffectEvent((event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void saveDrafts()
    }
  })

  useEffect(() => {
    window.addEventListener('keydown', saveWithKeyboardShortcut)
    return () => {
      window.removeEventListener('keydown', saveWithKeyboardShortcut)
    }
  }, [saveWithKeyboardShortcut])

  async function loadWorkbench(nextStatus = null) {
    setLoading(true)

    try {
      const response = await fetch('/api/translation-workbench')
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not load translation data')
      }

      setWorkbench(payload)

      if (nextStatus) {
        setStatus(nextStatus)
      }
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unknown loading error',
      })
    } finally {
      setLoading(false)
    }
  }

  async function saveDrafts(draftSubset = null) {
    const pendingDrafts = draftSubset ?? drafts

    if (Object.keys(pendingDrafts).length === 0 || !workbench) {
      return
    }

    const rowLookup = new Map(
      workbench.rows.map((row) => [`${row.datasetId}::${row.key}`, row])
    )
    const changes = Object.entries(pendingDrafts).map(([cellId, value]) => {
      const parsedCellId = parseCellId(cellId)
      const row = rowLookup.get(`${parsedCellId.datasetId}::${parsedCellId.key}`)
      const currentValue = row?.values[parsedCellId.language]?.value ?? ''

      return {
        ...parsedCellId,
        value,
        hasChanged: value !== currentValue,
      }
    })

    const filteredChanges = changes.filter((change) => change.hasChanged)

    if (filteredChanges.length === 0) {
      return
    }

    setSaving(true)
    setStatus({
      tone: 'info',
      message: `Saving ${filteredChanges.length} change${
        filteredChanges.length === 1 ? '' : 's'
      }...`,
    })

    try {
      const response = await fetch('/api/translation-workbench/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changes: filteredChanges,
        }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error ?? 'Could not save translation changes')
      }

      setWorkbench(payload.state)
      setDrafts((current) => {
        const next = { ...current }

        filteredChanges.forEach((change) => {
          delete next[createCellId(change.datasetId, change.key, change.language)]
        })

        return next
      })
      setStatus({
        tone: 'success',
        message: `Saved ${payload.savedCount} change${
          payload.savedCount === 1 ? '' : 's'
        }.`,
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unknown save error',
      })
    } finally {
      setSaving(false)
    }
  }

  function updateDraft(row, language, value) {
    const cellId = createCellId(row.datasetId, row.key, language)
    const originalValue = row.values[language]?.value ?? ''

    setDrafts((current) => {
      const next = { ...current }

      if (value === originalValue) {
        delete next[cellId]
      } else {
        next[cellId] = value
      }

      return next
    })
  }

  function toggleDataset(datasetId) {
    setSelectedDatasetIds((current) => {
      if (current.includes(datasetId)) {
        return current.length === 1
          ? current
          : current.filter((value) => value !== datasetId)
      }

      return [...current, datasetId]
    })
  }

  function toggleLanguage(language) {
    setSelectedLanguages((current) => {
      if (current.includes(language)) {
        return current.length === 1
          ? current
          : current.filter((value) => value !== language)
      }

      return [...current, language]
    })
  }

  function toggleIssueFilter(filterId) {
    setIssueFilters((current) => ({
      ...current,
      [filterId]: !current[filterId],
    }))
  }

  if (loading && !workbench) {
    return (
      <main className="page-shell">
        <section className="hero-panel hero-panel--loading">
          <p className="eyebrow">Translation Workbench</p>
          <h1>Loading locale data...</h1>
        </section>
      </main>
    )
  }

  if (!workbench) {
    return (
      <main className="page-shell">
        <section className="hero-panel hero-panel--loading">
          <p className="eyebrow">Translation Workbench</p>
          <h1>Workbench failed to load</h1>
          {status ? <p className="hero-copy">{status.message}</p> : null}
          <button className="action-button" onClick={() => void loadWorkbench()}>
            Retry
          </button>
        </section>
      </main>
    )
  }

  const selectedDatasetSet = new Set(selectedDatasetIds)
  const selectedLanguageSet = new Set(selectedLanguages)
  const activeRows = workbench.rows.filter((row) =>
    selectedDatasetSet.has(row.datasetId)
  )
  const namespaceOptions = [
    'all',
    ...new Set(activeRows.map((row) => row.namespace)),
  ].sort((left, right) => left.localeCompare(right))
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()

  const filteredRows = activeRows.filter((row) => {
    if (namespaceFilter !== 'all' && row.namespace !== namespaceFilter) {
      return false
    }

    if (normalizedSearchQuery) {
      const haystack = [
        row.datasetLabel,
        row.key,
        ...selectedLanguages.map((language) => row.values[language]?.value ?? ''),
      ]
        .join('\n')
        .toLowerCase()

      if (!haystack.includes(normalizedSearchQuery)) {
        return false
      }
    }

    if (
      issueFilters.dirtyOnly &&
      !selectedLanguages.some((language) =>
        Object.prototype.hasOwnProperty.call(
          drafts,
          createCellId(row.datasetId, row.key, language)
        )
      )
    ) {
      return false
    }

    return ISSUE_FILTER_FIELDS.every((filter) => {
      if (!issueFilters[filter.id]) {
        return true
      }

      return selectedLanguages.some((language) =>
        filter.predicate(row.values[language] ?? {})
      )
    })
  })

  const visibleRows = filteredRows.slice(0, visibleRowCount)
  const dirtyDraftCount = Object.keys(drafts).length
  const filteredIssueSummary = filteredRows.reduce(
    (summary, row) => {
      const rowIssues = summarizeRowIssues(row, selectedLanguages)
      summary.missing += rowIssues.missingCount
      summary.sameAsReference += rowIssues.sameAsReferenceCount
      summary.likelyUntranslated += rowIssues.likelyUntranslatedCount
      summary.placeholderMismatch += rowIssues.placeholderMismatchCount
      return summary
    },
    {
      missing: 0,
      sameAsReference: 0,
      likelyUntranslated: 0,
      placeholderMismatch: 0,
    }
  )

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div className="hero-copy-block">
          <p className="eyebrow">Translation Workbench</p>
          <h1>{workbench.title}</h1>
          <p className="hero-copy">{workbench.description}</p>
          <div className="hero-meta">
            <span className="hero-meta-chip">
              Config: <code>{workbench.configPath}</code>
            </span>
            <span className="hero-meta-chip">
              Reference language: <strong>{languageLabel(workbench, workbench.referenceLanguage)}</strong>
            </span>
            <span className="hero-meta-chip">
              Save with <strong>Cmd/Ctrl + S</strong>
            </span>
          </div>
        </div>
        <div className="hero-stats-grid">
          <StatCard label="Visible rows" value={filteredRows.length} />
          <StatCard
            label="Rows with issues"
            value={
              filteredRows.filter((row) =>
                selectedLanguages.some((language) => row.values[language]?.missing || row.values[language]?.sameAsReference || row.values[language]?.likelyUntranslated || row.values[language]?.placeholderMismatch)
              ).length
            }
          />
          <StatCard label="Dirty edits" value={dirtyDraftCount} />
          <StatCard label="Loaded datasets" value={selectedDatasetIds.length} />
        </div>
      </section>

      <section className="control-panel">
        <div className="control-grid">
          <div className="control-group">
            <label className="control-label" htmlFor="translation-search">
              Search
            </label>
            <input
              id="translation-search"
              className="search-input"
              type="search"
              placeholder="Search keys, values, placeholders, or namespaces..."
              value={searchQuery}
              onChange={(event) => {
                const nextValue = event.target.value
                startTransition(() => {
                  setSearchQuery(nextValue)
                })
              }}
            />
          </div>

          <div className="control-group">
            <label className="control-label" htmlFor="namespace-select">
              Namespace
            </label>
            <select
              id="namespace-select"
              className="select-input"
              value={namespaceFilter}
              onChange={(event) => setNamespaceFilter(event.target.value)}
            >
              {namespaceOptions.map((namespace) => (
                <option key={namespace} value={namespace}>
                  {namespace === 'all' ? 'All namespaces' : namespace}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group control-group--actions">
            <button
              className="action-button"
              onClick={() => void loadWorkbench()}
              type="button"
            >
              Reload
            </button>
            <button
              className="action-button action-button--strong"
              disabled={dirtyDraftCount === 0 || saving}
              onClick={() => void saveDrafts()}
              type="button"
            >
              {saving ? 'Saving…' : `Save ${dirtyDraftCount || ''}`.trim()}
            </button>
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-group">
            <span className="control-label">Datasets</span>
            <div className="pill-row">
              {workbench.datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  className={`filter-pill ${
                    selectedDatasetSet.has(dataset.id) ? 'filter-pill--active' : ''
                  }`}
                  onClick={() => toggleDataset(dataset.id)}
                  type="button"
                >
                  <span>{dataset.label}</span>
                  <strong>{dataset.stats.rows}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="control-label">Languages</span>
            <div className="pill-row">
              {workbench.languageOrder.map((language) => (
                <button
                  key={language}
                  className={`filter-pill filter-pill--language ${
                    selectedLanguageSet.has(language) ? 'filter-pill--active' : ''
                  }`}
                  onClick={() => toggleLanguage(language)}
                  style={{
                    '--accent': workbench.languages[language]?.accent ?? '#4254c5',
                  }}
                  type="button"
                >
                  <span>{languageLabel(workbench, language)}</span>
                  <strong>{language.toUpperCase()}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="control-label">Issue filters</span>
            <div className="pill-row">
              {ISSUE_FILTER_FIELDS.map((filter) => (
                <button
                  key={filter.id}
                  className={`filter-pill ${
                    issueFilters[filter.id] ? 'filter-pill--active' : ''
                  }`}
                  onClick={() => toggleIssueFilter(filter.id)}
                  type="button"
                >
                  <span>{filter.label}</span>
                  <strong>{filteredIssueSummary[filter.id] ?? 0}</strong>
                </button>
              ))}
              <button
                className={`filter-pill ${
                  issueFilters.dirtyOnly ? 'filter-pill--active' : ''
                }`}
                onClick={() => toggleIssueFilter('dirtyOnly')}
                type="button"
              >
                <span>Dirty only</span>
                <strong>{dirtyDraftCount}</strong>
              </button>
            </div>
          </div>
        </div>

        {status ? (
          <p className={`status-banner status-banner--${status.tone}`}>
            {status.message}
          </p>
        ) : null}
      </section>

      <section className="list-header">
        <div>
          <p className="eyebrow">Results</p>
          <h2>
            Showing {visibleRows.length} of {filteredRows.length} matching rows
          </h2>
        </div>
        <p className="list-header-copy">
          Each row keeps the key on the left and stacks the selected languages on
          the right so you can compare, scan, and edit without leaving the table.
        </p>
      </section>

      <section className="translation-list">
        {visibleRows.map((row) => {
          const rowDrafts = selectedLanguages.filter((language) =>
            Object.prototype.hasOwnProperty.call(
              drafts,
              createCellId(row.datasetId, row.key, language)
            )
          )
          const hiddenReference = !selectedLanguageSet.has(row.referenceLanguage)
          const rowIssues = summarizeRowIssues(row, selectedLanguages)

          return (
            <article className="translation-row" key={row.id}>
              <div className="translation-key-column">
                <div className="translation-key-topline">
                  <span className="dataset-badge">{row.datasetLabel}</span>
                  {rowDrafts.length > 0 ? (
                    <span className="dirty-badge">{rowDrafts.length} dirty</span>
                  ) : null}
                </div>
                <h3>{row.key}</h3>
                <p className="translation-key-meta">
                  Namespace <strong>{row.namespace}</strong> · Tag{' '}
                  <strong>{row.tag}</strong>
                </p>

                {hiddenReference ? (
                  <div className="reference-panel">
                    <span className="reference-label">
                      {languageLabel(workbench, row.referenceLanguage)}
                    </span>
                    <p>{row.referenceValue || 'No reference string'}</p>
                  </div>
                ) : null}

                <div className="issue-chip-row">
                  {rowIssues.missingCount > 0 ? (
                    <span className="issue-chip">Missing {rowIssues.missingCount}</span>
                  ) : null}
                  {rowIssues.sameAsReferenceCount > 0 ? (
                    <span className="issue-chip">
                      Same as ref {rowIssues.sameAsReferenceCount}
                    </span>
                  ) : null}
                  {rowIssues.likelyUntranslatedCount > 0 ? (
                    <span className="issue-chip">
                      Likely untranslated {rowIssues.likelyUntranslatedCount}
                    </span>
                  ) : null}
                  {rowIssues.placeholderMismatchCount > 0 ? (
                    <span className="issue-chip">
                      Placeholder mismatch {rowIssues.placeholderMismatchCount}
                    </span>
                  ) : null}
                </div>

                {rowDrafts.length > 0 ? (
                  <button
                    className="inline-save-button"
                    onClick={() =>
                      void saveDrafts(
                        Object.fromEntries(
                          rowDrafts.map((language) => {
                            const cellId = createCellId(
                              row.datasetId,
                              row.key,
                              language
                            )
                            return [cellId, drafts[cellId]]
                          })
                        )
                      )
                    }
                    type="button"
                  >
                    Save row
                  </button>
                ) : null}
              </div>

              <div className="translation-stack">
                {selectedLanguages.map((language) => {
                  const cell = row.values[language]
                  const cellId = createCellId(row.datasetId, row.key, language)
                  const draftValue =
                    drafts[cellId] === undefined ? cell.value : drafts[cellId]
                  const draftAnalysis =
                    draftValue === cell.value
                      ? cell
                      : analyzeTranslationValue({
                          value: draftValue,
                          referenceValue: row.referenceValue,
                          language,
                          referenceLanguage: row.referenceLanguage,
                        })

                  return (
                    <label
                      className={`translation-card ${
                        drafts[cellId] !== undefined ? 'translation-card--dirty' : ''
                      }`}
                      key={cellId}
                      style={{
                        '--accent': workbench.languages[language]?.accent ?? '#4254c5',
                      }}
                    >
                      <div className="translation-card-header">
                        <div>
                          <span className="translation-language">
                            {languageLabel(workbench, language)}
                          </span>
                          <span className="translation-file">
                            {cell.relativeFilePath}
                          </span>
                        </div>
                        <div className="issue-chip-row issue-chip-row--tight">
                          {draftAnalysis.missing ? (
                            <span className="issue-chip issue-chip--missing">
                              Missing
                            </span>
                          ) : null}
                          {draftAnalysis.sameAsReference ? (
                            <span className="issue-chip issue-chip--warning">
                              Same as reference
                            </span>
                          ) : null}
                          {draftAnalysis.likelyUntranslated ? (
                            <span className="issue-chip issue-chip--warning">
                              Likely untranslated
                            </span>
                          ) : null}
                          {draftAnalysis.placeholderMismatch ? (
                            <span className="issue-chip issue-chip--danger">
                              Placeholder mismatch
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <textarea
                        className="translation-input"
                        rows={textareaRows(draftValue)}
                        spellCheck={false}
                        value={draftValue}
                        onChange={(event) =>
                          updateDraft(row, language, event.target.value)
                        }
                      />

                      <div className="translation-card-footer">
                        <div className="translation-placeholder-line">
                          <span>
                            Placeholders:{' '}
                            {draftAnalysis.actualPlaceholders.length > 0
                              ? draftAnalysis.actualPlaceholders.join(', ')
                              : 'none'}
                          </span>
                          {draftAnalysis.placeholderMismatch ? (
                            <span>
                              Expected {draftAnalysis.expectedPlaceholders.join(', ') || 'none'}
                            </span>
                          ) : null}
                        </div>

                        {draftAnalysis.sharedReferenceWords.length > 0 ? (
                          <div className="shared-word-row">
                            {draftAnalysis.sharedReferenceWords.map((word) => (
                              <span className="shared-word-chip" key={word}>
                                {word}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  )
                })}
              </div>
            </article>
          )
        })}
      </section>

      {filteredRows.length > visibleRows.length ? (
        <div className="load-more-shell">
          <button
            className="action-button"
            onClick={() =>
              setVisibleRowCount((current) => current + ROW_BATCH_SIZE)
            }
            type="button"
          >
            Load {Math.min(ROW_BATCH_SIZE, filteredRows.length - visibleRows.length)} more rows
          </button>
        </div>
      ) : null}
    </main>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function languageLabel(workbench, language) {
  return workbench.languages[language]?.label ?? language.toUpperCase()
}

function textareaRows(value) {
  const lineCount = value.split('\n').length
  const wrappedLineCount = Math.ceil(value.length / 84)
  return Math.max(3, Math.min(9, Math.max(lineCount, wrappedLineCount)))
}
