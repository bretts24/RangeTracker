// Range Log Module
window.RangeLogModule = (() => {
  let _userId = null
  let _initialized = false
  let _sessions = []
  let _loadoutWeapons = []
  let _ammoStock = []
  let _searchQuery = ''
  let _dateFilter = 'all'

  const WEAPON_CATEGORY_LABELS = {
    rifle: 'Rifle', pistol: 'Pistol', shotgun: 'Shotgun',
    smg: 'SMG', pcc: 'PCC', other_weapon: 'Other',
  }

  async function init(userId) {
    if (_initialized) return
    _userId = userId
    _initialized = true

    document.getElementById('rangelog-add-btn').addEventListener('click', openAddSessionModal)
    document.getElementById('rangelog-export-btn')?.addEventListener('click', exportToCSV)

    // Show skeleton immediately
    document.getElementById('rangelog-content').innerHTML = Utils.skeletonCards(3)

    await Promise.all([loadSessions(), loadLoadoutWeapons(), loadAmmoStock()])
  }

  async function loadLoadoutWeapons() {
    const weaponCategories = ['rifle', 'pistol', 'shotgun', 'smg', 'pcc', 'other_weapon']
    const { data } = await window.sb
      .from('loadout_items')
      .select('id, name, category')
      .eq('user_id', _userId)
      .in('category', weaponCategories)
      .order('created_at', { ascending: true })
    _loadoutWeapons = data || []
  }

  async function loadAmmoStock() {
    const { data } = await window.sb
      .from('shtf_ammo')
      .select('id, caliber, brand, quantity')
      .eq('user_id', _userId)
      .order('caliber')
    _ammoStock = data || []
  }

  async function loadSessions() {
    const { data, error } = await window.sb
      .from('range_sessions')
      .select('*, range_entries(*)')
      .eq('user_id', _userId)
      .order('session_date', { ascending: false })

    if (error) {
      document.getElementById('rangelog-content').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⚠</div>
          <div class="empty-state-title">Error Loading Sessions</div>
          <div class="empty-state-desc">${Utils.esc(error.message)}</div>
        </div>`
      console.error(error)
      return
    }
    _sessions = data || []
    renderStats()
    renderSessions()
  }

  // ── Stats Panel ──────────────────────────────────────────────

  function renderStats() {
    const statsEl = document.getElementById('rangelog-stats')
    if (!statsEl) return

    if (_sessions.length === 0) {
      statsEl.innerHTML = ''
      return
    }

    let totalRounds = 0
    let totalHits = 0
    let totalShots = 0
    const weaponCount = {}
    let bestAccuracy = 0

    _sessions.forEach(session => {
      const entries = session.range_entries || []
      entries.forEach(entry => {
        if (entry.rounds_fired) totalRounds += entry.rounds_fired
        if (entry.hits != null && entry.misses != null) {
          totalHits += entry.hits
          totalShots += (entry.hits + entry.misses)
        }
        if (entry.weapon_used) {
          weaponCount[entry.weapon_used] = (weaponCount[entry.weapon_used] || 0) + 1
        }
      })

      let sHits = 0, sShots = 0
      entries.forEach(e => {
        if (e.hits != null && e.misses != null) {
          sHits += e.hits; sShots += (e.hits + e.misses)
        }
      })
      if (sShots > 0) {
        const acc = Math.round((sHits / sShots) * 100)
        if (acc > bestAccuracy) bestAccuracy = acc
      }
    })

    const lifetimeAccuracy = totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : null
    const mostUsedWeapon = Object.entries(weaponCount).sort((a, b) => b[1] - a[1])[0]
    const lastSession = _sessions[0]

    statsEl.innerHTML = `
      <div class="stats-panel">
        <div class="stat-card">
          <div class="stat-value">${_sessions.length}</div>
          <div class="stat-label">Sessions</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalRounds.toLocaleString()}</div>
          <div class="stat-label">Rounds Fired</div>
        </div>
        ${lifetimeAccuracy !== null ? `
        <div class="stat-card">
          <div class="stat-value">${lifetimeAccuracy}%</div>
          <div class="stat-label">Lifetime Accuracy</div>
        </div>` : ''}
        ${mostUsedWeapon ? `
        <div class="stat-card">
          <div class="stat-value" style="font-size:clamp(0.7rem,2vw,0.9rem);">${Utils.esc(mostUsedWeapon[0])}</div>
          <div class="stat-label">Top Weapon · ${mostUsedWeapon[1]}x</div>
        </div>` : ''}
        ${bestAccuracy > 0 ? `
        <div class="stat-card">
          <div class="stat-value">${bestAccuracy}%</div>
          <div class="stat-label">Best Session</div>
        </div>` : ''}
        ${lastSession ? `
        <div class="stat-card">
          <div class="stat-value" style="font-size:clamp(0.7rem,2vw,0.9rem);">${Utils.formatDateShort(lastSession.session_date)}</div>
          <div class="stat-label">Last Session</div>
        </div>` : ''}
      </div>
    `
  }

  // ── Search / Date Filter ─────────────────────────────────────

  function renderSessions() {
    const container = document.getElementById('rangelog-content')
    container.innerHTML = `
      <div class="rangelog-controls" style="display:flex;flex-wrap:wrap;gap:var(--space-md);align-items:center;margin-bottom:var(--space-md);">
        <div class="search-bar" style="flex:1;min-width:220px;">
          <span class="search-bar-icon">⌕</span>
          <input type="text" id="rangelog-search-input" class="search-bar-input"
            placeholder="Search location, weapon, drill…"
            aria-label="Search range sessions"
            value="${Utils.esc(_searchQuery)}" />
          ${_searchQuery ? `<button class="search-bar-clear" id="rangelog-search-clear" aria-label="Clear search">✕</button>` : ''}
        </div>
        <div class="filter-chips" role="group" aria-label="Date range filter">
          <button class="filter-chip ${_dateFilter === 'all'     ? 'active' : ''}" data-date="all">All</button>
          <button class="filter-chip ${_dateFilter === 'month'   ? 'active' : ''}" data-date="month">This Month</button>
          <button class="filter-chip ${_dateFilter === '3months' ? 'active' : ''}" data-date="3months">3 Months</button>
          <button class="filter-chip ${_dateFilter === 'year'    ? 'active' : ''}" data-date="year">This Year</button>
        </div>
      </div>
      <div id="rangelog-session-list"></div>
    `
    bindSearchControls()
    renderSessionList()
  }

  function bindSearchControls() {
    const input = document.getElementById('rangelog-search-input')
    if (input) {
      let debounceTimer
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          _searchQuery = input.value
          // Update clear button
          const existingClear = document.getElementById('rangelog-search-clear')
          if (_searchQuery && !existingClear) {
            const clearBtn = document.createElement('button')
            clearBtn.className = 'search-bar-clear'
            clearBtn.id = 'rangelog-search-clear'
            clearBtn.setAttribute('aria-label', 'Clear search')
            clearBtn.textContent = '✕'
            clearBtn.addEventListener('click', clearSearch)
            input.parentElement.appendChild(clearBtn)
          } else if (!_searchQuery && existingClear) {
            existingClear.remove()
          }
          renderSessionList()
        }, 200)
      })
    }

    document.getElementById('rangelog-search-clear')?.addEventListener('click', clearSearch)

    document.querySelectorAll('.filter-chip[data-date]').forEach(chip => {
      chip.addEventListener('click', () => {
        _dateFilter = chip.dataset.date
        document.querySelectorAll('.filter-chip[data-date]').forEach(c =>
          c.classList.toggle('active', c === chip)
        )
        renderSessionList()
      })
    })
  }

  function clearSearch() {
    _searchQuery = ''
    const input = document.getElementById('rangelog-search-input')
    if (input) input.value = ''
    document.getElementById('rangelog-search-clear')?.remove()
    renderSessionList()
  }

  function getFilteredSessions() {
    let sessions = _sessions

    if (_dateFilter !== 'all') {
      const now = new Date()
      sessions = sessions.filter(s => {
        const d = new Date(s.session_date)
        if (_dateFilter === 'month') {
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        }
        if (_dateFilter === '3months') {
          const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3)
          return d >= cutoff
        }
        if (_dateFilter === 'year') {
          return d.getFullYear() === now.getFullYear()
        }
        return true
      })
    }

    if (_searchQuery.trim()) {
      const q = _searchQuery.trim().toLowerCase()
      sessions = sessions.filter(s => {
        const entries = s.range_entries || []
        return (
          (s.location   && s.location.toLowerCase().includes(q)) ||
          (s.notes      && s.notes.toLowerCase().includes(q)) ||
          (s.conditions && s.conditions.toLowerCase().includes(q)) ||
          entries.some(e =>
            (e.weapon_used && e.weapon_used.toLowerCase().includes(q)) ||
            (e.caliber     && e.caliber.toLowerCase().includes(q)) ||
            (e.drill_name  && e.drill_name.toLowerCase().includes(q)) ||
            (e.notes       && e.notes.toLowerCase().includes(q))
          )
        )
      })
    }

    return sessions
  }

  function renderSessionList() {
    const container = document.getElementById('rangelog-session-list')
    if (!container) return

    const sessions = getFilteredSessions()

    if (_sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🎯</div>
          <div class="empty-state-title">No Range Sessions Yet</div>
          <div class="empty-state-desc">Start logging your range time to track accuracy, rounds fired, and performance trends.</div>
          <button class="btn btn-primary empty-state-cta" id="rangelog-empty-add-btn">+ New Session</button>
        </div>`
      document.getElementById('rangelog-empty-add-btn')?.addEventListener('click', openAddSessionModal)
      return
    }

    if (sessions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">⌕</div>
          <div class="empty-state-title">No Matching Sessions</div>
          <div class="empty-state-desc">Try a different search term or date range filter.</div>
        </div>`
      return
    }

    container.innerHTML = sessions.map(s => renderSessionCard(s)).join('')
    bindSessionHandlers()
  }

  function renderSessionCard(session) {
    const sid = session.id
    const entries = session.range_entries || []

    const totalRounds = entries.reduce((sum, e) => sum + (e.rounds_fired || 0), 0)
    let hits = 0, shots = 0
    entries.forEach(e => {
      if (e.hits != null && e.misses != null) { hits += e.hits; shots += e.hits + e.misses }
    })
    const accuracy = shots > 0 ? Math.round((hits / shots) * 100) : null
    const weapons = [...new Set(entries.map(e => e.weapon_used).filter(Boolean))]

    const meta = [
      session.location   ? `📍 ${Utils.esc(session.location)}`   : '',
      session.conditions ? `🌤 ${Utils.esc(session.conditions)}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')

    const summaryParts = [
      entries.length > 0 ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}` : null,
      totalRounds > 0    ? `${totalRounds} rds`         : null,
      accuracy !== null  ? `${accuracy}% acc`           : null,
      weapons.length > 0 ? Utils.esc(weapons.join(', ')) : null,
    ].filter(Boolean)

    const summaryBar = summaryParts.length > 0
      ? `<div class="session-summary">${summaryParts.map(p => `<span class="session-summary-stat">${p}</span>`).join('')}</div>`
      : ''

    return `
      <div class="session-card" data-id="${sid}">
        <div class="session-header" role="button" tabindex="0"
          aria-expanded="false" aria-controls="session-body-${sid}">
          <div>
            <div class="session-title">${Utils.formatDateShort(session.session_date)}</div>
            ${meta ? `<div class="session-meta">${meta}</div>` : ''}
            ${session.notes ? `<div class="session-meta" style="margin-top:2px;font-style:italic;">${Utils.esc(session.notes)}</div>` : ''}
            ${summaryBar}
          </div>
          <div class="session-header-right">
            <button class="btn btn-secondary btn-sm edit-session-btn" data-id="${sid}" aria-label="Edit session">Edit</button>
            <button class="btn btn-danger btn-sm delete-session-btn" data-id="${sid}" aria-label="Delete session">✕</button>
            <span class="session-chevron" aria-hidden="true">▼</span>
          </div>
        </div>
        <div class="session-body" id="session-body-${sid}">
          <div class="session-entries-toolbar">
            <span class="session-entries-label">Entries</span>
            <button class="btn btn-primary btn-sm toggle-entry-form-btn" data-session-id="${sid}">+ Add Entry</button>
          </div>
          <div class="entry-cards" id="entry-cards-${sid}">
            ${Utils.skeletonRows(2)}
          </div>
          <div class="entry-inline-form" id="entry-form-${sid}" style="display:none;">
            ${buildInlineEntryFormHTML(sid)}
          </div>
        </div>
      </div>
    `
  }

  // ── Weapon Picker ────────────────────────────────────────────

  function buildWeaponPickerHTML(sid) {
    if (_loadoutWeapons.length === 0) {
      return `
        <input type="text" name="weapon_used" id="ep-weapon-text-${sid}"
          class="form-input" placeholder="e.g. BCM AR15, Glock 19" maxlength="100" />
        <input type="hidden" name="loadout_item_id" value="" />
      `
    }

    const weaponOptions = _loadoutWeapons.map(w => {
      const typeLabel = WEAPON_CATEGORY_LABELS[w.category] || w.category
      return `<option value="${w.id}" data-name="${Utils.esc(w.name)}">${typeLabel} — ${Utils.esc(w.name)}</option>`
    }).join('')

    return `
      <select id="ep-weapon-select-${sid}" class="form-select">
        <option value="">— Select from Loadout —</option>
        ${weaponOptions}
        <option value="__manual__">✏ Type Manually (Rental / Borrowed)</option>
      </select>
      <input type="text" id="ep-weapon-text-${sid}" name="weapon_used"
        class="form-input" placeholder="e.g. Rented AR15, borrowed Glock 19" maxlength="100"
        style="display:none;margin-top:6px;" />
      <input type="hidden" id="ep-loadout-id-${sid}" name="loadout_item_id" value="" />
    `
  }

  // ── Ammo Picker ──────────────────────────────────────────────

  function buildAmmoPickerHTML(sid, selectedAmmoId = '', caliberValue = '') {
    if (_ammoStock.length === 0) {
      return `
        <input type="text" name="caliber" id="ep-ammo-text-${sid}"
          class="form-input" placeholder="e.g. 5.56 M193, 9mm 124gr" maxlength="80"
          value="${Utils.esc(caliberValue)}" />
        <input type="hidden" id="ep-ammo-id-${sid}" name="shtf_ammo_id" value="" />
      `
    }

    const ammoOptions = _ammoStock.map(a => {
      const qty   = a.quantity != null ? `${a.quantity.toLocaleString()} rds` : '? rds'
      const brand = a.brand ? ` — ${Utils.esc(a.brand)}` : ''
      const sel   = selectedAmmoId === a.id ? 'selected' : ''
      return `<option value="${a.id}" data-caliber="${Utils.esc(a.caliber)}" ${sel}>${Utils.esc(a.caliber)}${brand}  (${qty})</option>`
    }).join('')

    const isManual = !selectedAmmoId && caliberValue
    return `
      <select id="ep-ammo-select-${sid}" class="form-select">
        <option value="" ${!selectedAmmoId && !caliberValue ? 'selected' : ''}>— Select from Stockpile —</option>
        ${ammoOptions}
        <option value="__manual__" ${isManual ? 'selected' : ''}>✏ Enter Manually</option>
      </select>
      <input type="text" id="ep-ammo-text-${sid}" name="caliber"
        class="form-input" placeholder="e.g. 5.56 M193, 9mm 124gr" maxlength="80"
        value="${Utils.esc(caliberValue)}"
        style="margin-top:6px;${(selectedAmmoId || !caliberValue) ? 'display:none;' : ''}" />
      <input type="hidden" id="ep-ammo-id-${sid}" name="shtf_ammo_id" value="${Utils.esc(selectedAmmoId || '')}" />
    `
  }

  // ── Inline Entry Form ────────────────────────────────────────

  function buildInlineEntryFormHTML(sid) {
    return `
      <div class="entry-form-title">Log Entry</div>
      <form id="inline-entry-form-${sid}" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Weapon</label>
            <div>${buildWeaponPickerHTML(sid)}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Ammo / Caliber</label>
            <div>${buildAmmoPickerHTML(sid)}</div>
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">Rounds Fired</label>
            <input type="number" name="rounds_fired" class="form-input" placeholder="0" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Distance</label>
            <input type="number" name="distance_value" class="form-input" placeholder="0" min="0" step="0.5" />
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select name="distance_unit" class="form-select">
              <option value="yards">Yards</option>
              <option value="meters">Meters</option>
              <option value="feet">Feet</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Shots on Target (Hits)</label>
            <input type="number" name="hits" class="form-input" placeholder="0" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Misses</label>
            <input type="number" name="misses" class="form-input" placeholder="0" min="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Target Type</label>
            <select name="target_type" class="form-select">
              <option value="">— Select —</option>
              <option value="paper">Paper</option>
              <option value="steel">Steel</option>
              <option value="IPSC">IPSC / IDPA</option>
              <option value="silhouette">Silhouette</option>
              <option value="dueling_tree">Dueling Tree</option>
              <option value="reactive">Reactive</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Drill / Exercise</label>
            <input type="text" name="drill_name" class="form-input" placeholder="e.g. Bill Drill, Dot Torture" maxlength="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Observations, equipment issues, improvements, etc." rows="2"></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary done-entry-form-btn" data-session-id="${sid}">Done</button>
          <button type="submit" class="btn btn-primary">Add Entry</button>
        </div>
      </form>
    `
  }

  // ── Event Bindings ───────────────────────────────────────────

  function bindSessionHandlers() {
    document.querySelectorAll('.session-header').forEach(header => {
      function handleToggle(e) {
        if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return
        if (e.type === 'keydown') e.preventDefault()
        if (e.target.closest('button')) return
        const card = header.closest('.session-card')
        const isExpanded = card.classList.contains('expanded')
        card.classList.toggle('expanded', !isExpanded)
        header.setAttribute('aria-expanded', String(!isExpanded))
        if (!isExpanded) loadEntries(card.dataset.id)
      }
      header.addEventListener('click', handleToggle)
      header.addEventListener('keydown', handleToggle)
    })

    document.querySelectorAll('.edit-session-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        openEditSessionModal(btn.dataset.id)
      })
    })

    document.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation()
        Utils.confirmDialog(
          'Delete this range session and all its entries? This cannot be undone.',
          () => deleteSession(btn.dataset.id),
          'Delete Session'
        )
      })
    })

    document.querySelectorAll('.toggle-entry-form-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sessionId
        const formEl = document.getElementById(`entry-form-${sid}`)
        if (formEl) formEl.style.display = formEl.style.display === 'none' ? '' : 'none'
      })
    })

    document.querySelectorAll('.done-entry-form-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const formEl = document.getElementById(`entry-form-${btn.dataset.sessionId}`)
        if (formEl) formEl.style.display = 'none'
      })
    })

    getFilteredSessions().forEach(s => wireInlineEntryForm(s.id))
  }

  function wireInlineEntryForm(sid) {
    const weaponSelect = document.getElementById(`ep-weapon-select-${sid}`)
    if (weaponSelect) {
      const weaponText  = document.getElementById(`ep-weapon-text-${sid}`)
      const loadoutIdEl = document.getElementById(`ep-loadout-id-${sid}`)
      weaponSelect.addEventListener('change', () => {
        const val = weaponSelect.value
        if (val === '__manual__') {
          weaponText.style.display = ''
          weaponText.focus()
          loadoutIdEl.value = ''
        } else if (val === '') {
          weaponText.style.display = 'none'
          weaponText.value = ''
          loadoutIdEl.value = ''
        } else {
          weaponText.style.display = 'none'
          weaponText.value = ''
          loadoutIdEl.value = val
        }
      })
    }

    const ammoSelect = document.getElementById(`ep-ammo-select-${sid}`)
    if (ammoSelect) {
      const ammoText = document.getElementById(`ep-ammo-text-${sid}`)
      const ammoIdEl = document.getElementById(`ep-ammo-id-${sid}`)
      ammoSelect.addEventListener('change', () => {
        const val = ammoSelect.value
        if (val === '__manual__') {
          ammoText.style.display = ''
          ammoText.value = ''
          ammoText.focus()
          ammoIdEl.value = ''
        } else if (val === '') {
          ammoText.style.display = 'none'
          ammoText.value = ''
          ammoIdEl.value = ''
        } else {
          const opt = ammoSelect.selectedOptions[0]
          ammoText.style.display = 'none'
          ammoText.value = opt.dataset.caliber || ''
          ammoIdEl.value = val
        }
      })
    }

    const form = document.getElementById(`inline-entry-form-${sid}`)
    if (!form) return

    form.addEventListener('submit', async e => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const toInt = v => v ? parseInt(v) : null
      const toNum = v => v ? parseFloat(v) : null

      const loadoutItemId = fd.get('loadout_item_id') || null
      let weaponUsed = fd.get('weapon_used')?.trim() || null

      if (loadoutItemId && !weaponUsed) {
        const match = _loadoutWeapons.find(w => w.id === loadoutItemId)
        if (match) weaponUsed = match.name
      }

      // Resolve caliber: if stockpile item selected, pull caliber from it
      const shtfAmmoId = fd.get('shtf_ammo_id') || null
      let caliber = fd.get('caliber')?.trim() || null
      if (shtfAmmoId && !caliber) {
        const stock = _ammoStock.find(a => a.id === shtfAmmoId)
        if (stock) caliber = stock.caliber
      }

      const roundsFired = toInt(fd.get('rounds_fired'))

      const payload = {
        session_id: sid,
        weapon_used: weaponUsed,
        loadout_item_id: loadoutItemId,
        shtf_ammo_id: shtfAmmoId,
        caliber,
        rounds_fired: roundsFired,
        distance_value: toNum(fd.get('distance_value')),
        distance_unit: fd.get('distance_unit') || 'yards',
        hits: toInt(fd.get('hits')),
        misses: toInt(fd.get('misses')),
        target_type: fd.get('target_type') || null,
        drill_name: fd.get('drill_name').trim() || null,
        notes: fd.get('notes').trim() || null,
      }

      const btn = form.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving…'

      const { error } = await window.sb.from('range_entries').insert(payload)
      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Add Entry'
        return
      }

      // Deduct rounds from ammo stockpile if linked
      if (shtfAmmoId && roundsFired > 0) {
        const stock = _ammoStock.find(a => a.id === shtfAmmoId)
        if (stock) {
          const newQty = Math.max(0, (stock.quantity ?? 0) - roundsFired)
          await window.sb.from('shtf_ammo').update({ quantity: newQty }).eq('id', shtfAmmoId)
          stock.quantity = newQty
        }
      }

      Utils.showToast('Entry added!')
      form.reset()

      // Reset weapon selector
      const wSel = document.getElementById(`ep-weapon-select-${sid}`)
      if (wSel) {
        wSel.value = ''
        const wText = document.getElementById(`ep-weapon-text-${sid}`)
        const ldId  = document.getElementById(`ep-loadout-id-${sid}`)
        if (wText) { wText.style.display = 'none'; wText.value = '' }
        if (ldId)  ldId.value = ''
      }

      // Reset ammo selector
      const aSel = document.getElementById(`ep-ammo-select-${sid}`)
      if (aSel) {
        aSel.value = ''
        const aText = document.getElementById(`ep-ammo-text-${sid}`)
        const aId   = document.getElementById(`ep-ammo-id-${sid}`)
        if (aText) { aText.style.display = 'none'; aText.value = '' }
        if (aId)   aId.value = ''
      }

      btn.disabled = false; btn.textContent = 'Add Entry'

      await loadEntries(sid)
      await refreshSessionData(sid)
    })
  }

  // ── Load & Render Entries ────────────────────────────────────

  async function loadEntries(sessionId) {
    const container = document.getElementById(`entry-cards-${sessionId}`)
    if (!container) return

    const { data, error } = await window.sb
      .from('range_entries')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (error) {
      container.innerHTML = '<p class="loading-text">Error loading entries.</p>'
      return
    }
    renderEntries(sessionId, data || [])
  }

  function renderEntries(sessionId, entries) {
    const container = document.getElementById(`entry-cards-${sessionId}`)
    if (!container) return

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-lg) 0;">
          <div class="empty-state-icon" style="font-size:1.5rem;">📋</div>
          <div class="empty-state-title" style="font-size:0.85rem;">No Entries Yet</div>
          <div class="empty-state-desc" style="font-size:0.75rem;">Hit "+ Add Entry" to log weapons and accuracy.</div>
        </div>`
      return
    }

    container.innerHTML = entries.map(entry => renderEntryCard(entry, sessionId)).join('')

    container.querySelectorAll('.edit-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditEntryModal(btn.dataset.id, btn.dataset.sessionId))
    })

    container.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Utils.confirmDialog(
          'Remove this range entry?',
          () => deleteEntry(btn.dataset.id, btn.dataset.sessionId, btn.dataset.ammoId || null, parseInt(btn.dataset.rounds) || 0),
          'Remove Entry'
        )
      })
    })
  }

  function renderEntryCard(entry, sessionId) {
    const weaponLabel   = entry.weapon_used ? Utils.esc(entry.weapon_used) : 'Unknown Weapon'
    const isFromLoadout = !!entry.loadout_item_id

    const distStr = entry.distance_value
      ? `${entry.distance_value} ${entry.distance_unit || 'yds'}`
      : null

    let accuracyStr = null
    if (entry.hits != null && entry.misses != null) {
      const total = entry.hits + entry.misses
      const pct   = total > 0 ? Math.round((entry.hits / total) * 100) : 0
      accuracyStr = `${entry.hits}/${total} (${pct}%)`
    } else if (entry.hits != null) {
      accuracyStr = `${entry.hits} hits`
    }

    const chips = [
      entry.caliber     ? Utils.esc(entry.caliber)     : null,
      distStr           ? Utils.esc(distStr)            : null,
      entry.target_type ? Utils.esc(entry.target_type) : null,
    ].filter(Boolean)

    const hasDetail = entry.rounds_fired != null || accuracyStr || entry.drill_name || entry.notes

    return `
      <div class="entry-card">
        <div class="entry-card-header">
          <span class="entry-weapon-badge${isFromLoadout ? ' entry-weapon-loadout' : ''}">${weaponLabel}</span>
          ${chips.map(c => `<span class="entry-detail-chip">${c}</span>`).join('')}
          <div style="margin-left:auto;flex-shrink:0;display:flex;gap:4px;">
            <button class="btn btn-secondary btn-sm edit-entry-btn"
              data-id="${entry.id}" data-session-id="${sessionId}"
              aria-label="Edit entry">Edit</button>
            <button class="btn btn-danger btn-sm delete-entry-btn"
              data-id="${entry.id}" data-session-id="${sessionId}"
              data-ammo-id="${entry.shtf_ammo_id || ''}"
              data-rounds="${entry.rounds_fired || 0}"
              aria-label="Remove entry">✕</button>
          </div>
        </div>
        ${hasDetail ? `
        <div class="entry-card-detail">
          ${entry.rounds_fired != null ? `<span>Rounds: ${entry.rounds_fired}</span>` : ''}
          ${accuracyStr ? `<span>${accuracyStr}</span>` : ''}
          ${entry.drill_name ? `<span>Drill: ${Utils.esc(entry.drill_name)}</span>` : ''}
          ${entry.notes ? `<div class="entry-card-notes">${Utils.esc(entry.notes)}</div>` : ''}
        </div>` : ''}
      </div>
    `
  }

  // ── Refresh session in-place for stats panel ─────────────────

  async function refreshSessionData(sessionId) {
    const { data } = await window.sb
      .from('range_entries').select('*').eq('session_id', sessionId)
    if (!data) return
    const idx = _sessions.findIndex(s => s.id === sessionId)
    if (idx >= 0) {
      _sessions[idx].range_entries = data
      renderStats()
    }
  }

  // ── Edit Handlers ────────────────────────────────────────────

  function openEditSessionModal(sessionId) {
    const session = _sessions.find(s => String(s.id) === String(sessionId))
    if (!session) return

    Utils.openModal('Edit Session', `
      <form id="edit-session-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label">Date <span style="color:var(--color-red)">*</span></label>
          <input type="date" name="session_date" class="form-input" value="${Utils.esc(session.session_date)}" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Location / Range</label>
            <input type="text" name="location" class="form-input" value="${Utils.esc(session.location || '')}" placeholder="e.g. Elm Fork, Backyard" maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Conditions / Weather</label>
            <input type="text" name="conditions" class="form-input" value="${Utils.esc(session.conditions || '')}" placeholder="e.g. Sunny, 75°F, light wind" maxlength="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Session Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(session.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="edit-session-submit">Save Changes</button>
        </div>
      </form>
    `)

    document.getElementById('edit-session-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('edit-session-submit')
      btn.disabled = true; btn.textContent = 'Saving…'

      const { error } = await window.sb
        .from('range_sessions')
        .update({
          session_date: fd.get('session_date'),
          location:     fd.get('location').trim()   || null,
          conditions:   fd.get('conditions').trim() || null,
          notes:        fd.get('notes').trim()      || null,
        })
        .eq('id', sessionId)

      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Save Changes'
        return
      }
      Utils.closeModal()
      Utils.showToast('Session updated.')
      await loadSessions()
    })
  }

  async function openEditEntryModal(entryId, sessionId) {
    const { data: entry, error } = await window.sb
      .from('range_entries').select('*').eq('id', entryId).single()
    if (error || !entry) { Utils.showToast('Could not load entry.', 'error'); return }

    const weaponOptions = _loadoutWeapons.length > 0
      ? `<select id="edit-ep-weapon-select" class="form-select">
           <option value="">— Select from Loadout —</option>
           ${_loadoutWeapons.map(w => {
             const typeLabel = WEAPON_CATEGORY_LABELS[w.category] || w.category
             return `<option value="${w.id}" data-name="${Utils.esc(w.name)}">${typeLabel} — ${Utils.esc(w.name)}</option>`
           }).join('')}
           <option value="__manual__">✏ Type Manually</option>
         </select>
         <input type="text" id="edit-ep-weapon-text" name="weapon_used"
           class="form-input" value="${Utils.esc(entry.weapon_used || '')}"
           placeholder="e.g. BCM AR15, Glock 19" maxlength="100"
           style="margin-top:6px;${entry.loadout_item_id ? 'display:none;' : ''}" />
         <input type="hidden" id="edit-ep-loadout-id" name="loadout_item_id" value="${Utils.esc(entry.loadout_item_id || '')}" />`
      : `<input type="text" name="weapon_used" class="form-input"
           value="${Utils.esc(entry.weapon_used || '')}"
           placeholder="e.g. BCM AR15, Glock 19" maxlength="100" />
         <input type="hidden" name="loadout_item_id" value="" />`

    Utils.openModal('Edit Entry', `
      <form id="edit-entry-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Weapon</label>
            <div>${weaponOptions}</div>
          </div>
          <div class="form-group">
            <label class="form-label">Ammo / Caliber</label>
            <div>${buildAmmoPickerHTML('edit', entry.shtf_ammo_id || '', entry.caliber || '')}</div>
          </div>
        </div>
        <div class="form-row-3">
          <div class="form-group">
            <label class="form-label">Rounds Fired</label>
            <input type="number" name="rounds_fired" class="form-input"
              value="${entry.rounds_fired ?? ''}" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Distance</label>
            <input type="number" name="distance_value" class="form-input"
              value="${entry.distance_value ?? ''}" min="0" step="0.5" />
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <select name="distance_unit" class="form-select">
              <option value="yards"  ${entry.distance_unit === 'yards'  ? 'selected' : ''}>Yards</option>
              <option value="meters" ${entry.distance_unit === 'meters' ? 'selected' : ''}>Meters</option>
              <option value="feet"   ${entry.distance_unit === 'feet'   ? 'selected' : ''}>Feet</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Hits</label>
            <input type="number" name="hits" class="form-input"
              value="${entry.hits ?? ''}" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Misses</label>
            <input type="number" name="misses" class="form-input"
              value="${entry.misses ?? ''}" min="0" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Target Type</label>
            <select name="target_type" class="form-select">
              <option value="" ${!entry.target_type ? 'selected' : ''}>— Select —</option>
              <option value="paper"        ${entry.target_type === 'paper'        ? 'selected' : ''}>Paper</option>
              <option value="steel"        ${entry.target_type === 'steel'        ? 'selected' : ''}>Steel</option>
              <option value="IPSC"         ${entry.target_type === 'IPSC'         ? 'selected' : ''}>IPSC / IDPA</option>
              <option value="silhouette"   ${entry.target_type === 'silhouette'   ? 'selected' : ''}>Silhouette</option>
              <option value="dueling_tree" ${entry.target_type === 'dueling_tree' ? 'selected' : ''}>Dueling Tree</option>
              <option value="reactive"     ${entry.target_type === 'reactive'     ? 'selected' : ''}>Reactive</option>
              <option value="other"        ${entry.target_type === 'other'        ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Drill / Exercise</label>
            <input type="text" name="drill_name" class="form-input"
              value="${Utils.esc(entry.drill_name || '')}" maxlength="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(entry.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="edit-entry-submit">Save Changes</button>
        </div>
      </form>
    `)

    // Wire weapon picker if loadout weapons exist
    const weaponSelect = document.getElementById('edit-ep-weapon-select')
    if (weaponSelect) {
      if (entry.loadout_item_id) weaponSelect.value = entry.loadout_item_id
      weaponSelect.addEventListener('change', () => {
        const val     = weaponSelect.value
        const textEl  = document.getElementById('edit-ep-weapon-text')
        const ldIdEl  = document.getElementById('edit-ep-loadout-id')
        if (val === '__manual__') {
          textEl.style.display = ''
          textEl.focus()
          ldIdEl.value = ''
        } else if (val === '') {
          textEl.style.display = 'none'
          textEl.value = ''
          ldIdEl.value = ''
        } else {
          textEl.style.display = 'none'
          textEl.value = ''
          ldIdEl.value = val
        }
      })
    }

    // Wire ammo picker
    const ammoSelect = document.getElementById('ep-ammo-select-edit')
    if (ammoSelect) {
      ammoSelect.addEventListener('change', () => {
        const val    = ammoSelect.value
        const textEl = document.getElementById('ep-ammo-text-edit')
        const idEl   = document.getElementById('ep-ammo-id-edit')
        if (val === '__manual__') {
          textEl.style.display = ''
          textEl.value = ''
          textEl.focus()
          idEl.value = ''
        } else if (val === '') {
          textEl.style.display = 'none'
          textEl.value = ''
          idEl.value = ''
        } else {
          const opt = ammoSelect.selectedOptions[0]
          textEl.style.display = 'none'
          textEl.value = opt.dataset.caliber || ''
          idEl.value = val
        }
      })
    }

    document.getElementById('edit-entry-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('edit-entry-submit')
      btn.disabled = true; btn.textContent = 'Saving…'

      const toInt = v => (v !== '' && v != null) ? parseInt(v)   : null
      const toNum = v => (v !== '' && v != null) ? parseFloat(v) : null

      const loadoutItemId = fd.get('loadout_item_id') || null
      let weaponUsed = fd.get('weapon_used')?.trim() || null
      if (loadoutItemId && !weaponUsed) {
        const match = _loadoutWeapons.find(w => w.id === loadoutItemId)
        if (match) weaponUsed = match.name
      }

      const newAmmoId  = fd.get('shtf_ammo_id') || null
      const newRounds  = toInt(fd.get('rounds_fired'))
      const origAmmoId = entry.shtf_ammo_id || null
      const origRounds = entry.rounds_fired || 0

      // Resolve caliber from stockpile if needed
      let caliber = fd.get('caliber')?.trim() || null
      if (newAmmoId && !caliber) {
        const stock = _ammoStock.find(a => a.id === newAmmoId)
        if (stock) caliber = stock.caliber
      }

      const { error } = await window.sb
        .from('range_entries')
        .update({
          weapon_used:     weaponUsed,
          loadout_item_id: loadoutItemId,
          shtf_ammo_id:    newAmmoId,
          caliber,
          rounds_fired:    newRounds,
          distance_value:  toNum(fd.get('distance_value')),
          distance_unit:   fd.get('distance_unit') || 'yards',
          hits:            toInt(fd.get('hits')),
          misses:          toInt(fd.get('misses')),
          target_type:     fd.get('target_type')         || null,
          drill_name:      fd.get('drill_name').trim()   || null,
          notes:           fd.get('notes').trim()        || null,
        })
        .eq('id', entryId)

      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Save Changes'
        return
      }

      // Adjust ammo inventory if ammo link or rounds changed
      const sameAmmo   = origAmmoId === newAmmoId
      const sameRounds = origRounds === (newRounds || 0)
      if (!sameAmmo || !sameRounds) {
        // Restore original deduction
        if (origAmmoId && origRounds > 0) {
          const stock = _ammoStock.find(a => a.id === origAmmoId)
          if (stock) {
            stock.quantity = (stock.quantity ?? 0) + origRounds
            await window.sb.from('shtf_ammo').update({ quantity: stock.quantity }).eq('id', origAmmoId)
          }
        }
        // Apply new deduction
        if (newAmmoId && (newRounds || 0) > 0) {
          const stock = _ammoStock.find(a => a.id === newAmmoId)
          if (stock) {
            const newQty = Math.max(0, (stock.quantity ?? 0) - (newRounds || 0))
            stock.quantity = newQty
            await window.sb.from('shtf_ammo').update({ quantity: newQty }).eq('id', newAmmoId)
          }
        }
      }

      Utils.closeModal()
      Utils.showToast('Entry updated.')
      await loadEntries(sessionId)
      await refreshSessionData(sessionId)
    })
  }

  // ── Delete Handlers ──────────────────────────────────────────

  async function deleteSession(id) {
    const { error } = await window.sb.from('range_sessions').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Session deleted.')
    await loadSessions()
  }

  async function deleteEntry(id, sessionId, ammoId, rounds) {
    // Restore rounds to ammo inventory if this entry was linked
    if (ammoId && rounds > 0) {
      const stock = _ammoStock.find(a => a.id === ammoId)
      if (stock) {
        stock.quantity = (stock.quantity ?? 0) + rounds
        await window.sb.from('shtf_ammo').update({ quantity: stock.quantity }).eq('id', ammoId)
      }
    }
    const { error } = await window.sb.from('range_entries').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Entry removed.')
    await loadEntries(sessionId)
    await refreshSessionData(sessionId)
  }

  // ── CSV Export ───────────────────────────────────────────────

  function exportToCSV() {
    if (_sessions.length === 0) {
      Utils.showToast('No sessions to export.', 'info')
      return
    }

    const rows = [
      ['Session Date', 'Location', 'Conditions', 'Session Notes',
       'Weapon', 'Caliber', 'Rounds Fired', 'Distance', 'Hits', 'Misses', 'Accuracy %',
       'Target Type', 'Drill', 'Entry Notes'],
    ]

    _sessions.forEach(session => {
      const entries = session.range_entries || []
      if (entries.length === 0) {
        rows.push([
          session.session_date, session.location || '', session.conditions || '', session.notes || '',
          '', '', '', '', '', '', '', '', '', '',
        ])
      } else {
        entries.forEach(entry => {
          const total    = (entry.hits != null && entry.misses != null) ? entry.hits + entry.misses : null
          const accuracy = total > 0 ? Math.round((entry.hits / total) * 100) : ''
          const distance = entry.distance_value ? `${entry.distance_value} ${entry.distance_unit || 'yards'}` : ''
          rows.push([
            session.session_date,
            session.location   || '',
            session.conditions || '',
            session.notes      || '',
            entry.weapon_used  || '',
            entry.caliber      || '',
            entry.rounds_fired != null ? entry.rounds_fired : '',
            distance,
            entry.hits   != null ? entry.hits   : '',
            entry.misses != null ? entry.misses : '',
            accuracy,
            entry.target_type || '',
            entry.drill_name  || '',
            entry.notes       || '',
          ])
        })
      }
    })

    const csv = rows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `range-log-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    Utils.showToast('Log exported to CSV!')
  }

  // ── Add Session Modal ────────────────────────────────────────

  function openAddSessionModal() {
    const today = new Date().toISOString().split('T')[0]
    Utils.openModal('New Range Session', `
      <form id="session-form">
        <div class="form-group">
          <label class="form-label">Date <span style="color:var(--color-red)">*</span></label>
          <input type="date" name="session_date" class="form-input" value="${today}" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Location / Range</label>
            <input type="text" name="location" class="form-input" placeholder="e.g. Elm Fork, Backyard" maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Conditions / Weather</label>
            <input type="text" name="conditions" class="form-input" placeholder="e.g. Sunny, 75°F, light wind" maxlength="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Session Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Goals, overall summary, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Session</button>
        </div>
      </form>
    `)

    document.getElementById('session-form').addEventListener('submit', async e => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const payload = {
        user_id:      _userId,
        session_date: fd.get('session_date'),
        location:     fd.get('location').trim()   || null,
        conditions:   fd.get('conditions').trim() || null,
        notes:        fd.get('notes').trim()      || null,
      }
      const btn = e.target.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving…'

      const { error } = await window.sb.from('range_sessions').insert(payload)
      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Create Session'
        return
      }
      Utils.closeModal()
      Utils.showToast('Session logged!')
      await loadSessions()
    })
  }

  return { init }
})()
