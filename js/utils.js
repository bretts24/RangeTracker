// Shared utilities — loaded after supabase-client.js, before page modules
window.Utils = (() => {
  // ── URL Params ─────────────────────────────────────────────
  function getParam(key) {
    return new URLSearchParams(window.location.search).get(key)
  }

  function setParam(key, value) {
    const params = new URLSearchParams(window.location.search)
    params.set(key, value)
    history.replaceState(null, '', '?' + params.toString())
  }

  // ── Date Formatting ────────────────────────────────────────
  function formatDate(isoString) {
    if (!isoString) return '—'
    const d = new Date(isoString)
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function formatDateShort(isoString) {
    if (!isoString) return '—'
    // Parse YYYY-MM-DD without timezone shifting
    const [y, m, d] = isoString.split('-')
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function getExpiryClass(dateStr) {
    if (!dateStr) return ''
    const now = new Date()
    const exp = new Date(dateStr)
    const days = (exp - now) / (1000 * 60 * 60 * 24)
    if (days < 0) return 'expiry-danger'
    if (days < 90) return 'expiry-warn'
    return ''
  }

  // ── Toast ──────────────────────────────────────────────────
  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container')
    if (!container) {
      container = document.createElement('div')
      container.id = 'toast-container'
      document.body.appendChild(container)
    }

    const icons = { success: '✓', error: '✕', info: 'ℹ' }
    const icon = icons[type] || '✓'
    const typeClass = type === 'error' ? ' toast-error' : type === 'info' ? ' toast-info' : ''

    const toast = document.createElement('div')
    toast.className = `toast${typeClass}`
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-content">${esc(message)}</span>
      <span class="toast-progress"></span>
    `
    container.appendChild(toast)

    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transition = 'opacity 0.3s'
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  // ── Confirm Dialog (replaces native confirm()) ─────────────
  function confirmDialog(message, onConfirm, dangerLabel = 'Confirm Delete') {
    const _prev = _lastFocusedEl
    openModal('Confirm Action', `
      <div class="confirm-dialog-message">${esc(message)}</div>
      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="confirm-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-danger" id="confirm-ok-btn">${esc(dangerLabel)}</button>
      </div>
    `)
    document.getElementById('confirm-cancel-btn').addEventListener('click', closeModal)
    document.getElementById('confirm-ok-btn').addEventListener('click', () => {
      closeModal()
      onConfirm()
    })
    // restore focus target after confirm dialog
    _lastFocusedEl = _prev
  }

  // ── Modal ──────────────────────────────────────────────────
  let _lastFocusedEl = null
  let _removeFocusTrap = null

  function openModal(title, bodyHTML) {
    _lastFocusedEl = document.activeElement
    const overlay = document.getElementById('modal-overlay')
    document.getElementById('modal-title').textContent = title
    document.getElementById('modal-body').innerHTML = bodyHTML
    overlay.classList.remove('hidden')
    overlay.setAttribute('aria-hidden', 'false')

    // Focus first focusable element
    requestAnimationFrame(() => {
      const focusable = getFocusable(overlay)
      if (focusable.length) focusable[0].focus()
      _removeFocusTrap = trapFocus(overlay)
    })
  }

  function closeModal() {
    const overlay = document.getElementById('modal-overlay')
    overlay.classList.add('hidden')
    overlay.setAttribute('aria-hidden', 'true')
    document.getElementById('modal-body').innerHTML = ''
    if (_removeFocusTrap) { _removeFocusTrap(); _removeFocusTrap = null }
    if (_lastFocusedEl) { _lastFocusedEl.focus(); _lastFocusedEl = null }
  }

  // ── Focus Trap ─────────────────────────────────────────────
  function getFocusable(container) {
    return Array.from(container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none')
  }

  function trapFocus(container) {
    function handler(e) {
      if (e.key !== 'Tab') return
      const focusable = getFocusable(container)
      if (!focusable.length) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }

  // ── Badge HTML ─────────────────────────────────────────────
  function statusBadge(status) {
    const map = {
      complete:    'badge-complete',
      in_progress: 'badge-in-progress',
      pending:     'badge-pending',
    }
    const label = status.replace('_', ' ')
    return `<span class="badge ${map[status] || 'badge-pending'}">${label}</span>`
  }

  function priorityBadge(priority) {
    const map = {
      critical: 'badge-critical',
      high:     'badge-high',
      medium:   'badge-medium',
      low:      'badge-low',
    }
    return `<span class="badge ${map[priority] || 'badge-medium'}">${priority}</span>`
  }

  // ── Escape HTML ────────────────────────────────────────────
  function esc(str) {
    if (!str) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── Init modal close button + keyboard escape ──────────────
  function initModal() {
    const overlay = document.getElementById('modal-overlay')
    if (!overlay) return

    // Set ARIA attributes
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-labelledby', 'modal-title')
    overlay.setAttribute('aria-hidden', 'true')

    overlay.querySelector('.modal-close').addEventListener('click', closeModal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal()
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) closeModal()
    })
  }

  // ── Back to Top ────────────────────────────────────────────
  function initBackToTop() {
    const btn = document.getElementById('back-to-top')
    if (!btn) return

    window.addEventListener('scroll', () => {
      btn.classList.toggle('visible', window.scrollY > 300)
    }, { passive: true })

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  // ── Skeleton helpers ───────────────────────────────────────
  function skeletonCards(count = 3) {
    return Array.from({ length: count }, () => `
      <div class="skeleton-card">
        <div class="skeleton-line skeleton-line-short skeleton-block"></div>
        <div class="skeleton-line skeleton-line-long skeleton-block" style="margin-top:8px;"></div>
        <div class="skeleton-line skeleton-line-med skeleton-block" style="margin-top:8px;opacity:0.5;"></div>
      </div>
    `).join('')
  }

  function skeletonRows(count = 4) {
    return Array.from({ length: count }, () => `
      <div class="skeleton-row">
        <div class="skeleton-cell skeleton-block"></div>
        <div class="skeleton-cell skeleton-block" style="flex:2;"></div>
        <div class="skeleton-cell skeleton-block" style="flex:0.5;"></div>
      </div>
    `).join('')
  }

  return {
    getParam, setParam,
    formatDate, formatDateShort, getExpiryClass,
    showToast, confirmDialog,
    openModal, closeModal,
    statusBadge, priorityBadge,
    esc,
    initModal, initBackToTop,
    skeletonCards, skeletonRows,
  }
})()
