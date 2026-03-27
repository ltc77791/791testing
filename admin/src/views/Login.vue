<template>
  <div class="login-wrapper">
    <el-card class="login-card" shadow="always">
      <template #header>
        <h2 class="login-title">备件管理系统</h2>
      </template>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="0"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            style="width: 100%"
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- ★ Feature #2: Force change password dialog -->
    <el-dialog
      v-model="showForceChange"
      title="首次登录 — 请修改密码"
      width="420px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <el-alert type="warning" :closable="false" style="margin-bottom: 16px">
        您使用的是默认密码，为安全起见请立即修改密码。
      </el-alert>
      <el-form ref="changePwdRef" :model="changePwdForm" :rules="changePwdRules" label-width="80px">
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="changePwdForm.newPassword" type="password" show-password placeholder="至少8位，含大小写字母和数字" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="changePwdForm.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="changingPwd" @click="handleForceChange">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useAuthStore } from '../stores/auth'
import http from '../utils/http'

const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

// ★ Feature #2: Force change password state
const showForceChange = ref(false)
const changePwdRef = ref<FormInstance>()
const changingPwd = ref(false)
const changePwdForm = reactive({ newPassword: '', confirmPassword: '' })

// ★ Feature #4: Password complexity rules
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
const changePwdRules = {
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码至少8位', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value && !passwordPattern.test(value)) {
          callback(new Error('密码必须包含大写字母、小写字母和数字'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (_rule: any, value: string, callback: any) => {
        if (value !== changePwdForm.newPassword) callback(new Error('两次密码不一致'))
        else callback()
      },
      trigger: 'blur',
    },
  ],
}

// Temporary storage for the old password (needed for change-password API)
let tempOldPassword = ''

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await authStore.login(form.username, form.password)

    if (authStore.mustChangePassword) {
      tempOldPassword = form.password
      showForceChange.value = true
      return
    }

    ElMessage.success('登录成功')
    router.replace('/')
  } catch {
    // http interceptor handles error display
  } finally {
    loading.value = false
  }
}

async function handleForceChange() {
  const valid = await changePwdRef.value?.validate().catch(() => false)
  if (!valid) return

  changingPwd.value = true
  try {
    await http.post('/auth/change-password', {
      oldPassword: tempOldPassword,
      newPassword: changePwdForm.newPassword,
    })
    ElMessage.success('密码修改成功，请使用新密码重新登录')
    showForceChange.value = false
    tempOldPassword = ''
    // Clear session and redirect to login
    authStore.user = null
    localStorage.removeItem('sp_user')
  } catch {
    // handled by interceptor
  } finally {
    changingPwd.value = false
  }
}
</script>

<style scoped>
.login-wrapper {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  width: 400px;
}

.login-title {
  text-align: center;
  margin: 0;
  font-size: 22px;
  color: #303133;
}
</style>
