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

  <!-- 修改密码弹窗 -->
  <el-dialog v-model="showChangePassword" title="修改密码" width="420px" @close="resetPwdForm">
    <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="80px">
      <el-form-item label="旧密码" prop="oldPassword">
        <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入当前密码" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少6位" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="showChangePassword = false">取消</el-button>
      <el-button type="primary" :loading="changingPwd" @click="handleChangePwd">确认修改</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import http from '../utils/http'
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

async function handleLogout() {
  await authStore.logout()
  router.replace('/login')
}

// ── 修改密码 ──
const pwdFormRef = ref<FormInstance>()
const changingPwd = ref(false)
const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const pwdRules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value !== pwdForm.newPassword) callback(new Error('两次密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

function resetPwdForm() {
  pwdForm.oldPassword = ''
  pwdForm.newPassword = ''
  pwdForm.confirmPassword = ''
  pwdFormRef.value?.resetFields()
}

async function handleChangePwd() {
  const valid = await pwdFormRef.value?.validate().catch(() => false)
  if (!valid) return

  changingPwd.value = true
  try {
    await http.post('/auth/change-password', {
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    })
    ElMessage.success('密码修改成功，请重新登录')
    showChangePassword.value = false
    authStore.logout()
    router.replace('/login')
  } catch {
    // handled by interceptor
  } finally {
    changingPwd.value = false
  }
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
