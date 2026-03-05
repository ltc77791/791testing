import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '../router'

const TOKEN_KEY = 'sp_token'

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// 请求拦截器: 自动附加 JWT token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器: 统一错误处理
http.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const status = err.response?.status
    const msg = err.response?.data?.message

    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      router.replace('/login')
      ElMessage.error(msg || '登录已过期，请重新登录')
    } else if (status === 403) {
      ElMessage.error(msg || '无权限执行此操作')
    } else if (status === 400) {
      ElMessage.error(msg || '请求参数错误')
    } else if (status === 404) {
      ElMessage.error(msg || '请求的资源不存在')
    } else if (status && status >= 500) {
      ElMessage.error(msg || '服务器错误，请稍后重试')
    } else {
      ElMessage.error('网络连接失败，请检查网络')
    }

    return Promise.reject(err)
  },
)

export { TOKEN_KEY }
export default http
