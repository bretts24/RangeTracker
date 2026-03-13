// Loadout Module
window.LoadoutModule = (() => {
  let _userId = null
  let _initialized = false
  let _items = []
  let _attachMap = {}
  let _maintMap = {}
  let _dopeMap = {}
  let _searchQuery = ''

  const WEAPON_CATEGORIES = ['rifle', 'pistol', 'shotgun', 'smg', 'pcc', 'other_weapon']

  const ATTACHMENT_TYPES = [
    { value: 'optic',      label: 'Optic / Sight' },
    { value: 'muzzle',     label: 'Muzzle Device' },
    { value: 'barrel',     label: 'Barrel' },
    { value: 'handguard',  label: 'Handguard / Rail' },
    { value: 'stock',      label: 'Stock / Brace' },
    { value: 'grip',       label: 'Grip' },
    { value: 'sling',      label: 'Sling' },
    { value: 'light',      label: 'Light / Flashlight' },
    { value: 'laser',      label: 'Laser / PEQ' },
    { value: 'magazine',   label: 'Magazine' },
    { value: 'trigger',    label: 'Trigger / Internals' },
    { value: 'furniture',  label: 'Furniture' },
    { value: 'other',      label: 'Other' },
  ]

  const ATTACHMENT_TO_CATEGORY = {
    optic: 'optic', grip: 'grip', light: 'light', laser: 'laser',
    muzzle: 'suppressor',
  }
  const DEFAULT_ATTACHMENT_CATEGORY = 'other_attachment'

  const GROUPS = [
    { key: 'weapons',     label: 'Weapons',            categories: WEAPON_CATEGORIES,                                                        icon: '🔫' },
    { key: 'attachments', label: 'Weapon Attachments', categories: ['optic','suppressor','grip','light','laser','bipod','other_attachment'],  icon: '🔭' },
    { key: 'knives',      label: 'Knives',             categories: ['fixed_blade','folding','other_knife'],                                   icon: '🔪' },
    { key: 'gear',        label: 'Gear',               categories: ['plate','carrier','pouch','holster','belt','other_gear'],                 icon: '🎽' },
    { key: 'equipment',   label: 'Equipment',          categories: ['night_vision','comms','medical_kit','navigation','other_equipment'],     icon: '🛠️' },
  ]

  const CATEGORY_LABELS = {
    rifle: 'Rifle', pistol: 'Pistol', shotgun: 'Shotgun', smg: 'SMG',
    pcc: 'PCC', other_weapon: 'Other Weapon',
    optic: 'Optic', suppressor: 'Suppressor', grip: 'Grip', light: 'Light',
    laser: 'Laser', bipod: 'Bipod', other_attachment: 'Other Attachment',
    fixed_blade: 'Fixed Blade', folding: 'Folding Knife', other_knife: 'Other Knife',
    plate: 'Plate', carrier: 'Plate Carrier', pouch: 'Pouch', holster: 'Holster',
    belt: 'Belt', other_gear: 'Other Gear',
    night_vision: 'Night Vision', comms: 'Comms', medical_kit: 'Medical Kit',
    navigation: 'Navigation', other_equipment: 'Other Equipment',
  }

  async function init(userId) {
    if (_initialized) return
    _userId = userId
    _initialized = true
    bindAddButton()
    bindPrintButton()

    // Show skeleton while loading
    const container = document.getElementById('loadout-content')
    container.innerHTML = Utils.skeletonCards(3)

    await loadAll()
  }

  async function loadAll() {
    const [itemsResult, attachResult, cleaningsResult, malfunctionsResult, partsResult, dopeResult] = await Promise.all([
      window.sb.from('loadout_items').select('*').eq('user_id', _userId).order('created_at', { ascending: true }),
      window.sb.from('weapon_attachments').select('*').eq('user_id', _userId).order('created_at', { ascending: true }),
      window.sb.from('weapon_cleanings').select('*').eq('user_id', _userId).order('cleaned_date', { ascending: false }),
      window.sb.from('weapon_malfunctions').select('*').eq('user_id', _userId).order('mal_date', { ascending: false }),
      window.sb.from('weapon_parts_replaced').select('*').eq('user_id', _userId).order('replaced_date', { ascending: false }),
      window.sb.from('weapon_dope').select('*, weapon_dope_data(*)').eq('user_id', _userId).order('created_at', { ascending: true }),
    ])

    if (itemsResult.error) {
      document.getElementById('loadout-content').innerHTML = '<p class="error-text">Error loading loadout. Please refresh.</p>'
      console.error(itemsResult.error)
      return
    }

    const items = itemsResult.data || []
    const attachments = attachResult.data || []

    const attachMap = {}
    attachments.forEach(a => {
      if (!attachMap[a.weapon_id]) attachMap[a.weapon_id] = []
      attachMap[a.weapon_id].push(a)
    })

    // Build maintenance map
    const maintMap = {}
    const ensureMaint = (wid) => {
      if (!maintMap[wid]) maintMap[wid] = { cleanings: [], malfunctions: [], parts: [] }
    }
    ;(cleaningsResult.error ? [] : (cleaningsResult.data || [])).forEach(c => { ensureMaint(c.weapon_id); maintMap[c.weapon_id].cleanings.push(c) })
    ;(malfunctionsResult.error ? [] : (malfunctionsResult.data || [])).forEach(m => { ensureMaint(m.weapon_id); maintMap[m.weapon_id].malfunctions.push(m) })
    ;(partsResult.error ? [] : (partsResult.data || [])).forEach(p => { ensureMaint(p.weapon_id); maintMap[p.weapon_id].parts.push(p) })

    // Build dope map
    const dopeMap = {}
    ;(dopeResult.error ? [] : (dopeResult.data || [])).forEach(d => {
      if (!dopeMap[d.weapon_id]) dopeMap[d.weapon_id] = []
      dopeMap[d.weapon_id].push(d)
    })

    _items = items
    _attachMap = attachMap
    _maintMap = maintMap
    _dopeMap = dopeMap

    // Publish stats to profile header
    const weapons     = items.filter(i => WEAPON_CATEGORIES.includes(i.category)).length
    const atts        = attachments.length
    const gear        = items.filter(i => !WEAPON_CATEGORIES.includes(i.category)).length
    if (window._updateProfileStats) window._updateProfileStats(weapons, atts, gear)

    renderAll(items, attachMap)
  }

  function filteredItems(items) {
    if (!_searchQuery) return items
    const q = _searchQuery.toLowerCase()
    return items.filter(i =>
      (i.name   && i.name.toLowerCase().includes(q)) ||
      (i.brand  && i.brand.toLowerCase().includes(q)) ||
      (i.notes  && i.notes.toLowerCase().includes(q)) ||
      (CATEGORY_LABELS[i.category] || i.category).toLowerCase().includes(q)
    )
  }

  function renderAll(items, attachMap) {
    const container = document.getElementById('loadout-content')

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔫</div>
          <div class="empty-state-title">No Gear on the Rack</div>
          <div class="empty-state-desc">Start building your loadout — add weapons, optics, armor, and more.</div>
        </div>
      `
      return
    }

    // Search bar
    const searchBar = `
      <div class="search-bar loadout-search-row">
        <span class="search-bar-icon">⌕</span>
        <input id="loadout-search-input" class="search-bar-input"
          type="search" placeholder="Search loadout…" value="${Utils.esc(_searchQuery)}"
          aria-label="Search loadout items" />
        <button class="search-bar-clear${_searchQuery ? ' visible' : ''}" id="loadout-search-clear" aria-label="Clear search">✕</button>
      </div>
    `

    const filtered = filteredItems(items)
    const html = GROUPS.map(group => {
      const groupItems = filtered.filter(item => group.categories.includes(item.category))
      if (group.key === 'weapons') return renderWeaponGroup(group, groupItems, attachMap)
      return renderSimpleGroup(group, groupItems)
    }).join('')

    container.innerHTML = searchBar + (filtered.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">No Results</div><div class="empty-state-desc">No items match "${Utils.esc(_searchQuery)}"</div></div>`
      : html)

    // Bind search
    const searchInput = document.getElementById('loadout-search-input')
    const searchClear = document.getElementById('loadout-search-clear')
    if (searchInput) {
      let debounce
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce)
        debounce = setTimeout(() => {
          _searchQuery = searchInput.value.trim()
          renderAll(_items, _attachMap)
        }, 200)
      })
    }
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        _searchQuery = ''
        renderAll(_items, _attachMap)
      })
    }

    if (filtered.length > 0) {
      bindDeleteButtons()
      bindEditButtons()
      bindGroupToggles()
      bindWeaponCardToggles()
      bindRemoveAttachmentButtons()
      bindEditAttachmentButtons()
      bindWeaponSubSectionToggles()
      bindMaintenanceBtns()
      bindDopeBtns()
    }
  }

  // ── Weapon Group ───────────────────────────────────────────
  function renderWeaponGroup(group, weapons, attachMap) {
    const count = weapons.length
    const bodyHTML = weapons.length === 0
      ? `<div class="empty-state" style="padding:var(--space-lg) 0;">
           <div class="empty-state-icon">🔫</div>
           <div class="empty-state-title">No Weapons Yet</div>
           <div class="empty-state-desc">Add your primary, pistol, or any long gun.</div>
         </div>`
      : weapons.map(w => renderWeaponCard(w, attachMap[w.id] || [])).join('')

    return `
      <div class="loadout-group" data-group="${group.key}">
        <div class="loadout-group-header" data-toggle="${group.key}" role="button"
          aria-expanded="true" aria-controls="group-body-${group.key}" tabindex="0">
          <span class="loadout-group-title">${group.icon} ${group.label}</span>
          <span class="loadout-group-count">${count} weapon${count !== 1 ? 's' : ''}</span>
        </div>
        <div class="loadout-group-body" id="group-body-${group.key}">
          <div class="weapon-cards">${bodyHTML}</div>
        </div>
      </div>
    `
  }

  function renderWeaponCard(weapon, attachments) {
    const attCount = attachments.length
    const attTypeLabel = (val) => ATTACHMENT_TYPES.find(t => t.value === val)?.label || val

    const attHTML = attachments.length === 0
      ? '<p class="build-empty">No attachments on this build. Hit "+ Part" to add one.</p>'
      : `<div class="build-attachment-list">${attachments.map(a => `
          <div class="build-item">
            <span class="build-item-type">${Utils.esc(attTypeLabel(a.attachment_type))}</span>
            <div class="build-item-body">
              <span class="build-item-name">${Utils.esc(a.name)}${a.brand ? ` <span class="build-item-brand">· ${Utils.esc(a.brand)}</span>` : ''}</span>
              ${a.notes ? `<span class="build-item-notes">${Utils.esc(a.notes)}</span>` : ''}
            </div>
            <div class="build-item-actions">
              <button class="btn btn-secondary btn-sm btn-edit-attachment" data-id="${a.id}"
                title="Edit attachment" aria-label="Edit ${Utils.esc(a.name)}">Edit</button>
              <button class="btn-remove-attachment" data-id="${a.id}" data-weapon-id="${weapon.id}"
                title="Remove attachment" aria-label="Remove ${Utils.esc(a.name)}">✕</button>
            </div>
          </div>
        `).join('')}</div>`

    // Maintenance summary meta
    const maint = _maintMap[weapon.id] || { cleanings: [], malfunctions: [], parts: [] }
    const lastCleaning = maint.cleanings[0]
    const maintMeta = lastCleaning
      ? `Last cleaned ${Utils.formatDate(lastCleaning.cleaned_date)}`
      : 'No records'

    // Dope summary meta
    const dopeCards = _dopeMap[weapon.id] || []
    const dopeMeta = dopeCards.length > 0
      ? `${dopeCards.length} card${dopeCards.length !== 1 ? 's' : ''}`
      : 'No cards'

    return `
      <div class="weapon-card" data-weapon-id="${weapon.id}">
        <div class="weapon-card-header" data-weapon-toggle="${weapon.id}"
          role="button" aria-expanded="false" aria-controls="weapon-build-${weapon.id}" tabindex="0">
          <div class="weapon-card-info">
            <span class="weapon-type-badge">${Utils.esc(CATEGORY_LABELS[weapon.category] || weapon.category)}</span>
            <span class="weapon-card-name">${Utils.esc(weapon.name)}</span>
            ${weapon.notes ? `<span class="weapon-card-notes">${Utils.esc(weapon.notes)}</span>` : ''}
          </div>
          <div class="weapon-card-actions">
            <span class="weapon-build-count">${attCount} part${attCount !== 1 ? 's' : ''}</span>
            <button class="btn btn-primary btn-sm add-weapon-att-btn" data-weapon-id="${weapon.id}">+ Part</button>
            <button class="btn btn-secondary btn-sm edit-loadout-btn" data-id="${weapon.id}">Edit</button>
            <button class="btn btn-danger btn-sm delete-loadout-btn" data-id="${weapon.id}"
              aria-label="Remove ${Utils.esc(weapon.name)}">Remove</button>
            <span class="weapon-chevron" aria-hidden="true">▼</span>
          </div>
        </div>
        <div class="weapon-card-build" id="weapon-build-${weapon.id}">${attHTML}</div>

        <div class="weapon-subsec-header" data-subsection="maint" data-weapon-id="${weapon.id}">
          <div class="weapon-subsec-title">
            🔧 Maintenance
            <span class="weapon-subsec-meta">${maintMeta}</span>
          </div>
          <span class="weapon-subsec-chevron" aria-hidden="true">▼</span>
        </div>
        <div class="weapon-card-maint" id="weapon-maint-${weapon.id}">${renderMaintSection(weapon.id)}</div>

        <div class="weapon-subsec-header" data-subsection="dope" data-weapon-id="${weapon.id}">
          <div class="weapon-subsec-title">
            🎯 Dope Cards
            <span class="weapon-subsec-meta">${dopeMeta}</span>
          </div>
          <div class="weapon-subsec-actions">
            <button class="btn btn-primary btn-sm wd-add-btn" data-weapon-id="${weapon.id}">+ New Card</button>
          </div>
          <span class="weapon-subsec-chevron" aria-hidden="true">▼</span>
        </div>
        <div class="weapon-card-dope" id="weapon-dope-${weapon.id}">${renderDopeSection(weapon.id)}</div>
      </div>
    `
  }

  // ── Simple Group (non-weapon) ───────────────────────────────
  function renderSimpleGroup(group, items) {
    const count = items.length
    const emptyIcons = { attachments: '🔭', knives: '🔪', gear: '🎽', equipment: '🛠️' }
    const emptyDescs = {
      attachments: 'Log standalone optics, suppressors, and accessories.',
      knives:      'Add your fixed blades, folders, and multi-tools.',
      gear:        'Track plates, carriers, pouches, holsters, and belts.',
      equipment:   'Log night vision, comms, navigation, and other kit.',
    }

    const rowsHTML = items.length === 0
      ? `<tr><td colspan="6" class="table-empty">
           <div class="empty-state" style="padding:var(--space-lg) 0;">
             <div class="empty-state-icon">${emptyIcons[group.key] || '📦'}</div>
             <div class="empty-state-title">No ${group.label}</div>
             <div class="empty-state-desc">${emptyDescs[group.key] || ''}</div>
           </div>
         </td></tr>`
      : items.map(item => `
          <tr>
            <td>${Utils.esc(CATEGORY_LABELS[item.category] || item.category)}</td>
            <td>${Utils.esc(item.name)}</td>
            <td>${Utils.esc(item.brand || '—')}</td>
            <td>${Utils.esc(item.notes || '—')}</td>
            <td>${Utils.formatDate(item.created_at)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-secondary btn-sm edit-loadout-btn" data-id="${item.id}" style="margin-right:4px;"
                aria-label="Edit ${Utils.esc(item.name)}">Edit</button>
              <button class="btn btn-danger btn-sm delete-loadout-btn" data-id="${item.id}"
                aria-label="Remove ${Utils.esc(item.name)}">Remove</button>
            </td>
          </tr>
        `).join('')

    return `
      <div class="loadout-group" data-group="${group.key}">
        <div class="loadout-group-header" data-toggle="${group.key}" role="button"
          aria-expanded="true" aria-controls="group-body-${group.key}" tabindex="0">
          <span class="loadout-group-title">${group.icon} ${group.label}</span>
          <span class="loadout-group-count">${count} item${count !== 1 ? 's' : ''}</span>
        </div>
        <div class="loadout-group-body" id="group-body-${group.key}">
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr><th>Category</th><th>Name / Model</th><th>Brand</th><th>Notes</th><th>Added</th><th></th></tr>
              </thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>
        </div>
      </div>
    `
  }

  // ── Event Bindings ─────────────────────────────────────────
  function bindGroupToggles() {
    document.querySelectorAll('[data-toggle]').forEach(header => {
      function toggle() {
        const key  = header.dataset.toggle
        const body = document.getElementById(`group-body-${key}`)
        const isOpen = body.style.display !== 'none'
        body.style.display = isOpen ? 'none' : ''
        header.setAttribute('aria-expanded', !isOpen)
      }
      header.addEventListener('click', toggle)
      header.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() }})
    })
  }

  function bindWeaponCardToggles() {
    document.querySelectorAll('[data-weapon-toggle]').forEach(header => {
      function toggle(e) {
        if (e.target.closest('button')) return
        const weaponId = header.dataset.weaponToggle
        const card     = header.closest('.weapon-card')
        const isOpen   = card.classList.contains('weapon-card-open')
        card.classList.toggle('weapon-card-open', !isOpen)
        header.setAttribute('aria-expanded', !isOpen)
      }
      header.addEventListener('click', toggle)
      header.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e) }})
    })

    document.querySelectorAll('.add-weapon-att-btn').forEach(btn => {
      btn.addEventListener('click', () => openAddAttachmentModal(btn.dataset.weaponId))
    })
  }

  function bindDeleteButtons() {
    document.querySelectorAll('.delete-loadout-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = _items.find(i => i.id === btn.dataset.id)
        const name = item ? item.name : 'this item'
        Utils.confirmDialog(
          `Remove "${name}" from your loadout? All associated build parts will also be deleted.`,
          () => deleteItem(btn.dataset.id),
          'Remove Item'
        )
      })
    })
  }

  function bindEditButtons() {
    document.querySelectorAll('.edit-loadout-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id))
    })
  }

  async function openEditModal(itemId) {
    const item = _items.find(i => i.id === itemId)
    if (!item) return

    const isWeapon = WEAPON_CATEGORIES.includes(item.category)
    let pendingAtts = isWeapon
      ? (_attachMap[itemId] || []).map(a => ({
          type: a.attachment_type, name: a.name,
          brand: a.brand || '', tempId: a.id,
        }))
      : []

    Utils.openModal('Edit Loadout Item', `
      <form id="edit-loadout-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category <span style="color:var(--color-red)">*</span></label>
            <select name="category" id="elf-category" class="form-select" required>
              ${buildCategoryOptions()}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Name / Model <span style="color:var(--color-red)">*</span></label>
            <input type="text" name="name" class="form-input" value="${Utils.esc(item.name)}" required maxlength="100" />
          </div>
        </div>

        <div id="elf-nonweapon">
          <div class="form-group">
            <label class="form-label">Brand / Manufacturer</label>
            <input type="text" name="brand" class="form-input" value="${Utils.esc(item.brand || '')}" maxlength="80" />
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea name="notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
          </div>
        </div>

        <div id="elf-weapon-builder" style="display:none;">
          <div class="form-group">
            <label class="form-label">Notes / Config</label>
            <textarea name="weapon_notes" class="form-textarea">${Utils.esc(item.notes || '')}</textarea>
          </div>
          <div class="weapon-builder-section">
            <div class="weapon-builder-header">
              <span class="weapon-builder-title">🔧 Build Parts</span>
              <button type="button" class="btn btn-primary btn-sm" id="elf-toggle-att">+ Add Attachment</button>
            </div>
            <div id="elf-att-inline" class="att-inline-form" style="display:none;">
              <div class="form-row-3">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Type</label>
                  <select id="elf-att-type" class="form-select">${attTypeOptionsHTML()}</select>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Name / Model <span style="color:var(--color-red)">*</span></label>
                  <input type="text" id="elf-att-name" class="form-input" placeholder="e.g. Holosun ARO" maxlength="100" />
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Brand</label>
                  <input type="text" id="elf-att-brand" class="form-input" placeholder="e.g. Holosun" maxlength="80" />
                </div>
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button type="button" class="btn btn-secondary btn-sm" id="elf-att-cancel">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" id="elf-att-confirm">Add to Build</button>
              </div>
            </div>
            <div id="elf-pending-build" class="pending-build-list"></div>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="elf-submit">Save Changes</button>
        </div>
      </form>
    `)

    const modalEl              = document.querySelector('.modal')
    const categorySelect       = document.getElementById('elf-category')
    const nonWeaponSection     = document.getElementById('elf-nonweapon')
    const weaponBuilderSection = document.getElementById('elf-weapon-builder')

    categorySelect.value = item.category

    function updateMode() {
      const isW = WEAPON_CATEGORIES.includes(categorySelect.value)
      nonWeaponSection.style.display     = isW ? 'none' : ''
      weaponBuilderSection.style.display = isW ? '' : 'none'
      if (modalEl) modalEl.style.maxWidth = isW ? '720px' : '580px'
    }

    categorySelect.addEventListener('change', updateMode)
    updateMode()

    function renderPendingBuild(atts) {
      const container = document.getElementById('elf-pending-build')
      if (atts.length === 0) {
        container.innerHTML = '<p class="build-empty">No attachments yet — hit "+ Add Attachment" to start building.</p>'
        return
      }
      const typeLabel = (val) => ATTACHMENT_TYPES.find(t => t.value === val)?.label || val
      container.innerHTML = `
        <div class="build-attachment-list">
          ${atts.map(a => `
            <div class="build-item">
              <span class="build-item-type">${Utils.esc(typeLabel(a.type))}</span>
              <span class="build-item-name">${Utils.esc(a.name)}${a.brand ? ` <span class="build-item-brand">· ${Utils.esc(a.brand)}</span>` : ''}</span>
              <button class="btn-remove-pending" data-temp-id="${a.tempId}" type="button"
                aria-label="Remove ${Utils.esc(a.name)}">✕</button>
            </div>
          `).join('')}
        </div>
      `
      container.querySelectorAll('.btn-remove-pending').forEach(btn => {
        btn.addEventListener('click', () => {
          pendingAtts = pendingAtts.filter(a => String(a.tempId) !== String(btn.dataset.tempId))
          renderPendingBuild(pendingAtts)
        })
      })
    }

    renderPendingBuild(pendingAtts)

    document.getElementById('elf-toggle-att').addEventListener('click', () => {
      const form = document.getElementById('elf-att-inline')
      const showing = form.style.display !== 'none'
      form.style.display = showing ? 'none' : ''
      if (!showing) document.getElementById('elf-att-name').focus()
    })

    document.getElementById('elf-att-cancel').addEventListener('click', () => {
      document.getElementById('elf-att-inline').style.display = 'none'
    })

    document.getElementById('elf-att-confirm').addEventListener('click', () => {
      const type  = document.getElementById('elf-att-type').value
      const name  = document.getElementById('elf-att-name').value.trim()
      const brand = document.getElementById('elf-att-brand').value.trim()
      if (!name) { document.getElementById('elf-att-name').focus(); return }
      pendingAtts.push({ type, name, brand, tempId: Date.now() + Math.random() })
      document.getElementById('elf-att-name').value  = ''
      document.getElementById('elf-att-brand').value = ''
      document.getElementById('elf-att-inline').style.display = 'none'
      renderPendingBuild(pendingAtts)
    })

    document.getElementById('edit-loadout-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const isW = WEAPON_CATEGORIES.includes(fd.get('category'))
      const btn = document.getElementById('elf-submit')
      btn.disabled = true; btn.textContent = 'Saving...'

      const { error } = await window.sb
        .from('loadout_items')
        .update({
          category: fd.get('category'),
          name:     fd.get('name').trim(),
          brand:    isW ? null : (fd.get('brand')?.trim() || null),
          notes:    isW ? (fd.get('weapon_notes')?.trim() || null) : (fd.get('notes')?.trim() || null),
        })
        .eq('id', itemId)

      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Save Changes'
        return
      }

      if (isW) {
        await window.sb.from('weapon_attachments').delete().eq('weapon_id', itemId)
        if (pendingAtts.length > 0) {
          const { error: attErr } = await window.sb.from('weapon_attachments').insert(
            pendingAtts.map(a => ({
              weapon_id: itemId, user_id: _userId,
              attachment_type: a.type, name: a.name, brand: a.brand || null,
            }))
          )
          if (attErr) Utils.showToast('Saved but some parts failed: ' + attErr.message, 'error')
        }
      }

      Utils.closeModal()
      Utils.showToast('Loadout item updated!')
      await loadAll()
    })
  }

  function bindRemoveAttachmentButtons() {
    document.querySelectorAll('.btn-remove-attachment').forEach(btn => {
      btn.addEventListener('click', () => openRemoveAttachmentModal(btn.dataset.id))
    })
  }

  function bindEditAttachmentButtons() {
    document.querySelectorAll('.btn-edit-attachment').forEach(btn => {
      btn.addEventListener('click', () => openEditAttachmentModal(btn.dataset.id))
    })
  }

  async function openEditAttachmentModal(attachmentId) {
    // Find attachment from in-memory map
    let attachment = null
    for (const atts of Object.values(_attachMap)) {
      attachment = atts.find(a => String(a.id) === String(attachmentId))
      if (attachment) break
    }
    if (!attachment) { Utils.showToast('Could not find attachment.', 'error'); return }

    Utils.openModal('Edit Attachment', `
      <form id="edit-att-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label">Attachment Type</label>
          <select name="attachment_type" class="form-select">${attTypeOptionsHTML()}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Name / Model <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="name" class="form-input" value="${Utils.esc(attachment.name)}" required maxlength="100" />
        </div>
        <div class="form-group">
          <label class="form-label">Brand / Manufacturer</label>
          <input type="text" name="brand" class="form-input" value="${Utils.esc(attachment.brand || '')}" maxlength="80" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea">${Utils.esc(attachment.notes || '')}</textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="edit-att-submit">Save Changes</button>
        </div>
      </form>
    `)

    // Pre-select the current type
    document.querySelector('#edit-att-form select[name="attachment_type"]').value = attachment.attachment_type

    document.getElementById('edit-att-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = document.getElementById('edit-att-submit')
      btn.disabled = true; btn.textContent = 'Saving...'

      const { error } = await window.sb
        .from('weapon_attachments')
        .update({
          attachment_type: fd.get('attachment_type'),
          name:  fd.get('name').trim(),
          brand: fd.get('brand').trim() || null,
          notes: fd.get('notes').trim() || null,
        })
        .eq('id', attachmentId)

      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Save Changes'
        return
      }
      Utils.closeModal()
      Utils.showToast('Attachment updated.')
      await loadAll()
    })
  }

  async function deleteItem(id) {
    const { error } = await window.sb.from('loadout_items').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Item removed.')
    await loadAll()
  }

  async function openRemoveAttachmentModal(attachmentId) {
    const { data, error } = await window.sb
      .from('weapon_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single()

    if (error || !data) { Utils.showToast('Could not find attachment.', 'error'); return }

    Utils.openModal('Remove Attachment', `
      <div>
        <p style="font-size:0.9rem;color:var(--color-text-muted);margin-bottom:var(--space-lg);">
          What would you like to do with <strong style="color:var(--color-text-primary);">${Utils.esc(data.name)}</strong>?
        </p>
        <div class="remove-att-options">
          <button class="remove-att-option" id="ra-move">
            <span class="remove-att-option-icon">📦</span>
            <div>
              <div class="remove-att-option-title">Move to Loadout</div>
              <div class="remove-att-option-desc">Keep it as a standalone item in your loadout inventory</div>
            </div>
          </button>
          <button class="remove-att-option remove-att-option-danger" id="ra-delete">
            <span class="remove-att-option-icon">🗑</span>
            <div>
              <div class="remove-att-option-title">Delete Permanently</div>
              <div class="remove-att-option-desc">Remove it completely — cannot be undone</div>
            </div>
          </button>
        </div>
        <div class="form-actions" style="margin-top:var(--space-md);">
          <button class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
        </div>
      </div>
    `)

    document.getElementById('ra-move').addEventListener('click', async () => {
      const category = ATTACHMENT_TO_CATEGORY[data.attachment_type] || DEFAULT_ATTACHMENT_CATEGORY
      const [delResult, insResult] = await Promise.all([
        window.sb.from('weapon_attachments').delete().eq('id', attachmentId),
        window.sb.from('loadout_items').insert({
          user_id: _userId, category, name: data.name,
          brand: data.brand || null, notes: data.notes || null,
        }),
      ])
      if (delResult.error || insResult.error) {
        Utils.showToast('Failed to move attachment.', 'error'); return
      }
      Utils.closeModal()
      Utils.showToast(`${data.name} moved to loadout!`)
      await loadAll()
    })

    document.getElementById('ra-delete').addEventListener('click', () => {
      Utils.closeModal()
      Utils.confirmDialog(
        `Permanently delete "${data.name}"?`,
        async () => {
          const { error: delErr } = await window.sb.from('weapon_attachments').delete().eq('id', attachmentId)
          if (delErr) { Utils.showToast('Delete failed: ' + delErr.message, 'error'); return }
          Utils.showToast('Attachment deleted.')
          await loadAll()
        },
        'Delete Permanently'
      )
    })
  }

  function openAddAttachmentModal(weaponId) {
    const attTypeOptions = ATTACHMENT_TYPES.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('')

    Utils.openModal('Add Part to Build', `
      <form id="att-form">
        <div class="form-group">
          <label class="form-label">Attachment Type</label>
          <select name="attachment_type" class="form-select" required>${attTypeOptions}</select>
        </div>
        <div class="form-group">
          <label class="form-label">Name / Model <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="name" class="form-input" placeholder="e.g. Holosun ARO, BFH 16&quot; Barrel" required maxlength="100" />
        </div>
        <div class="form-group">
          <label class="form-label">Brand / Manufacturer</label>
          <input type="text" name="brand" class="form-input" placeholder="e.g. Holosun, BCM, B5 Systems" maxlength="80" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Specs, finish, serial, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add to Build</button>
        </div>
      </form>
    `)

    document.getElementById('att-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd  = new FormData(e.target)
      const btn = e.target.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving...'

      const { error } = await window.sb.from('weapon_attachments').insert({
        weapon_id: weaponId, user_id: _userId,
        attachment_type: fd.get('attachment_type'),
        name: fd.get('name').trim(),
        brand: fd.get('brand').trim() || null,
        notes: fd.get('notes').trim() || null,
      })

      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Add to Build'
        return
      }
      Utils.closeModal()
      Utils.showToast('Part added to build!')
      await loadAll()
    })
  }

  // ── Add Item Modal ──────────────────────────────────────────
  function bindAddButton() {
    document.getElementById('loadout-add-btn').addEventListener('click', openAddModal)
  }

  function bindPrintButton() {
    const btn = document.getElementById('loadout-print-btn')
    if (!btn) return
    btn.addEventListener('click', () => printLoadout())
  }

  function printLoadout() {
    const weapons = _items.filter(i => WEAPON_CATEGORIES.includes(i.category))
    const gear    = _items.filter(i => !WEAPON_CATEGORIES.includes(i.category))

    let html = `<!DOCTYPE html><html><head><title>Loadout</title>
    <style>body{font-family:Courier New,monospace;color:#000;background:#fff;padding:20px;}
    h1{font-size:1.4rem;text-transform:uppercase;letter-spacing:0.1em;border-bottom:2px solid #000;margin-bottom:16px;}
    h2{font-size:1rem;text-transform:uppercase;letter-spacing:0.1em;margin:20px 0 8px;border-bottom:1px solid #ccc;}
    .weapon{margin-bottom:16px;padding-left:12px;border-left:3px solid #000;}
    .weapon-name{font-size:0.95rem;font-weight:bold;}
    .weapon-badge{font-size:0.7rem;text-transform:uppercase;opacity:0.6;}
    .att{font-size:0.8rem;padding:2px 0 2px 12px;}
    .att::before{content:"— ";}
    table{width:100%;border-collapse:collapse;font-size:0.8rem;margin-top:8px;}
    th{text-align:left;border-bottom:1px solid #000;padding:4px 8px;text-transform:uppercase;font-size:0.7rem;}
    td{padding:4px 8px;border-bottom:1px solid #eee;}
    </style></head><body>`

    html += `<h1>Loadout — ${document.getElementById('profile-name')?.textContent || ''}</h1>`
    html += `<p style="font-size:0.75rem;opacity:0.5;">Exported ${new Date().toLocaleDateString()}</p>`

    if (weapons.length) {
      html += `<h2>🔫 Weapons (${weapons.length})</h2>`
      weapons.forEach(w => {
        const atts = _attachMap[w.id] || []
        html += `<div class="weapon">
          <div class="weapon-badge">${CATEGORY_LABELS[w.category] || w.category}</div>
          <div class="weapon-name">${Utils.esc(w.name)}</div>
          ${w.notes ? `<div style="font-size:0.8rem;opacity:0.7;">${Utils.esc(w.notes)}</div>` : ''}
          ${atts.map(a => `<div class="att">${Utils.esc(a.name)}${a.brand ? ` · ${Utils.esc(a.brand)}` : ''}</div>`).join('')}
        </div>`
      })
    }

    if (gear.length) {
      GROUPS.filter(g => g.key !== 'weapons').forEach(group => {
        const groupItems = gear.filter(i => group.categories.includes(i.category))
        if (!groupItems.length) return
        html += `<h2>${group.icon} ${group.label} (${groupItems.length})</h2>
        <table><thead><tr><th>Category</th><th>Name</th><th>Brand</th><th>Notes</th></tr></thead><tbody>`
        groupItems.forEach(i => {
          html += `<tr><td>${Utils.esc(CATEGORY_LABELS[i.category] || i.category)}</td>
            <td>${Utils.esc(i.name)}</td><td>${Utils.esc(i.brand || '—')}</td><td>${Utils.esc(i.notes || '—')}</td></tr>`
        })
        html += `</tbody></table>`
      })
    }

    html += `</body></html>`
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.print()
  }

  function buildCategoryOptions() {
    return GROUPS.map(g => `
      <optgroup label="${g.label}">
        ${g.categories.map(c => `<option value="${c}">${CATEGORY_LABELS[c]}</option>`).join('')}
      </optgroup>
    `).join('')
  }

  function attTypeOptionsHTML() {
    return ATTACHMENT_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')
  }

  function openAddModal() {
    Utils.openModal('Add Loadout Item', `
      <form id="loadout-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category <span style="color:var(--color-red)">*</span></label>
            <select name="category" id="lf-category" class="form-select" required>
              ${buildCategoryOptions()}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Name / Model <span style="color:var(--color-red)">*</span></label>
            <input type="text" name="name" class="form-input" placeholder="e.g. BCM MK2 / PSA Sabre Lower" required maxlength="100" />
          </div>
        </div>

        <div id="lf-nonweapon">
          <div class="form-group">
            <label class="form-label">Brand / Manufacturer</label>
            <input type="text" name="brand" class="form-input" placeholder="e.g. BCM, Trijicon, Magpul" maxlength="80" />
          </div>
          <div class="form-group">
            <label class="form-label">Notes</label>
            <textarea name="notes" class="form-textarea" placeholder="Serial number, caliber, configuration details, etc."></textarea>
          </div>
        </div>

        <div id="lf-weapon-builder" style="display:none;">
          <div class="form-group">
            <label class="form-label">Notes / Config</label>
            <textarea name="weapon_notes" class="form-textarea" placeholder="Caliber, serial number, configuration overview..."></textarea>
          </div>
          <div class="weapon-builder-section">
            <div class="weapon-builder-header">
              <span class="weapon-builder-title">🔧 Build Parts</span>
              <button type="button" class="btn btn-primary btn-sm" id="lf-toggle-att">+ Add Attachment</button>
            </div>
            <div id="lf-att-inline" class="att-inline-form" style="display:none;">
              <div class="form-row-3">
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Type</label>
                  <select id="lf-att-type" class="form-select">${attTypeOptionsHTML()}</select>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Name / Model <span style="color:var(--color-red)">*</span></label>
                  <input type="text" id="lf-att-name" class="form-input" placeholder="e.g. Holosun ARO" maxlength="100" />
                </div>
                <div class="form-group" style="margin-bottom:0;">
                  <label class="form-label">Brand</label>
                  <input type="text" id="lf-att-brand" class="form-input" placeholder="e.g. Holosun" maxlength="80" />
                </div>
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
                <button type="button" class="btn btn-secondary btn-sm" id="lf-att-cancel">Cancel</button>
                <button type="button" class="btn btn-primary btn-sm" id="lf-att-confirm">Add to Build</button>
              </div>
            </div>
            <div id="lf-pending-build" class="pending-build-list">
              <p class="build-empty">No attachments yet — hit "+ Add Attachment" to start building your weapon.</p>
            </div>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="lf-submit">Add to Loadout</button>
        </div>
      </form>
    `)

    const modalEl = document.querySelector('.modal')
    const categorySelect = document.getElementById('lf-category')
    const nonWeaponSection = document.getElementById('lf-nonweapon')
    const weaponBuilderSection = document.getElementById('lf-weapon-builder')
    let pendingAtts = []

    function updateMode() {
      const isWeapon = WEAPON_CATEGORIES.includes(categorySelect.value)
      nonWeaponSection.style.display = isWeapon ? 'none' : ''
      weaponBuilderSection.style.display = isWeapon ? '' : 'none'
      if (modalEl) modalEl.style.maxWidth = isWeapon ? '720px' : '580px'
    }

    categorySelect.addEventListener('change', updateMode)
    updateMode()

    document.getElementById('lf-toggle-att').addEventListener('click', () => {
      const form = document.getElementById('lf-att-inline')
      const showing = form.style.display !== 'none'
      form.style.display = showing ? 'none' : ''
      if (!showing) document.getElementById('lf-att-name').focus()
    })

    document.getElementById('lf-att-cancel').addEventListener('click', () => {
      document.getElementById('lf-att-inline').style.display = 'none'
    })

    document.getElementById('lf-att-confirm').addEventListener('click', () => {
      const type  = document.getElementById('lf-att-type').value
      const name  = document.getElementById('lf-att-name').value.trim()
      const brand = document.getElementById('lf-att-brand').value.trim()
      if (!name) { document.getElementById('lf-att-name').focus(); return }
      pendingAtts.push({ type, name, brand, tempId: Date.now() + Math.random() })
      document.getElementById('lf-att-name').value  = ''
      document.getElementById('lf-att-brand').value = ''
      document.getElementById('lf-att-inline').style.display = 'none'
      renderPendingBuild(pendingAtts)
    })

    function renderPendingBuild(atts) {
      const container = document.getElementById('lf-pending-build')
      if (atts.length === 0) {
        container.innerHTML = '<p class="build-empty">No attachments yet — hit "+ Add Attachment" to start building your weapon.</p>'
        return
      }
      const typeLabel = (val) => ATTACHMENT_TYPES.find(t => t.value === val)?.label || val
      container.innerHTML = `
        <div class="build-attachment-list">
          ${atts.map(a => `
            <div class="build-item">
              <span class="build-item-type">${Utils.esc(typeLabel(a.type))}</span>
              <span class="build-item-name">${Utils.esc(a.name)}${a.brand ? ` <span class="build-item-brand">· ${Utils.esc(a.brand)}</span>` : ''}</span>
              <button class="btn-remove-pending" data-temp-id="${a.tempId}" type="button">✕</button>
            </div>
          `).join('')}
        </div>
      `
      container.querySelectorAll('.btn-remove-pending').forEach(btn => {
        btn.addEventListener('click', () => {
          pendingAtts = pendingAtts.filter(a => String(a.tempId) !== String(btn.dataset.tempId))
          renderPendingBuild(pendingAtts)
        })
      })
    }

    document.getElementById('loadout-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd       = new FormData(e.target)
      const isWeapon = WEAPON_CATEGORIES.includes(fd.get('category'))
      const btn      = document.getElementById('lf-submit')
      btn.disabled = true; btn.textContent = 'Saving...'

      const payload = {
        user_id:  _userId,
        category: fd.get('category'),
        name:     fd.get('name').trim(),
        brand:    isWeapon ? null : (fd.get('brand')?.trim() || null),
        notes:    isWeapon ? (fd.get('weapon_notes')?.trim() || null) : (fd.get('notes')?.trim() || null),
      }

      const { data: newItem, error } = await window.sb
        .from('loadout_items').insert(payload).select().single()

      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Add to Loadout'
        return
      }

      if (isWeapon && pendingAtts.length > 0) {
        const { error: attErr } = await window.sb.from('weapon_attachments').insert(
          pendingAtts.map(a => ({
            weapon_id: newItem.id, user_id: _userId,
            attachment_type: a.type, name: a.name, brand: a.brand || null,
          }))
        )
        if (attErr) Utils.showToast('Weapon saved but some parts failed: ' + attErr.message, 'error')
      }

      Utils.closeModal()
      Utils.showToast(isWeapon
        ? `Weapon added with ${pendingAtts.length} part${pendingAtts.length !== 1 ? 's' : ''}!`
        : 'Item added to loadout!')
      await loadAll()
    })
  }

  // ── Maintenance & Dope Helpers ─────────────────────────────

  function formatMalType(type) {
    const labels = { FTF: 'FTF', FTE: 'FTE', double_feed: 'Double Feed', stovepipe: 'Stovepipe', other: 'Other' }
    return labels[type] || type || '—'
  }

  function renderMaintSection(weaponId) {
    const maint = _maintMap[weaponId] || { cleanings: [], malfunctions: [], parts: [] }

    const toolbar = `
      <div class="maint-toolbar">
        <button class="btn btn-secondary btn-sm wm-clean-btn" data-weapon-id="${weaponId}">+ Log Cleaning</button>
        <button class="btn btn-secondary btn-sm wm-mal-btn" data-weapon-id="${weaponId}">+ Malfunction</button>
        <button class="btn btn-secondary btn-sm wm-part-btn" data-weapon-id="${weaponId}">+ Replace Part</button>
      </div>`

    const cleaningsTable = maint.cleanings.length === 0
      ? '<p class="maint-empty">No cleaning records yet.</p>'
      : `<div style="overflow-x:auto;"><table class="data-table data-table-sm">
          <thead><tr><th>Date</th><th>Rounds at Clean</th><th>Products</th><th>Notes</th><th></th></tr></thead>
          <tbody>${maint.cleanings.map(c => `
            <tr>
              <td>${Utils.formatDate(c.cleaned_date)}</td>
              <td>${c.round_count != null ? c.round_count.toLocaleString() : '—'}</td>
              <td>${Utils.esc(c.products_used || '—')}</td>
              <td>${Utils.esc(c.notes || '—')}</td>
              <td><button class="btn btn-danger btn-sm del-cleaning-btn" data-id="${c.id}">✕</button></td>
            </tr>`).join('')}
          </tbody></table></div>`

    const malTable = maint.malfunctions.length === 0
      ? '<p class="maint-empty">No malfunction records.</p>'
      : `<div style="overflow-x:auto;"><table class="data-table data-table-sm">
          <thead><tr><th>Date</th><th>Type</th><th>Rounds</th><th>Ammo</th><th>Resolution</th><th></th></tr></thead>
          <tbody>${maint.malfunctions.map(m => `
            <tr>
              <td>${Utils.formatDate(m.mal_date)}</td>
              <td><span class="mal-badge mal-${Utils.esc(m.mal_type || 'other')}">${formatMalType(m.mal_type)}</span></td>
              <td>${m.round_count != null ? m.round_count.toLocaleString() : '—'}</td>
              <td>${Utils.esc(m.ammo_used || '—')}</td>
              <td>${Utils.esc(m.resolution || '—')}</td>
              <td><button class="btn btn-danger btn-sm del-malfunction-btn" data-id="${m.id}">✕</button></td>
            </tr>`).join('')}
          </tbody></table></div>`

    const partsTable = maint.parts.length === 0
      ? '<p class="maint-empty">No part replacement records.</p>'
      : `<div style="overflow-x:auto;"><table class="data-table data-table-sm">
          <thead><tr><th>Part</th><th>Date</th><th>Rounds at Replace</th><th>Notes</th><th></th></tr></thead>
          <tbody>${maint.parts.map(p => `
            <tr>
              <td>${Utils.esc(p.part_name)}</td>
              <td>${Utils.formatDate(p.replaced_date)}</td>
              <td>${p.round_count != null ? p.round_count.toLocaleString() : '—'}</td>
              <td>${Utils.esc(p.notes || '—')}</td>
              <td><button class="btn btn-danger btn-sm del-part-btn" data-id="${p.id}">✕</button></td>
            </tr>`).join('')}
          </tbody></table></div>`

    return `
      ${toolbar}
      <div class="maint-subsec"><div class="maint-subsec-title">Cleanings</div>${cleaningsTable}</div>
      <div class="maint-subsec"><div class="maint-subsec-title">Malfunctions</div>${malTable}</div>
      <div class="maint-subsec"><div class="maint-subsec-title">Parts Replaced</div>${partsTable}</div>
    `
  }

  function renderDopeSection(weaponId) {
    const cards = _dopeMap[weaponId] || []
    if (cards.length === 0) {
      return '<p class="maint-empty">No dope cards. Hit "+ New Card" to record your zero data.</p>'
    }
    return cards.map(card => {
      const sortedData = [...(card.weapon_dope_data || [])].sort((a, b) => a.distance_yd - b.distance_yd)
      const holdUnit = Utils.esc(card.hold_unit || 'MOA')
      const dataHTML = sortedData.length === 0
        ? '<p class="maint-empty" style="margin:8px 0 0;">No distance data yet — hit "+ Distance" to add holds.</p>'
        : `<div style="overflow-x:auto;"><table class="dope-table">
            <thead><tr>
              <th>Dist (yd)</th>
              <th>Elev (${holdUnit})</th>
              <th>Wind (${holdUnit})</th>
              <th>Notes</th>
              <th></th>
            </tr></thead>
            <tbody>${sortedData.map(dp => `
              <tr>
                <td class="dope-dist">${dp.distance_yd}</td>
                <td>${dp.elevation_hold != null ? dp.elevation_hold : '—'}</td>
                <td>${dp.windage_hold != null ? dp.windage_hold : '—'}</td>
                <td>${Utils.esc(dp.notes || '—')}</td>
                <td><button class="btn btn-danger btn-sm del-dope-data-btn" data-id="${dp.id}">✕</button></td>
              </tr>`).join('')}
            </tbody></table></div>`

      return `
        <div class="dope-card" data-dope-id="${card.id}">
          <div class="dope-card-header">
            <div class="dope-card-info">
              <span class="dope-card-optic">${Utils.esc(card.optic_name || 'Unknown Optic')}</span>
              ${card.zero_distance_yd ? `<span class="dope-card-tag">${card.zero_distance_yd}yd zero</span>` : ''}
              ${card.ammo_used ? `<span class="dope-card-tag">${Utils.esc(card.ammo_used)}</span>` : ''}
              ${card.zero_date ? `<span class="dope-card-tag muted">Zeroed ${Utils.formatDate(card.zero_date)}</span>` : ''}
            </div>
            <div class="dope-card-actions">
              <button class="btn btn-secondary btn-sm dope-add-data-btn"
                data-dope-id="${card.id}" data-weapon-id="${card.weapon_id}" data-hold-unit="${Utils.esc(card.hold_unit || 'MOA')}">+ Distance</button>
              <button class="btn btn-secondary btn-sm dope-print-btn" data-dope-id="${card.id}">Print</button>
              <button class="btn btn-danger btn-sm del-dope-btn" data-id="${card.id}">✕</button>
            </div>
          </div>
          ${dataHTML}
          ${card.notes ? `<div class="dope-card-notes">${Utils.esc(card.notes)}</div>` : ''}
        </div>`
    }).join('')
  }

  // ── Sub-section Toggle Bindings ─────────────────────────────

  function bindWeaponSubSectionToggles() {
    document.querySelectorAll('.weapon-subsec-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return
        const subsection = header.dataset.subsection  // 'maint' or 'dope'
        const card = header.closest('.weapon-card')
        card.classList.toggle(`weapon-${subsection}-open`)
        const chevron = header.querySelector('.weapon-subsec-chevron')
        if (chevron) chevron.style.transform = card.classList.contains(`weapon-${subsection}-open`) ? 'rotate(180deg)' : ''
      })
    })
  }

  // ── Maintenance Button Bindings ─────────────────────────────

  function bindMaintenanceBtns() {
    document.querySelectorAll('.wm-clean-btn').forEach(btn =>
      btn.addEventListener('click', () => openLogCleaningModal(btn.dataset.weaponId)))
    document.querySelectorAll('.wm-mal-btn').forEach(btn =>
      btn.addEventListener('click', () => openLogMalfunctionModal(btn.dataset.weaponId)))
    document.querySelectorAll('.wm-part-btn').forEach(btn =>
      btn.addEventListener('click', () => openLogPartModal(btn.dataset.weaponId)))

    document.querySelectorAll('.del-cleaning-btn').forEach(btn => {
      btn.addEventListener('click', () => Utils.confirmDialog('Delete this cleaning record?', async () => {
        const { error } = await window.sb.from('weapon_cleanings').delete().eq('id', btn.dataset.id)
        if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
        Utils.showToast('Cleaning record deleted.')
        await loadAll()
      }, 'Delete Record'))
    })

    document.querySelectorAll('.del-malfunction-btn').forEach(btn => {
      btn.addEventListener('click', () => Utils.confirmDialog('Delete this malfunction record?', async () => {
        const { error } = await window.sb.from('weapon_malfunctions').delete().eq('id', btn.dataset.id)
        if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
        Utils.showToast('Malfunction record deleted.')
        await loadAll()
      }, 'Delete Record'))
    })

    document.querySelectorAll('.del-part-btn').forEach(btn => {
      btn.addEventListener('click', () => Utils.confirmDialog('Delete this parts record?', async () => {
        const { error } = await window.sb.from('weapon_parts_replaced').delete().eq('id', btn.dataset.id)
        if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
        Utils.showToast('Parts record deleted.')
        await loadAll()
      }, 'Delete Record'))
    })
  }

  function openLogCleaningModal(weaponId) {
    const weapon = _items.find(i => i.id === weaponId)
    Utils.openModal(`Log Cleaning — ${weapon ? Utils.esc(weapon.name) : ''}`, `
      <form id="cleaning-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date <span style="color:var(--color-red)">*</span></label>
            <input type="date" name="cleaned_date" class="form-input" value="${new Date().toISOString().slice(0,10)}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Total Rounds Through Gun</label>
            <input type="number" name="round_count" class="form-input" placeholder="e.g. 1500" min="0" max="999999" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Products Used</label>
          <input type="text" name="products_used" class="form-input" placeholder="e.g. Hoppes No.9, Ballistol, CLP" maxlength="200" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Condition found, inspection notes, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="cleaning-submit">Save</button>
        </div>
      </form>
    `)
    document.getElementById('cleaning-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const btn = document.getElementById('cleaning-submit')
      btn.disabled = true; btn.textContent = 'Saving...'
      const { error } = await window.sb.from('weapon_cleanings').insert({
        weapon_id: weaponId, user_id: _userId,
        cleaned_date: fd.get('cleaned_date'),
        round_count: fd.get('round_count') ? parseInt(fd.get('round_count')) : null,
        products_used: fd.get('products_used').trim() || null,
        notes: fd.get('notes').trim() || null,
      })
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save'; return }
      Utils.closeModal(); Utils.showToast('Cleaning logged!'); await loadAll()
    })
  }

  function openLogMalfunctionModal(weaponId) {
    const weapon = _items.find(i => i.id === weaponId)
    Utils.openModal(`Log Malfunction — ${weapon ? Utils.esc(weapon.name) : ''}`, `
      <form id="mal-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date <span style="color:var(--color-red)">*</span></label>
            <input type="date" name="mal_date" class="form-input" value="${new Date().toISOString().slice(0,10)}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Type <span style="color:var(--color-red)">*</span></label>
            <select name="mal_type" class="form-select" required>
              <option value="FTF">FTF — Failure to Feed</option>
              <option value="FTE">FTE — Failure to Eject</option>
              <option value="double_feed">Double Feed</option>
              <option value="stovepipe">Stovepipe</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rounds at Time of Malfunction</label>
            <input type="number" name="round_count" class="form-input" placeholder="e.g. 2347" min="0" max="999999" />
          </div>
          <div class="form-group">
            <label class="form-label">Ammo Used</label>
            <input type="text" name="ammo_used" class="form-input" placeholder="e.g. Federal 115gr 9mm" maxlength="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Resolution</label>
          <input type="text" name="resolution" class="form-input" placeholder="e.g. Tap-rack cleared, replaced extractor" maxlength="200" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Additional context, ammo lot, conditions, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="mal-submit">Save</button>
        </div>
      </form>
    `)
    document.getElementById('mal-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const btn = document.getElementById('mal-submit')
      btn.disabled = true; btn.textContent = 'Saving...'
      const { error } = await window.sb.from('weapon_malfunctions').insert({
        weapon_id: weaponId, user_id: _userId,
        mal_date: fd.get('mal_date'),
        mal_type: fd.get('mal_type'),
        round_count: fd.get('round_count') ? parseInt(fd.get('round_count')) : null,
        ammo_used: fd.get('ammo_used').trim() || null,
        resolution: fd.get('resolution').trim() || null,
        notes: fd.get('notes').trim() || null,
      })
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save'; return }
      Utils.closeModal(); Utils.showToast('Malfunction logged.'); await loadAll()
    })
  }

  function openLogPartModal(weaponId) {
    const weapon = _items.find(i => i.id === weaponId)
    Utils.openModal(`Log Part Replacement — ${weapon ? Utils.esc(weapon.name) : ''}`, `
      <form id="part-form" autocomplete="off">
        <div class="form-group">
          <label class="form-label">Part Name <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="part_name" class="form-input" placeholder="e.g. Recoil spring, Extractor, Barrel" required maxlength="100" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date Replaced</label>
            <input type="date" name="replaced_date" class="form-input" value="${new Date().toISOString().slice(0,10)}" />
          </div>
          <div class="form-group">
            <label class="form-label">Rounds at Replacement</label>
            <input type="number" name="round_count" class="form-input" placeholder="e.g. 5000" min="0" max="999999" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Reason, brand of replacement part, condition of old part, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="part-submit">Save</button>
        </div>
      </form>
    `)
    document.getElementById('part-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const btn = document.getElementById('part-submit')
      btn.disabled = true; btn.textContent = 'Saving...'
      const { error } = await window.sb.from('weapon_parts_replaced').insert({
        weapon_id: weaponId, user_id: _userId,
        part_name: fd.get('part_name').trim(),
        replaced_date: fd.get('replaced_date') || null,
        round_count: fd.get('round_count') ? parseInt(fd.get('round_count')) : null,
        notes: fd.get('notes').trim() || null,
      })
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save'; return }
      Utils.closeModal(); Utils.showToast('Part replacement logged!'); await loadAll()
    })
  }

  // ── Dope Card Button Bindings ───────────────────────────────

  function bindDopeBtns() {
    document.querySelectorAll('.wd-add-btn').forEach(btn =>
      btn.addEventListener('click', () => openAddDopeCardModal(btn.dataset.weaponId)))

    document.querySelectorAll('.dope-add-data-btn').forEach(btn =>
      btn.addEventListener('click', () => openAddDopeDataModal(btn.dataset.dopeId, btn.dataset.weaponId, btn.dataset.holdUnit)))

    document.querySelectorAll('.dope-print-btn').forEach(btn =>
      btn.addEventListener('click', () => printDopeCard(btn.dataset.dopeId)))

    document.querySelectorAll('.del-dope-btn').forEach(btn => {
      btn.addEventListener('click', () => Utils.confirmDialog('Delete this dope card and all its distance data?', async () => {
        const { error } = await window.sb.from('weapon_dope').delete().eq('id', btn.dataset.id)
        if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
        Utils.showToast('Dope card deleted.'); await loadAll()
      }, 'Delete Card'))
    })

    document.querySelectorAll('.del-dope-data-btn').forEach(btn => {
      btn.addEventListener('click', () => Utils.confirmDialog('Delete this distance data point?', async () => {
        const { error } = await window.sb.from('weapon_dope_data').delete().eq('id', btn.dataset.id)
        if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
        Utils.showToast('Data point deleted.'); await loadAll()
      }, 'Delete'))
    })
  }

  function openAddDopeCardModal(weaponId) {
    const weapon = _items.find(i => i.id === weaponId)
    Utils.openModal(`New Dope Card — ${weapon ? Utils.esc(weapon.name) : ''}`, `
      <form id="dope-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Optic / Sight <span style="color:var(--color-red)">*</span></label>
            <input type="text" name="optic_name" class="form-input" placeholder="e.g. Vortex Strike Eagle 1-6x, Trijicon MRO" required maxlength="100" />
          </div>
          <div class="form-group">
            <label class="form-label">Hold Unit</label>
            <select name="hold_unit" class="form-select">
              <option value="MOA">MOA</option>
              <option value="MIL">MIL</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Zero Distance (yd)</label>
            <input type="number" name="zero_distance_yd" class="form-input" placeholder="e.g. 100" min="1" max="2000" />
          </div>
          <div class="form-group">
            <label class="form-label">Zero Date</label>
            <input type="date" name="zero_date" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Ammo Used at Zero</label>
          <input type="text" name="ammo_used" class="form-input" placeholder="e.g. Federal Gold Medal 77gr OTM, PMC Bronze 55gr FMJ" maxlength="100" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Rounds at Zero</label>
            <input type="number" name="rounds_at_zero" class="form-input" placeholder="Total rds through gun" min="0" />
          </div>
          <div class="form-group">
            <label class="form-label">Altitude (ft)</label>
            <input type="number" name="altitude_ft" class="form-input" placeholder="e.g. 500" min="-1000" max="20000" />
          </div>
          <div class="form-group">
            <label class="form-label">Temperature (°F)</label>
            <input type="number" name="temp_f" class="form-input" placeholder="e.g. 72" min="-60" max="140" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Conditions, lighting, range notes, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="dope-submit">Save Dope Card</button>
        </div>
      </form>
    `)
    document.getElementById('dope-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const btn = document.getElementById('dope-submit')
      btn.disabled = true; btn.textContent = 'Saving...'
      const { error } = await window.sb.from('weapon_dope').insert({
        weapon_id: weaponId, user_id: _userId,
        optic_name: fd.get('optic_name').trim(),
        hold_unit: fd.get('hold_unit'),
        zero_distance_yd: fd.get('zero_distance_yd') ? parseInt(fd.get('zero_distance_yd')) : null,
        zero_date: fd.get('zero_date') || null,
        ammo_used: fd.get('ammo_used').trim() || null,
        rounds_at_zero: fd.get('rounds_at_zero') ? parseInt(fd.get('rounds_at_zero')) : null,
        altitude_ft: fd.get('altitude_ft') ? parseInt(fd.get('altitude_ft')) : null,
        temp_f: fd.get('temp_f') ? parseInt(fd.get('temp_f')) : null,
        notes: fd.get('notes').trim() || null,
      })
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Save Dope Card'; return }
      Utils.closeModal(); Utils.showToast('Dope card created!'); await loadAll()
    })
  }

  function openAddDopeDataModal(dopeId, weaponId, holdUnit) {
    Utils.openModal(`Add Distance Data — ${holdUnit} holds`, `
      <form id="dope-data-form" autocomplete="off">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Distance (yd) <span style="color:var(--color-red)">*</span></label>
            <input type="number" name="distance_yd" class="form-input" placeholder="e.g. 300" required min="1" max="3000" />
          </div>
          <div class="form-group">
            <label class="form-label">Elevation Hold (${Utils.esc(holdUnit)})</label>
            <input type="number" name="elevation_hold" class="form-input" placeholder="e.g. 4.25" step="0.01" min="-99" max="999" />
          </div>
          <div class="form-group">
            <label class="form-label">Windage Hold (${Utils.esc(holdUnit)})</label>
            <input type="number" name="windage_hold" class="form-input" placeholder="e.g. 0.5" step="0.01" min="-99" max="999" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <input type="text" name="notes" class="form-input" placeholder="e.g. Full value 10mph wind hold" maxlength="200" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="dope-data-submit">Add Distance</button>
        </div>
      </form>
    `)
    document.getElementById('dope-data-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const btn = document.getElementById('dope-data-submit')
      btn.disabled = true; btn.textContent = 'Saving...'
      const { error } = await window.sb.from('weapon_dope_data').insert({
        dope_id: dopeId,
        distance_yd: parseInt(fd.get('distance_yd')),
        elevation_hold: fd.get('elevation_hold') !== '' ? parseFloat(fd.get('elevation_hold')) : null,
        windage_hold: fd.get('windage_hold') !== '' ? parseFloat(fd.get('windage_hold')) : null,
        notes: fd.get('notes').trim() || null,
      })
      if (error) { Utils.showToast('Save failed: ' + error.message, 'error'); btn.disabled = false; btn.textContent = 'Add Distance'; return }
      Utils.closeModal(); Utils.showToast('Distance data added!'); await loadAll()
    })
  }

  function printDopeCard(dopeId) {
    // Find card in _dopeMap
    let card = null
    let weaponName = ''
    for (const [wId, cards] of Object.entries(_dopeMap)) {
      card = cards.find(c => c.id === dopeId)
      if (card) { const w = _items.find(i => i.id === wId); weaponName = w ? w.name : ''; break }
    }
    if (!card) return

    const sortedData = [...(card.weapon_dope_data || [])].sort((a, b) => a.distance_yd - b.distance_yd)
    const holdUnit = card.hold_unit || 'MOA'

    let html = `<!DOCTYPE html><html><head><title>Dope Card</title>
    <style>
      @page { size: landscape; margin: 1.5cm; }
      body { font-family: Courier New, monospace; color: #000; background: #fff; padding: 0; }
      h1 { font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 2px solid #000; margin: 0 0 6px; }
      .meta { font-size: 0.7rem; color: #555; margin-bottom: 14px; display: flex; gap: 20px; flex-wrap: wrap; }
      .meta span { white-space: nowrap; }
      table { width: 100%; border-collapse: collapse; }
      th { text-align: left; border-bottom: 2px solid #000; padding: 5px 12px; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; }
      td { padding: 8px 12px; border-bottom: 1px solid #ccc; font-size: 1rem; }
      td:first-child { font-size: 1.2rem; font-weight: bold; }
      .footer { margin-top: 16px; font-size: 0.65rem; color: #aaa; }
    </style></head><body>`

    html += `<h1>${Utils.esc(weaponName)}${card.optic_name ? ' — ' + Utils.esc(card.optic_name) : ''}</h1>`
    html += `<div class="meta">`
    if (card.zero_distance_yd) html += `<span>Zero: ${card.zero_distance_yd}yd</span>`
    if (card.zero_date) html += `<span>Zeroed: ${Utils.formatDate(card.zero_date)}</span>`
    if (card.ammo_used) html += `<span>Ammo: ${Utils.esc(card.ammo_used)}</span>`
    if (card.altitude_ft) html += `<span>Alt: ${card.altitude_ft}ft</span>`
    if (card.temp_f) html += `<span>Temp: ${card.temp_f}°F</span>`
    if (card.rounds_at_zero) html += `<span>Rds at zero: ${card.rounds_at_zero.toLocaleString()}</span>`
    html += `</div>`

    if (sortedData.length > 0) {
      html += `<table><thead><tr>
        <th>Distance (yd)</th>
        <th>Elevation (${Utils.esc(holdUnit)})</th>
        <th>Windage (${Utils.esc(holdUnit)})</th>
        <th>Notes</th>
      </tr></thead><tbody>`
      sortedData.forEach(dp => {
        html += `<tr>
          <td>${dp.distance_yd}</td>
          <td>${dp.elevation_hold != null ? dp.elevation_hold : '—'}</td>
          <td>${dp.windage_hold != null ? dp.windage_hold : '—'}</td>
          <td style="font-size:0.85rem;">${Utils.esc(dp.notes || '')}</td>
        </tr>`
      })
      html += `</tbody></table>`
    } else {
      html += '<p>No distance data on this dope card.</p>'
    }

    if (card.notes) html += `<div class="footer">Notes: ${Utils.esc(card.notes)}</div>`
    html += `<div class="footer">Printed ${new Date().toLocaleDateString()} — LastStandLog</div>`
    html += `</body></html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.print()
  }

  return { init }
})()
