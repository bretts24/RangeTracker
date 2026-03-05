// Knowledge Center Module
;(async function () {
  Utils.initModal()

  let _allItems = []
  let _activeCategory = Utils.getParam('category') || 'all'
  let _users = []

  const CAT_LABELS = {
    all:              'All',
    video:            'Video',
    book:             'Book',
    article:          'Article',
    gear_rec:         'Gear Rec',
    prep_plan:        'Prep Plan',
    tactics_training: 'Tactics & Training',
    general_note:     'Note',
  }

  // ── Init ───────────────────────────────────────────────────
  await Promise.all([loadUsers(), loadItems()])
  bindFilters()
  bindAddButton()

  // Set active filter from URL
  document.querySelectorAll('.kc-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === _activeCategory)
  })

  // ── Load Data ──────────────────────────────────────────────
  async function loadUsers() {
    const { data } = await window.sb.from('users').select('id, name')
    _users = data || []
  }

  async function loadItems() {
    const { data, error } = await window.sb
      .from('knowledge_items')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      document.getElementById('kc-grid').innerHTML = '<p class="kc-empty">Error loading resources.</p>'
      console.error(error)
      return
    }
    _allItems = data || []
    renderItems()
  }

  // ── Filter & Render ────────────────────────────────────────
  function renderItems() {
    const grid = document.getElementById('kc-grid')
    const filtered = _activeCategory === 'all'
      ? _allItems
      : _allItems.filter(item => item.category === _activeCategory)

    if (filtered.length === 0) {
      grid.innerHTML = '<p class="kc-empty">No resources found in this category.</p>'
      return
    }

    grid.innerHTML = filtered.map(item => renderCard(item)).join('')

    grid.querySelectorAll('.kc-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteItem(btn.dataset.id))
    })
  }

  function renderCard(item) {
    const user = _users.find(u => u.id === item.uploaded_by)
    const uploaderName = user ? Utils.esc(user.name) : 'Unknown'
    const catLabel = CAT_LABELS[item.category] || item.category

    const titleHTML = item.url
      ? `<a href="${Utils.esc(item.url)}" target="_blank" rel="noopener noreferrer">${Utils.esc(item.title)} ↗</a>`
      : Utils.esc(item.title)

    const tagsHTML = item.tags && item.tags.length
      ? `<div class="kc-tags">${item.tags.map(t => `<span class="kc-tag">${Utils.esc(t)}</span>`).join('')}</div>`
      : ''

    return `
      <div class="kc-item kc-cat-${item.category}">
        <div class="kc-item-header">
          <div class="kc-item-title">${titleHTML}</div>
          <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
            <span class="badge badge-medium" style="white-space:nowrap;">${catLabel}</span>
            <button class="btn btn-danger btn-sm kc-del-btn" data-id="${item.id}">✕</button>
          </div>
        </div>
        ${item.description ? `<div class="kc-item-desc">${Utils.esc(item.description)}</div>` : ''}
        ${tagsHTML}
        <div class="kc-item-footer">
          <span class="kc-item-meta">Added by ${uploaderName} · ${Utils.formatDate(item.created_at)}</span>
        </div>
      </div>
    `
  }

  // ── Category Filters ───────────────────────────────────────
  function bindFilters() {
    document.querySelectorAll('.kc-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeCategory = btn.dataset.cat
        Utils.setParam('category', _activeCategory)
        document.querySelectorAll('.kc-filter-btn').forEach(b => b.classList.toggle('active', b === btn))
        renderItems()
      })
    })
  }

  // ── Add Modal ──────────────────────────────────────────────
  function bindAddButton() {
    document.getElementById('kc-add-btn').addEventListener('click', openAddModal)
  }

  function openAddModal() {
    const userOptions = _users.map(u => `<option value="${u.id}">${Utils.esc(u.name)}</option>`).join('')

    Utils.openModal('Add Knowledge Resource', `
      <form id="kc-form">
        <div class="form-group">
          <label class="form-label">Title <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="title" class="form-input" placeholder="Resource name or title" required maxlength="200" />
        </div>
        <div class="form-group">
          <label class="form-label">URL / Link (optional)</label>
          <input type="url" name="url" class="form-input" placeholder="https://..." maxlength="500" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category <span style="color:var(--color-red)">*</span></label>
            <select name="category" class="form-select" required>
              <option value="video">Video</option>
              <option value="book">Book</option>
              <option value="article">Article</option>
              <option value="gear_rec">Gear Recommendation</option>
              <option value="prep_plan">Prep Plan</option>
              <option value="tactics_training">Tactics / Training</option>
              <option value="general_note">General Note</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Added By</label>
            <select name="uploaded_by" class="form-select">
              <option value="">— Anonymous —</option>
              ${userOptions}
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <textarea name="description" class="form-textarea" placeholder="What is this? Why is it useful?"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Tags (comma-separated)</label>
          <input type="text" name="tags" class="form-input" placeholder="e.g. medical, trauma, IFAK" maxlength="200" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Add Resource</button>
        </div>
      </form>
    `)

    document.getElementById('kc-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const fd = new FormData(e.target)
      const tagsRaw = fd.get('tags').trim()
      const tags = tagsRaw
        ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
        : null

      const payload = {
        title: fd.get('title').trim(),
        url: fd.get('url').trim() || null,
        category: fd.get('category'),
        uploaded_by: fd.get('uploaded_by') || null,
        description: fd.get('description').trim() || null,
        tags: tags,
      }
      const btn = e.target.querySelector('[type=submit]')
      btn.disabled = true; btn.textContent = 'Saving...'

      const { error } = await window.sb.from('knowledge_items').insert(payload)
      if (error) {
        Utils.showToast('Save failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Add Resource'
        return
      }
      Utils.closeModal()
      Utils.showToast('Resource added!')
      await loadItems()
    })
  }

  // ── Delete ─────────────────────────────────────────────────
  async function deleteItem(id) {
    if (!confirm('Remove this resource?')) return
    const { error } = await window.sb.from('knowledge_items').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Resource removed.')
    await loadItems()
  }
})()
