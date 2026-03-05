// Add User page logic
;(function () {
  const form = document.getElementById('add-user-form')
  const submitBtn = document.getElementById('submit-btn')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = form.name.value.trim()
    if (!name) return

    submitBtn.disabled = true
    submitBtn.textContent = 'Creating...'

    const { data, error } = await window.sb
      .from('users')
      .insert({ name })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        Utils.showToast('That name is already taken. Try another.', 'error')
      } else {
        Utils.showToast('Error creating profile: ' + error.message, 'error')
        console.error(error)
      }
      submitBtn.disabled = false
      submitBtn.textContent = 'Create Profile'
      return
    }

    Utils.showToast('Profile created!')
    setTimeout(() => {
      window.location.href = `/profile.html?userId=${data.id}`
    }, 600)
  })
})()
