<template>
  <div class="part-type-management">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- ========== Tab 1: 备件类型列表 ========== -->
      <el-tab-pane label="备件类型列表" name="list">
        <!-- 顶部操作栏 -->
        <div class="toolbar">
          <el-input
            v-model="keyword"
            placeholder="搜索备件编号或名称"
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
            <el-icon><Plus /></el-icon> 新增备件类型
          </el-button>
        </div>

        <!-- 备件类型表格 -->
        <el-table :data="tableData" v-loading="loading" border stripe>
          <el-table-column prop="part_no" label="备件编号" min-width="140" />
          <el-table-column prop="part_name" label="备件名称" min-width="160" />
          <el-table-column label="价值类型" width="100" align="center">
            <template #default="{ row }">
              <el-tag :type="(row.value_type || '高价值') === '高价值' ? 'danger' : 'info'" size="small">
                {{ row.value_type || '高价值' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="model" label="型号" min-width="120">
            <template #default="{ row }">
              {{ row.model || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="单价" width="100" align="center">
            <template #default="{ row }">
              {{ row.unit_price != null ? row.unit_price : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="min_stock" label="安全库存" width="100" align="center" />
          <el-table-column prop="current_stock" label="当前库存" width="100" align="center">
            <template #default="{ row }">
              <span :class="{ 'stock-warning': row.current_stock < row.min_stock }">
                {{ row.current_stock }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="total_outbound" label="累计出库" width="100" align="center" />
          <el-table-column label="更新时间" min-width="160">
            <template #default="{ row }">
              {{ formatTime(row.updated_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEditDialog(row)">编辑</el-button>
              <el-popconfirm
                title="确定要删除该备件类型吗？"
                @confirm="handleDelete(row.part_no)"
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
      </el-tab-pane>

      <!-- ========== Tab 2: 批量导入 ========== -->
      <el-tab-pane label="批量导入" name="batch">
        <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 12px">
          <el-upload
            ref="uploadRef"
            accept=".xlsx,.xls,.csv"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleFileChange"
          >
            <el-button type="primary">选择 Excel / CSV 文件</el-button>
          </el-upload>
          <el-button @click="downloadTemplate">下载导入模板</el-button>
          <span v-if="batchFileName" style="color: #606266">{{ batchFileName }}</span>
        </div>

        <el-alert
          v-if="batchParseErrors.length > 0"
          type="warning"
          :closable="false"
          style="margin-bottom: 12px"
        >
          <template #title>
            解析警告：{{ batchParseErrors.length }} 项问题
          </template>
          <div v-for="(e, i) in batchParseErrors.slice(0, 10)" :key="i" style="font-size: 12px">
            第 {{ e.row }} 行: {{ e.message }}
          </div>
          <div v-if="batchParseErrors.length > 10" style="font-size: 12px; color: #999">
            ... 共 {{ batchParseErrors.length }} 条警告
          </div>
        </el-alert>

        <!-- 预览表格 -->
        <el-table
          v-if="batchPreview.length > 0"
          :data="batchPreview"
          border
          stripe
          max-height="400"
          style="width: 100%; margin-bottom: 16px"
        >
          <el-table-column type="index" label="#" width="50" />
          <el-table-column prop="part_no" label="备件编号" min-width="130" />
          <el-table-column prop="part_name" label="备件名称" min-width="140" />
          <el-table-column prop="value_type" label="价值类型" width="100" />
          <el-table-column prop="model" label="型号" min-width="120">
            <template #default="{ row }">
              {{ row.model || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="单价" width="100" align="center">
            <template #default="{ row }">
              {{ row.unit_price != null && row.unit_price !== '' ? row.unit_price : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="min_stock" label="安全库存" width="100" align="center" />
        </el-table>

        <div v-if="batchPreview.length > 0">
          <el-button type="primary" :loading="batchSubmitting" @click="handleBatchSubmit">
            确认导入 ({{ batchPreview.length }} 条)
          </el-button>
          <el-button @click="clearBatch">清空</el-button>
        </div>

        <div v-if="batchResult" style="margin-top: 16px">
          <el-alert
            :type="batchResult.failed === 0 ? 'success' : 'warning'"
            :closable="false"
          >
            <template #title>
              导入完成: 成功 {{ batchResult.success }} 条，失败 {{ batchResult.failed }} 条
            </template>
            <div v-if="batchResult.errors?.length" style="margin-top: 4px">
              <div v-for="(e, i) in batchResult.errors.slice(0, 10)" :key="i" style="font-size: 12px">
                第 {{ e.row }} 行: {{ e.message }}
              </div>
            </div>
          </el-alert>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑备件类型' : '新增备件类型'"
      width="450px"
      @close="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px">
        <el-form-item label="备件编号" prop="part_no">
          <el-input v-model="form.part_no" :disabled="isEdit" placeholder="如 PWR-MOD-500" />
        </el-form-item>
        <el-form-item label="备件名称" prop="part_name">
          <el-input v-model="form.part_name" placeholder="如 500W电源模块" />
        </el-form-item>
        <el-form-item label="价值类型" prop="value_type">
          <el-radio-group v-model="form.value_type">
            <el-radio value="高价值">高价值</el-radio>
            <el-radio value="低价值">低价值</el-radio>
          </el-radio-group>
          <div style="font-size: 12px; color: #909399; margin-top: 4px">
            高价值备件入库需要序列号，低价值备件序列号非必填
          </div>
        </el-form-item>
        <el-form-item label="型号" prop="model">
          <el-input v-model="form.model" placeholder="如 NUC11PAHi7" />
          <div v-if="form.value_type === '高价值'" style="font-size: 12px; color: #e6a23c; margin-top: 4px">
            高价值备件型号为必填项
          </div>
        </el-form-item>
        <el-form-item label="单价" prop="unit_price">
          <el-input-number v-model="form.unit_price" :min="0" :max="99999999" :precision="2" :controls="false" placeholder="选填" style="width: 200px" />
        </el-form-item>
        <el-form-item label="安全库存" prop="min_stock">
          <el-input-number v-model="form.min_stock" :min="0" :max="99999" />
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
import { ref, reactive, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Search } from '@element-plus/icons-vue'
import type { FormInstance, UploadFile } from 'element-plus'
import * as XLSX from 'xlsx'
import http from '../../utils/http'

interface PartType {
  _id: string
  part_no: string
  part_name: string
  value_type: string
  model: string
  unit_price: number | null
  min_stock: number
  current_stock: number
  total_outbound: number
  updated_at: string
}

interface BatchPartTypeItem {
  part_no: string
  part_name: string
  value_type: string
  model: string
  unit_price: number | null | string
  min_stock: number
}

const activeTab = ref('list')
const loading = ref(false)
const submitting = ref(false)
const tableData = ref<PartType[]>([])
const keyword = ref('')
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

// 新增/编辑
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  part_no: '',
  part_name: '',
  value_type: '高价值' as string,
  model: '',
  unit_price: null as number | null,
  min_stock: 0,
})

const modelValidator = (_rule: any, value: string, callback: (err?: Error) => void) => {
  if (form.value_type === '高价值' && (!value || !value.trim())) {
    callback(new Error('高价值备件型号为必填项'))
  } else {
    callback()
  }
}

const formRules = {
  part_no: [{ required: true, message: '请输入备件编号', trigger: 'blur' }],
  part_name: [{ required: true, message: '请输入备件名称', trigger: 'blur' }],
  model: [{ validator: modelValidator, trigger: 'blur' }],
}

// 价值类型变化时重新校验型号
watch(() => form.value_type, () => {
  if (dialogVisible.value) {
    formRef.value?.validateField('model').catch(() => {})
  }
})

// ======== 批量导入 ========
const batchFileName = ref('')
const batchPreview = ref<BatchPartTypeItem[]>([])
const batchParseErrors = ref<{ row: number; message: string }[]>([])
const batchSubmitting = ref(false)
const batchResult = ref<{ success: number; failed: number; errors: { row: number; message: string }[] } | null>(null)

const COLUMN_MAP: Record<string, string> = {
  '备件编号': 'part_no',
  'part_no': 'part_no',
  '备件名称': 'part_name',
  'part_name': 'part_name',
  '价值类型': 'value_type',
  'value_type': 'value_type',
  '型号': 'model',
  'model': 'model',
  '单价': 'unit_price',
  'unit_price': 'unit_price',
  '安全库存': 'min_stock',
  'min_stock': 'min_stock',
}

function formatTime(t: string) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

// ---- 数据加载 ----
async function fetchData() {
  loading.value = true
  try {
    const res: any = await http.get('/part-types', {
      params: {
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

onMounted(fetchData)

// ---- 新增 ----
function openCreateDialog() {
  isEdit.value = false
  form.part_no = ''
  form.part_name = ''
  form.value_type = '高价值'
  form.model = ''
  form.unit_price = null
  form.min_stock = 0
  dialogVisible.value = true
}

// ---- 编辑 ----
function openEditDialog(row: PartType) {
  isEdit.value = true
  form.part_no = row.part_no
  form.part_name = row.part_name
  form.value_type = row.value_type || '高价值'
  form.model = row.model || ''
  form.unit_price = row.unit_price ?? null
  form.min_stock = row.min_stock
  dialogVisible.value = true
}

// ---- 提交 ----
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value) {
      await http.patch(`/part-types/${form.part_no}`, {
        part_name: form.part_name,
        value_type: form.value_type,
        model: form.model,
        unit_price: form.unit_price,
        min_stock: form.min_stock,
      })
      ElMessage.success('备件类型更新成功')
    } else {
      await http.post('/part-types', {
        part_no: form.part_no,
        part_name: form.part_name,
        value_type: form.value_type,
        model: form.model,
        unit_price: form.unit_price,
        min_stock: form.min_stock,
      })
      ElMessage.success('备件类型创建成功')
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

// ---- 删除 ----
async function handleDelete(partNo: string) {
  try {
    await http.delete(`/part-types/${partNo}`)
    ElMessage.success('备件类型删除成功')
    fetchData()
  } catch {
    // http 拦截器已处理
  }
}

// ======== 批量导入: 下载模板 ========
function downloadTemplate() {
  const headers = [['备件编号', '备件名称', '价值类型', '型号', '单价', '安全库存']]
  const example = [['PWR-MOD-500', '500W电源模块', '高价值', 'NUC11PAHi7', '2999.00', '5']]
  const ws = XLSX.utils.aoa_to_sheet([...headers, ...example])
  ws['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 10 }, { wch: 10 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '备件类型导入模板')
  XLSX.writeFile(wb, '备件类型导入模板.xlsx')
}

// ======== 批量导入: Excel 解析 ========
function handleFileChange(file: UploadFile) {
  batchResult.value = null
  batchParseErrors.value = []
  batchPreview.value = []

  if (!file.raw) return
  batchFileName.value = file.name

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0] || ''
      const sheet = workbook.Sheets[firstSheetName]
      const rows: any[] = sheet ? XLSX.utils.sheet_to_json(sheet, { defval: '' }) : []

      if (rows.length === 0) {
        ElMessage.warning('文件中没有数据')
        return
      }

      const items: BatchPartTypeItem[] = []
      const errors: { row: number; message: string }[] = []

      for (let i = 0; i < rows.length; i++) {
        const raw = rows[i]
        const mapped: any = {}

        for (const [key, value] of Object.entries(raw)) {
          const field = COLUMN_MAP[key.trim()]
          if (field) {
            mapped[field] = String(value).trim()
          }
        }

        // Validate required fields
        const missing: string[] = []
        if (!mapped.part_no) missing.push('备件编号')
        if (!mapped.part_name) missing.push('备件名称')

        // 价值类型默认高价值
        if (!mapped.value_type) mapped.value_type = '高价值'
        if (!['高价值', '低价值'].includes(mapped.value_type)) {
          errors.push({ row: i + 2, message: `价值类型无效: ${mapped.value_type}，应为 高价值 或 低价值` })
          continue
        }

        // 高价值备件型号必填
        if (mapped.value_type === '高价值' && !mapped.model) {
          missing.push('型号(高价值必填)')
        }

        if (missing.length > 0) {
          errors.push({ row: i + 2, message: `缺少: ${missing.join(', ')}` })
          continue
        }

        // 处理单价和安全库存的数值转换
        const unitPrice = mapped.unit_price !== undefined && mapped.unit_price !== '' ? Number(mapped.unit_price) : null
        if (unitPrice !== null && isNaN(unitPrice)) {
          errors.push({ row: i + 2, message: `单价格式无效: ${mapped.unit_price}` })
          continue
        }

        const minStock = mapped.min_stock !== undefined && mapped.min_stock !== '' ? Number(mapped.min_stock) : 0
        if (isNaN(minStock) || minStock < 0) {
          errors.push({ row: i + 2, message: `安全库存格式无效: ${mapped.min_stock}` })
          continue
        }

        items.push({
          part_no: mapped.part_no,
          part_name: mapped.part_name,
          value_type: mapped.value_type,
          model: mapped.model || '',
          unit_price: unitPrice,
          min_stock: Math.floor(minStock),
        })
      }

      batchPreview.value = items
      batchParseErrors.value = errors

      if (items.length === 0) {
        ElMessage.warning('没有有效的数据行')
      }
    } catch {
      ElMessage.error('文件解析失败，请检查格式')
    }
  }
  reader.readAsArrayBuffer(file.raw)
}

// ======== 批量导入: 提交 ========
async function handleBatchSubmit() {
  if (batchPreview.value.length === 0) return

  batchSubmitting.value = true
  try {
    const res: any = await http.post('/part-types/batch-import', {
      items: batchPreview.value,
    })
    batchResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(`成功导入 ${res.data.success} 条`)
      batchPreview.value = []
      batchFileName.value = ''
      fetchData()
    } else {
      ElMessage.warning(`成功 ${res.data.success} 条，失败 ${res.data.failed} 条`)
      if (res.data.success > 0) fetchData()
    }
  } finally {
    batchSubmitting.value = false
  }
}

function clearBatch() {
  batchPreview.value = []
  batchParseErrors.value = []
  batchFileName.value = ''
  batchResult.value = null
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
.stock-warning {
  color: #f56c6c;
  font-weight: bold;
}
</style>
