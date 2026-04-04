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
    label: 'Same as ref',
    predicate: (cell) => cell.sameAsReference,
  },
  {
    id: 'likelyUntranslated',
    label: 'Untranslated',
    predicate: (cell) => cell.likelyUntranslated,
  },
  {
    id: 'placeholderMismatch',
    label: 'Placeholder',
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
    if (!workbench) return

    setSelectedDatasetIds((current) => {
      if (current.length === 0) return workbench.datasets.map((d) => d.id)
      const next = current.filter((id) => workbench.datasets.some((d) => d.id === id))
      return next.length === 0 ? workbench.datasets.map((d) => d.id) : next
    })

    setSelectedLanguages((current) => {
      if (current.length === 0) return workbench.languageOrder
      const next = current.filter((l) => workbench.languageOrder.includes(l))
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
    return () => window.removeEventListener('keydown', saveWithKeyboardShortcut)
  }, [saveWithKeyboardShortcut])

  async function loadWorkbench(nextStatus = null) {
    setLoading(true)
    try {
      const response = await fetch('/api/translation-workbench')
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not load translation data')
      setWorkbench(payload)
      if (nextStatus) setStatus(nextStatus)
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Unknown loading error' })
    } finally {
      setLoading(false)
    }
  }

  async function saveDrafts(draftSubset = null) {
    const pendingDrafts = draftSubset ?? drafts
    if (Object.keys(pendingDrafts).length === 0 || !workbench) return

    const rowLookup = new Map(workbench.rows.map((row) => [`${row.datasetId}::${row.key}`, row]))
    const changes = Object.entries(pendingDrafts).map(([cellId, value]) => {
      const parsed = parseCellId(cellId)
      const row = rowLookup.get(`${parsed.datasetId}::${parsed.key}`)
      return { ...parsed, value, hasChanged: value !== (row?.values[parsed.language]?.value ?? '') }
    })
    const filteredChanges = changes.filter((c) => c.hasChanged)
    if (filteredChanges.length === 0) return

    setSaving(true)
    setStatus({ tone: 'info', message: `Saving ${filteredChanges.length} change${filteredChanges.length === 1 ? '' : 's'}...` })

    try {
      const response = await fetch('/api/translation-workbench/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: filteredChanges }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? 'Could not save translation changes')

      setWorkbench(payload.state)
      setDrafts((current) => {
        const next = { ...current }
        filteredChanges.forEach((c) => delete next[createCellId(c.datasetId, c.key, c.language)])
        return next
      })
      setStatus({ tone: 'success', message: `Saved ${payload.savedCount} change${payload.savedCount === 1 ? '' : 's'}.` })
    } catch (error) {
      setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Unknown save error' })
    } finally {
      setSaving(false)
    }
  }

  function updateDraft(row, language, value) {
    const cellId = createCellId(row.datasetId, row.key, language)
    const originalValue = row.values[language]?.value ?? ''
    setDrafts((current) => {
      const next = { ...current }
      if (value === originalValue) delete next[cellId]
      else next[cellId] = value
      return next
    })
  }

  function toggleDataset(datasetId) {
    setSelectedDatasetIds((current) => {
      if (current.includes(datasetId)) {
        return current.length === 1 ? current : current.filter((v) => v !== datasetId)
      }
      return [...current, datasetId]
    })
  }

  function toggleLanguage(language) {
    setSelectedLanguages((current) => {
      if (current.includes(language)) {
        return current.length === 1 ? current : current.filter((v) => v !== language)
      }
      return [...current, language]
    })
  }

  function toggleIssueFilter(filterId) {
    setIssueFilters((current) => ({ ...current, [filterId]: !current[filterId] }))
  }

  if (loading && !workbench) {
    return (
      <main className="page-shell">
        <section className="hero-panel hero-panel--loading">
          <span className="hero-title">Translation Workbench</span>
          <span style={{ color: 'var(--text-secondary)' }}>Loading...</span>
        </section>
      </main>
    )
  }

  if (!workbench) {
    return (
      <main className="page-shell">
        <section className="hero-panel hero-panel--loading">
          <span className="hero-title">Translation Workbench</span>
          <span style={{ color: 'var(--red)' }}>{status?.message ?? 'Failed to load'}</span>
          <button className="action-button action-button--strong" onClick={() => void loadWorkbench()}>Retry</button>
        </section>
      </main>
    )
  }

  const selectedDatasetSet = new Set(selectedDatasetIds)
  const selectedLanguageSet = new Set(selectedLanguages)
  const refLang = workbench.referenceLanguage
  const targetLanguages = selectedLanguages.filter((l) => l !== refLang)
  const activeRows = workbench.rows.filter((row) => selectedDatasetSet.has(row.datasetId))
  const namespaceOptions = ['all', ...new Set(activeRows.map((row) => row.namespace))].sort((a, b) => a.localeCompare(b))
  const normalizedSearchQuery = deferredSearchQuery.trim().toLowerCase()

  const filteredRows = activeRows.filter((row) => {
    if (namespaceFilter !== 'all' && row.namespace !== namespaceFilter) return false

    if (normalizedSearchQuery) {
      const haystack = [row.datasetLabel, row.key, ...selectedLanguages.map((l) => row.values[l]?.value ?? '')]
        .join('\n').toLowerCase()
      if (!haystack.includes(normalizedSearchQuery)) return false
    }

    if (issueFilters.dirtyOnly && !selectedLanguages.some((l) =>
      Object.prototype.hasOwnProperty.call(drafts, createCellId(row.datasetId, row.key, l))
    )) return false

    return ISSUE_FILTER_FIELDS.every((filter) => {
      if (!issueFilters[filter.id]) return true
      return selectedLanguages.some((l) => filter.predicate(row.values[l] ?? {}))
    })
  })

  const visibleRows = filteredRows.slice(0, visibleRowCount)
  const dirtyDraftCount = Object.keys(drafts).length
  const filteredIssueSummary = filteredRows.reduce(
    (s, row) => {
      const ri = summarizeRowIssues(row, selectedLanguages)
      s.missing += ri.missingCount
      s.sameAsReference += ri.sameAsReferenceCount
      s.likelyUntranslated += ri.likelyUntranslatedCount
      s.placeholderMismatch += ri.placeholderMismatchCount
      return s
    },
    { missing: 0, sameAsReference: 0, likelyUntranslated: 0, placeholderMismatch: 0 }
  )

  const rowsWithIssues = filteredRows.filter((row) =>
    selectedLanguages.some((l) =>
      row.values[l]?.missing || row.values[l]?.sameAsReference ||
      row.values[l]?.likelyUntranslated || row.values[l]?.placeholderMismatch
    )
  ).length

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <span className="hero-title">{workbench.title}</span>
        <div className="hero-meta">
          <span className="hero-meta-chip">
            Ref: <strong>{languageLabel(workbench, refLang)}</strong>
          </span>
          <span className="hero-meta-chip">
            <kbd style={{ fontSize: '0.9em', opacity: 0.6 }}>Cmd+S</kbd>
          </span>
        </div>
        <div className="hero-stats">
          <div className="stat-item">
            <span>Rows</span>
            <strong>{filteredRows.length}</strong>
          </div>
          <div className="stat-item">
            <span>Issues</span>
            <strong>{rowsWithIssues}</strong>
          </div>
          <div className="stat-item">
            <span>Unsaved</span>
            <strong>{dirtyDraftCount}</strong>
          </div>
        </div>
      </section>

      <section className="control-panel">
        <div className="control-grid">
          <div className="control-group control-group--search">
            <label className="control-label" htmlFor="translation-search">Search</label>
            <input
              id="translation-search"
              className="search-input"
              type="search"
              placeholder="Keys, values, namespaces..."
              value={searchQuery}
              onChange={(e) => { const v = e.target.value; startTransition(() => setSearchQuery(v)) }}
            />
          </div>
          <div className="control-group control-group--namespace">
            <label className="control-label" htmlFor="namespace-select">Namespace</label>
            <select
              id="namespace-select"
              className="select-input"
              value={namespaceFilter}
              onChange={(e) => setNamespaceFilter(e.target.value)}
            >
              {namespaceOptions.map((ns) => (
                <option key={ns} value={ns}>{ns === 'all' ? 'All' : ns}</option>
              ))}
            </select>
          </div>
          <div className="control-group--actions">
            <button className="action-button" onClick={() => void loadWorkbench()} type="button">Reload</button>
            <button
              className="action-button action-button--strong"
              disabled={dirtyDraftCount === 0 || saving}
              onClick={() => void saveDrafts()}
              type="button"
            >
              {saving ? 'Saving...' : `Save ${dirtyDraftCount || ''}`.trim()}
            </button>
          </div>
        </div>

        <div className="filter-section">
          <div className="filter-group">
            <span className="filter-group-label">Sets</span>
            <div className="pill-row">
              {workbench.datasets.map((ds) => (
                <button
                  key={ds.id}
                  className={`filter-pill ${selectedDatasetSet.has(ds.id) ? 'filter-pill--active' : ''}`}
                  onClick={() => toggleDataset(ds.id)}
                  type="button"
                >
                  <span>{ds.label}</span>
                  <strong>{ds.stats.rows}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group-divider" />

          <div className="filter-group">
            <span className="filter-group-label">Lang</span>
            <div className="pill-row">
              {workbench.languageOrder.map((language) => (
                <button
                  key={language}
                  className={`filter-pill filter-pill--language ${selectedLanguageSet.has(language) ? 'filter-pill--active' : ''}`}
                  onClick={() => toggleLanguage(language)}
                  style={{ '--accent': workbench.languages[language]?.accent ?? '#4DC3EA' }}
                  type="button"
                >
                  <span>{language.toUpperCase()}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group-divider" />

          <div className="filter-group">
            <span className="filter-group-label">Issues</span>
            <div className="pill-row">
              {ISSUE_FILTER_FIELDS.map((filter) => (
                <button
                  key={filter.id}
                  className={`filter-pill ${issueFilters[filter.id] ? 'filter-pill--active' : ''}`}
                  onClick={() => toggleIssueFilter(filter.id)}
                  type="button"
                >
                  <span>{filter.label}</span>
                  <strong>{filteredIssueSummary[filter.id] ?? 0}</strong>
                </button>
              ))}
              <button
                className={`filter-pill ${issueFilters.dirtyOnly ? 'filter-pill--active' : ''}`}
                onClick={() => toggleIssueFilter('dirtyOnly')}
                type="button"
              >
                <span>Dirty</span>
                <strong>{dirtyDraftCount}</strong>
              </button>
            </div>
          </div>
        </div>

        {status ? (
          <p className={`status-banner status-banner--${status.tone}`}>{status.message}</p>
        ) : null}
      </section>

      <div className="list-header">
        <h2>{visibleRows.length} of {filteredRows.length} rows</h2>
      </div>

      <section className="translation-list">
        {visibleRows.map((row) => {
          const rowDrafts = selectedLanguages.filter((l) =>
            Object.prototype.hasOwnProperty.call(drafts, createCellId(row.datasetId, row.key, l))
          )
          const rowIssues = summarizeRowIssues(row, targetLanguages)
          const refCell = row.values[refLang]

          return (
            <article className="translation-row" key={row.id}>
              <div className="ref-lane">
                <div className="ref-lane-topline">
                  <span className="dataset-badge">{row.datasetLabel}</span>
                  <span className="ref-lane-meta">
                    <strong>{row.namespace}</strong> / {row.tag}
                  </span>
                  {rowDrafts.length > 0 ? (
                    <span className="dirty-badge">{rowDrafts.length} unsaved</span>
                  ) : null}
                </div>
                <h3>{row.key}</h3>
                <div className={`ref-text ${!row.referenceValue ? 'ref-text--empty' : ''}`}>
                  {row.referenceValue || 'No reference string'}
                </div>
                {(rowIssues.missingCount > 0 || rowIssues.sameAsReferenceCount > 0 || rowIssues.likelyUntranslatedCount > 0 || rowIssues.placeholderMismatchCount > 0) ? (
                  <div className="issue-chip-row">
                    {rowIssues.missingCount > 0 ? <span className="issue-chip issue-chip--missing">Missing {rowIssues.missingCount}</span> : null}
                    {rowIssues.sameAsReferenceCount > 0 ? <span className="issue-chip issue-chip--warning">Same {rowIssues.sameAsReferenceCount}</span> : null}
                    {rowIssues.likelyUntranslatedCount > 0 ? <span className="issue-chip issue-chip--warning">Untranslated {rowIssues.likelyUntranslatedCount}</span> : null}
                    {rowIssues.placeholderMismatchCount > 0 ? <span className="issue-chip issue-chip--danger">Placeholder {rowIssues.placeholderMismatchCount}</span> : null}
                  </div>
                ) : null}
                {rowDrafts.length > 0 ? (
                  <button
                    className="inline-save-button"
                    onClick={() =>
                      void saveDrafts(
                        Object.fromEntries(
                          rowDrafts.map((l) => {
                            const cellId = createCellId(row.datasetId, row.key, l)
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

              <div className="target-lane">
                {targetLanguages.map((language) => {
                  const cell = row.values[language]
                  if (!cell) return null
                  const cellId = createCellId(row.datasetId, row.key, language)
                  const draftValue = drafts[cellId] === undefined ? cell.value : drafts[cellId]
                  const draftAnalysis = draftValue === cell.value
                    ? cell
                    : analyzeTranslationValue({
                        value: draftValue,
                        referenceValue: row.referenceValue,
                        language,
                        referenceLanguage: row.referenceLanguage,
                      })

                  const hasIssue = draftAnalysis.missing || draftAnalysis.sameAsReference ||
                    draftAnalysis.likelyUntranslated || draftAnalysis.placeholderMismatch

                  return (
                    <label
                      className={`target-card ${drafts[cellId] !== undefined ? 'target-card--dirty' : ''}`}
                      key={cellId}
                      style={{ '--accent': workbench.languages[language]?.accent ?? '#4DC3EA' }}
                    >
                      <div className="target-card-header">
                        <span className="translation-language">
                          {languageLabel(workbench, language)}
                        </span>
                        <span className="translation-file">{cell.relativeFilePath}</span>
                        {hasIssue ? (
                          <div className="issue-chip-row issue-chip-row--tight">
                            {draftAnalysis.missing ? <span className="issue-chip issue-chip--missing">Missing</span> : null}
                            {draftAnalysis.sameAsReference ? <span className="issue-chip issue-chip--warning">Same</span> : null}
                            {draftAnalysis.likelyUntranslated ? <span className="issue-chip issue-chip--warning">Untranslated</span> : null}
                            {draftAnalysis.placeholderMismatch ? <span className="issue-chip issue-chip--danger">Placeholder</span> : null}
                          </div>
                        ) : null}
                      </div>

                      <textarea
                        className="translation-input"
                        rows={textareaRows(draftValue)}
                        spellCheck={false}
                        value={draftValue}
                        onChange={(e) => updateDraft(row, language, e.target.value)}
                      />

                      {(draftAnalysis.placeholderMismatch || draftAnalysis.sharedReferenceWords.length > 0) ? (
                        <div className="target-card-footer">
                          {draftAnalysis.placeholderMismatch ? (
                            <span>
                              Placeholders: {draftAnalysis.actualPlaceholders.join(', ') || 'none'} (expected {draftAnalysis.expectedPlaceholders.join(', ') || 'none'})
                            </span>
                          ) : null}
                          {draftAnalysis.sharedReferenceWords.length > 0 ? (
                            <div className="shared-word-row">
                              {draftAnalysis.sharedReferenceWords.map((word) => (
                                <span className="shared-word-chip" key={word}>{word}</span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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
            className="action-button action-button--strong"
            onClick={() => setVisibleRowCount((c) => c + ROW_BATCH_SIZE)}
            type="button"
          >
            Load {Math.min(ROW_BATCH_SIZE, filteredRows.length - visibleRows.length)} more
          </button>
        </div>
      ) : null}
    </main>
  )
}

function languageLabel(workbench, language) {
  return workbench.languages[language]?.label ?? language.toUpperCase()
}

function textareaRows(value) {
  const lineCount = value.split('\n').length
  const wrappedLineCount = Math.ceil(value.length / 80)
  return Math.max(2, Math.min(6, Math.max(lineCount, wrappedLineCount)))
}
