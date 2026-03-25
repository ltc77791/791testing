<template>
  <div class="inventory-list">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-input
        v-model="filters.keyword"
        placeholder="序列号/编号/名称/仓库"
        clearable
        style="width: 220px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      >
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>

      <el-select
        v-model="filters.part_no"
        placeholder="备件类型"
        clearable
        filterable
        style="width: 160px"
        @change="handleSearch"
      >
        <el-option
          v-for="pt in partTypeOptions"
          :key="pt.part_no"
          :label="`${pt.part_no} - ${pt.part_name}`"
          :value="pt.part_no"
        />
      </el-select>

      <el-select
        v-model="filters.subsidiary"
        placeholder="子公司"
        clearable
        style="width: 130px"
        @change="handleSearch"
      >
        <el-option
          v-for="s in subsidiaryOptions"
          :key="s"
          :label="s"
          :value="s"
        />
      </el-select>

      <el-select
        v-model="filters.contract_no"
        placeholder="合同号"
        clearable
        filterable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option
          v-for="c in contractOptions"
          :key="c"
          :label="c"
          :value="c"
        />
      </el-select>

      <el-select
        v-model="filters.status"
        placeholder="状态"
        clearable
        style="width: 90px"
        @change="handleSearch"
      >
        <el-option label="在库" :value="0" />
        <el-option label="已出库" :value="1" />
      </el-select>

      <el-button @click="handleReset">重置</el-button>
      <el-button style="margin-left: auto" type="success" plain :loading="exporting" @click="handleExport">导出</el-button>
    </div>

    <!-- 库存表格 -->
    <el-table :data="tableData" v-loading="loading" border stripe size="small" class="compact-table" style="width: 100%">
      <el-table-column prop="serial_number" label="序列号" min-width="120" show-overflow-tooltip />
      <el-table-column prop="part_no" label="备件编号" min-width="95" show-overflow-tooltip />
      <el-table-column prop="part_name" label="备件名称" min-width="95" show-overflow-tooltip />
      <el-table-column prop="subsidiary" label="子公司" min-width="80" show-overflow-tooltip />
      <el-table-column prop="warehouse" label="仓库" min-width="80" show-overflow-tooltip />
      <el-table-column label="成色" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="row.condition === '全新' ? 'success' : 'warning'" size="small">
            {{ row.condition }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="contract_no" label="合同号" min-width="95" show-overflow-tooltip>
        <template #default="{ row }">{{ row.contract_no || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="60" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 0 ? '' : 'info'" size="small">
            {{ row.status === 0 ? '在库' : '已出库' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="入库时间" width="135" show-overflow-tooltip>
        <template #default="{ row }">{{ formatTime(row.inbound_time) }}</template>
      </el-table-column>
      <el-table-column prop="inbound_operator" label="入库人" width="70" show-overflow-tooltip />
      <el-table-column label="出库时间" width="135" show-overflow-tooltip>
        <template #default="{ row }">{{ row.outbound_time ? formatTime(row.outbound_time) : '-' }}</template>
      </el-table-column>
      <el-table-column label="领用人" width="70" show-overflow-tooltip>
        <template #default="{ row }">{{ row.receiver || '-' }}</template>
      </el-table-column>
      <el-table-column label="项目/用途" min-width="90" show-overflow-tooltip>
        <template #default="{ row }">{{ row.project_location || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="55" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openEditDialog(row)" :disabled="row.status === 1">
            编辑
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        @size-change="fetchData"
        @current-change="fetchData"
      />
    </div>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editVisible" title="编辑库存记录" width="500px" @close="resetEditForm">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="90px">
        <el-form-item label="序列号">
          <el-input :model-value="editForm.serial_number" disabled />
        </el-form-item>
        <el-form-item label="备件类型" prop="part_no">
          <el-select v-model="editForm.part_no" filterable placeholder="选择备件类型" style="width: 100%">
            <el-option
              v-for="pt in partTypeOptions"
              :key="pt.part_no"
              :label="`${pt.part_no} - ${pt.part_name}`"
              :value="pt.part_no"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="子公司" prop="subsidiary">
          <el-input v-model="editForm.subsidiary" placeholder="如 华东子公司" />
        </el-form-item>
        <el-form-item label="仓库" prop="warehouse">
          <el-input v-model="editForm.warehouse" placeholder="如 上海主仓" />
        </el-form-item>
        <el-form-item label="成色" prop="condition">
          <el-radio-group v-model="editForm.condition">
            <el-radio value="全新">全新</el-radio>
            <el-radio value="利旧/返还">利旧/返还</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleEditSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import type { FormInstance } from 'element-plus'
import http from '../../utils/http'

interface InventoryRecord {
  _id: string
  part_no: string
  part_name: string
  serial_number: string
  subsidiary: string
  warehouse: string
  condition: string
  contract_no: string | null
  status: number
  inbound_time: string
  inbound_operator: string
  outbound_time: string | null
  receiver: string | null
  approver: string | null
  project_location: string | null
}

interface PartTypeOption {
  part_no: string
  part_name: string
}

const loading = ref(false)
const exporting = ref(false)
const submitting = ref(false)
const tableData = ref<InventoryRecord[]>([])
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

// 筛选
const filters = reactive({
  keyword: '',
  part_no: '',
  subsidiary: '',
  contract_no: '',
  status: undefined as number | undefined,
})

// 下拉选项
const partTypeOptions = ref<PartTypeOption[]>([])
const subsidiaryOptions = ref<string[]>([])
const contractOptions = ref<string[]>([])

// 编辑
const editVisible = ref(false)
const editFormRef = ref<FormInstance>()
const editForm = reactive({
  _id: '',
  serial_number: '',
  part_no: '',
  subsidiary: '',
  warehouse: '',
  condition: '',
})
const editRules = {
  part_no: [{ required: true, message: '请选择备件类型', trigger: 'change' }],
  subsidiary: [{ required: true, message: '请输入子公司', trigger: 'blur' }],
  warehouse: [{ required: true, message: '请输入仓库', trigger: 'blur' }],
  condition: [{ required: true, message: '请选择成色', trigger: 'change' }],
}

// 原始编辑记录（用于对比变更）
let editOriginal = { part_no: '', subsidiary: '', warehouse: '', condition: '' }

function formatTime(t: string) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

// ---- 加载下拉选项 ----
async function loadOptions() {
  try {
    const res: any = await http.get('/part-types', { params: { pageSize: 100 } })
    partTypeOptions.value = res.data.items.map((i: any) => ({
      part_no: i.part_no,
      part_name: i.part_name,
    }))
  } catch { /* ignore */ }

  // 从库存数据中提取子公司列表
  try {
    const allRes: any = await http.get('/inventory', { params: { pageSize: 100 } })
    const subs = new Set<string>()
    for (const item of allRes.data.items) {
      if (item.subsidiary) subs.add(item.subsidiary)
    }
    subsidiaryOptions.value = [...subs].sort()
  } catch { /* ignore */ }

  // 加载采购合同号选项
  try {
    const res: any = await http.get('/dictionaries/options', { params: { category: 'contract_no' } })
    contractOptions.value = res.data.map((d: any) => d.label)
  } catch { /* ignore */ }
}

// ---- 数据加载 ----
async function fetchData() {
  loading.value = true
  try {
    const params: any = {
      page: currentPage.value,
      pageSize: pageSize.value,
    }
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.part_no) params.part_no = filters.part_no
    if (filters.subsidiary) params.subsidiary = filters.subsidiary
    if (filters.contract_no) params.contract_no = filters.contract_no
    if (filters.status !== undefined) params.status = filters.status

    const res: any = await http.get('/inventory', { params })
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

function handleReset() {
  filters.keyword = ''
  filters.part_no = ''
  filters.subsidiary = ''
  filters.contract_no = ''
  filters.status = undefined
  handleSearch()
}

async function handleExport() {
  exporting.value = true
  try {
    const params: any = {}
    if (filters.keyword) params.keyword = filters.keyword
    if (filters.part_no) params.part_no = filters.part_no
    if (filters.subsidiary) params.subsidiary = filters.subsidiary
    if (filters.contract_no) params.contract_no = filters.contract_no
    if (filters.status !== undefined) params.status = filters.status
    const res = await http.get('/export/inventory', { params, responseType: 'blob' })
    const blob = new Blob([res as any], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'inventory_export.csv'
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch {
    // handled by interceptor
  } finally {
    exporting.value = false
  }
}

onMounted(() => {
  loadOptions()
  fetchData()
})

// ---- 编辑 ----
function openEditDialog(row: InventoryRecord) {
  editForm._id = row._id
  editForm.serial_number = row.serial_number
  editForm.part_no = row.part_no
  editForm.subsidiary = row.subsidiary
  editForm.warehouse = row.warehouse
  editForm.condition = row.condition
  editOriginal = {
    part_no: row.part_no,
    subsidiary: row.subsidiary,
    warehouse: row.warehouse,
    condition: row.condition,
  }
  editVisible.value = true
}

async function handleEditSubmit() {
  const valid = await editFormRef.value?.validate().catch(() => false)
  if (!valid) return

  // 只发送变更字段
  const payload: any = {}
  if (editForm.part_no !== editOriginal.part_no) payload.part_no = editForm.part_no
  if (editForm.subsidiary !== editOriginal.subsidiary) payload.subsidiary = editForm.subsidiary
  if (editForm.warehouse !== editOriginal.warehouse) payload.warehouse = editForm.warehouse
  if (editForm.condition !== editOriginal.condition) payload.condition = editForm.condition

  if (Object.keys(payload).length === 0) {
    ElMessage.info('没有修改任何字段')
    return
  }

  submitting.value = true
  try {
    await http.patch(`/inventory/${editForm._id}`, payload)
    ElMessage.success('库存记录更新成功')
    editVisible.value = false
    fetchData()
  } finally {
    submitting.value = false
  }
}

function resetEditForm() {
  editFormRef.value?.resetFields()
}
</script>

<style scoped>
.filter-bar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
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
.pagination-wrapper {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
