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
    const toast = document.createElement('div')
    toast.className = `toast${type === 'error' ? ' toast-error' : type === 'info' ? ' toast-info' : ''}`
    toast.textContent = message
    container.appendChild(toast)
    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transition = 'opacity 0.3s'
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  // ── Modal ──────────────────────────────────────────────────
  function openModal(title, bodyHTML) {
    const overlay = document.getElementById('modal-overlay')
    document.getElementById('modal-title').textContent = title
    document.getElementById('modal-body').innerHTML = bodyHTML
    overlay.classList.remove('hidden')
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden')
    document.getElementById('modal-body').innerHTML = ''
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
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ── Init modal close button ────────────────────────────────
  function initModal() {
    const overlay = document.getElementById('modal-overlay')
    if (!overlay) return
    overlay.querySelector('.modal-close').addEventListener('click', closeModal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal()
    })
  }

  return { getParam, setParam, formatDate, formatDateShort, getExpiryClass, showToast, openModal, closeModal, statusBadge, priorityBadge, esc, initModal }
})()
