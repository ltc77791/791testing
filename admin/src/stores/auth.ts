import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import http from '../utils/http'

export interface UserInfo {
  username: string
  roles: string[]
}

export const useAuthStore = defineStore('auth', () => {
  // 依靠存在 user 来判断是否登录（Token 现由浏览器 HttpOnly Cookie 自动管理）
  const user = ref<UserInfo | null>(JSON.parse(localStorage.getItem('sp_user') || 'null'))

  const isLoggedIn = computed(() => !!user.value)
  const roles = computed(() => user.value?.roles || [])
  const isAdmin = computed(() => roles.value.includes('admin'))
  const isManager = computed(() => roles.value.includes('manager') || isAdmin.value)

  async function login(username: string, password: string) {
    const res: any = await http.post('/auth/login', { username, password })
    user.value = res.data.user
    // 仅存放不敏感的结构化数据用于刷新页面回显
    localStorage.setItem('sp_user', JSON.stringify(res.data.user))
  }

  async function logout() {
    try {
      await http.post('/auth/logout')
    } catch (e) {
      console.error('Logout request failed', e)
    } finally {
      user.value = null
      localStorage.removeItem('sp_user')
    }
  }

  // 因为信息存在 localStorage('sp_user')，不再需要解析 Token 恢复
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

  return { user, isLoggedIn, roles, isAdmin, isManager, login, logout, restoreFromToken }
})
