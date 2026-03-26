import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import AppLayout from '../components/AppLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/',
    component: AppLayout,
    redirect: '/overview',
    children: [
      // 数据分析
      {
        path: 'overview',
        name: 'Overview',
        component: () => import('../views/analytics/Overview.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        path: 'trend',
        name: 'Trend',
        component: () => import('../views/analytics/Trend.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        path: 'age',
        name: 'Age',
        component: () => import('../views/analytics/Age.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 用户管理
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('../views/users/UserManagement.vue'),
        meta: { roles: ['admin'] },
      },
      // 备件类型
      {
        path: 'part-types',
        name: 'PartTypes',
        component: () => import('../views/part-types/PartTypeManagement.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 字典管理
      {
        path: 'dictionaries',
        name: 'Dictionaries',
        component: () => import('../views/dictionaries/DictionaryManagement.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 库存管理
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('../views/inventory/InventoryList.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 入库
      {
        path: 'inbound',
        name: 'Inbound',
        component: () => import('../views/inventory/InboundPage.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 申请出库 — 仅 user 角色（权限隔离：审批者不可申请）
      {
        path: 'requests',
        name: 'Requests',
        component: () => import('../views/requests/RequestPage.vue'),
        meta: { roles: ['operator'] },
      },
      // 审批管理
      {
        path: 'approvals',
        name: 'Approvals',
        component: () => import('../views/requests/ApprovalPage.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 系统日志
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../views/logs/LogViewer.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

// 路由守卫
let sessionVerified = false

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  // 只在初次加载（刷新页面且内存空）时从 localStorage 恢复
  if (!authStore.user) {
    authStore.restoreFromToken()
  }

  // 公开页面直接放行
  if (to.meta.public) {
    // 已登录用户访问登录页 → 跳转首页
    if (to.path === '/login' && authStore.isLoggedIn) {
      return next('/')
    }
    return next()
  }

  // 未登录 → 跳转登录页
  if (!authStore.isLoggedIn) {
    return next('/login')
  }

  // Verify session with server on first non-public navigation
  if (!sessionVerified) {
    sessionVerified = true
    const valid = await authStore.verifySession()
    if (!valid) {
      return next('/login')
    }
  }

  // 角色权限检查
  const requiredRoles = to.meta.roles as string[] | undefined
  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = authStore.roles
    const hasAccess = requiredRoles.some((r) => userRoles.includes(r))
    if (!hasAccess) {
      // 无权限 → 管理员跳审批页，普通用户跳申请页
      const isApprover = userRoles.includes('admin') || userRoles.includes('manager')
      const fallback = isApprover ? '/approvals' : '/requests'
      return next(fallback)
    }
  }

  next()
})

export default router
