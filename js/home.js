// Home page — loads users and renders operator tiles
;(async function () {
  const grid = document.getElementById('user-tile-grid')

  async function loadUsers() {
    // Load users and their most recent range session date in parallel
    const [usersRes, sessionsRes] = await Promise.all([
      window.sb.from('users').select('id, name').order('created_at', { ascending: true }),
      window.sb.from('range_sessions').select('user_id, session_date').order('session_date', { ascending: false }),
    ])

    if (usersRes.error) {
      grid.innerHTML = '<p class="loading-text">Error loading operators. Check console.</p>'
      console.error(usersRes.error)
      return
    }

    const users    = usersRes.data || []
    const sessions = sessionsRes.data || []

    if (users.length === 0) {
      grid.innerHTML = '<p class="loading-text">No operators found. Add one below.</p>'
      return
    }

    // Build a map of userId → most recent session_date
    const lastActive = {}
    sessions.forEach(s => {
      if (!lastActive[s.user_id]) lastActive[s.user_id] = s.session_date
    })

    grid.innerHTML = users.map(user => {
      const lastDate = lastActive[user.id]
      const lastLabel = formatLastActive(lastDate)
      return `
        <a href="/profile.html?userId=${user.id}" class="tile">
          <span class="tile-name">${Utils.esc(user.name)}</span>
          <span class="tile-meta">Operator Profile</span>
          ${lastLabel ? `<span class="tile-last-active">${lastLabel}</span>` : ''}
        </a>
      `
    }).join('')
  }

  function formatLastActive(dateStr) {
    if (!dateStr) return null

    const [y, m, d]  = dateStr.split('-')
    const then       = new Date(y, m - 1, d)
    const now        = new Date()
    const today      = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays   = Math.round((today - then) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Active today'
    if (diffDays === 1) return 'Active yesterday'
    if (diffDays < 7)   return `Active ${diffDays}d ago`
    if (diffDays < 30)  return `Active ${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `Active ${Math.floor(diffDays / 30)}mo ago`
    return `Active ${Math.floor(diffDays / 365)}y ago`
  }

  await loadUsers()
})()
