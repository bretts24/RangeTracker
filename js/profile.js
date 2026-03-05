// Profile page orchestrator — runs last, after all modules are defined
;(async function () {
  Utils.initModal()

  const userId = Utils.getParam('userId')
  if (!userId) {
    window.location.href = '/index.html'
    return
  }

  // ── Load user ──────────────────────────────────────────────
  const { data: user, error } = await window.sb
    .from('users')
    .select('id, name')
    .eq('id', userId)
    .single()

  if (error || !user) {
    Utils.showToast('Operator not found.', 'error')
    setTimeout(() => { window.location.href = '/index.html' }, 1500)
    return
  }

  document.title = `${user.name} — LastStandLog`
  document.getElementById('profile-name').textContent = user.name
  document.getElementById('profile-avatar').textContent = user.name.charAt(0).toUpperCase()

  // ── Tab switching ──────────────────────────────────────────
  const tabBtns = document.querySelectorAll('.tab-btn')
  const tabSections = document.querySelectorAll('.tab-section')
  const initialized = {}

  function activateTab(tabName) {
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabName))
    tabSections.forEach(s => s.classList.toggle('active', s.id === `tab-${tabName}`))
    Utils.setParam('tab', tabName)

    if (!initialized[tabName]) {
      initialized[tabName] = true
      if (tabName === 'loadout')   window.LoadoutModule.init(userId)
      if (tabName === 'rangelog')  window.RangeLogModule.init(userId)
      if (tabName === 'shtf')      window.SHTFModule.init(userId)
    }
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab))
  })

  // Start on the correct tab
  const startTab = Utils.getParam('tab') || 'loadout'
  activateTab(startTab)
})()
