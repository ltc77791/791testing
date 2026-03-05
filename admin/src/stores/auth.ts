import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http, { TOKEN_KEY } from '../utils/http'

export interface UserInfo {
  username: string
  roles: string[]
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem(TOKEN_KEY) || '')
  const user = ref<UserInfo | null>(null)

  const isLoggedIn = computed(() => !!token.value)
  const roles = computed(() => user.value?.roles || [])
  const isAdmin = computed(() => roles.value.includes('admin'))
  const isManager = computed(() => roles.value.includes('manager') || isAdmin.value)

  async function login(username: string, password: string) {
    const res: any = await http.post('/auth/login', { username, password })
    token.value = res.data.token
    user.value = res.data.user
    localStorage.setItem(TOKEN_KEY, res.data.token)
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  // 从 token 中恢复用户信息 (页面刷新时)
  function restoreFromToken() {
    if (!token.value) return
    try {
      const payload = JSON.parse(atob(token.value.split('.')[1]))
      user.value = { username: payload.username, roles: payload.roles }
    } catch {
      logout()
    }
  }

  return { token, user, isLoggedIn, roles, isAdmin, isManager, login, logout, restoreFromToken }
})
