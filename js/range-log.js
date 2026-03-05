// Range Log Module
window.RangeLogModule = (() => {
  let _userId = null
  let _initialized = false
  let _sessions = []
  let _loadoutWeapons = []

  const WEAPON_CATEGORY_LABELS = {
    rifle: 'Rifle', pistol: 'Pistol', shotgun: 'Shotgun',
    smg: 'SMG', pcc: 'PCC', other_weapon: 'Other',
  }

  async function init(userId) {
    if (_initialized) return
    _userId = userId
    _initialized = true
    document.getElementById('rangelog-add-btn').addEventListener('click', openAddSessionModal)
    await Promise.all([loadSessions(), loadLoadoutWeapons()])
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

  async function loadSessions() {
    const { data, error } = await window.sb
      .from('range_sessions')
      .select('*')
      .eq('user_id', _userId)
      .order('session_date', { ascending: false })

    if (error) {
      document.getElementById('rangelog-content').innerHTML = '<p class="loading-text">Error loading sessions.</p>'
      console.error(error)
      return
    }
    _sessions = data || []
    renderSessions()
  }

  function renderSessions() {
    const container = document.getElementById('rangelog-content')
    if (_sessions.length === 0) {
      container.innerHTML = '<p class="loading-text">No range sessions yet. Hit "+ New Session" to log one.</p>'
      return
    }
    container.innerHTML = _sessions.map(s => renderSessionCard(s)).join('')
    bindSessionHandlers()
  }

  function renderSessionCard(session) {
    const sid = session.id
    const meta = [
      session.location   ? `📍 ${Utils.esc(session.location)}`   : '',
      session.conditions ? `🌤 ${Utils.esc(session.conditions)}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')

    return `
      <div class="session-card" data-id="${sid}">
        <div class="session-header">
          <div>
            <div class="session-title">${Utils.formatDateShort(session.session_date)}</div>
            ${meta ? `<div class="session-meta">${meta}</div>` : ''}
            ${session.notes ? `<div class="session-meta" style="margin-top:2px;font-style:italic;">${Utils.esc(session.notes)}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <button class="btn btn-danger delete-session-btn btn-sm" data-id="${sid}">Delete</button>
            <span class="session-chevron">▼</span>
          </div>
        </div>
        <div class="session-body">
          <div class="session-entries-toolbar">
            <span class="session-entries-label">Entries</span>
            <button class="btn btn-primary btn-sm toggle-entry-form-btn" data-session-id="${sid}">+ Add Entry</button>
          </div>
          <div class="entry-cards" id="entry-cards-${sid}">
            <p class="loading-text" style="padding:var(--space-md) 0;">Loading entries...</p>
          </div>
          <div class="entry-inline-form" id="entry-form-${sid}" style="display:none;">
            ${buildInlineEntryFormHTML(sid)}
          </div>
        </div>
      </div>
    `
  }

  // ── Weapon Picker (session-scoped IDs) ───────────────────────

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

  // ── Inline Entry Form HTML ───────────────────────────────────

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
            <label class="form-label">Caliber / Ammo Type</label>
            <input type="text" name="caliber" class="form-input" placeholder="e.g. 5.56 M193, 9mm 124gr" maxlength="80" />
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
    // Expand / collapse session
    document.querySelectorAll('.session-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return
        const card = header.closest('.session-card')
        const wasExpanded = card.classList.contains('expanded')
        card.classList.toggle('expanded', !wasExpanded)
        if (!wasExpanded) loadEntries(card.dataset.id)
      })
    })

    // Delete session
    document.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteSession(btn.dataset.id))
    })

    // Toggle inline entry form visibility
    document.querySelectorAll('.toggle-entry-form-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.dataset.sessionId
        const formEl = document.getElementById(`entry-form-${sid}`)
        formEl.style.display = formEl.style.display === 'none' ? '' : 'none'
      })
    })

    // Done button inside inline form
    document.querySelectorAll('.done-entry-form-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const formEl = document.getElementById(`entry-form-${btn.dataset.sessionId}`)
        if (formEl) formEl.style.display = 'none'
      })
    })

    // Wire weapon pickers and form submits for each session
    _sessions.forEach(s => wireInlineEntryForm(s.id))
  }

  function wireInlineEntryForm(sid) {
    // Weapon picker: loadout select ↔ manual text toggle
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

    // Form submit
    const form = document.getElementById(`inline-entry-form-${sid}`)
    if (!form) return

    form.addEventListener('submit', async (e) => {
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

      const payload = {
        session_id: sid,
        weapon_used: weaponUsed,
        loadout_item_id: loadoutItemId,
        caliber: fd.get('caliber').trim() || null,
        rounds_fired: toInt(fd.get('rounds_fired')),
        distance_value: toNum(fd.get('distance_value')),
        distance_unit: fd.get('distance_unit') || 'yards',
        hits: toInt(fd.get('hits')),
        misses: toInt(fd.get('misses')),
        target_type: fd.get('target_type') || null,
        drill_name: fd.get('drill_name').trim() || null,
        notes: fd.get('notes').trim() || null,
      }

      const btn = form.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving...'

      const { error } = await window.sb.from('range_entries').insert(payload)
      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Add Entry'
        return
      }

      Utils.showToast('Entry added!')

      // Reset form but keep it open for the next entry
      form.reset()
      if (weaponSelect) {
        weaponSelect.value = ''
        const weaponText  = document.getElementById(`ep-weapon-text-${sid}`)
        const loadoutIdEl = document.getElementById(`ep-loadout-id-${sid}`)
        if (weaponText)  { weaponText.style.display = 'none'; weaponText.value = '' }
        if (loadoutIdEl) loadoutIdEl.value = ''
      }
      btn.disabled = false; btn.textContent = 'Add Entry'

      await loadEntries(sid)
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
      container.innerHTML = '<p class="loading-text" style="padding:var(--space-md) 0;">No entries yet — hit "+ Add Entry" to start logging.</p>'
      return
    }

    container.innerHTML = entries.map(entry => renderEntryCard(entry, sessionId)).join('')

    container.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(btn.dataset.id, btn.dataset.sessionId))
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
      accuracyStr = `${entry.hits}/${total} hits (${pct}%)`
    } else if (entry.hits != null) {
      accuracyStr = `${entry.hits} hits`
    }

    const chips = [
      entry.caliber     ? Utils.esc(entry.caliber)      : null,
      distStr           ? Utils.esc(distStr)             : null,
      entry.target_type ? Utils.esc(entry.target_type)  : null,
    ].filter(Boolean)

    const hasDetail = entry.rounds_fired != null || accuracyStr || entry.drill_name || entry.notes

    return `
      <div class="entry-card">
        <div class="entry-card-header">
          <span class="entry-weapon-badge${isFromLoadout ? ' entry-weapon-loadout' : ''}">${weaponLabel}</span>
          ${chips.map(c => `<span class="entry-detail-chip">${c}</span>`).join('')}
          <button class="btn btn-danger btn-sm delete-entry-btn"
            data-id="${entry.id}" data-session-id="${sessionId}"
            style="margin-left:auto;flex-shrink:0;">✕</button>
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

  // ── Delete Handlers ──────────────────────────────────────────

  async function deleteSession(id) {
    if (!confirm('Delete this range session and all its entries?')) return
    const { error } = await window.sb.from('range_sessions').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Session deleted.')
    await loadSessions()
  }

  async function deleteEntry(id, sessionId) {
    if (!confirm('Remove this entry?')) return
    const { error } = await window.sb.from('range_entries').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Entry removed.')
    await loadEntries(sessionId)
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

    document.getElementById('session-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const payload = {
        user_id: _userId,
        session_date: fd.get('session_date'),
        location: fd.get('location').trim() || null,
        conditions: fd.get('conditions').trim() || null,
        notes: fd.get('notes').trim() || null,
      }
      const btn = e.target.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving...'

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
