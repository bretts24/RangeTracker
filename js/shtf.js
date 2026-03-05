// SHTF Tracker Module
window.SHTFModule = (() => {
  let _userId = null
  let _initialized = false
  let _activeSubTab = 'food'

  async function init(userId) {
    if (_initialized) return
    _userId = userId
    _initialized = true
    bindSubTabs()
    bindAddButtons()
    activateSubTab('food')
  }

  // ── Sub-tab Navigation ─────────────────────────────────────
  function bindSubTabs() {
    document.querySelectorAll('.shtf-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateSubTab(btn.dataset.shtf))
    })
  }

  const loadedTabs = {}

  function activateSubTab(name) {
    _activeSubTab = name
    document.querySelectorAll('.shtf-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.shtf === name))
    document.querySelectorAll('.shtf-subsection').forEach(s => s.classList.toggle('active', s.id === `shtf-${name}`))

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

  // ── Generic table loader ───────────────────────────────────
  async function loadSubSection(type) {
    if (type === 'prepplans') return loadPrepPlans()
    if (type === 'bugout')    return loadBugoutPlans()

    const tableMap = {
      food: 'shtf_food', water: 'shtf_water',
      medical: 'shtf_medical', gear: 'shtf_gear', ammo: 'shtf_ammo',
      seeds: 'shtf_seeds',
    }
    const table = tableMap[type]
    const container = document.getElementById(`shtf-${type}-content`)

    const { data, error } = await window.sb
      .from(table)
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: true })

    if (error) { container.innerHTML = '<p class="loading-text">Error loading data.</p>'; return }
    renderSimpleTable(type, data || [], container)
  }

  // ── Simple supply tables ───────────────────────────────────
  function renderSimpleTable(type, items, container) {
    if (items.length === 0) {
      container.innerHTML = `<p class="loading-text">No ${type} supplies logged yet.</p>`
      return
    }

    let headersHTML = ''
    let rowsFn = null

    if (type === 'food') {
      headersHTML = '<th>Item</th><th>Quantity</th><th>Expiry Date</th><th>Notes</th><th></th>'
      rowsFn = item => {
        const expClass = Utils.getExpiryClass(item.expiry_date)
        return `<tr>
          <td>${Utils.esc(item.item)}</td>
          <td>${Utils.esc(item.quantity || '—')}</td>
          <td class="${expClass}">${item.expiry_date ? Utils.formatDateShort(item.expiry_date) : '—'}</td>
          <td>${Utils.esc(item.notes || '—')}</td>
          <td><button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_food" data-id="${item.id}" data-type="food">✕</button></td>
        </tr>`
      }
    } else if (type === 'seeds') {
      headersHTML = '<th>Seed Name</th><th>Type</th><th>Variety</th><th>Heirloom</th><th>Qty</th><th>Harvest Yr</th><th>Rotate By</th><th>Storage</th><th>Germ %</th><th>Notes</th><th></th>'
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
          <td><button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_seeds" data-id="${item.id}" data-type="seeds">✕</button></td>
        </tr>`
      }
    } else if (type === 'ammo') {
      headersHTML = '<th>Caliber</th><th>Quantity</th><th>Brand</th><th>Notes</th><th></th>'
      rowsFn = item => `<tr>
        <td>${Utils.esc(item.caliber)}</td>
        <td>${item.quantity != null ? item.quantity + ' rds' : '—'}</td>
        <td>${Utils.esc(item.brand || '—')}</td>
        <td>${Utils.esc(item.notes || '—')}</td>
        <td><button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_ammo" data-id="${item.id}" data-type="ammo">✕</button></td>
      </tr>`
    } else {
      headersHTML = '<th>Item</th><th>Quantity</th><th>Notes</th><th></th>'
      rowsFn = item => `<tr>
        <td>${Utils.esc(item.item)}</td>
        <td>${Utils.esc(item.quantity || '—')}</td>
        <td>${Utils.esc(item.notes || '—')}</td>
        <td><button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_${type}" data-id="${item.id}" data-type="${type}">✕</button></td>
      </tr>`
    }

    container.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>${headersHTML}</tr></thead>
          <tbody>${items.map(rowsFn).join('')}</tbody>
        </table>
      </div>
    `

    container.querySelectorAll('.shtf-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.table, btn.dataset.id, btn.dataset.type))
    })
  }

  async function deleteItem(tableName, id, type) {
    if (!confirm('Remove this item?')) return
    const { error } = await window.sb.from(tableName).delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Item removed.')
    loadedTabs[type] = false
    loadSubSection(type)
  }

  // ── Prep Plans ─────────────────────────────────────────────
  async function loadPrepPlans() {
    const container = document.getElementById('shtf-prepplans-content')
    const { data, error } = await window.sb
      .from('shtf_prep_plans')
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: false })

    if (error) { container.innerHTML = '<p class="loading-text">Error loading plans.</p>'; return }
    renderPrepPlans(data || [], container)
  }

  function renderPrepPlans(plans, container) {
    if (plans.length === 0) {
      container.innerHTML = '<p class="loading-text">No prep plans yet. Add one to get started.</p>'
      return
    }

    container.innerHTML = plans.map(plan => `
      <div class="plan-card" data-priority="${plan.priority}">
        <div style="flex:1">
          <div class="plan-card-title">${Utils.esc(plan.title)}</div>
          ${plan.description ? `<div class="plan-card-desc">${Utils.esc(plan.description)}</div>` : ''}
          <div class="plan-card-actions">
            <select class="form-select" style="font-size:0.75rem;padding:2px 6px;width:auto;" data-plan-id="${plan.id}" data-field="status">
              <option value="pending"     ${plan.status === 'pending'     ? 'selected' : ''}>Pending</option>
              <option value="in_progress" ${plan.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
              <option value="complete"    ${plan.status === 'complete'    ? 'selected' : ''}>Complete</option>
            </select>
          </div>
        </div>
        <div class="plan-card-badges">
          ${Utils.priorityBadge(plan.priority)}
          ${Utils.statusBadge(plan.status)}
          <button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_prep_plans" data-id="${plan.id}" data-type="prepplans">✕</button>
        </div>
      </div>
    `).join('')

    // Status update dropdowns
    container.querySelectorAll('select[data-plan-id]').forEach(sel => {
      sel.addEventListener('change', async () => {
        const { error } = await window.sb
          .from('shtf_prep_plans')
          .update({ status: sel.value })
          .eq('id', sel.dataset.planId)
        if (error) { Utils.showToast('Update failed', 'error'); return }
        Utils.showToast('Status updated.')
        loadedTabs['prepplans'] = false
        loadPrepPlans()
      })
    })

    container.querySelectorAll('.shtf-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.table, btn.dataset.id, btn.dataset.type))
    })
  }

  // ── Bug-Out Plans ──────────────────────────────────────────
  async function loadBugoutPlans() {
    const container = document.getElementById('shtf-bugout-content')
    const { data, error } = await window.sb
      .from('shtf_bugout_plans')
      .select('*')
      .eq('user_id', _userId)
      .order('created_at', { ascending: false })

    if (error) { container.innerHTML = '<p class="loading-text">Error loading bug-out plans.</p>'; return }
    renderBugoutPlans(data || [], container)
  }

  function renderBugoutPlans(plans, container) {
    if (plans.length === 0) {
      container.innerHTML = '<p class="loading-text">No bug-out plans yet.</p>'
      return
    }
    container.innerHTML = plans.map(plan => `
      <div class="plan-card" data-priority="medium">
        <div style="flex:1">
          <div class="plan-card-title">${Utils.esc(plan.title)}</div>
          ${plan.description ? `<div class="plan-card-desc">${Utils.esc(plan.description)}</div>` : ''}
          ${plan.route       ? `<div class="plan-card-desc"><strong>Route:</strong> ${Utils.esc(plan.route)}</div>` : ''}
          ${plan.destination ? `<div class="plan-card-desc"><strong>Destination:</strong> ${Utils.esc(plan.destination)}</div>` : ''}
          ${plan.notes       ? `<div class="plan-card-desc" style="font-style:italic;">${Utils.esc(plan.notes)}</div>` : ''}
        </div>
        <div class="plan-card-badges">
          <button class="btn btn-danger btn-sm shtf-del-btn" data-table="shtf_bugout_plans" data-id="${plan.id}" data-type="bugout">✕</button>
        </div>
      </div>
    `).join('')

    container.querySelectorAll('.shtf-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.table, btn.dataset.id, btn.dataset.type))
    })
  }

  // ── Add Modals ─────────────────────────────────────────────
  function openAddModal(type) {
    const forms = {
      food:     addFoodForm,
      water:    addSupplyForm('water', 'Water Supply'),
      medical:  addSupplyForm('medical', 'Medical Item'),
      gear:     addSupplyForm('gear', 'Gear Item'),
      ammo:     addAmmoForm,
      prepplans: addPrepPlanForm,
      bugout:   addBugoutForm,
      seeds:    addSeedBankForm,
    }
    const formFn = forms[type]
    if (formFn) formFn()
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
          <button type="submit" class="btn btn-primary">Add</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      await saveItem('shtf_food', {
        user_id: _userId,
        item: fd.get('item').trim(),
        quantity: fd.get('quantity').trim() || null,
        expiry_date: fd.get('expiry_date') || null,
        notes: fd.get('notes').trim() || null,
      }, 'food', e.target)
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
            <button type="submit" class="btn btn-primary">Add</button>
          </div>
        </form>
      `)
      document.getElementById('shtf-form').addEventListener('submit', async (e) => {
        e.preventDefault()
        const fd = new FormData(e.target)
        await saveItem(`shtf_${type}`, {
          user_id: _userId,
          item: fd.get('item').trim(),
          quantity: fd.get('quantity').trim() || null,
          notes: fd.get('notes').trim() || null,
        }, type, e.target)
      })
    }
  }

  function addAmmoForm() {
    Utils.openModal('Add Ammo Stockpile', `
      <form id="shtf-form">
        <div class="form-group">
          <label class="form-label">Caliber <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="caliber" class="form-input" placeholder="e.g. 5.56 NATO, 9mm, .308" required maxlength="60" />
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
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Grain weight, storage location, lot #, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const qty = fd.get('quantity')
      await saveItem('shtf_ammo', {
        user_id: _userId,
        caliber: fd.get('caliber').trim(),
        quantity: qty ? parseInt(qty) : null,
        brand: fd.get('brand').trim() || null,
        notes: fd.get('notes').trim() || null,
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
          <textarea name="description" class="form-textarea" placeholder="Details, tasks, milestones..."></textarea>
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
    document.getElementById('shtf-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      await saveItem('shtf_prep_plans', {
        user_id: _userId,
        title: fd.get('title').trim(),
        description: fd.get('description').trim() || null,
        priority: fd.get('priority'),
        status: fd.get('status'),
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
          <textarea name="description" class="form-textarea" placeholder="Scenario, trigger conditions, team size..."></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Route</label>
            <input type="text" name="route" class="form-input" placeholder="e.g. I-20 West to FM 123" maxlength="200" />
          </div>
          <div class="form-group">
            <label class="form-label">Destination</label>
            <input type="text" name="destination" class="form-input" placeholder="e.g. Family property - Comanche County" maxlength="200" />
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
    document.getElementById('shtf-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      await saveItem('shtf_bugout_plans', {
        user_id: _userId,
        title: fd.get('title').trim(),
        description: fd.get('description').trim() || null,
        route: fd.get('route').trim() || null,
        destination: fd.get('destination').trim() || null,
        notes: fd.get('notes').trim() || null,
      }, 'bugout', e.target)
    })
  }

  function addSeedBankForm() {
    Utils.openModal('Add to Seed Bank', `
      <form id="shtf-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Seed Name <span style="color:var(--color-red)">*</span></label>
            <input type="text" name="seed_name" class="form-input" placeholder="e.g. Heirloom Tomato, Black Beans" required maxlength="120" />
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
            <small style="color:var(--color-text-muted);font-size:0.7rem;">When seeds should be swapped out for fresh stock</small>
          </div>
          <div class="form-group">
            <label class="form-label">Germination Rate %</label>
            <input type="number" name="germination_rate" class="form-input" placeholder="e.g. 85" min="0" max="100" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Storage Method</label>
          <input type="text" name="storage_method" class="form-input" placeholder="e.g. Vacuum sealed, cool/dark, mylar bag, freezer" maxlength="120" />
        </div>
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea name="notes" class="form-textarea" placeholder="Growing notes, planting depth, days to maturity, location, etc."></textarea>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Seeds</button>
        </div>
      </form>
    `)
    document.getElementById('shtf-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const harvestYr = fd.get('harvest_year')
      const germRate  = fd.get('germination_rate')
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
    btn.disabled = true; btn.textContent = 'Saving...'

    const { error } = await window.sb.from(tableName).insert(payload)
    if (error) {
      Utils.showToast('Save failed: ' + error.message, 'error')
      btn.disabled = false; btn.textContent = 'Add'
      return
    }
    Utils.closeModal()
    Utils.showToast('Saved!')
    loadedTabs[type] = false
    loadSubSection(type)
  }

  return { init }
})()
