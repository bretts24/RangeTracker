// Home page — loads users and renders operator tiles
;(async function () {
  const grid = document.getElementById('user-tile-grid')

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

    grid.innerHTML = users.map((user) => `
      <a href="/profile.html?userId=${user.id}" class="tile">
        <span class="tile-name">${Utils.esc(user.name)}</span>
        <span class="tile-meta">Operator Profile</span>
      </a>
    `).join('')
  }

  await loadUsers()
})()
