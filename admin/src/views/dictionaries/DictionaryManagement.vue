<template>
  <div class="dictionary-management">
    <!-- 分类切换 -->
    <el-tabs v-model="activeCategory" @tab-change="handleCategoryChange">
      <el-tab-pane label="项目号" name="project_no" />
      <el-tab-pane label="采购合同号" name="contract_no" />
    </el-tabs>

    <!-- 操作栏 -->
    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索字典值"
        clearable
        style="width: 260px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
      <el-button type="primary" @click="openCreateDialog" style="margin-left: 12px">
        <el-icon><Plus /></el-icon> 新增{{ categoryLabel }}
      </el-button>
    </div>

    <!-- 表格 -->
    <el-table :data="tableData" v-loading="loading" border stripe>
      <el-table-column prop="label" :label="categoryLabel" min-width="200" />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
            {{ row.is_active ? '启用' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="160">
        <template #default="{ row }">
          {{ formatTime(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
          <el-button
            size="small"
            :type="row.is_active ? 'warning' : 'success'"
            @click="toggleActive(row)"
          >
            {{ row.is_active ? '停用' : '启用' }}
          </el-button>
          <el-popconfirm
            title="确定要删除该字典项吗？"
            @confirm="handleDelete(row._id)"
          >
            <template #reference>
              <el-button size="small" type="danger">删除</el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? `编辑${categoryLabel}` : `新增${categoryLabel}`"
      width="420px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item :label="categoryLabel" prop="label">
          <el-input v-model="form.label" :placeholder="`请输入${categoryLabel}`" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import type { FormInstance } from 'element-plus'
import http from '../../utils/http'

interface DictItem {
  _id: string
  category: string
  label: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

const CATEGORY_MAP: Record<string, string> = {
  project_no: '项目号',
  contract_no: '采购合同号',
}

const activeCategory = ref('project_no')
const categoryLabel = computed(() => CATEGORY_MAP[activeCategory.value])

const loading = ref(false)
const submitting = ref(false)
const tableData = ref<DictItem[]>([])
const keyword = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

// 新增/编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const editId = ref('')
const formRef = ref<FormInstance>()
const form = reactive({ label: '' })

const formRules = {
  label: [{ required: true, message: '请输入字典值', trigger: 'blur' }],
}

function formatTime(t: string) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

async function fetchData() {
  loading.value = true
  try {
    const res: any = await http.get('/dictionaries', {
      params: {
        category: activeCategory.value,
        keyword: keyword.value || undefined,
        page: currentPage.value,
        pageSize: pageSize.value,
      },
    })
    tableData.value = res.data.items
    total.value = res.data.total
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  currentPage.value = 1
  fetchData()
}

function handleCategoryChange() {
  keyword.value = ''
  currentPage.value = 1
  fetchData()
}

onMounted(fetchData)

function openCreateDialog() {
  isEdit.value = false
  editId.value = ''
  form.label = ''
  dialogVisible.value = true
}

function openEditDialog(row: DictItem) {
  isEdit.value = true
  editId.value = row._id
  form.label = row.label
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value) {
      await http.patch(`/dictionaries/${editId.value}`, { label: form.label })
      ElMessage.success('字典项更新成功')
    } else {
      await http.post('/dictionaries', {
        category: activeCategory.value,
        label: form.label,
      })
      ElMessage.success('字典项创建成功')
    }
    dialogVisible.value = false
    fetchData()
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  formRef.value?.resetFields()
}

async function toggleActive(row: DictItem) {
  try {
    await http.patch(`/dictionaries/${row._id}`, { is_active: !row.is_active })
    ElMessage.success(row.is_active ? '已停用' : '已启用')
    fetchData()
  } catch {
    // http interceptor handles error
  }
}

async function handleDelete(id: string) {
  try {
    await http.delete(`/dictionaries/${id}`)
    ElMessage.success('字典项删除成功')
    fetchData()
  } catch {
    // http interceptor handles error
  }
}
</script>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
}
.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
