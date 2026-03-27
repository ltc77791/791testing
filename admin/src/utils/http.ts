import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'
import { resetSessionVerified } from './session'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
  withCredentials: true, // 重要：允许跨域请求携带 Cookie
})

// 请求拦截器: 移除手动 JWT 注入，由浏览器管理 HttpOnly Cookie
http.interceptors.request.use((config) => {
  return config
})

// 防止 401 时多个并发请求重复弹消息和跳转
let isRedirectingToLogin = false

// Allow external code (e.g. hard/soft timeout) to suppress 401 messages
export function beginAuthRedirect() {
  isRedirectingToLogin = true
}

// 响应拦截器: 统一错误处理
http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status
    const msg = err.response?.data?.message

    if (status === 401) {
      // 清除所有登录态：localStorage + Pinia store
      localStorage.removeItem('sp_user')
      // 动态引入 auth store 以避免循环依赖，直接清空 Pinia 状态
      import('../stores/auth').then(({ useAuthStore }) => {
        const authStore = useAuthStore()
        authStore.user = null
        authStore.mustChangePassword = false
      })
      // 重置 session verified 标记，下次登录后需重新验证
      resetSessionVerified()

      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true
        ElMessage.error(msg || '登录已过期，请重新登录')
        router.replace('/login').finally(() => {
          isRedirectingToLogin = false
        })
      }
    } else if (status === 423) {
      // ★ Feature #7: Account locked
      ElMessage.error(msg || '账户已锁定，请稍后重试')
    } else if (status === 403) {
      ElMessage.error(msg || '无权限执行此操作')
    } else if (status === 400) {
      ElMessage.error(msg || '请求参数错误')
    } else if (status === 404) {
      ElMessage.error(msg || '请求的资源不存在')
    } else if (status === 409) {
      ElMessage.error(msg || '数据冲突，请检查后重试')
    } else if (status && status >= 500) {
      ElMessage.error(msg || '服务器错误，请稍后重试')
    } else if (status) {
      ElMessage.error(msg || '请求失败')
    } else {
      ElMessage.error('网络连接失败，请检查网络')
    }

    return Promise.reject(err)
  },
)

export default http
