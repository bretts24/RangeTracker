// SHTF Tracker Module
window.SHTFModule = (() => {
  let _userId = null
  let _initialized = false
  let _activeSubTab = 'overview'
  let _searchQuery = ''
  const loadedTabs = {}
  const _dataCache = {}   // { type: items[] } populated as tabs load
  const _sortState = {}   // { type: { col, dir } }

  const CATEGORY_META = {
    food:     { label: 'Food',        icon: '🥫', table: 'shtf_food' },
    water:    { label: 'Water',       icon: '💧', table: 'shtf_water' },
    medical:  { label: 'Medical',     icon: '🩺', table: 'shtf_medical' },
    gear:     { label: 'Gear',        icon: '🎒', table: 'shtf_gear' },
    ammo:     { label: 'Ammo',        icon: '🔫', table: 'shtf_ammo' },
    seeds:    { label: 'Seed Bank',   icon: '🌱', table: 'shtf_seeds' },
    prepplans:{ label: 'Prep Plans',  icon: '📋', table: 'shtf_prep_plans' },
    bugout:   { label: 'Bug-Out',     icon: '🗺',  table: 'shtf_bugout_plans' },
  }

  async function init(userId) {
    if (_initialized) return
    _userId = userId
    _initialized = true

    bindSubTabs()
    bindAddButtons()
    bindGlobalSearch()

    // Check expiry alerts
    checkExpiryAlerts()

    // Restore sub-tab from URL
    const urlSubTab = Utils.getParam('shtf')
    activateSubTab(urlSubTab || 'overview')
  }

  // ── Sub-tab Navigation ────────────────────────────────────────

  function bindSubTabs() {
    document.querySelectorAll('.shtf-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateSubTab(btn.dataset.shtf))
    })
  }

  function activateSubTab(name) {
    _activeSubTab = name

    document.querySelectorAll('.shtf-tab-btn').forEach(b => {
      const isActive = b.dataset.shtf === name
      b.classList.toggle('active', isActive)
      b.setAttribute('aria-selected', String(isActive))
    })
    document.querySelectorAll('.shtf-subsection').forEach(s => {
      s.classList.toggle('active', s.id === `shtf-${name}`)
    })

    // Persist in URL
    Utils.setParam('shtf', name)

    if (!loadedTabs[name]) {
      loadedTabs[name] = true
      loadSubSection(name)
    }
  }

  function bindAddButtons() {
    document.querySelectorAll('.shtf-add-btn').forEach(btn => {
      btn.addEventListener('click', () => openAddModal(btn.dataset.type))
    })
  }

  // ── Global Search ────────────────────────────────────────────

  function bindGlobalSearch() {
    const toolbar = document.querySelector('#tab-shtf .toolbar')
    if (!toolbar) return

    const searchWrap = document.createElement('div')
    searchWrap.className = 'search-bar'
    searchWrap.style.cssText = 'flex:1;min-width:180px;max-width:320px;'
    searchWrap.innerHTML = `
      <span class="search-bar-icon">⌕</span>
      <input type="text" id="shtf-search-input" class="search-bar-input"
        placeholder="Search all categories…" aria-label="Search supplies" />
    `
    toolbar.appendChild(searchWrap)

    const input = document.getElementById('shtf-search-input')
    let debounceTimer
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        _searchQuery = input.value.trim()
        if (_searchQuery) renderGlobalSearchResults()
        else reRenderActiveTab()
      }, 250)
    })
  }

  function renderGlobalSearchResults() {
    const q = _searchQuery.toLowerCase()
    const resultsHTML = []

    Object.keys(_dataCache).forEach(type => {
      const items = _dataCache[type] || []
      const meta = CATEGORY_META[type]
      let matched = []

      if (type === 'food' || type === 'water' || type === 'medical' || type === 'gear') {
        matched = items.filter(i =>
          (i.item && i.item.toLowerCase().includes(q)) ||
          (i.notes && i.notes.toLowerCase().includes(q)) ||
          (i.quantity && String(i.quantity).toLowerCase().includes(q))
        )
      } else if (type === 'ammo') {
        matched = items.filter(i =>
          (i.caliber && i.caliber.toLowerCase().includes(q)) ||
          (i.brand   && i.brand.toLowerCase().includes(q)) ||
          (i.notes   && i.notes.toLowerCase().includes(q))
        )
      } else if (type === 'seeds') {
        matched = items.filter(i =>
          (i.seed_name && i.seed_name.toLowerCase().includes(q)) ||
          (i.seed_type && i.seed_type.toLowerCase().includes(q)) ||
          (i.variety   && i.variety.toLowerCase().includes(q)) ||
          (i.notes     && i.notes.toLowerCase().includes(q))
        )
      } else if (type === 'prepplans') {
        matched = items.filter(i =>
          (i.title       && i.title.toLowerCase().includes(q)) ||
          (i.description && i.description.toLowerCase().includes(q))
        )
      } else if (type === 'bugout') {
        matched = items.filter(i =>
          (i.title       && i.title.toLowerCase().includes(q)) ||
          (i.description && i.description.toLowerCase().includes(q)) ||
          (i.route       && i.route.toLowerCase().includes(q)) ||
          (i.destination && i.destination.toLowerCase().includes(q))
        )
      }

      if (matched.length > 0) {
        resultsHTML.push(`
          <div style="margin-bottom:var(--space-lg);">
            <div class="section-heading" style="font-size:0.7rem;">${meta.icon} ${meta.label} (${matched.length})</div>
            ${matched.map(i => {
              const name = i.item || i.caliber || i.seed_name || i.title || '—'
              const sub  = i.quantity || i.brand || i.seed_type || i.status || ''
              return `<div style="padding:var(--space-sm) 0;border-bottom:1px solid var(--color-border);font-size:0.85rem;">
                <span style="color:var(--color-text-primary);">${Utils.esc(name)}</span>
                ${sub ? `<span style="color:var(--color-text-muted);margin-left:var(--space-sm);font-size:0.75rem;">${Utils.esc(sub)}</span>` : ''}
              </div>`
            }).join('')}
          </div>
        `)
      }
    })

    // Show results in the currently active sub-section
    const activeSection = document.querySelector('.shtf-subsection.active')
    if (!activeSection) return

    const contentId = activeSection.id + '-content'
    const contentEl = document.getElementById(contentId) || activeSection.querySelector('[id$="-content"]')
    const target = contentEl || activeSection

    if (resultsHTML.length === 0) {
      target.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⌕</div>
          <div class="empty-state-title">No Results Found</div>
          <div class="empty-state-desc">No items match "${Utils.esc(_searchQuery)}" in any loaded category.</div>
        </div>`
    } else {
      target.innerHTML = `<div style="padding:var(--space-md) 0;">${resultsHTML.join('')}</div>`
    }
  }

  function reRenderActiveTab() {
    loadedTabs[_activeSubTab] = false
    loadSubSection(_activeSubTab)
  }

  // ── Expiry Alert Banner ───────────────────────────────────────

  async function checkExpiryAlerts() {
    const alertsEl = document.getElementById('shtf-alerts')
    if (!alertsEl) return

    const now    = new Date()
    const in15   = new Date(now); in15.setDate(in15.getDate() + 15)
    const todayStr = now.toISOString().split('T')[0]
    const in15Str  = in15.toISOString().split('T')[0]

    const [foodRes, waterRes, seedsRes] = await Promise.all([
      window.sb.from('shtf_food').select('item, expiry_date').eq('user_id', _userId).not('expiry_date', 'is', null),
      window.sb.from('shtf_water').select('item, rotate_date').eq('user_id', _userId).not('rotate_date', 'is', null),
      window.sb.from('shtf_seeds').select('seed_name, rotate_by_date').eq('user_id', _userId).not('rotate_by_date', 'is', null),
    ])

    const expired  = []
    const expiring = []

    ;(foodRes.data || []).forEach(i => {
      const e = { name: i.item, tab: 'food', date: i.expiry_date }
      if (i.expiry_date < todayStr) expired.push(e)
      else if (i.expiry_date <= in15Str) expiring.push(e)
    })
    ;(waterRes.data || []).forEach(i => {
      const e = { name: i.item, tab: 'water', date: i.rotate_date }
      if (i.rotate_date < todayStr) expired.push(e)
      else if (i.rotate_date <= in15Str) expiring.push(e)
    })
    ;(seedsRes.data || []).forEach(i => {
      const e = { name: i.seed_name, tab: 'seeds', date: i.rotate_by_date }
      if (i.rotate_by_date < todayStr) expired.push(e)
      else if (i.rotate_by_date <= in15Str) expiring.push(e)
    })

    if (expired.length === 0 && expiring.length === 0) {
      alertsEl.innerHTML = ''
      return
    }

    const TAB_TAG = { food: 'Food', water: 'Water', seeds: 'Seeds' }
    const fmtDate = d => {
      const [, mo, da] = d.split('-')
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo) - 1] + ' ' + parseInt(da)
    }
    const chipsHTML = (items, cls) => items.map(i =>
      `<span class="expiry-chip ${cls}" data-tab="${i.tab}" title="Go to ${TAB_TAG[i.tab]}">${Utils.esc(i.name)} · ${TAB_TAG[i.tab]} · ${fmtDate(i.date)}</span>`
    ).join('')

    let html = ''
    if (expired.length > 0) {
      html += `
        <div class="alert-banner alert-red" role="alert">
          <div class="alert-banner-row">
            <span>✕ EXPIRED — ${expired.length} item${expired.length > 1 ? 's' : ''} past date</span>
            <button class="alert-banner-dismiss" aria-label="Dismiss">×</button>
          </div>
          <div class="expiry-chip-list">${chipsHTML(expired, 'expiry-chip-red')}</div>
        </div>`
    }
    if (expiring.length > 0) {
      html += `
        <div class="alert-banner" role="alert">
          <div class="alert-banner-row">
            <span>⚠ EXPIRING SOON — ${expiring.length} item${expiring.length > 1 ? 's' : ''} within 15 days</span>
            <button class="alert-banner-dismiss" aria-label="Dismiss">×</button>
          </div>
          <div class="expiry-chip-list">${chipsHTML(expiring, 'expiry-chip-amber')}</div>
        </div>`
    }

    alertsEl.innerHTML = html

    alertsEl.querySelectorAll('.alert-banner-dismiss').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.alert-banner').remove())
    })
    alertsEl.querySelectorAll('.expiry-chip[data-tab]').forEach(chip => {
      chip.addEventListener('click', () => activateSubTab(chip.dataset.tab))
    })
  }

  // ── Overview Dashboard ────────────────────────────────────────

  async function loadOverview() {
    const container = document.getElementById('shtf-overview')
    container.innerHTML = Utils.skeletonCards(4)

    const now = new Date()
    const in30 = new Date(now); in30.setDate(in30.getDate() + 30)
    const in30Str  = in30.toISOString().split('T')[0]
    const todayStr = now.toISOString().split('T')[0]

    const tableTypes = ['food', 'water', 'medical', 'gear', 'ammo', 'seeds', 'prepplans', 'bugout']
    const results = await Promise.all(
      tableTypes.map(type =>
        window.sb.from(CATEGORY_META[type].table).select('*').eq('user_id', _userId)
          .then(({ data }) => ({ type, items: data || [] }))
      )
    )

    const counts    = {}
    const alertsMap = {}

    results.forEach(({ type, items }) => {
      counts[type] = items.length
      _dataCache[type] = items

      if (type === 'food') {
        alertsMap.food = items.filter(i => i.expiry_date && i.expiry_date <= in30Str).length
      }
      if (type === 'seeds') {
        alertsMap.seeds = items.filter(i => i.rotate_by_date && i.rotate_by_date <= in30Str).length
      }
      if (type === 'prepplans') {
        counts.prepplansComplete = items.filter(i => i.status === 'complete').length
        counts.prepplansTotal    = items.length
      }
    })

    // Total items across supply categories
    const supplyTypes = ['food', 'water', 'medical', 'gear', 'ammo', 'seeds']
    const totalItems  = supplyTypes.reduce((sum, t) => sum + (counts[t] || 0), 0)

    const planPct = counts.prepplansTotal > 0
      ? Math.round((counts.prepplansComplete / counts.prepplansTotal) * 100)
      : 0

    const tileHTML = (type) => {
      const meta = CATEGORY_META[type]
      if (!meta) return ''
      const count    = counts[type] || 0
      const hasAlert = (alertsMap[type] || 0) > 0
      const tileClass = count === 0 ? 'empty' : hasAlert ? 'has-alerts' : 'has-items'
      return `
        <div class="readiness-tile ${tileClass}" role="button" tabindex="0"
          aria-label="View ${meta.label}" data-nav="${type}"
          style="cursor:pointer;">
          <div style="font-size:1.5rem;margin-bottom:var(--space-xs);">${meta.icon}</div>
          <div style="font-family:var(--font-mono);font-size:0.75rem;letter-spacing:0.06em;text-transform:uppercase;font-weight:700;margin-bottom:2px;">
            ${meta.label}
          </div>
          <div style="font-size:0.8rem;color:var(--color-text-muted);">
            ${count === 0 ? 'No items' : `${count} item${count !== 1 ? 's' : ''}`}
          </div>
          ${hasAlert ? `<div style="font-size:0.7rem;color:var(--color-amber);margin-top:4px;">⚠ ${alertsMap[type]} expiring</div>` : ''}
        </div>
      `
    }

    container.innerHTML = `
      <div class="stats-panel" style="margin-bottom:var(--space-lg);">
        <div class="stat-card">
          <div class="stat-value">${totalItems}</div>
          <div class="stat-label">Total Supplies</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${counts.prepplansComplete || 0}/${counts.prepplansTotal || 0}</div>
          <div class="stat-label">Plans Complete</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${counts.bugout || 0}</div>
          <div class="stat-label">Bug-Out Plans</div>
        </div>
        <div class="stat-card">
          <div class="stat-value${(alertsMap.food || 0) + (alertsMap.seeds || 0) > 0 ? ' expiry-warn' : ''}">${(alertsMap.food || 0) + (alertsMap.seeds || 0)}</div>
          <div class="stat-label">Expiring Soon</div>
        </div>
      </div>

      ${counts.prepplansTotal > 0 ? `
      <div style="margin-bottom:var(--space-lg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm);">
          <span style="font-family:var(--font-mono);font-size:0.75rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-muted);">
            Prep Plan Progress
          </span>
          <span style="font-size:0.8rem;color:var(--color-text-primary);">${planPct}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${planPct}%;"></div>
          </div>
        </div>
        <div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:var(--space-xs);">
          ${counts.prepplansComplete} of ${counts.prepplansTotal} plans complete
        </div>
      </div>` : ''}

      <div class="readiness-grid">
        ${supplyTypes.map(tileHTML).join('')}
        ${tileHTML('prepplans')}
        ${tileHTML('bugout')}
      </div>
    `

    // Navigate to sub-tab on tile click
    container.querySelectorAll('.readiness-tile[data-nav]').forEach(tile => {
      function nav() { activateSubTab(tile.dataset.nav) }
      tile.addEventListener('click', nav)
      tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav() } })
    })
  }

  // ── Generic Table Loader ──────────────────────────────────────

  async function loadSubSection(type) {
    if (type === 'overview')  return loadOverview()
    if (type === 'prepplans') return loadPrepPlans()
    if (type === 'bugout')    return loadBugoutPlans()
    if (type === 'ammo')      return loadAmmoSection()

    const meta      = CATEGORY_META[type]
    const container = document.getElementById(`shtf-${type}-content`)
    if (!meta || !container) return

    container.innerHTML = Utils.skeletonRows(3)

    try {
      const { data, error } = await window.sb
        .from(meta.table)
        .select('*')
        .eq('user_id', _userId)
        .order('created_at', { ascending: true })

      if (error) {
        container.innerHTML = '<p class="loading-text">Error loading data: ' + Utils.esc(error.message) + '</p>'
        return
      }
      _dataCache[type] = data || []
      renderSimpleTable(type, data || [], container)
    } catch (err) {
      container.innerHTML = '<p class="loading-text">Failed to load data.</p>'
    }
  }

  async function loadAmmoSection() {
    const container = document.getElementById('shtf-ammo-content')
    if (!container) return
    container.innerHTML = Utils.skeletonRows(3)
    try {
      const { data, error } = await window.sb
        .from('shtf_ammo').select('*').eq('user_id', _userId)
        .order('created_at', { ascending: true })
      if (error) { container.innerHTML = '<p class="loading-text">Error: ' + Utils.esc(error.message) + '</p>'; return }
      const all     = data || []
      const active  = all.filter(a => a.status !== 'archived')
      const history = all.filter(a => a.status === 'archived')
      _dataCache['ammo']         = active
      _dataCache['ammo_history'] = history
      renderSimpleTable('ammo', active, container)
    } catch (err) {
      container.innerHTML = '<p class="loading-text">Failed to load ammo.</p>'
    }
  }

  // ── Simple Supply Tables ──────────────────────────────────────

  // ── Sort Helpers ─────────────────────────────────────────────

  // Columns eligible for clicking-to-sort, keyed by type
  const TABLE_SORT_COLS = {
    food:    ['item','quantity','expiry_date','notes'],
    water:   ['item','quantity','rotate_date','notes'],
    medical: ['item','quantity','notes'],
    gear:    ['item','quantity','notes'],
    ammo:    ['caliber','quantity','brand','notes'],
    seeds:   ['seed_name','seed_type','variety','rotate_by_date','harvest_year'],
  }

  function sortItems(type, items) {
    const state = _sortState[type]
    if (!state) return items
    const { col, dir } = state
    return [...items].sort((a, b) => {
      let va = a[col] ?? '', vb = b[col] ?? ''
      // Numeric quantity (integers in ammo)
      if (col === 'quantity' && typeof a[col] === 'number') {
        return dir === 'asc' ? (va - vb) : (vb - va)
      }
      // Empty values always sort to end
      if (!va && vb) return 1
      if (va && !vb) return -1
      const cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' })
      return dir === 'asc' ? cmp : -cmp
    })
  }

  function mkTh(type, col, label) {
    const state    = _sortState[type]
    const isActive = state && state.col === col
    const arrow    = isActive ? (state.dir === 'asc' ? ' ↑' : ' ↓') : ''
    return `<th class="th-sort${isActive ? ' th-sort-active' : ''}" data-sort-type="${type}" data-sort-col="${col}">${label}${arrow}</th>`
  }

  // cols: array of [fieldKey, displayLabel] — pass null key for the actions column
  function mkHeaders(type, cols) {
    const sortable = TABLE_SORT_COLS[type] || []
    return cols.map(([col, label]) => {
      if (col === null) return '<th></th>'
      return sortable.includes(col) ? mkTh(type, col, label) : `<th>${label}</th>`
    }).join('')
  }

  function renderSimpleTable(type, items, container) {
    const meta = CATEGORY_META[type]
    const icon = meta ? meta.icon : '📦'
    const label = meta ? meta.label : type

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${icon}</div>
          <div class="empty-state-title">No ${label} Logged</div>
          <div class="empty-state-desc">Add your first ${label.toLowerCase()} item to start tracking your supplies.</div>
        </div>`
      return
    }

    const displayItems = sortItems(type, items)
    let headersHTML = ''
    let rowsFn = null

    const actionBtns = (tableName, id, itemType) => `
      <div style="display:flex;gap:4px;white-space:nowrap;">
        <button class="btn btn-secondary btn-sm shtf-edit-btn" data-type="${itemType}" data-id="${id}" aria-label="Edit item">Edit</button>
        <button class="btn btn-danger btn-sm shtf-del-btn" data-table="${tableName}" data-id="${id}" data-type="${itemType}" aria-label="Remove item">✕</button>
      </div>`

    if (type === 'food') {
      headersHTML = mkHeaders(type, [['item','Item'],['quantity','Quantity'],['expiry_date','Expiry Date'],['notes','Notes'],[null,'']])
      rowsFn = item => {
        const expClass = Utils.getExpiryClass(item.expiry_date)
        return `<tr>
          <td>${Utils.esc(item.item)}</td>
          <td>${Utils.esc(item.quantity || '—')}</td>
          <td class="${expClass}">${item.expiry_date ? Utils.formatDateShort(item.expiry_date) : '—'}</td>
          <td>${Utils.esc(item.notes || '—')}</td>
          <td>${actionBtns('shtf_food', item.id, 'food')}</td>
        </tr>`
      }
    } else if (type === 'water') {
      headersHTML = mkHeaders(type, [['item','Item'],['quantity','Quantity'],['rotate_date','Rotate Date'],['notes','Notes'],[null,'']])
      rowsFn = item => {
        const rotClass = Utils.getExpiryClass(item.rotate_date)
        return `<tr>
          <td>${Utils.esc(item.item)}</td>
          <td>${Utils.esc(item.quantity || '—')}</td>
          <td class="${rotClass}">${item.rotate_date ? Utils.formatDateShort(item.rotate_date) : '—'}</td>
          <td>${Utils.esc(item.notes || '—')}</td>
          <td>${actionBtns('shtf_water', item.id, 'water')}</td>
        </tr>`
      }
    } else if (type === 'seeds') {
      headersHTML = mkHeaders(type, [
        ['seed_name','Seed'],['seed_type','Type'],['variety','Variety'],
        ['heirloom','Heirloom'],['quantity','Qty'],['harvest_year','Yr'],
        ['rotate_by_date','Rotate By'],['storage_method','Storage'],
        ['germination_rate','Germ %'],['notes','Notes'],[null,''],
      ])
      rowsFn = item => {
        const rotClass = Utils.getExpiryClass(item.rotate_by_date)
        return `<tr>
          <td>${Utils.esc(item.seed_name)}</td>
          <td>${Utils.esc(item.seed_type || '—')}</td>
          <td>${Utils.esc(item.variety || '—')}</td>
          <td>${item.heirloom ? 'Heirloom' : 'Hybrid'}</td>
          <td>${Utils.esc(item.quantity || '—')}</td>
          <td>${item.harvest_year || '—'}</td>
          <td class="${rotClass}">${item.rotate_by_date ? Utils.formatDateShort(item.rotate_by_date) : '—'}</td>
          <td>${Utils.esc(item.storage_method || '—')}</td>
          <td>${item.germination_rate != null ? item.germination_rate + '%' : '—'}</td>
          <td>${Utils.esc(item.notes || '—')}</td>
          <td>${actionBtns('shtf_seeds', item.id, 'seeds')}</td>
        </tr>`
      }
    } else if (type === 'ammo') {
      const historyItems = _dataCache['ammo_history'] || []
      const ammoBarHTML  = renderAmmoBars(displayItems)

      headersHTML = mkHeaders(type, [['caliber','Caliber'],['quantity','Qty (rds)'],['brand','Brand'],['price_paid','Price'],['notes','Notes'],[null,'']])
      rowsFn = item => {
        const isDepleted = item.quantity === 0 || item.quantity == null
        const histBadge  = renderHistBadge(item.caliber, historyItems)
        const ppr        = (item.price_paid && item.quantity) ? `$${(item.price_paid / item.quantity).toFixed(3)}/rd` : '—'
        const priceCell  = item.price_paid ? `$${parseFloat(item.price_paid).toFixed(2)}<br><span style="font-size:0.7em;color:var(--color-text-muted);">${ppr}</span>` : '—'
        const actions    = isDepleted
          ? `<div style="display:flex;gap:4px;white-space:nowrap;">
               <button class="btn btn-primary btn-sm ammo-archive-btn" data-id="${item.id}" aria-label="Archive and rate">↗ Archive</button>
               <button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_ammo" data-id="${item.id}" data-type="ammo" aria-label="Delete">✕</button>
             </div>`
          : actionBtns('shtf_ammo', item.id, 'ammo')
        return `<tr${isDepleted ? ' class="ammo-depleted-row"' : ''}>
          <td>${Utils.esc(item.caliber)}${histBadge}</td>
          <td>${isDepleted ? '<span style="color:var(--color-red);font-weight:600;">DEPLETED</span>' : item.quantity.toLocaleString()}</td>
          <td>${Utils.esc(item.brand || '—')}</td>
          <td>${priceCell}</td>
          <td>${Utils.esc(item.notes || '—')}</td>
          <td>${actions}</td>
        </tr>`
      }

      container.innerHTML = ammoBarHTML + `
        <div style="overflow-x:auto;">
          <table class="data-table">
            <thead><tr>${headersHTML}</tr></thead>
            <tbody>${displayItems.map(rowsFn).join('')}</tbody>
          </table>
        </div>
        ${renderAmmoHistory(historyItems)}`

      bindTableActionBtns(container, type)
      bindAmmoSpecialBtns(container)
      return
    } else {
      headersHTML = mkHeaders(type, [['item','Item'],['quantity','Quantity'],['notes','Notes'],[null,'']])
      rowsFn = item => `<tr>
        <td>${Utils.esc(item.item)}</td>
        <td>${Utils.esc(item.quantity || '—')}</td>
        <td>${Utils.esc(item.notes || '—')}</td>
        <td>${actionBtns('shtf_' + type, item.id, type)}</td>
      </tr>`
    }

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>${headersHTML}</tr></thead>
          <tbody>${displayItems.map(rowsFn).join('')}</tbody>
        </table>
      </div>`

    bindTableActionBtns(container, type)
  }

  // ── Ammo Inventory Bars ───────────────────────────────────────

  function renderAmmoBars(ammoItems) {
    if (ammoItems.length === 0) return ''

    // Sum quantities by caliber
    const totals = {}
    ammoItems.forEach(i => {
      if (i.quantity == null) return
      const key = i.caliber || 'Unknown'
      totals[key] = (totals[key] || 0) + i.quantity
    })

    const entries = Object.entries(totals)
    if (entries.length === 0) return ''

    const maxQty = Math.max(...entries.map(([, qty]) => qty), 1000)

    const bars = entries.map(([caliber, total]) => {
      const pct   = Math.min(100, Math.round((total / maxQty) * 100))
      const color = total >= 500 ? 'var(--color-green-bright)'
                  : total >= 100  ? 'var(--color-amber)'
                  : 'var(--color-red)'
      return `
        <div class="ammo-bar-item">
          <span class="ammo-bar-caliber">${Utils.esc(caliber)}</span>
          <div class="ammo-bar-track">
            <div class="ammo-bar-fill" style="width:${pct}%;background-color:${color};"></div>
          </div>
          <span style="font-size:0.75rem;color:var(--color-text-muted);white-space:nowrap;">${total.toLocaleString()} rds</span>
        </div>`
    }).join('')

    return `
      <div class="ammo-bar-list" style="margin-bottom:var(--space-lg);">
        <div class="section-heading" style="font-size:0.7rem;margin-bottom:var(--space-md);">Inventory at a Glance</div>
        ${bars}
      </div>`
  }

  // ── Ammo History Helpers ──────────────────────────────────────

  function renderHistBadge(caliber, historyItems) {
    const rated = historyItems.filter(h => h.caliber === caliber && h.performance_rating != null)
    if (rated.length === 0) return ''
    const avg = rated.reduce((s, h) => s + h.performance_rating, 0) / rated.length
    return `<span class="ammo-hist-badge" title="${rated.length} archived batch${rated.length > 1 ? 'es' : ''}">★ ${avg.toFixed(1)}</span>`
  }

  function perfClass(r) { return r >= 8 ? 'perf-high' : r >= 5 ? 'perf-mid' : 'perf-low' }

  function renderAmmoHistory(historyItems) {
    if (historyItems.length === 0) return ''
    const fmtDate = iso => {
      const d = new Date(iso)
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear()
    }
    const rows = historyItems.map(item => {
      const origQty = item.original_quantity || 'N/A'
      const ppr     = (item.price_paid && item.original_quantity)
        ? `$${(item.price_paid / item.original_quantity).toFixed(3)}/rd`
        : item.price_paid ? `$${parseFloat(item.price_paid).toFixed(2)} paid` : '—'
      const rating  = item.performance_rating != null
        ? `<span class="perf-rating-badge ${perfClass(item.performance_rating)}">${item.performance_rating}/10</span>`
        : `<span style="color:var(--color-text-muted);font-size:0.75rem;">Not rated</span>`
      return `<tr>
        <td>${Utils.esc(item.caliber)}</td>
        <td>${Utils.esc(item.brand || '—')}</td>
        <td>${origQty !== 'N/A' ? Number(origQty).toLocaleString() : '—'}</td>
        <td>${ppr}</td>
        <td>${rating}</td>
        <td>${Utils.esc(item.performance_notes || '—')}</td>
        <td style="white-space:nowrap;color:var(--color-text-muted);font-size:0.75rem;">${item.archived_at ? fmtDate(item.archived_at) : '—'}</td>
        <td>
          <div style="display:flex;gap:4px;white-space:nowrap;">
            <button class="btn btn-secondary btn-sm ammo-hist-edit-btn" data-id="${item.id}" aria-label="Edit rating">Rate</button>
            <button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_ammo" data-id="${item.id}" data-type="ammo" aria-label="Delete">✕</button>
          </div>
        </td>
      </tr>`
    }).join('')

    // Average rating per caliber for the summary line
    const caliberAvgs = {}
    historyItems.filter(h => h.performance_rating != null).forEach(h => {
      caliberAvgs[h.caliber] = caliberAvgs[h.caliber] || []
      caliberAvgs[h.caliber].push(h.performance_rating)
    })
    const topCalibers = Object.entries(caliberAvgs)
      .map(([cal, ratings]) => ({ cal, avg: ratings.reduce((s, r) => s + r, 0) / ratings.length }))
      .sort((a, b) => b.avg - a.avg).slice(0, 3)
      .map(({ cal, avg }) => `<span class="ammo-hist-badge">${Utils.esc(cal)} ★${avg.toFixed(1)}</span>`).join(' ')

    return `
      <div class="ammo-history-section">
        <details class="ammo-history-details">
          <summary class="ammo-history-summary">
            <span class="ammo-hist-title">Ammo History</span>
            <span class="ammo-hist-meta">${historyItems.length} batch${historyItems.length > 1 ? 'es' : ''}${topCalibers ? ' · Top: ' + topCalibers : ''}</span>
          </summary>
          <div style="overflow-x:auto;margin-top:var(--space-md);">
            <table class="data-table">
              <thead><tr><th>Caliber</th><th>Brand</th><th>Orig Qty</th><th>$/rd</th><th>Rating</th><th>Notes</th><th>Archived</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>
      </div>`
  }

  function bindAmmoSpecialBtns(container) {
    container.querySelectorAll('.ammo-archive-btn').forEach(btn => {
      btn.addEventListener('click', () => openArchiveModal(btn.dataset.id))
    })
    container.querySelectorAll('.ammo-hist-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => editHistoryRatingModal(btn.dataset.id))
    })
  }

  function openArchiveModal(itemId) {
    const item = (_dataCache['ammo'] || []).find(a => String(a.id) === String(itemId))
    if (!item) return
    Utils.openModal(`Archive: ${item.caliber}`, `
      <div style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);background:var(--color-bg-elevated);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--color-text-muted);">
        ${Utils.esc(item.brand || 'Unknown brand')}${item.notes ? ' · ' + Utils.esc(item.notes) : ''}
      </div>
      <form id="archive-ammo-form">
        <div class="form-group">
          <label class="form-label">Performance Rating <span style="font-size:0.7em;color:var(--color-text-muted);font-weight:normal;">1 = poor · 10 = excellent</span></label>
          <div class="rating-row" id="archive-rating">
            ${[1,2,3,4,5,6,7,8,9,10].map(n =>
              `<button type="button" class="rating-btn" data-val="${n}" onclick="window.rlSetRating('archive-rating',${n})">${n}</button>`
            ).join('')}
            <input type="hidden" name="performance_rating" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="performance_notes" class="form-textarea" rows="3"
            placeholder="How did it group? Feed reliably? Would you buy again?"></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="archive-ammo-submit">Archive & Rate</button>
        </div>
      </form>
    `)
    document.getElementById('archive-ammo-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('archive-ammo-submit')
      btn.disabled = true; btn.textContent = 'Archiving…'
      const rating = fd.get('performance_rating') ? parseInt(fd.get('performance_rating')) : null
      const { error } = await window.sb.from('shtf_ammo').update({
        status:              'archived',
        performance_rating:  rating,
        performance_notes:   fd.get('performance_notes').trim() || null,
        archived_at:         new Date().toISOString(),
        original_quantity:   item.original_quantity ?? item.quantity,
      }).eq('id', itemId)
      if (error) { Utils.showToast('Error: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Archive & Rate'; return }
      Utils.closeModal()
      Utils.showToast('Ammo archived!')
      invalidateAndReload('ammo')
    })
  }

  function editHistoryRatingModal(itemId) {
    const item = (_dataCache['ammo_history'] || []).find(a => String(a.id) === String(itemId))
    if (!item) return
    Utils.openModal(`Re-rate: ${item.caliber}`, `
      <div style="margin-bottom:var(--space-md);padding:var(--space-sm) var(--space-md);background:var(--color-bg-elevated);border-radius:var(--radius-sm);font-size:0.8rem;color:var(--color-text-muted);">
        ${Utils.esc(item.brand || 'Unknown brand')}${item.original_quantity ? ' · ' + Number(item.original_quantity).toLocaleString() + ' rds originally' : ''}
      </div>
      <form id="hist-rating-form">
        <div class="form-group">
          <label class="form-label">Performance Rating</label>
          <div class="rating-row" id="hist-rating">
            ${[1,2,3,4,5,6,7,8,9,10].map(n =>
              `<button type="button" class="rating-btn${item.performance_rating != null && n <= item.performance_rating ? ' rating-active' : ''}" data-val="${n}" onclick="window.rlSetRating('hist-rating',${n})">${n}</button>`
            ).join('')}
            <input type="hidden" name="performance_rating" value="${item.performance_rating || ''}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="performance_notes" class="form-textarea" rows="3">${Utils.esc(item.performance_notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="hist-rating-submit">Save</button>
        </div>
      </form>
    `)
    document.getElementById('hist-rating-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('hist-rating-submit')
      btn.disabled = true; btn.textContent = 'Saving…'
      const rating = fd.get('performance_rating') ? parseInt(fd.get('performance_rating')) : null
      const { error } = await window.sb.from('shtf_ammo').update({
        performance_rating: rating,
        performance_notes:  fd.get('performance_notes').trim() || null,
      }).eq('id', itemId)
      if (error) { Utils.showToast('Error: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save'; return }
      Utils.closeModal(); Utils.showToast('Rating saved!')
      invalidateAndReload('ammo')
    })
  }

  function bindTableActionBtns(container, type) {
    container.querySelectorAll('.shtf-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.type, btn.dataset.id))
    })
    container.querySelectorAll('.shtf-del-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.table, btn.dataset.id, btn.dataset.type))
    })
    bindSortHeaders(container, type)
  }

  function bindSortHeaders(container, type) {
    container.querySelectorAll('.th-sort[data-sort-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sortCol
        const cur = _sortState[type]
        _sortState[type] = (cur && cur.col === col)
          ? { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
          : { col, dir: 'asc' }
        renderSimpleTable(type, _dataCache[type] || [], container)
      })
    })
  }

  // ── Delete Handler ────────────────────────────────────────────

  function confirmDelete(tableName, id, type) {
    Utils.confirmDialog(
      'Remove this item from your tracker?',
      () => deleteItem(tableName, id, type),
      'Remove Item'
    )
  }

  async function deleteItem(tableName, id, type) {
    const { error } = await window.sb.from(tableName).delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Item removed.')
    // Invalidate caches
    loadedTabs[type]       = false
    loadedTabs['overview'] = false
    delete _dataCache[type]
    loadSubSection(type)
  }

  // ── Prep Plans ────────────────────────────────────────────────

  async function loadPrepPlans() {
    const container = document.getElementById('shtf-prepplans-content')
    container.innerHTML = Utils.skeletonCards(2)

    const { data, error } = await window.sb
      .from('shtf_prep_plans')
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: false })

    if (error) { container.innerHTML = '<p class="loading-text">Error loading plans.</p>'; return }
    _dataCache['prepplans'] = data || []
    renderPrepPlans(data || [], container)
  }

  function renderPrepPlans(plans, container) {
    if (plans.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-title">No Prep Plans Yet</div>
          <div class="empty-state-desc">Document your preparedness goals and track their completion status.</div>
        </div>`
      return
    }

    const complete = plans.filter(p => p.status === 'complete').length
    const total    = plans.length
    const pct      = Math.round((complete / total) * 100)

    container.innerHTML = `
      <div style="margin-bottom:var(--space-lg);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-sm);">
          <span style="font-family:var(--font-mono);font-size:0.75rem;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-muted);">
            ${complete} of ${total} complete
          </span>
          <span style="font-size:0.8rem;color:var(--color-text-primary);">${pct}%</span>
        </div>
        <div class="progress-bar-wrap">
          <div class="progress-bar-track">
            <div class="progress-bar-fill" style="width:${pct}%;"></div>
          </div>
        </div>
      </div>

      ${plans.map(plan => `
        <div class="plan-card" data-priority="${plan.priority}">
          <div style="flex:1">
            <div class="plan-card-title">${Utils.esc(plan.title)}</div>
            ${plan.description ? `<div class="plan-card-desc">${Utils.esc(plan.description)}</div>` : ''}
            <div class="plan-card-actions">
              <select class="form-select" style="font-size:0.75rem;padding:2px 6px;width:auto;" data-plan-id="${plan.id}" aria-label="Plan status">
                <option value="pending"     ${plan.status === 'pending'     ? 'selected' : ''}>Pending</option>
                <option value="in_progress" ${plan.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="complete"    ${plan.status === 'complete'    ? 'selected' : ''}>Complete</option>
              </select>
            </div>
          </div>
          <div class="plan-card-badges">
            ${Utils.priorityBadge(plan.priority)}
            ${Utils.statusBadge(plan.status)}
            <button class="btn btn-secondary btn-sm shtf-edit-btn"
              data-type="prepplans" data-id="${plan.id}"
              aria-label="Edit plan">Edit</button>
            <button class="btn btn-danger btn-sm shtf-del-btn"
              data-table="shtf_prep_plans" data-id="${plan.id}" data-type="prepplans"
              aria-label="Remove plan">✕</button>
          </div>
        </div>
      `).join('')}
    `

    container.querySelectorAll('select[data-plan-id]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const { error } = await window.sb
          .from('shtf_prep_plans')
          .update({ status: sel.value })
          .eq('id', sel.dataset.planId)
        if (error) { Utils.showToast('Update failed', 'error'); return }
        Utils.showToast('Status updated.')
        loadedTabs['prepplans'] = false
        loadedTabs['overview']  = false
        loadPrepPlans()
      })
    })

    container.querySelectorAll('.shtf-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.type, btn.dataset.id))
    })
    container.querySelectorAll('.shtf-del-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.table, btn.dataset.id, btn.dataset.type))
    })
  }

  // ── Bug-Out Plans ─────────────────────────────────────────────

  async function loadBugoutPlans() {
    const container = document.getElementById('shtf-bugout-content')
    container.innerHTML = Utils.skeletonCards(2)

    const { data, error } = await window.sb
      .from('shtf_bugout_plans')
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: false })

    if (error) { container.innerHTML = '<p class="loading-text">Error loading plans.</p>'; return }
    _dataCache['bugout'] = data || []
    renderBugoutPlans(data || [], container)
  }

  function renderBugoutPlans(plans, container) {
    if (plans.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🗺</div>
          <div class="empty-state-title">No Bug-Out Plans Yet</div>
          <div class="empty-state-desc">Document your evacuation routes, destinations, and rally points.</div>
        </div>`
      return
    }

    container.innerHTML = plans.map(plan => `
      <div class="bugout-card">
        <div class="bugout-card-title">${Utils.esc(plan.title)}</div>
        ${plan.description ? `<div class="bugout-card-meta">${Utils.esc(plan.description)}</div>` : ''}
        ${plan.route       ? `<div class="bugout-card-meta"><strong>Route:</strong> ${Utils.esc(plan.route)}</div>` : ''}
        ${plan.destination ? `<div class="bugout-card-meta"><strong>Destination:</strong> ${Utils.esc(plan.destination)}</div>` : ''}
        ${plan.notes       ? `<div class="bugout-card-meta" style="font-style:italic;">${Utils.esc(plan.notes)}</div>` : ''}
        <div class="bugout-card-actions">
          <button class="btn btn-secondary btn-sm shtf-edit-btn"
            data-type="bugout" data-id="${plan.id}"
            aria-label="Edit plan">Edit</button>
          <button class="btn btn-danger btn-sm shtf-del-btn"
            data-table="shtf_bugout_plans" data-id="${plan.id}" data-type="bugout"
            aria-label="Remove plan">Remove</button>
        </div>
      </div>
    `).join('')

    container.querySelectorAll('.shtf-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.type, btn.dataset.id))
    })
    container.querySelectorAll('.shtf-del-btn').forEach(btn => {
      btn.addEventListener('click', () => confirmDelete(btn.dataset.table, btn.dataset.id, btn.dataset.type))
    })
  }

  // ── Edit Modal Dispatcher ─────────────────────────────────────

  function openEditModal(type, id) {
    const items = _dataCache[type] || []
    const item  = items.find(i => String(i.id) === String(id))
    if (!item) { Utils.showToast('Could not find item.', 'error'); return }

    const editFns = {
      food:      () => editFoodModal(item),
      water:     () => editWaterModal(item),
      medical:   () => editSupplyModal('medical', 'Medical Item',  item),
      gear:      () => editSupplyModal('gear',    'Gear Item',     item),
      ammo:      () => editAmmoModal(item),
      seeds:     () => editSeedsModal(item),
      prepplans: () => editPrepPlanModal(item),
      bugout:    () => editBugoutModal(item),
    }
    const fn = editFns[type]
    if (fn) fn()
  }

  function editFoodModal(item) {
    Utils.openModal('Edit Food Item', `
      <form id="shtf-edit-form">
        <div class="form-group">
          <label class="form-label">Item <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="item" class="form-input" value="${Utils.esc(item.item)}" required maxlength="100" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="text" name="quantity" class="form-input" value="${Utils.esc(item.quantity || '')}" maxlength="60" />
          </div>
          <div class="form-group">
            <label class="form-label">Expiry Date</label>
            <input type="date" name="expiry_date" class="form-input" value="${Utils.esc(item.expiry_date || '')}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="shtf-edit-submit">Save Changes</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-edit-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('shtf-edit-submit')
      btn.disabled = true; btn.textContent = 'Saving…'
      const { error } = await window.sb.from('shtf_food').update({
        item: fd.get('item').trim(), quantity: fd.get('quantity').trim() || null,
        expiry_date: fd.get('expiry_date') || null, notes: fd.get('notes').trim() || null,
      }).eq('id', item.id)
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; return }
      Utils.closeModal(); Utils.showToast('Updated!')
      invalidateAndReload('food')
    })
  }

  function editWaterModal(item) {
    Utils.openModal('Edit Water Supply', `
      <form id="shtf-edit-form">
        <div class="form-group">
          <label class="form-label">Item <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="item" class="form-input" value="${Utils.esc(item.item)}" required maxlength="100" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="text" name="quantity" class="form-input" value="${Utils.esc(item.quantity || '')}" maxlength="60" />
          </div>
          <div class="form-group">
            <label class="form-label">Rotate Date</label>
            <input type="date" name="rotate_date" class="form-input" value="${Utils.esc(item.rotate_date || '')}" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="shtf-edit-submit">Save Changes</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-edit-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('shtf-edit-submit')
      btn.disabled = true; btn.textContent = 'Saving…'
      const { error } = await window.sb.from('shtf_water').update({
        item:        fd.get('item').trim(),
        quantity:    fd.get('quantity').trim() || null,
        rotate_date: fd.get('rotate_date') || null,
        notes:       fd.get('notes').trim() || null,
      }).eq('id', item.id)
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; return }
      Utils.closeModal(); Utils.showToast('Updated!')
      invalidateAndReload('water')
    })
  }

  function editSupplyModal(type, label, item) {
    Utils.openModal(`Edit ${label}`, `
      <form id="shtf-edit-form">
        <div class="form-group">
          <label class="form-label">Item <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="item" class="form-input" value="${Utils.esc(item.item)}" required maxlength="100" />
        </div>
        <div class="form-group">
          <label class="form-label">Quantity</label>
          <input type="text" name="quantity" class="form-input" value="${Utils.esc(item.quantity || '')}" maxlength="60" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="shtf-edit-submit">Save Changes</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-edit-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('shtf-edit-submit')
      btn.disabled = true; btn.textContent = 'Saving…'
      const { error } = await window.sb.from(`shtf_${type}`).update({
        item: fd.get('item').trim(), quantity: fd.get('quantity').trim() || null,
        notes: fd.get('notes').trim() || null,
      }).eq('id', item.id)
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; return }
      Utils.closeModal(); Utils.showToast('Updated!')
      invalidateAndReload(type)
    })
  }

  function editAmmoModal(item) {
    const initPPR = (item.price_paid && item.quantity) ? '$' + (item.price_paid / item.quantity).toFixed(3) + '/rd' : '—'
    Utils.openModal('Edit Ammo', `
      <form id="shtf-edit-form">
        <div class="form-group">
          <label class="form-label">Caliber <span style="color:var(--color-red)">*</span></label>
          ${caliberSelectHTML(item.caliber)}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity (rounds)</label>
            <input type="number" name="quantity" class="form-input" value="${item.quantity ?? ''}" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Brand / Manufacturer</label>
            <input type="text" name="brand" class="form-input" value="${Utils.esc(item.brand || '')}" maxlength="80" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Price Paid <span style="font-size:0.7em;color:var(--color-text-muted);font-weight:normal;">(total box/lot)</span></label>
            <input type="number" name="price_paid" class="form-input" value="${item.price_paid ?? ''}" min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Price / Round <span style="font-size:0.7em;color:var(--color-text-muted);font-weight:normal;">(auto)</span></label>
            <input type="text" id="edit-ammo-ppr" class="form-input" value="${initPPR}" readonly style="opacity:0.75;cursor:default;" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="shtf-edit-submit">Save Changes</button>
        </div>
      </form>
    `)
    bindCaliberSelect()
    const calcPPR = () => {
      const qty   = parseFloat(document.querySelector('#shtf-edit-form [name=quantity]')?.value) || 0
      const price = parseFloat(document.querySelector('#shtf-edit-form [name=price_paid]')?.value) || 0
      const el = document.getElementById('edit-ammo-ppr')
      if (el) el.value = (qty > 0 && price > 0) ? '$' + (price / qty).toFixed(3) + '/rd' : '—'
    }
    document.querySelector('#shtf-edit-form [name=quantity]')?.addEventListener('input', calcPPR)
    document.querySelector('#shtf-edit-form [name=price_paid]')?.addEventListener('input', calcPPR)
    document.getElementById('shtf-edit-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd      = new FormData(e.target)
      const btn     = document.getElementById('shtf-edit-submit')
      const caliber = resolveCaliberFromForm(fd)
      if (!caliber) { Utils.showToast('Please select or enter a caliber.', 'error'); return }
      btn.disabled = true; btn.textContent = 'Saving…'
      const qty   = fd.get('quantity')
      const price = fd.get('price_paid')
      const { error } = await window.sb.from('shtf_ammo').update({
        caliber,
        quantity:   qty ? parseInt(qty) : null,
        brand:      fd.get('brand').trim() || null,
        price_paid: price ? parseFloat(price) : null,
        notes:      fd.get('notes').trim() || null,
      }).eq('id', item.id)
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; return }
      Utils.closeModal(); Utils.showToast('Updated!')
      invalidateAndReload('ammo')
    })
  }

  function editSeedsModal(item) {
    Utils.openModal('Edit Seed Bank Entry', `
      <form id="shtf-edit-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Seed Name <span style="color:var(--color-red)">*</span></label>
            <input type="text" name="seed_name" class="form-input" value="${Utils.esc(item.seed_name)}" required maxlength="120" />
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select name="seed_type" class="form-select">
              <option value="">— Select —</option>
              ${['Vegetable','Fruit','Herb','Grain','Legume','Flower','Other'].map(t =>
                `<option value="${t}" ${item.seed_type === t ? 'selected' : ''}>${t}</option>`
              ).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Variety</label>
            <input type="text" name="variety" class="form-input" value="${Utils.esc(item.variety || '')}" maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Heirloom / Hybrid</label>
            <select name="heirloom" class="form-select">
              <option value="true"  ${item.heirloom ? 'selected' : ''}>Heirloom</option>
              <option value="false" ${!item.heirloom ? 'selected' : ''}>Hybrid</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="text" name="quantity" class="form-input" value="${Utils.esc(item.quantity || '')}" maxlength="60" />
          </div>
          <div class="form-group">
            <label class="form-label">Harvest / Pack Year</label>
            <input type="number" name="harvest_year" class="form-input" value="${item.harvest_year || ''}" min="2000" max="2100" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rotate By Date</label>
            <input type="date" name="rotate_by_date" class="form-input" value="${Utils.esc(item.rotate_by_date || '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Germination Rate %</label>
            <input type="number" name="germination_rate" class="form-input" value="${item.germination_rate ?? ''}" min="0" max="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Storage Method</label>
          <input type="text" name="storage_method" class="form-input" value="${Utils.esc(item.storage_method || '')}" maxlength="120" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="shtf-edit-submit">Save Changes</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-edit-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('shtf-edit-submit')
      btn.disabled = true; btn.textContent = 'Saving…'
      const harvestYr = fd.get('harvest_year')
      const germRate  = fd.get('germination_rate')
      const { error } = await window.sb.from('shtf_seeds').update({
        seed_name: fd.get('seed_name').trim(), seed_type: fd.get('seed_type') || null,
        variety: fd.get('variety').trim() || null, heirloom: fd.get('heirloom') === 'true',
        quantity: fd.get('quantity').trim() || null, harvest_year: harvestYr ? parseInt(harvestYr) : null,
        rotate_by_date: fd.get('rotate_by_date') || null,
        germination_rate: germRate ? parseInt(germRate) : null,
        storage_method: fd.get('storage_method').trim() || null,
        notes: fd.get('notes').trim() || null,
      }).eq('id', item.id)
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; return }
      Utils.closeModal(); Utils.showToast('Updated!')
      invalidateAndReload('seeds')
    })
  }

  function editPrepPlanModal(item) {
    Utils.openModal('Edit Prep Plan', `
      <form id="shtf-edit-form">
        <div class="form-group">
          <label class="form-label">Title <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="title" class="form-input" value="${Utils.esc(item.title)}" required maxlength="150" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea">${Utils.esc(item.description || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select name="priority" class="form-select">
              ${['low','medium','high','critical'].map(p =>
                `<option value="${p}" ${item.priority === p ? 'selected' : ''}>${p.charAt(0).toUpperCase() + p.slice(1)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select name="status" class="form-select">
              <option value="pending"     ${item.status === 'pending'     ? 'selected' : ''}>Pending</option>
              <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="complete"    ${item.status === 'complete'    ? 'selected' : ''}>Complete</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="shtf-edit-submit">Save Changes</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-edit-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('shtf-edit-submit')
      btn.disabled = true; btn.textContent = 'Saving…'
      const { error } = await window.sb.from('shtf_prep_plans').update({
        title: fd.get('title').trim(), description: fd.get('description').trim() || null,
        priority: fd.get('priority'), status: fd.get('status'),
      }).eq('id', item.id)
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; return }
      Utils.closeModal(); Utils.showToast('Plan updated!')
      invalidateAndReload('prepplans')
    })
  }

  function editBugoutModal(item) {
    Utils.openModal('Edit Bug-Out Plan', `
      <form id="shtf-edit-form">
        <div class="form-group">
          <label class="form-label">Plan Title <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="title" class="form-input" value="${Utils.esc(item.title)}" required maxlength="150" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea">${Utils.esc(item.description || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Route</label>
            <input type="text" name="route" class="form-input" value="${Utils.esc(item.route || '')}" maxlength="200" />
          </div>
          <div class="form-group">
            <label class="form-label">Destination</label>
            <input type="text" name="destination" class="form-input" value="${Utils.esc(item.destination || '')}" maxlength="200" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="shtf-edit-submit">Save Changes</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-edit-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('shtf-edit-submit')
      btn.disabled = true; btn.textContent = 'Saving…'
      const { error } = await window.sb.from('shtf_bugout_plans').update({
        title: fd.get('title').trim(), description: fd.get('description').trim() || null,
        route: fd.get('route').trim() || null, destination: fd.get('destination').trim() || null,
        notes: fd.get('notes').trim() || null,
      }).eq('id', item.id)
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Changes'; return }
      Utils.closeModal(); Utils.showToast('Plan updated!')
      invalidateAndReload('bugout')
    })
  }

  function invalidateAndReload(type) {
    loadedTabs[type]       = false
    loadedTabs['overview'] = false
    delete _dataCache[type]
    if (type === 'ammo') delete _dataCache['ammo_history']
    loadSubSection(type)
  }

  // ── Add Modals ────────────────────────────────────────────────

  function openAddModal(type) {
    const forms = {
      food:      addFoodForm,
      water:     addWaterForm,
      medical:   addSupplyForm('medical', 'Medical Item'),
      gear:      addSupplyForm('gear',    'Gear Item'),
      ammo:      addAmmoForm,
      prepplans: addPrepPlanForm,
      bugout:    addBugoutForm,
      seeds:     addSeedBankForm,
    }
    const fn = forms[type]
    if (fn) fn()
  }

  function addFoodForm() {
    Utils.openModal('Add Food Supply', `
      <form id="shtf-form">
        <div class="form-group">
          <label class="form-label">Item <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="item" class="form-input" placeholder="e.g. Freeze-dried rice, MRE" required maxlength="100" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="text" name="quantity" class="form-input" placeholder="e.g. 30 lbs, 24 packs" maxlength="60" />
          </div>
          <div class="form-group">
            <label class="form-label">Expiry Date</label>
            <input type="date" name="expiry_date" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Storage location, brand, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Food</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd = new FormData(e.target)
      await saveItem('shtf_food', {
        user_id:     _userId,
        item:        fd.get('item').trim(),
        quantity:    fd.get('quantity').trim() || null,
        expiry_date: fd.get('expiry_date') || null,
        notes:       fd.get('notes').trim() || null,
      }, 'food', e.target)
    })
  }

  function addWaterForm() {
    Utils.openModal('Add Water Supply', `
      <form id="shtf-form">
        <div class="form-group">
          <label class="form-label">Item <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="item" class="form-input" placeholder="e.g. Bottled water, water filter, barrel" required maxlength="100" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="text" name="quantity" class="form-input" placeholder="e.g. 10 gallons, 24 bottles" maxlength="60" />
          </div>
          <div class="form-group">
            <label class="form-label">Rotate Date</label>
            <input type="date" name="rotate_date" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Storage location, purification method, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Water</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd = new FormData(e.target)
      await saveItem('shtf_water', {
        user_id:     _userId,
        item:        fd.get('item').trim(),
        quantity:    fd.get('quantity').trim() || null,
        rotate_date: fd.get('rotate_date') || null,
        notes:       fd.get('notes').trim() || null,
      }, 'water', e.target)
    })
  }

  function addSupplyForm(type, label) {
    return () => {
      Utils.openModal(`Add ${label}`, `
        <form id="shtf-form">
          <div class="form-group">
            <label class="form-label">Item <span style="color:var(--color-red)">*</span></label>
            <input type="text" name="item" class="form-input" placeholder="e.g. ${label}" required maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="text" name="quantity" class="form-input" placeholder="e.g. 10 gallons, 2 units" maxlength="60" />
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea name="notes" class="form-textarea" placeholder="Brand, condition, location, etc."></textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary">Add ${label}</button>
          </div>
        </form>
      `)
      document.getElementById('shtf-form').addEventListener('submit', async e => {
        e.preventDefault()
        const fd = new FormData(e.target)
        await saveItem(`shtf_${type}`, {
          user_id:  _userId,
          item:     fd.get('item').trim(),
          quantity: fd.get('quantity').trim() || null,
          notes:    fd.get('notes').trim() || null,
        }, type, e.target)
      })
    }
  }

  const COMMON_CALIBERS = [
    '5.56 NATO', '.223 Rem', '9mm', '.45 ACP', '.22 LR',
    '7.62x39', '7.62x51 NATO', '.308 Win', '.30-06',
    '12 Gauge', '20 Gauge', '.410 Bore',
    '.357 Mag', '.38 Special', '.40 S&W', '.44 Mag',
    '6.5 Creedmoor', '.300 Win Mag', '.50 BMG',
  ]

  function caliberSelectHTML(selectedVal = '') {
    const isCustom = selectedVal && !COMMON_CALIBERS.includes(selectedVal)
    const opts = COMMON_CALIBERS.map(c =>
      `<option value="${c}"${selectedVal === c ? ' selected' : ''}>${c}</option>`
    ).join('')
    return `
      <select name="caliber_select" class="form-select" id="caliber-select-field">
        <option value="">— Select Caliber —</option>
        ${opts}
        <option value="__custom__"${isCustom ? ' selected' : ''}>Other (specify)…</option>
      </select>
      <input type="text" name="caliber_custom" id="caliber-custom-field" class="form-input"
        placeholder="Enter caliber…" maxlength="60"
        style="margin-top:8px;display:${isCustom ? 'block' : 'none'};"
        value="${Utils.esc(isCustom ? selectedVal : '')}" />`
  }

  function bindCaliberSelect() {
    const sel = document.getElementById('caliber-select-field')
    const inp = document.getElementById('caliber-custom-field')
    if (!sel || !inp) return
    sel.addEventListener('change', () => {
      inp.style.display = sel.value === '__custom__' ? 'block' : 'none'
    })
  }

  function resolveCaliberFromForm(fd) {
    const sel = fd.get('caliber_select') || ''
    if (sel === '__custom__') return (fd.get('caliber_custom') || '').trim()
    return sel.trim()
  }

  function addAmmoForm() {
    Utils.openModal('Add Ammo Stockpile', `
      <form id="shtf-form">
        <div class="form-group">
          <label class="form-label">Caliber <span style="color:var(--color-red)">*</span></label>
          ${caliberSelectHTML()}
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity (rounds)</label>
            <input type="number" name="quantity" class="form-input" placeholder="0" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Brand / Manufacturer</label>
            <input type="text" name="brand" class="form-input" placeholder="e.g. Federal, Hornady" maxlength="80" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Price Paid <span style="font-size:0.7em;color:var(--color-text-muted);font-weight:normal;">(total box/lot)</span></label>
            <input type="number" name="price_paid" class="form-input" placeholder="e.g. 24.99" min="0" step="0.01" />
          </div>
          <div class="form-group">
            <label class="form-label">Price / Round <span style="font-size:0.7em;color:var(--color-text-muted);font-weight:normal;">(auto)</span></label>
            <input type="text" id="add-ammo-ppr" class="form-input" placeholder="—" readonly style="opacity:0.75;cursor:default;" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Grain weight, storage location, lot #, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Ammo</button>
        </div>
      </form>
    `)
    bindCaliberSelect()
    // Auto-calc price per round
    const calcPPR = () => {
      const qty   = parseFloat(document.querySelector('#shtf-form [name=quantity]')?.value) || 0
      const price = parseFloat(document.querySelector('#shtf-form [name=price_paid]')?.value) || 0
      const el = document.getElementById('add-ammo-ppr')
      if (el) el.value = (qty > 0 && price > 0) ? '$' + (price / qty).toFixed(3) + '/rd' : '—'
    }
    document.querySelector('#shtf-form [name=quantity]')?.addEventListener('input', calcPPR)
    document.querySelector('#shtf-form [name=price_paid]')?.addEventListener('input', calcPPR)
    document.getElementById('shtf-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd      = new FormData(e.target)
      const caliber = resolveCaliberFromForm(fd)
      if (!caliber) { Utils.showToast('Please select or enter a caliber.', 'error'); return }
      const qty   = fd.get('quantity')
      const price = fd.get('price_paid')
      const qtyInt = qty ? parseInt(qty) : null
      await saveItem('shtf_ammo', {
        user_id:           _userId,
        caliber,
        quantity:          qtyInt,
        original_quantity: qtyInt,
        brand:             fd.get('brand').trim() || null,
        price_paid:        price ? parseFloat(price) : null,
        notes:             fd.get('notes').trim() || null,
        status:            'active',
      }, 'ammo', e.target)
    })
  }

  function addPrepPlanForm() {
    Utils.openModal('Add Prep Plan', `
      <form id="shtf-form">
        <div class="form-group">
          <label class="form-label">Title <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="title" class="form-input" placeholder="e.g. 72-hour bug-out bag complete" required maxlength="150" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea" placeholder="Details, tasks, milestones…"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Priority</label>
            <select name="priority" class="form-select">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select name="status" class="form-select">
              <option value="pending" selected>Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="complete">Complete</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Plan</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd = new FormData(e.target)
      await saveItem('shtf_prep_plans', {
        user_id:     _userId,
        title:       fd.get('title').trim(),
        description: fd.get('description').trim() || null,
        priority:    fd.get('priority'),
        status:      fd.get('status'),
      }, 'prepplans', e.target)
    })
  }

  function addBugoutForm() {
    Utils.openModal('Add Bug-Out Plan', `
      <form id="shtf-form">
        <div class="form-group">
          <label class="form-label">Plan Title <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="title" class="form-input" placeholder="e.g. Primary Bug-Out Route" required maxlength="150" />
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea" placeholder="Scenario, trigger conditions, team size…"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Route</label>
            <input type="text" name="route" class="form-input" placeholder="e.g. I-20 West to FM 123" maxlength="200" />
          </div>
          <div class="form-group">
            <label class="form-label">Destination</label>
            <input type="text" name="destination" class="form-input" placeholder="e.g. Family property — Comanche County" maxlength="200" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Alternate routes, rally points, comm plan, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Plan</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd = new FormData(e.target)
      await saveItem('shtf_bugout_plans', {
        user_id:     _userId,
        title:       fd.get('title').trim(),
        description: fd.get('description').trim() || null,
        route:       fd.get('route').trim()       || null,
        destination: fd.get('destination').trim() || null,
        notes:       fd.get('notes').trim()       || null,
      }, 'bugout', e.target)
    })
  }

  function addSeedBankForm() {
    Utils.openModal('Add to Seed Bank', `
      <form id="shtf-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Seed Name <span style="color:var(--color-red)">*</span></label>
            <input type="text" name="seed_name" class="form-input" placeholder="e.g. Heirloom Tomato" required maxlength="120" />
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select name="seed_type" class="form-select">
              <option value="">— Select —</option>
              <option value="Vegetable">Vegetable</option>
              <option value="Fruit">Fruit</option>
              <option value="Herb">Herb</option>
              <option value="Grain">Grain</option>
              <option value="Legume">Legume</option>
              <option value="Flower">Flower</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Variety</label>
            <input type="text" name="variety" class="form-input" placeholder="e.g. Roma, Cherokee Purple" maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Heirloom / Hybrid</label>
            <select name="heirloom" class="form-select">
              <option value="true">Heirloom</option>
              <option value="false">Hybrid</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity</label>
            <input type="text" name="quantity" class="form-input" placeholder="e.g. 500 seeds, 3 packets" maxlength="60" />
          </div>
          <div class="form-group">
            <label class="form-label">Harvest / Pack Year</label>
            <input type="number" name="harvest_year" class="form-input" placeholder="${new Date().getFullYear()}" min="2000" max="2100" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rotate By Date</label>
            <input type="date" name="rotate_by_date" class="form-input" />
            <small style="color:var(--color-text-muted);font-size:0.7rem;">When seeds should be swapped for fresh stock</small>
          </div>
          <div class="form-group">
            <label class="form-label">Germination Rate %</label>
            <input type="number" name="germination_rate" class="form-input" placeholder="e.g. 85" min="0" max="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Storage Method</label>
          <input type="text" name="storage_method" class="form-input" placeholder="e.g. Vacuum sealed, mylar bag, freezer" maxlength="120" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Growing notes, days to maturity, location, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Seeds</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd         = new FormData(e.target)
      const harvestYr  = fd.get('harvest_year')
      const germRate   = fd.get('germination_rate')
      await saveItem('shtf_seeds', {
        user_id:          _userId,
        seed_name:        fd.get('seed_name').trim(),
        seed_type:        fd.get('seed_type') || null,
        variety:          fd.get('variety').trim() || null,
        heirloom:         fd.get('heirloom') === 'true',
        quantity:         fd.get('quantity').trim() || null,
        harvest_year:     harvestYr ? parseInt(harvestYr) : null,
        rotate_by_date:   fd.get('rotate_by_date') || null,
        germination_rate: germRate ? parseInt(germRate) : null,
        storage_method:   fd.get('storage_method').trim() || null,
        notes:            fd.get('notes').trim() || null,
      }, 'seeds', e.target)
    })
  }

  async function saveItem(tableName, payload, type, form) {
    const btn = form.querySelector('[type=submit]')
    const originalText = btn.textContent
    btn.disabled = true; btn.textContent = 'Saving…'

    const { error } = await window.sb.from(tableName).insert(payload)
    if (error) {
      Utils.showToast('Save failed: ' + error.message, 'error')
      btn.disabled = false; btn.textContent = originalText
      return
    }
    Utils.closeModal()
    Utils.showToast('Saved!')
    // Invalidate both the specific tab and overview
    loadedTabs[type]       = false
    loadedTabs['overview'] = false
    delete _dataCache[type]
    loadSubSection(type)
  }

  return { init }
})()
