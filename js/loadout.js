// Loadout Module
window.LoadoutModule = (() => {
  let _userId = null
  let _initialized = false

  const GROUPS = [
    {
      key: 'weapons',
      label: 'Weapons',
      categories: ['rifle', 'pistol', 'shotgun', 'smg', 'pcc', 'other_weapon'],
      icon: '🔫',
    },
    {
      key: 'attachments',
      label: 'Weapon Attachments',
      categories: ['optic', 'suppressor', 'grip', 'light', 'laser', 'bipod', 'other_attachment'],
      icon: '🔭',
    },
    {
      key: 'knives',
      label: 'Knives',
      categories: ['fixed_blade', 'folding', 'other_knife'],
      icon: '🔪',
    },
    {
      key: 'gear',
      label: 'Gear',
      categories: ['plate', 'carrier', 'pouch', 'holster', 'belt', 'other_gear'],
      icon: '🎽',
    },
    {
      key: 'equipment',
      label: 'Equipment',
      categories: ['night_vision', 'comms', 'medical_kit', 'navigation', 'other_equipment'],
      icon: '🛠️',
    },
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
    const { data, error } = await window.sb
      .from('loadout_items')
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: true })

    if (error) {
      document.getElementById('loadout-content').innerHTML = '<p class="loading-text">Error loading loadout.</p>'
      console.error(error)
      return
    }

    renderAll(data || [])
  }

  function renderAll(items) {
    const container = document.getElementById('loadout-content')

    if (items.length === 0) {
      container.innerHTML = '<p class="loading-text">No loadout items yet. Hit "+ Add Item" to get started.</p>'
      return
    }

    const html = GROUPS.map(group => {
      const groupItems = items.filter(item => group.categories.includes(item.category))
      return renderGroup(group, groupItems)
    }).join('')

    container.innerHTML = html
    bindDeleteButtons()
    bindGroupToggles()
  }

  function renderGroup(group, items) {
    const count = items.length
    const rowsHTML = items.length === 0
      ? `<tr><td colspan="5" class="table-empty">No ${group.label.toLowerCase()} items yet.</td></tr>`
      : items.map(item => `
          <tr>
            <td>${Utils.esc(CATEGORY_LABELS[item.category] || item.category)}</td>
            <td>${Utils.esc(item.name)}</td>
            <td>${Utils.esc(item.brand || '—')}</td>
            <td>${Utils.esc(item.notes || '—')}</td>
            <td>${Utils.formatDate(item.created_at)}</td>
            <td><button class="btn btn-danger delete-loadout-btn" data-id="${item.id}">Remove</button></td>
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
                  <th>Category</th>
                  <th>Name / Model</th>
                  <th>Brand</th>
                  <th>Notes</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rowsHTML}</tbody>
            </table>
          </div>
        </div>
      </div>
    `
  }

  function bindGroupToggles() {
    document.querySelectorAll('[data-toggle]').forEach(header => {
      header.addEventListener('click', () => {
        const key = header.dataset.toggle
        const body = document.getElementById(`group-body-${key}`)
        const isHidden = body.style.display === 'none'
        body.style.display = isHidden ? '' : 'none'
      })
    })
  }

  function bindDeleteButtons() {
    document.querySelectorAll('.delete-loadout-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id))
    })
  }

  async function deleteItem(id) {
    if (!confirm('Remove this item from your loadout?')) return
    const { error } = await window.sb.from('loadout_items').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Item removed.')
    await loadAll()
  }

  function bindAddButton() {
    document.getElementById('loadout-add-btn').addEventListener('click', openAddModal)
  }

  function buildCategoryOptions(group) {
    const grouped = GROUPS.map(g => `
      <optgroup label="${g.label}">
        ${g.categories.map(c => `<option value="${c}">${CATEGORY_LABELS[c]}</option>`).join('')}
      </optgroup>
    `).join('')
    return grouped
  }

  function openAddModal() {
    Utils.openModal('Add Loadout Item', `
      <form id="loadout-form">
        <div class="form-group">
          <label class="form-label">Category</label>
          <select name="category" class="form-select" required>
            ${buildCategoryOptions()}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Name / Model <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="name" class="form-input" placeholder="e.g. BCM MK2 Upper, Glock 19 Gen5" required maxlength="100" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Brand / Manufacturer</label>
            <input type="text" name="brand" class="form-input" placeholder="e.g. BCM, Trijicon" maxlength="80" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Serial number, caliber, configuration details, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add to Loadout</button>
        </div>
      </form>
    `)

    document.getElementById('loadout-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const payload = {
        user_id: _userId,
        category: fd.get('category'),
        name: fd.get('name').trim(),
        brand: fd.get('brand').trim() || null,
        notes: fd.get('notes').trim() || null,
      }
      const submitBtn = e.target.querySelector('[type=submit]')
      submitBtn.disabled = true
      submitBtn.textContent = 'Saving...'

      const { error } = await window.sb.from('loadout_items').insert(payload)
      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        submitBtn.disabled = false
        submitBtn.textContent = 'Add to Loadout'
        return
      }
      Utils.closeModal()
      Utils.showToast('Item added to loadout!')
      await loadAll()
    })
  }

  return { init }
})()
