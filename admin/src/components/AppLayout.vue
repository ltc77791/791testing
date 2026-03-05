<template>
  <el-container class="app-layout">
    <!-- 侧边栏 -->
    <el-aside :width="isCollapsed ? '64px' : '220px'">
      <div class="logo" @click="isCollapsed = !isCollapsed">
        <span v-if="!isCollapsed">备件管理系统</span>
        <span v-else>备</span>
      </div>
      <el-menu
        :default-active="route.path"
        :collapse="isCollapsed"
        router
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
      >
        <!-- 数据分析 — admin / manager -->
        <el-menu-item v-if="authStore.isManager" index="/overview">
          <el-icon><DataAnalysis /></el-icon>
          <template #title>数据概览</template>
        </el-menu-item>
        <el-menu-item v-if="authStore.isManager" index="/trend">
          <el-icon><TrendCharts /></el-icon>
          <template #title>趋势分析</template>
        </el-menu-item>
        <el-menu-item v-if="authStore.isManager" index="/age">
          <el-icon><Timer /></el-icon>
          <template #title>库龄分析</template>
        </el-menu-item>

        <!-- 用户管理 — admin only -->
        <el-menu-item v-if="authStore.isAdmin" index="/users">
          <el-icon><User /></el-icon>
          <template #title>用户管理</template>
        </el-menu-item>

        <!-- 备件类型 — admin / manager -->
        <el-menu-item v-if="authStore.isManager" index="/part-types">
          <el-icon><Files /></el-icon>
          <template #title>备件类型</template>
        </el-menu-item>

        <!-- 库存管理 — admin / manager -->
        <el-menu-item v-if="authStore.isManager" index="/inventory">
          <el-icon><Box /></el-icon>
          <template #title>库存管理</template>
        </el-menu-item>

        <!-- 入库 — admin / manager -->
        <el-menu-item v-if="authStore.isManager" index="/inbound">
          <el-icon><Download /></el-icon>
          <template #title>备件入库</template>
        </el-menu-item>

        <!-- 申请出库 — user only (审批者不可申请) -->
        <el-menu-item v-if="!authStore.isManager" index="/requests">
          <el-icon><DocumentAdd /></el-icon>
          <template #title>申请出库</template>
        </el-menu-item>

        <!-- 审批管理 — admin / manager -->
        <el-menu-item v-if="authStore.isManager" index="/approvals">
          <el-icon><Stamp /></el-icon>
          <template #title>审批管理</template>
        </el-menu-item>

        <!-- 系统日志 — admin / manager -->
        <el-menu-item v-if="authStore.isManager" index="/logs">
          <el-icon><Document /></el-icon>
          <template #title>系统日志</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- 主内容 -->
    <el-container>
      <el-header class="app-header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>{{ currentMenuTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown trigger="click">
            <span class="user-info">
              <el-icon><UserFilled /></el-icon>
              {{ authStore.user?.username }}
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="showChangePassword = true">
                  修改密码
                </el-dropdown-item>
                <el-dropdown-item divided @click="handleLogout">
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>

  <!-- 修改密码弹窗 (预留) -->
  <el-dialog v-model="showChangePassword" title="修改密码" width="400px">
    <p>修改密码功能将在步骤 5-3 实现</p>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import {
  DataAnalysis, TrendCharts, Timer, User, Files, Box,
  Download, DocumentAdd, Stamp, Document, UserFilled, ArrowDown,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const isCollapsed = ref(false)
const showChangePassword = ref(false)

const menuMap: Record<string, string> = {
  '/overview': '数据概览',
  '/trend': '趋势分析',
  '/age': '库龄分析',
  '/users': '用户管理',
  '/part-types': '备件类型',
  '/inventory': '库存管理',
  '/inbound': '备件入库',
  '/requests': '申请出库',
  '/approvals': '审批管理',
  '/logs': '系统日志',
}

const currentMenuTitle = computed(() => menuMap[route.path] || '备件管理系统')

function handleLogout() {
  authStore.logout()
  router.replace('/login')
}
</script>

<style scoped>
.app-layout {
  height: 100vh;
}

.el-aside {
  background-color: #304156;
  transition: width 0.3s;
  overflow-x: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 18px;
  font-weight: bold;
  cursor: pointer;
  white-space: nowrap;
  background-color: #263445;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e6e6e6;
  background: #fff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #606266;
}
</style>
