<template>
  <div class="user-management">
    <!-- 顶部操作栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon> 新增用户
      </el-button>
    </div>

    <!-- 用户表格 -->
    <el-table :data="userList" v-loading="loading" border stripe>
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column label="角色" min-width="120">
        <template #default="{ row }">
          <el-tag
            v-for="role in row.roles"
            :key="role"
            :type="roleTagType(role)"
            size="small"
            style="margin-right: 4px"
          >
            {{ roleLabel(role) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.is_active"
            @change="(val: boolean) => handleToggleActive(row, val)"
            :disabled="row.username === authStore.user?.username"
            active-text="启用"
            inactive-text="停用"
            inline-prompt
          />
        </template>
      </el-table-column>
      <el-table-column label="微信绑定" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.openid" type="success" size="small">已绑定</el-tag>
          <el-tag v-else type="info" size="small">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" min-width="160">
        <template #default="{ row }">
          {{ row.last_login ? formatTime(row.last_login) : '从未登录' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="160">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
          <el-button size="small" type="warning" @click="openResetPwdDialog(row)">
            重置密码
          </el-button>
          <el-button
            v-if="row.openid"
            size="small"
            type="info"
            @click="handleUnbindWx(row.username)"
          >
            解绑微信
          </el-button>
          <el-popconfirm
            title="确定要删除该用户吗？"
            @confirm="handleDelete(row.username)"
            :disabled="row.username === authStore.user?.username"
          >
            <template #reference>
              <el-button
                size="small"
                type="danger"
                :disabled="row.username === authStore.user?.username"
              >
                删除
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新增/编辑 弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑用户' : '新增用户'"
      width="450px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="isEdit" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item v-if="!isEdit" label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
          />
        </el-form-item>
        <el-form-item label="角色" prop="roles">
          <el-select v-model="form.roles" multiple placeholder="请选择角色">
            <el-option label="管理员" value="admin" :disabled="form.roles.includes('operator')" />
            <el-option label="仓管" value="manager" :disabled="form.roles.includes('operator')" />
            <el-option label="操作员" value="operator" :disabled="form.roles.includes('admin') || form.roles.includes('manager')" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 重置密码弹窗 -->
    <el-dialog v-model="resetPwdVisible" title="重置密码" width="400px" @close="resetPwdForm.password = ''">
      <el-form ref="resetPwdRef" :model="resetPwdForm" :rules="resetPwdRules" label-width="80px">
        <el-form-item label="用户名">
          <el-input :model-value="resetPwdForm.username" disabled />
        </el-form-item>
        <el-form-item label="新密码" prop="password">
          <el-input
            v-model="resetPwdForm.password"
            type="password"
            show-password
            placeholder="请输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetPwdVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleResetPwd">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { FormInstance } from 'element-plus'
import http from '../../utils/http'
import { useAuthStore } from '../../stores/auth'

interface UserRecord {
  _id: string
  username: string
  roles: string[]
  is_active: boolean
  openid?: string
  created_at: string
  last_login: string | null
}

const authStore = useAuthStore()
const loading = ref(false)
const submitting = ref(false)
const userList = ref<UserRecord[]>([])

// 新增/编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  username: '',
  password: '',
  roles: [] as string[],
})

const formRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  roles: [{ required: true, message: '请选择角色', trigger: 'change', type: 'array' as const }],
}

// 重置密码
const resetPwdVisible = ref(false)
const resetPwdRef = ref<FormInstance>()
const resetPwdForm = reactive({ username: '', password: '' })
const resetPwdRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
}

// ---- 工具函数 ----
function roleLabel(role: string) {
  const map: Record<string, string> = { admin: '管理员', manager: '仓管', operator: '操作员' }
  return map[role] || role
}

function roleTagType(role: string) {
  const map: Record<string, string> = { admin: 'danger', manager: 'warning', operator: '' }
  return (map[role] || '') as '' | 'success' | 'warning' | 'danger' | 'info'
}

function formatTime(t: string) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

// ---- 数据加载 ----
async function fetchUsers() {
  loading.value = true
  try {
    const res: any = await http.get('/users')
    userList.value = res.data
  } finally {
    loading.value = false
  }
}

onMounted(fetchUsers)

// ---- 新增 ----
function openCreateDialog() {
  isEdit.value = false
  form.username = ''
  form.password = ''
  form.roles = []
  dialogVisible.value = true
}

// ---- 编辑 ----
function openEditDialog(row: UserRecord) {
  isEdit.value = true
  form.username = row.username
  form.password = ''
  form.roles = [...row.roles]
  dialogVisible.value = true
}

// ---- 提交新增/编辑 ----
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value) {
      await http.patch(`/users/${form.username}`, { roles: form.roles })
      ElMessage.success('用户更新成功')
    } else {
      await http.post('/users', {
        username: form.username,
        password: form.password,
        roles: form.roles,
      })
      ElMessage.success('用户创建成功')
    }
    dialogVisible.value = false
    fetchUsers()
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  formRef.value?.resetFields()
}

// ---- 启用/停用 ----
async function handleToggleActive(row: UserRecord, val: boolean) {
  try {
    await http.patch(`/users/${row.username}`, { is_active: val })
    ElMessage.success(val ? '已启用' : '已停用')
    fetchUsers()
  } catch {
    // http 拦截器已处理
  }
}

// ---- 重置密码 ----
function openResetPwdDialog(row: UserRecord) {
  resetPwdForm.username = row.username
  resetPwdForm.password = ''
  resetPwdVisible.value = true
}

async function handleResetPwd() {
  const valid = await resetPwdRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await http.patch(`/users/${resetPwdForm.username}`, { password: resetPwdForm.password })
    ElMessage.success('密码重置成功')
    resetPwdVisible.value = false
  } finally {
    submitting.value = false
  }
}

// ---- 解绑微信 ----
async function handleUnbindWx(username: string) {
  try {
    await http.post('/auth/wx-unbind', { username })
    ElMessage.success('微信解绑成功')
    fetchUsers()
  } catch {
    // http 拦截器已处理
  }
}

// ---- 删除 ----
async function handleDelete(username: string) {
  try {
    await http.delete(`/users/${username}`)
    ElMessage.success('用户删除成功')
    fetchUsers()
  } catch {
    // http 拦截器已处理
  }
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
