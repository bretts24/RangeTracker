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
    const meta = [
      session.location   ? `📍 ${Utils.esc(session.location)}`   : '',
      session.conditions ? `🌤 ${Utils.esc(session.conditions)}` : '',
    ].filter(Boolean).join(' &nbsp;·&nbsp; ')

    return `
      <div class="session-card" data-id="${session.id}">
        <div class="session-header">
          <div>
            <div class="session-title">${Utils.formatDateShort(session.session_date)}</div>
            ${meta ? `<div class="session-meta">${meta}</div>` : ''}
            ${session.notes ? `<div class="session-meta" style="margin-top:2px;font-style:italic;">${Utils.esc(session.notes)}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-sm);">
            <button class="btn btn-danger delete-session-btn btn-sm" data-id="${session.id}">Delete</button>
            <span class="session-chevron">▼</span>
          </div>
        </div>
        <div class="session-body">
          <div class="session-entries-toolbar">
            <span class="session-entries-label">Entries</span>
            <button class="btn btn-primary btn-sm add-entry-btn" data-session-id="${session.id}">+ Add Entry</button>
          </div>
          <div id="entries-${session.id}">
            <p class="loading-text" style="padding:var(--space-md);">Loading entries...</p>
          </div>
        </div>
      </div>
    `
  }

  function bindSessionHandlers() {
    document.querySelectorAll('.session-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return
        const card = header.closest('.session-card')
        const wasExpanded = card.classList.contains('expanded')
        card.classList.toggle('expanded', !wasExpanded)
        if (!wasExpanded) loadEntries(card.dataset.id)
      })
    })

    document.querySelectorAll('.delete-session-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteSession(btn.dataset.id))
    })

    document.querySelectorAll('.add-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => openAddEntryModal(btn.dataset.sessionId))
    })
  }

  async function loadEntries(sessionId) {
    const container = document.getElementById(`entries-${sessionId}`)
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
    const container = document.getElementById(`entries-${sessionId}`)
    if (entries.length === 0) {
      container.innerHTML = '<p class="loading-text" style="padding:var(--space-md);">No entries yet for this session.</p>'
      return
    }

    const rows = entries.map(entry => {
      const dist = entry.distance_value ? `${entry.distance_value} ${entry.distance_unit || 'yds'}` : '—'
      const accuracy = (entry.hits != null && entry.misses != null)
        ? `${entry.hits} hits / ${entry.misses} miss`
        : (entry.hits != null ? `${entry.hits} hits` : '—')

      // Show loadout indicator if weapon came from loadout
      const weaponDisplay = entry.weapon_used
        ? (entry.loadout_item_id
            ? `${Utils.esc(entry.weapon_used)} <span class="loadout-tag">loadout</span>`
            : Utils.esc(entry.weapon_used))
        : '—'

      return `
        <tr>
          <td>${weaponDisplay}</td>
          <td>${Utils.esc(entry.caliber || '—')}</td>
          <td>${entry.rounds_fired != null ? entry.rounds_fired : '—'}</td>
          <td>${dist}</td>
          <td>${accuracy}</td>
          <td>${Utils.esc(entry.target_type || '—')}</td>
          <td>${Utils.esc(entry.drill_name || '—')}</td>
          <td>${Utils.esc(entry.notes || '—')}</td>
          <td><button class="btn btn-danger btn-sm delete-entry-btn" data-id="${entry.id}" data-session-id="${sessionId}">✕</button></td>
        </tr>
      `
    }).join('')

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Weapon</th>
              <th>Caliber / Ammo</th>
              <th>Rounds</th>
              <th>Distance</th>
              <th>Accuracy</th>
              <th>Target</th>
              <th>Drill</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `

    container.querySelectorAll('.delete-entry-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteEntry(btn.dataset.id, btn.dataset.sessionId))
    })
  }

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

  function buildWeaponPickerHTML() {
    if (_loadoutWeapons.length === 0) {
      // No loadout weapons — just show text input
      return `
        <input type="text" name="weapon_used" id="ep-weapon-text"
          class="form-input" placeholder="e.g. BCM AR15, Glock 19" maxlength="100" />
        <input type="hidden" name="loadout_item_id" value="" />
      `
    }

    const weaponOptions = _loadoutWeapons.map(w => {
      const typeLabel = WEAPON_CATEGORY_LABELS[w.category] || w.category
      return `<option value="${w.id}" data-name="${Utils.esc(w.name)}">${typeLabel} — ${Utils.esc(w.name)}</option>`
    }).join('')

    return `
      <select id="ep-weapon-select" class="form-select">
        <option value="">— Select from Loadout —</option>
        ${weaponOptions}
        <option value="__manual__">✏ Type Manually (Rental / Borrowed)</option>
      </select>
      <input type="text" id="ep-weapon-text" name="weapon_used"
        class="form-input" placeholder="e.g. Rented AR15, borrowed Glock 19" maxlength="100"
        style="display:none;margin-top:6px;" />
      <input type="hidden" id="ep-loadout-id" name="loadout_item_id" value="" />
    `
  }

  function openAddEntryModal(sessionId) {
    Utils.openModal('Add Range Entry', `
      <form id="entry-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Weapon Used</label>
            <div class="weapon-picker">${buildWeaponPickerHTML()}</div>
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
            <label class="form-label">Hits</label>
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
            <label class="form-label">Drill / Exercise Name</label>
            <input type="text" name="drill_name" class="form-input" placeholder="e.g. Bill Drill, Dot Torture" maxlength="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Observations, equipment issues, improvements, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Entry</button>
        </div>
      </form>
    `)

    // Wire up weapon picker if loadout weapons are available
    const weaponSelect = document.getElementById('ep-weapon-select')
    if (weaponSelect) {
      const weaponText = document.getElementById('ep-weapon-text')
      const loadoutIdInput = document.getElementById('ep-loadout-id')

      weaponSelect.addEventListener('change', () => {
        const val = weaponSelect.value
        if (val === '__manual__') {
          weaponText.style.display = ''
          weaponText.focus()
          loadoutIdInput.value = ''
        } else if (val === '') {
          weaponText.style.display = 'none'
          weaponText.value = ''
          loadoutIdInput.value = ''
        } else {
          weaponText.style.display = 'none'
          weaponText.value = ''
          loadoutIdInput.value = val
        }
      })
    }

    document.getElementById('entry-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const toInt = v => v ? parseInt(v) : null
      const toNum = v => v ? parseFloat(v) : null

      // Resolve weapon info
      const loadoutItemId = fd.get('loadout_item_id') || null
      let weaponUsed = fd.get('weapon_used')?.trim() || null

      // If a loadout weapon was selected, use its name as weapon_used text
      if (loadoutItemId && !weaponUsed) {
        const match = _loadoutWeapons.find(w => w.id === loadoutItemId)
        if (match) weaponUsed = match.name
      }

      const payload = {
        session_id: sessionId,
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

      const btn = e.target.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving...'

      const { error } = await window.sb.from('range_entries').insert(payload)
      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Add Entry'
        return
      }
      Utils.closeModal()
      Utils.showToast('Entry added!')
      await loadEntries(sessionId)
    })
  }

  return { init }
})()
