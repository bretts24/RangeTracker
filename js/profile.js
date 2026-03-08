// Profile page orchestrator — runs last, after all modules are defined
;(async function () {
  Utils.initModal()
  Utils.initBackToTop()

  const userId = Utils.getParam('userId')
  if (!userId) {
    window.location.href = '/index.html'
    return
  }

  // ── Load user ──────────────────────────────────────────────
  const { data: user, error } = await window.sb
    .from('users')
    .select('id, name, color')
    .eq('id', userId)
    .single()

  if (error || !user) {
    Utils.showToast('Operator not found.', 'error')
    setTimeout(() => { window.location.href = '/index.html' }, 1500)
    return
  }

  document.title = `${user.name} — LastStandLog`

  const profileNameEl   = document.getElementById('profile-name')
  const profileAvatarEl = document.getElementById('profile-avatar')
  const siteSubtitleEl  = document.getElementById('site-subtitle')

  profileNameEl.textContent = user.name
  profileAvatarEl.textContent = user.name.charAt(0).toUpperCase()
  if (user.color) profileAvatarEl.dataset.color = user.color
  if (siteSubtitleEl) siteSubtitleEl.textContent = user.name

  // ── Profile stats row (populated after loadout loads) ─────
  function updateProfileStats(weapons, attachments, gear) {
    const row = document.getElementById('profile-stats-row')
    if (!row) return
    const parts = []
    if (weapons    != null) parts.push(`<span>${weapons}</span> WEAPONS`)
    if (attachments != null) parts.push(`<span>${attachments}</span> PARTS`)
    if (gear       != null) parts.push(`<span>${gear}</span> GEAR`)
    row.innerHTML = parts.map(p => `<span class="profile-stat-badge">${p}</span>`).join('')
  }
  window._updateProfileStats = updateProfileStats

  // ── Edit operator name (inline) ────────────────────────────
  const editNameBtn = document.getElementById('profile-edit-name-btn')
  if (editNameBtn) {
    editNameBtn.addEventListener('click', () => {
      const currentName = profileNameEl.textContent
      // Replace name with input
      const nameRow = document.getElementById('profile-name-row')
      nameRow.innerHTML = `
        <input id="profile-name-input" class="profile-name-input form-input"
          value="${Utils.esc(currentName)}" maxlength="50" autocomplete="off" />
        <button class="btn btn-primary btn-sm" id="profile-name-save">Save</button>
        <button class="btn btn-secondary btn-sm" id="profile-name-cancel">Cancel</button>
      `
      const input = document.getElementById('profile-name-input')
      input.focus()
      input.select()

      async function saveName() {
        const newName = input.value.trim()
        if (!newName) { input.focus(); return }
        if (newName === currentName) { restoreNameDisplay(currentName); return }

        const saveBtn = document.getElementById('profile-name-save')
        saveBtn.disabled = true; saveBtn.textContent = '...'
        const { error: updateErr } = await window.sb
          .from('users').update({ name: newName }).eq('id', userId)

        if (updateErr) {
          Utils.showToast('Save failed: ' + updateErr.message, 'error')
          saveBtn.disabled = false; saveBtn.textContent = 'Save'
          return
        }
        document.title = `${newName} — LastStandLog`
        if (siteSubtitleEl) siteSubtitleEl.textContent = newName
        profileAvatarEl.textContent = newName.charAt(0).toUpperCase()
        restoreNameDisplay(newName)
        Utils.showToast('Name updated!')
      }

      function restoreNameDisplay(name) {
        const nameRow = document.getElementById('profile-name-row')
        nameRow.innerHTML = `
          <span id="profile-name" class="profile-name">${Utils.esc(name)}</span>
          <button id="profile-edit-name-btn" class="profile-edit-btn" title="Edit name" aria-label="Edit operator name">✎</button>
        `
        document.getElementById('profile-edit-name-btn').addEventListener('click', arguments.callee.caller || (() => editNameBtn.click()))
        bindEditNameBtn()
      }

      document.getElementById('profile-name-save').addEventListener('click', saveName)
      document.getElementById('profile-name-cancel').addEventListener('click', () => restoreNameDisplay(currentName))
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveName()
        if (e.key === 'Escape') restoreNameDisplay(currentName)
      })
    })
  }

  function bindEditNameBtn() {
    const btn = document.getElementById('profile-edit-name-btn')
    if (!btn) return
    btn.addEventListener('click', () => {
      document.getElementById('profile-edit-name-btn').dispatchEvent(new MouseEvent('click'))
    })
  }

  // ── Profile dropdown menu ─────────────────────────────────
  const menuBtn = document.getElementById('profile-menu-btn')
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      let existing = document.getElementById('profile-dropdown')
      if (existing) { existing.remove(); return }

      const dropdown = document.createElement('div')
      dropdown.id = 'profile-dropdown'
      dropdown.className = 'profile-dropdown'
      dropdown.innerHTML = `
        <button class="profile-dropdown-item" id="pdd-export">📤 Export Data</button>
        <div class="profile-dropdown-divider"></div>
        <button class="profile-dropdown-item danger" id="pdd-delete">🗑 Delete Operator</button>
      `
      menuBtn.closest('.profile-header-actions-wrap').appendChild(dropdown)

      document.getElementById('pdd-export').addEventListener('click', () => {
        dropdown.remove()
        exportOperatorData()
      })
      document.getElementById('pdd-delete').addEventListener('click', () => {
        dropdown.remove()
        Utils.confirmDialog(
          `Permanently delete operator "${profileNameEl.textContent}"? All loadout, range sessions, and SHTF data will be lost.`,
          async () => {
            const { error: delErr } = await window.sb.from('users').delete().eq('id', userId)
            if (delErr) { Utils.showToast('Delete failed: ' + delErr.message, 'error'); return }
            Utils.showToast('Operator deleted.')
            setTimeout(() => { window.location.href = '/index.html' }, 800)
          },
          'Delete Permanently'
        )
      })

      // Close on outside click
      setTimeout(() => {
        document.addEventListener('click', function close() {
          dropdown.remove()
          document.removeEventListener('click', close)
        })
      }, 10)
    })
  }

  // ── Export operator data as JSON ───────────────────────────
  async function exportOperatorData() {
    Utils.showToast('Preparing export...', 'info')
    const tables = [
      'loadout_items', 'weapon_attachments', 'range_sessions', 'range_entries',
      'shtf_food', 'shtf_water', 'shtf_medical', 'shtf_gear',
      'shtf_ammo', 'shtf_seeds', 'shtf_prep_plans', 'shtf_bugout_plans',
    ]

    // weapon_attachments has user_id too
    const [items, sessions] = await Promise.all([
      window.sb.from('loadout_items').select('*').eq('user_id', userId),
      window.sb.from('range_sessions').select('*').eq('user_id', userId),
    ])

    const [atts, entries, food, water, medical, gear, ammo, seeds, prep, bugout] = await Promise.all([
      window.sb.from('weapon_attachments').select('*').eq('user_id', userId),
      window.sb.from('range_entries').select('*').in('session_id', (sessions.data || []).map(s => s.id)),
      window.sb.from('shtf_food').select('*').eq('user_id', userId),
      window.sb.from('shtf_water').select('*').eq('user_id', userId),
      window.sb.from('shtf_medical').select('*').eq('user_id', userId),
      window.sb.from('shtf_gear').select('*').eq('user_id', userId),
      window.sb.from('shtf_ammo').select('*').eq('user_id', userId),
      window.sb.from('shtf_seeds').select('*').eq('user_id', userId),
      window.sb.from('shtf_prep_plans').select('*').eq('user_id', userId),
      window.sb.from('shtf_bugout_plans').select('*').eq('user_id', userId),
    ])

    const exportObj = {
      exported_at: new Date().toISOString(),
      operator: { id: userId, name: profileNameEl.textContent },
      loadout:  { items: items.data || [], weapon_attachments: atts.data || [] },
      range_log: { sessions: sessions.data || [], entries: entries.data || [] },
      shtf: {
        food: food.data || [], water: water.data || [],
        medical: medical.data || [], gear: gear.data || [],
        ammo: ammo.data || [], seeds: seeds.data || [],
        prep_plans: prep.data || [], bugout_plans: bugout.data || [],
      },
    }

    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `laststandlog-${profileNameEl.textContent.toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    Utils.showToast('Export downloaded!')
  }

  // ── Tab switching ──────────────────────────────────────────
  const tabBtns     = document.querySelectorAll('.tab-btn')
  const tabSections = document.querySelectorAll('.tab-section')
  const initialized = {}
  const TAB_LABELS  = { loadout: 'Loadout', rangelog: 'Range Log', shtf: 'SHTF Tracker' }

  function activateTab(tabName) {
    tabBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName)
      b.setAttribute('aria-selected', b.dataset.tab === tabName ? 'true' : 'false')
    })
    tabSections.forEach(s => s.classList.toggle('active', s.id === `tab-${tabName}`))
    Utils.setParam('tab', tabName)

    // Update sub-context label in header
    const subtitleEl = document.getElementById('profile-tab-context')
    if (subtitleEl) subtitleEl.textContent = TAB_LABELS[tabName] || ''

    // Persist last tab in localStorage
    try { localStorage.setItem('lastTab', tabName) } catch (_) {}

    if (!initialized[tabName]) {
      initialized[tabName] = true
      if (tabName === 'loadout')  window.LoadoutModule.init(userId)
      if (tabName === 'rangelog') window.RangeLogModule.init(userId)
      if (tabName === 'shtf')     window.SHTFModule.init(userId)
    }
  }

  // Set ARIA roles on tabs
  document.querySelector('.profile-tabs')?.setAttribute('role', 'tablist')
  tabBtns.forEach(btn => {
    btn.setAttribute('role', 'tab')
    btn.setAttribute('aria-selected', 'false')
    btn.setAttribute('aria-controls', `tab-${btn.dataset.tab}`)
    btn.addEventListener('click', () => activateTab(btn.dataset.tab))
  })
  tabSections.forEach(s => {
    s.setAttribute('role', 'tabpanel')
  })

  // Start on the correct tab: URL param → localStorage → default
  const urlTab   = Utils.getParam('tab')
  const lsTab    = (() => { try { return localStorage.getItem('lastTab') } catch(_) { return null } })()
  const startTab = urlTab || lsTab || 'loadout'
  activateTab(startTab)
})()
