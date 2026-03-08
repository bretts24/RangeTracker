// Knowledge Center Module
;(async function () {
  Utils.initModal()

  let _allItems      = []
  let _users         = []
  let _activeCategory = Utils.getParam('category') || 'all'
  let _activeTag     = null
  let _sortOrder     = 'newest'
  let _searchQuery   = ''

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

  // ── Init ───────────────────────────────────────────────────────

  await Promise.all([loadUsers(), loadItems()])
  bindFilters()
  bindAddButton()
  bindSearchAndSort()

  document.querySelectorAll('.kc-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === _activeCategory)
  })

  // ── Load Data ──────────────────────────────────────────────────

  async function loadUsers() {
    const { data } = await window.sb.from('users').select('id, name')
    _users = data || []
  }

  async function loadItems() {
    const grid = document.getElementById('kc-grid')
    grid.innerHTML = Utils.skeletonCards(4)

    const { data, error } = await window.sb
      .from('knowledge_items')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state-icon">⚠</div>
          <div class="empty-state-title">Error Loading Resources</div>
          <div class="empty-state-desc">${Utils.esc(error.message)}</div>
        </div>`
      console.error(error)
      return
    }
    _allItems = data || []
    updateFilterCounts()
    renderItems()
  }

  // ── Count Badges on Filter Buttons ────────────────────────────

  function updateFilterCounts() {
    document.querySelectorAll('.kc-filter-btn').forEach(btn => {
      const cat = btn.dataset.cat
      const count = cat === 'all'
        ? _allItems.length
        : _allItems.filter(i => i.category === cat).length

      // Remove existing count badge if any
      const existing = btn.querySelector('.kc-filter-count')
      if (existing) existing.remove()

      if (count > 0) {
        const badge = document.createElement('span')
        badge.className = 'kc-filter-count'
        badge.textContent = count
        btn.appendChild(badge)
      }
    })
  }

  // ── Search & Sort Controls ─────────────────────────────────────

  function bindSearchAndSort() {
    const toolbar = document.querySelector('.kc-toolbar') || document.querySelector('.toolbar')
    if (!toolbar) return

    // Insert search + sort bar after the filter row
    const filtersEl = document.querySelector('.kc-filters')
    if (!filtersEl) return

    const controlsBar = document.createElement('div')
    controlsBar.className = 'kc-controls-bar'
    controlsBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-md);align-items:center;margin-bottom:var(--space-lg);'
    controlsBar.innerHTML = `
      <div class="search-bar" style="flex:1;min-width:200px;">
        <span class="search-bar-icon">⌕</span>
        <input type="text" id="kc-search-input" class="search-bar-input"
          placeholder="Search title, description, tags…"
          aria-label="Search knowledge resources" />
      </div>
      <div class="filter-chips" role="group" aria-label="Sort order">
        <button class="filter-chip active" data-sort="newest">Newest</button>
        <button class="filter-chip" data-sort="oldest">Oldest</button>
        <button class="filter-chip" data-sort="az">A–Z</button>
      </div>
    `
    filtersEl.insertAdjacentElement('afterend', controlsBar)

    const searchInput = document.getElementById('kc-search-input')
    let debounceTimer
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        _searchQuery = searchInput.value.trim()
        renderItems()
      }, 200)
    })

    document.querySelectorAll('.filter-chip[data-sort]').forEach(chip => {
      chip.addEventListener('click', () => {
        _sortOrder = chip.dataset.sort
        document.querySelectorAll('.filter-chip[data-sort]').forEach(c =>
          c.classList.toggle('active', c === chip)
        )
        renderItems()
      })
    })
  }

  // ── Filter & Render ────────────────────────────────────────────

  function getFilteredSorted() {
    let items = _activeCategory === 'all'
      ? [..._allItems]
      : _allItems.filter(i => i.category === _activeCategory)

    // Tag filter
    if (_activeTag) {
      items = items.filter(i => i.tags && i.tags.includes(_activeTag))
    }

    // Search filter
    if (_searchQuery) {
      const q = _searchQuery.toLowerCase()
      items = items.filter(i =>
        (i.title       && i.title.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.tags        && i.tags.some(t => t.toLowerCase().includes(q)))
      )
    }

    // Sort
    if (_sortOrder === 'oldest') {
      items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    } else if (_sortOrder === 'az') {
      items.sort((a, b) => a.title.localeCompare(b.title))
    } else {
      items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    return items
  }

  function renderItems() {
    const grid     = document.getElementById('kc-grid')
    const filtered = getFilteredSorted()

    if (_allItems.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state-icon">📚</div>
          <div class="empty-state-title">No Resources Yet</div>
          <div class="empty-state-desc">Start building your team's knowledge base — add videos, books, articles, gear recommendations, and training plans.</div>
          <button class="btn btn-primary empty-state-cta" id="kc-empty-add-btn">+ Add Resource</button>
        </div>`
      document.getElementById('kc-empty-add-btn')?.addEventListener('click', openAddModal)
      return
    }

    if (filtered.length === 0) {
      const context = _activeTag
        ? `tagged "${_activeTag}"`
        : _searchQuery
          ? `matching "${_searchQuery}"`
          : `in this category`
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state-icon">⌕</div>
          <div class="empty-state-title">No Resources Found</div>
          <div class="empty-state-desc">No resources ${Utils.esc(context)}. Try a different filter or search term.</div>
        </div>`
      return
    }

    grid.innerHTML = filtered.map(item => renderCard(item)).join('')

    grid.querySelectorAll('.kc-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        Utils.confirmDialog(
          'Remove this resource from the knowledge center?',
          () => deleteItem(btn.dataset.id),
          'Remove Resource'
        )
      })
    })

    grid.querySelectorAll('.kc-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id))
    })

    // Tag click → filter by that tag
    grid.querySelectorAll('.kc-tag[data-tag]').forEach(tag => {
      tag.addEventListener('click', () => {
        const clicked = tag.dataset.tag
        _activeTag = _activeTag === clicked ? null : clicked
        // Update visual state across all tags
        grid.querySelectorAll('.kc-tag[data-tag]').forEach(t =>
          t.classList.toggle('active', t.dataset.tag === _activeTag)
        )
        renderItems()
      })
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
      ? `<div class="kc-tags">
           ${item.tags.map(t => `
             <button class="kc-tag${_activeTag === t ? ' active' : ''}"
               data-tag="${Utils.esc(t)}"
               aria-label="Filter by tag: ${Utils.esc(t)}"
               aria-pressed="${_activeTag === t}">${Utils.esc(t)}</button>
           `).join('')}
         </div>`
      : ''

    return `
      <div class="kc-item kc-cat-${item.category}">
        <div class="kc-item-header">
          <div class="kc-item-title">${titleHTML}</div>
          <div style="display:flex;gap:4px;align-items:center;flex-shrink:0;">
            <span class="badge badge-medium" style="white-space:nowrap;">${catLabel}</span>
            <button class="btn btn-secondary btn-sm kc-edit-btn" data-id="${item.id}" aria-label="Edit resource">✎</button>
            <button class="btn btn-danger btn-sm kc-del-btn" data-id="${item.id}" aria-label="Remove resource">✕</button>
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

  // ── Category Filters ───────────────────────────────────────────

  function bindFilters() {
    document.querySelectorAll('.kc-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeCategory = btn.dataset.cat
        _activeTag      = null
        Utils.setParam('category', _activeCategory)
        document.querySelectorAll('.kc-filter-btn').forEach(b => b.classList.toggle('active', b === btn))
        renderItems()
      })
    })
  }

  // ── Add / Edit Modals ──────────────────────────────────────────

  function bindAddButton() {
    document.getElementById('kc-add-btn').addEventListener('click', openAddModal)
  }

  function buildResourceForm(prefill = {}) {
    const userOptions = _users.map(u =>
      `<option value="${u.id}" ${prefill.uploaded_by === u.id ? 'selected' : ''}>${Utils.esc(u.name)}</option>`
    ).join('')

    const catOptions = [
      ['video',            'Video'],
      ['book',             'Book'],
      ['article',          'Article'],
      ['gear_rec',         'Gear Recommendation'],
      ['prep_plan',        'Prep Plan'],
      ['tactics_training', 'Tactics / Training'],
      ['general_note',     'General Note'],
    ].map(([val, lbl]) =>
      `<option value="${val}" ${prefill.category === val ? 'selected' : ''}>${lbl}</option>`
    ).join('')

    return `
      <form id="kc-form">
        <div class="form-group">
          <label class="form-label">Title <span style="color:var(--color-red)">*</span></label>
          <input type="text" name="title" class="form-input"
            placeholder="Resource name or title" required maxlength="200"
            value="${Utils.esc(prefill.title || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">URL / Link (optional)</label>
          <input type="url" name="url" class="form-input"
            placeholder="https://…" maxlength="500"
            value="${Utils.esc(prefill.url || '')}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category <span style="color:var(--color-red)">*</span></label>
            <select name="category" class="form-select" required>${catOptions}</select>
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
          <textarea name="description" class="form-textarea"
            placeholder="What is this? Why is it useful?">${Utils.esc(prefill.description || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Tags (comma-separated)</label>
          <input type="text" name="tags" class="form-input"
            placeholder="e.g. medical, trauma, IFAK" maxlength="200"
            value="${Utils.esc((prefill.tags || []).join(', '))}" />
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="Utils.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${prefill.id ? 'Save Changes' : 'Add Resource'}</button>
        </div>
      </form>
    `
  }

  function openAddModal() {
    Utils.openModal('Add Knowledge Resource', buildResourceForm())

    document.getElementById('kc-form').addEventListener('submit', async e => {
      e.preventDefault()
      const payload = extractFormPayload(new FormData(e.target))
      const btn     = e.target.querySelector('[type=submit]')
      btn.disabled  = true; btn.textContent = 'Saving…'

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

  function openEditModal(id) {
    const item = _allItems.find(i => i.id === id)
    if (!item) return

    Utils.openModal('Edit Resource', buildResourceForm(item))

    document.getElementById('kc-form').addEventListener('submit', async e => {
      e.preventDefault()
      const payload = extractFormPayload(new FormData(e.target))
      const btn     = e.target.querySelector('[type=submit]')
      btn.disabled  = true; btn.textContent = 'Saving…'

      const { error } = await window.sb.from('knowledge_items').update(payload).eq('id', id)
      if (error) {
        Utils.showToast('Update failed: ' + error.message, 'error')
        btn.disabled = false; btn.textContent = 'Save Changes'
        return
      }
      Utils.closeModal()
      Utils.showToast('Resource updated!')
      await loadItems()
    })
  }

  function extractFormPayload(fd) {
    const tagsRaw = fd.get('tags').trim()
    return {
      title:       fd.get('title').trim(),
      url:         fd.get('url').trim() || null,
      category:    fd.get('category'),
      uploaded_by: fd.get('uploaded_by') || null,
      description: fd.get('description').trim() || null,
      tags:        tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : null,
    }
  }

  // ── Delete ─────────────────────────────────────────────────────

  async function deleteItem(id) {
    const { error } = await window.sb.from('knowledge_items').delete().eq('id', id)
    if (error) { Utils.showToast('Delete failed: ' + error.message, 'error'); return }
    Utils.showToast('Resource removed.')
    await loadItems()
  }
})()
