<template>
  <div class="user-management">
    <!-- 顶部操作栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon> 新增用户
      </el-button>
    </div>

    <!-- 用户表格 -->
    <el-table :data="userList" v-loading="loading" border stripe size="small" class="compact-table">
      <el-table-column prop="username" label="用户名" min-width="100" show-overflow-tooltip />
      <el-table-column label="角色" min-width="100">
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
      <el-table-column label="状态" width="85" align="center">
        <template #default="{ row }">
          <el-switch
            :model-value="row.is_active"
            @change="(val: boolean) => handleToggleActive(row, val)"
            :disabled="row.username === authStore.user?.username"
            active-text="启用"
            inactive-text="停用"
            inline-prompt
            size="small"
          />
        </template>
      </el-table-column>
      <el-table-column label="锁定" width="70" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.locked_until && new Date(row.locked_until) > new Date()" type="danger" size="small">已锁定</el-tag>
          <el-tag v-else type="success" size="small">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="微信" width="70" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.openid" type="success" size="small">已绑定</el-tag>
          <el-tag v-else type="info" size="small">未绑定</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后登录" width="135" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.last_login ? formatTime(row.last_login) : '从未登录' }}
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="135" show-overflow-tooltip>
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openEditDialog(row)">编辑</el-button>
          <el-popconfirm
            title="确定将密码重置为默认密码 123456？"
            @confirm="handleResetPwd(row.username)"
          >
            <template #reference>
              <el-button size="small" link type="warning">重置密码</el-button>
            </template>
          </el-popconfirm>
          <el-button
            v-if="row.locked_until && new Date(row.locked_until) > new Date()"
            size="small"
            link
            type="success"
            @click="handleUnlock(row.username)"
          >
            解锁
          </el-button>
          <el-button
            v-if="row.openid"
            size="small"
            link
            type="info"
            @click="handleUnbindWx(row.username)"
          >
            解绑
          </el-button>
          <el-popconfirm
            title="确定要删除该用户吗？"
            @confirm="handleDelete(row.username)"
            :disabled="row.username === authStore.user?.username"
          >
            <template #reference>
              <el-button
                size="small"
                link
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
        <!-- ★ Feature #2: No password field for create — default password 123456 -->
        <el-alert v-if="!isEdit" type="info" :closable="false" style="margin-bottom: 12px">
          新用户默认密码为 <strong>123456</strong>，首次登录需修改密码。
        </el-alert>
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
  locked_until?: string | null
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
  roles: [] as string[],
})

const formRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  roles: [{ required: true, message: '请选择角色', trigger: 'change', type: 'array' as const }],
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
  form.roles = []
  dialogVisible.value = true
}

// ---- 编辑 ----
function openEditDialog(row: UserRecord) {
  isEdit.value = true
  form.username = row.username
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
      // ★ Feature #2: No password — server uses default
      await http.post('/users', {
        username: form.username,
        roles: form.roles,
      })
      ElMessage.success('用户创建成功，默认密码为 123456')
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

// ---- ★ Feature #3: 重置密码为默认密码 ----
async function handleResetPwd(username: string) {
  submitting.value = true
  try {
    await http.post(`/users/${username}/reset-password`)
    ElMessage.success('密码已重置为默认密码 123456')
    fetchUsers()
  } finally {
    submitting.value = false
  }
}

// ---- ★ Feature #7: 解锁用户 ----
async function handleUnlock(username: string) {
  try {
    await http.post(`/users/${username}/unlock`)
    ElMessage.success('用户已解锁')
    fetchUsers()
  } catch {
    // http 拦截器已处理
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
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
}
.compact-table {
  font-size: 13px;
}
.compact-table :deep(.el-table__header th) {
  font-size: 13px;
  padding: 6px 0;
}
.compact-table :deep(.el-table__body td) {
  padding: 4px 0;
}
</style>
