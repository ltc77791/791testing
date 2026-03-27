import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http from '../utils/http'
import { resetSessionVerified } from '../utils/session'

export interface UserInfo {
  username: string
  roles: string[]
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserInfo | null>(JSON.parse(localStorage.getItem('sp_user') || 'null'))
  const mustChangePassword = ref(false)
  // ★ Feature #5: Soft timeout minutes (default 15, overridden by server response)
  const softTimeoutMinutes = ref(Number(localStorage.getItem('sp_soft_timeout')) || 15)
  // ★ Hard timeout: milliseconds until JWT expires (set on login / verifySession)
  const hardTimeoutMs = ref(0)

  const isLoggedIn = computed(() => !!user.value)
  const roles = computed(() => user.value?.roles || [])
  const isAdmin = computed(() => roles.value.includes('admin'))
  const isManager = computed(() => roles.value.includes('manager') || isAdmin.value)

  async function login(username: string, password: string) {
    const res: any = await http.post('/auth/login', { username, password })
    user.value = res.data.user
    mustChangePassword.value = !!res.data.must_change_password
    if (res.data.softTimeoutMinutes) {
      softTimeoutMinutes.value = res.data.softTimeoutMinutes
      localStorage.setItem('sp_soft_timeout', String(res.data.softTimeoutMinutes))
    }
    if (res.data.hardTimeoutMs) {
      hardTimeoutMs.value = res.data.hardTimeoutMs
    }
    localStorage.setItem('sp_user', JSON.stringify(res.data.user))
  }

  async function logout() {
    try {
      await http.post('/auth/logout')
    } catch (e) {
      console.error('Logout request failed', e)
    } finally {
      user.value = null
      mustChangePassword.value = false
      localStorage.removeItem('sp_user')
      resetSessionVerified()
    }
  }

  function restoreFromToken() {
    const saved = localStorage.getItem('sp_user')
    if (saved) {
      try {
        user.value = JSON.parse(saved)
      } catch {
        user.value = null
      }
    }
  }

  async function verifySession(): Promise<boolean> {
    try {
      const res: any = await http.get('/auth/me')
      if (res.code === 0 && res.data) {
        user.value = { username: res.data.username, roles: res.data.roles }
        localStorage.setItem('sp_user', JSON.stringify(user.value))
        mustChangePassword.value = !!res.data.must_change_password
        if (res.data.softTimeoutMinutes) {
          softTimeoutMinutes.value = res.data.softTimeoutMinutes
          localStorage.setItem('sp_soft_timeout', String(res.data.softTimeoutMinutes))
        }
        if (res.data.hardTimeoutMs) {
          hardTimeoutMs.value = res.data.hardTimeoutMs
        }
        return true
      }
    } catch {
      // Session invalid
    }
    user.value = null
    localStorage.removeItem('sp_user')
    return false
  }

  return { user, isLoggedIn, roles, isAdmin, isManager, mustChangePassword, softTimeoutMinutes, hardTimeoutMs, login, logout, restoreFromToken, verifySession }
})
