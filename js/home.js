// Home page — loads users and renders operator tiles
;(async function () {
  const grid = document.getElementById('user-tile-grid')

  const ICONS = ['🎯', '🔫', '🪖', '⚔️', '🛡️', '🔰']

  function iconFor(index) {
    return ICONS[index % ICONS.length]
  }

  async function loadUsers() {
    const { data: users, error } = await window.sb
      .from('users')
      .select('id, name, created_at')
      .order('created_at', { ascending: true })

    if (error) {
      grid.innerHTML = '<p class="loading-text">Error loading operators. Check console.</p>'
      console.error(error)
      return
    }

    if (!users || users.length === 0) {
      grid.innerHTML = '<p class="loading-text">No operators found. Add one below.</p>'
      return
    }

    grid.innerHTML = users.map((user, i) => `
      <a href="/profile.html?userId=${user.id}" class="tile">
        <span class="tile-icon">${iconFor(i)}</span>
        <span class="tile-name">${Utils.esc(user.name)}</span>
        <span class="tile-meta">Operator Profile</span>
      </a>
    `).join('')
  }

  await loadUsers()
})()
