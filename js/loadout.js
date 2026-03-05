// Loadout Module
window.LoadoutModule = (() => {
  let _userId = null
  let _initialized = false
  let _items = []
  let _attachMap = {}

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

  // Maps weapon_attachment.attachment_type → loadout_items.category
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
    await loadAll()
  }

  async function loadAll() {
    const [itemsResult, attachResult] = await Promise.all([
      window.sb.from('loadout_items').select('*').eq('user_id', _userId).order('created_at', { ascending: true }),
      window.sb.from('weapon_attachments').select('*').eq('user_id', _userId).order('created_at', { ascending: true }),
    ])

    if (itemsResult.error) {
      document.getElementById('loadout-content').innerHTML = '<p class="loading-text">Error loading loadout.</p>'
      console.error(itemsResult.error)
      return
    }

    const items = itemsResult.data || []
    const attachments = attachResult.data || []

    // Build map: weapon_id → [attachments]
    const attachMap = {}
    attachments.forEach(a => {
      if (!attachMap[a.weapon_id]) attachMap[a.weapon_id] = []
      attachMap[a.weapon_id].push(a)
    })

    _items = items
    _attachMap = attachMap
    renderAll(items, attachMap)
  }

  function renderAll(items, attachMap) {
    const container = document.getElementById('loadout-content')

    if (items.length === 0) {
      container.innerHTML = '<p class="loading-text">No loadout items yet. Hit "+ Add Item" to get started.</p>'
      return
    }

    const html = GROUPS.map(group => {
      const groupItems = items.filter(item => group.categories.includes(item.category))
      if (group.key === 'weapons') return renderWeaponGroup(group, groupItems, attachMap)
      return renderSimpleGroup(group, groupItems)
    }).join('')

    container.innerHTML = html
    bindDeleteButtons()
    bindEditButtons()
    bindGroupToggles()
    bindWeaponCardToggles()
    bindRemoveAttachmentButtons()
  }

  // ── Weapon Group (card-based, CoD-style) ──────────────────

  function renderWeaponGroup(group, weapons, attachMap) {
    const count = weapons.length
    const bodyHTML = weapons.length === 0
      ? '<p class="loading-text" style="padding:16px 0;">No weapons added yet.</p>'
      : weapons.map(w => renderWeaponCard(w, attachMap[w.id] || [])).join('')

    return `
      <div class="loadout-group" data-group="${group.key}">
        <div class="loadout-group-header" data-toggle="${group.key}">
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
            <span class="build-item-name">${Utils.esc(a.name)}${a.brand ? ` <span class="build-item-brand">· ${Utils.esc(a.brand)}</span>` : ''}</span>
            <button class="btn-remove-attachment" data-id="${a.id}" data-weapon-id="${weapon.id}" title="Remove attachment">✕</button>
          </div>
        `).join('')}</div>`

    return `
      <div class="weapon-card" data-weapon-id="${weapon.id}">
        <div class="weapon-card-header" data-weapon-toggle="${weapon.id}">
          <div class="weapon-card-info">
            <span class="weapon-type-badge">${Utils.esc(CATEGORY_LABELS[weapon.category] || weapon.category)}</span>
            <span class="weapon-card-name">${Utils.esc(weapon.name)}</span>
            ${weapon.notes ? `<span class="weapon-card-notes">${Utils.esc(weapon.notes)}</span>` : ''}
          </div>
          <div class="weapon-card-actions">
            <span class="weapon-build-count">${attCount} part${attCount !== 1 ? 's' : ''}</span>
            <button class="btn btn-primary btn-sm add-weapon-att-btn" data-weapon-id="${weapon.id}">+ Part</button>
            <button class="btn btn-secondary btn-sm edit-loadout-btn" data-id="${weapon.id}">Edit</button>
            <button class="btn btn-danger btn-sm delete-loadout-btn" data-id="${weapon.id}">Remove</button>
            <span class="weapon-chevron">▼</span>
          </div>
        </div>
        <div class="weapon-card-build" id="weapon-build-${weapon.id}">${attHTML}</div>
      </div>
    `
  }

  // ── Simple Group (non-weapon, same table layout) ───────────

  function renderSimpleGroup(group, items) {
    const count = items.length
    const rowsHTML = items.length === 0
      ? `<tr><td colspan="6" class="table-empty">No ${group.label.toLowerCase()} items yet.</td></tr>`
      : items.map(item => `
          <tr>
            <td>${Utils.esc(CATEGORY_LABELS[item.category] || item.category)}</td>
            <td>${Utils.esc(item.name)}</td>
            <td>${Utils.esc(item.brand || '—')}</td>
            <td>${Utils.esc(item.notes || '—')}</td>
            <td>${Utils.formatDate(item.created_at)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-secondary btn-sm edit-loadout-btn" data-id="${item.id}" style="margin-right:4px;">Edit</button>
              <button class="btn btn-danger btn-sm delete-loadout-btn" data-id="${item.id}">Remove</button>
            </td>
          </tr>
        `).join('')

    return `
      <div class="loadout-group" data-group="${group.key}">
        <div class="loadout-group-header" data-toggle="${group.key}">
          <span class="loadout-group-title">${group.icon} ${group.label}</span>
          <span class="loadout-group-count">${count} item${count !== 1 ? 's' : ''}</span>
        </div>
        <div class="loadout-group-body" id="group-body-${group.key}">
          <div style="overflow-x:auto;">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Category</th><th>Name / Model</th><th>Brand</th><th>Notes</th><th>Added</th><th></th>
                </tr>
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
      header.addEventListener('click', () => {
        const key = header.dataset.toggle
        const body = document.getElementById(`group-body-${key}`)
        body.style.display = body.style.display === 'none' ? '' : 'none'
      })
    })
  }

  function bindWeaponCardToggles() {
    document.querySelectorAll('[data-weapon-toggle]').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.closest('button')) return
        const weaponId = header.dataset.weaponToggle
        const build = document.getElementById(`weapon-build-${weaponId}`)
        const card = header.closest('.weapon-card')
        const isOpen = card.classList.contains('weapon-card-open')
        build.style.display = isOpen ? 'none' : ''
        card.classList.toggle('weapon-card-open', !isOpen)
      })
    })

    document.querySelectorAll('.add-weapon-att-btn').forEach(btn => {
      btn.addEventListener('click', () => openAddAttachmentModal(btn.dataset.weaponId))
    })
  }

  function bindDeleteButtons() {
    document.querySelectorAll('.delete-loadout-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id))
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

    const modalEl         = document.querySelector('.modal')
    const categorySelect  = document.getElementById('elf-category')
    const nonWeaponSection    = document.getElementById('elf-nonweapon')
    const weaponBuilderSection = document.getElementById('elf-weapon-builder')

    categorySelect.value = item.category

    function updateMode() {
      const isW = WEAPON_CATEGORIES.includes(categorySelect.value)
      nonWeaponSection.style.display    = isW ? 'none' : ''
      weaponBuilderSection.style.display = isW ? '' : 'none'
      if (modalEl) modalEl.style.maxWidth = isW ? '720px' : '580px'
    }

    categorySelect.addEventListener('change', updateMode)
    updateMode()

    function renderPendingBuild(atts) {
      const container = document.getElementById('elf-pending-build')
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
        // Replace all attachments: delete existing, re-insert all in pendingAtts
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

  // ── Delete Loadout Item ────────────────────────────────────

  async function deleteItem(id) {
    if (!confirm('Remove this item from your loadout? All associated build parts will also be deleted.')) return
    const { error } = await window.sb.from('loadout_items').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Item removed.')
    await loadAll()
  }

  // ── Remove Attachment Modal (Delete or Move to Loadout) ────

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
          user_id: _userId,
          category,
          name: data.name,
          brand: data.brand || null,
          notes: data.notes || null,
        }),
      ])
      if (delResult.error || insResult.error) {
        Utils.showToast('Failed to move attachment.', 'error'); return
      }
      Utils.closeModal()
      Utils.showToast(`${data.name} moved to loadout!`)
      await loadAll()
    })

    document.getElementById('ra-delete').addEventListener('click', async () => {
      if (!confirm(`Permanently delete "${data.name}"?`)) return
      const { error: delErr } = await window.sb.from('weapon_attachments').delete().eq('id', attachmentId)
      if (delErr) { Utils.showToast('Delete failed: ' + delErr.message, 'error'); return }
      Utils.closeModal()
      Utils.showToast('Attachment deleted.')
      await loadAll()
    })
  }

  // ── Add Attachment to Existing Weapon ──────────────────────

  function openAddAttachmentModal(weaponId) {
    const attTypeOptions = ATTACHMENT_TYPES.map(t =>
      `<option value="${t.value}">${t.label}</option>`
    ).join('')

    Utils.openModal('Add Part to Build', `
      <form id="att-form">
        <div class="form-group">
          <label class="form-label">Attachment Type</label>
          <select name="attachment_type" class="form-select" required>
            ${attTypeOptions}
          </select>
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
          <textarea name="notes" class="form-textarea" placeholder="Additional details, specs, finish, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add to Build</button>
        </div>
      </form>
    `)

    document.getElementById('att-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const btn = e.target.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving...'

      const { error } = await window.sb.from('weapon_attachments').insert({
        weapon_id: weaponId,
        user_id: _userId,
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

  // ── Add Item Modal (category-aware, morphs for weapons) ────

  function bindAddButton() {
    document.getElementById('loadout-add-btn').addEventListener('click', openAddModal)
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

        <!-- Non-weapon fields -->
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

        <!-- Weapon builder — shown when a weapon category is selected -->
        <div id="lf-weapon-builder" style="display:none;">
          <div class="form-group">
            <label class="form-label">Notes / Config</label>
            <textarea name="weapon_notes" class="form-textarea" placeholder="Caliber, serial number, overall configuration overview..."></textarea>
          </div>

          <div class="weapon-builder-section">
            <div class="weapon-builder-header">
              <span class="weapon-builder-title">🔧 Build Parts</span>
              <button type="button" class="btn btn-primary btn-sm" id="lf-toggle-att">+ Add Attachment</button>
            </div>

            <!-- Inline add-attachment form -->
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

            <!-- Live build list (pending attachments before save) -->
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

    // Toggle inline attachment form
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
      const type = document.getElementById('lf-att-type').value
      const name = document.getElementById('lf-att-name').value.trim()
      const brand = document.getElementById('lf-att-brand').value.trim()
      if (!name) { document.getElementById('lf-att-name').focus(); return }

      pendingAtts.push({ type, name, brand, tempId: Date.now() + Math.random() })
      document.getElementById('lf-att-name').value = ''
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
      const fd = new FormData(e.target)
      const isWeapon = WEAPON_CATEGORIES.includes(fd.get('category'))
      const btn = document.getElementById('lf-submit')
      btn.disabled = true; btn.textContent = 'Saving...'

      const payload = {
        user_id: _userId,
        category: fd.get('category'),
        name: fd.get('name').trim(),
        brand: isWeapon ? null : (fd.get('brand')?.trim() || null),
        notes: isWeapon
          ? (fd.get('weapon_notes')?.trim() || null)
          : (fd.get('notes')?.trim() || null),
      }

      const { data: newItem, error } = await window.sb
        .from('loadout_items').insert(payload).select().single()

      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Add to Loadout'
        return
      }

      // Save all pending attachments for the new weapon
      if (isWeapon && pendingAtts.length > 0) {
        const attPayloads = pendingAtts.map(a => ({
          weapon_id: newItem.id,
          user_id: _userId,
          attachment_type: a.type,
          name: a.name,
          brand: a.brand || null,
        }))
        const { error: attErr } = await window.sb.from('weapon_attachments').insert(attPayloads)
        if (attErr) Utils.showToast('Weapon saved but some parts failed: ' + attErr.message, 'error')
      }

      Utils.closeModal()
      const partCount = pendingAtts.length
      Utils.showToast(
        isWeapon
          ? `Weapon added with ${partCount} part${partCount !== 1 ? 's' : ''}!`
          : 'Item added to loadout!'
      )
      await loadAll()
    })
  }

  return { init }
})()
