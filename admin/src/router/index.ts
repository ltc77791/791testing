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
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        path: 'trend',
        name: 'Trend',
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      {
        path: 'age',
        name: 'Age',
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 用户管理
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin'] },
      },
      // 备件类型
      {
        path: 'part-types',
        name: 'PartTypes',
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 库存管理
      {
        path: 'inventory',
        name: 'Inventory',
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 入库
      {
        path: 'inbound',
        name: 'Inbound',
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 申请出库
      {
        path: 'requests',
        name: 'Requests',
        component: () => import('../views/Placeholder.vue'),
      },
      // 审批管理
      {
        path: 'approvals',
        name: 'Approvals',
        component: () => import('../views/Placeholder.vue'),
        meta: { roles: ['admin', 'manager'] },
      },
      // 系统日志
      {
        path: 'logs',
        name: 'Logs',
        component: () => import('../views/Placeholder.vue'),
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
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()

  // 刷新页面时从 token 恢复用户信息
  if (!authStore.user && authStore.token) {
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

  // 角色权限检查
  const requiredRoles = to.meta.roles as string[] | undefined
  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = authStore.roles
    const hasAccess = requiredRoles.some((r) => userRoles.includes(r))
    if (!hasAccess) {
      // 无权限 → 跳转到申请出库页 (所有角色都有权限的页面)
      return next('/requests')
    }
  }

  next()
})

export default router
