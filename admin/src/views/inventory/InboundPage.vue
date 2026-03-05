<template>
  <div class="inbound-page">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- ========== Tab 1: 单件入库 ========== -->
      <el-tab-pane label="单件入库" name="single">
        <el-form
          ref="singleFormRef"
          :model="singleForm"
          :rules="singleRules"
          label-width="100px"
          style="max-width: 520px; margin-top: 12px"
        >
          <el-form-item label="备件类型" prop="part_no">
            <el-select
              v-model="singleForm.part_no"
              filterable
              placeholder="选择备件类型"
              style="width: 100%"
            >
              <el-option
                v-for="pt in partTypeOptions"
                :key="pt.part_no"
                :label="`${pt.part_no} - ${pt.part_name}`"
                :value="pt.part_no"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="序列号" prop="serial_number">
            <el-input v-model="singleForm.serial_number" placeholder="扫码或手动输入序列号" />
          </el-form-item>
          <el-form-item label="子公司" prop="subsidiary">
            <el-input v-model="singleForm.subsidiary" placeholder="如 华东子公司" />
          </el-form-item>
          <el-form-item label="仓库" prop="warehouse">
            <el-input v-model="singleForm.warehouse" placeholder="如 上海主仓" />
          </el-form-item>
          <el-form-item label="成色" prop="condition">
            <el-radio-group v-model="singleForm.condition">
              <el-radio value="全新">全新</el-radio>
              <el-radio value="利旧/返还">利旧/返还</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="singleSubmitting" @click="handleSingleSubmit">
              提交入库
            </el-button>
            <el-button @click="resetSingleForm">重置</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ========== Tab 2: 批量导入 ========== -->
      <el-tab-pane label="批量导入" name="batch">
        <div style="margin-bottom: 16px">
          <el-upload
            ref="uploadRef"
            accept=".xlsx,.xls,.csv"
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleFileChange"
          >
            <el-button type="primary">选择 Excel / CSV 文件</el-button>
          </el-upload>
          <span v-if="fileName" style="margin-left: 12px; color: #606266">{{ fileName }}</span>
        </div>

        <el-alert
          v-if="parseErrors.length > 0"
          type="warning"
          :closable="false"
          style="margin-bottom: 12px"
        >
          <template #title>
            解析警告：{{ parseErrors.length }} 项问题
          </template>
          <div v-for="(e, i) in parseErrors.slice(0, 10)" :key="i" style="font-size: 12px">
            第 {{ e.row }} 行: {{ e.message }}
          </div>
          <div v-if="parseErrors.length > 10" style="font-size: 12px; color: #999">
            ... 共 {{ parseErrors.length }} 条警告
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
          <el-table-column prop="serial_number" label="序列号" min-width="150" />
          <el-table-column prop="subsidiary" label="子公司" min-width="120" />
          <el-table-column prop="warehouse" label="仓库" min-width="120" />
          <el-table-column prop="condition" label="成色" width="100" />
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

      <!-- ========== Tab 3: 扫码查询 ========== -->
      <el-tab-pane label="扫码查询" name="scan">
        <div style="display: flex; gap: 12px; margin-bottom: 16px; max-width: 500px">
          <el-input
            v-model="scanSN"
            placeholder="输入或扫描序列号"
            clearable
            @keyup.enter="handleScan"
            @clear="scanRecord = null"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-button type="primary" :loading="scanning" @click="handleScan">查询</el-button>
        </div>

        <el-descriptions
          v-if="scanRecord"
          :column="2"
          border
          style="max-width: 700px"
        >
          <el-descriptions-item label="序列号">{{ scanRecord.serial_number }}</el-descriptions-item>
          <el-descriptions-item label="备件编号">{{ scanRecord.part_no }}</el-descriptions-item>
          <el-descriptions-item label="备件名称">{{ scanRecord.part_name }}</el-descriptions-item>
          <el-descriptions-item label="子公司">{{ scanRecord.subsidiary }}</el-descriptions-item>
          <el-descriptions-item label="仓库">{{ scanRecord.warehouse }}</el-descriptions-item>
          <el-descriptions-item label="成色">
            <el-tag :type="scanRecord.condition === '全新' ? 'success' : 'warning'" size="small">
              {{ scanRecord.condition }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="scanRecord.status === 0 ? '' : 'info'" size="small">
              {{ scanRecord.status === 0 ? '在库' : '已出库' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="入库时间">{{ formatTime(scanRecord.inbound_time) }}</el-descriptions-item>
          <el-descriptions-item label="入库人">{{ scanRecord.inbound_operator }}</el-descriptions-item>
          <el-descriptions-item label="出库时间">{{ scanRecord.outbound_time ? formatTime(scanRecord.outbound_time) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="领用人">{{ scanRecord.receiver || '-' }}</el-descriptions-item>
          <el-descriptions-item label="项目/用途">{{ scanRecord.project_location || '-' }}</el-descriptions-item>
        </el-descriptions>

        <el-empty v-if="scanSearched && !scanRecord" description="未找到该序列号的记录" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import type { FormInstance, UploadFile } from 'element-plus'
import * as XLSX from 'xlsx'
import http from '../../utils/http'

interface PartTypeOption {
  part_no: string
  part_name: string
}

interface InventoryRecord {
  _id: string
  part_no: string
  part_name: string
  serial_number: string
  subsidiary: string
  warehouse: string
  condition: string
  status: number
  inbound_time: string
  inbound_operator: string
  outbound_time: string | null
  receiver: string | null
  project_location: string | null
}

interface BatchItem {
  part_no: string
  serial_number: string
  subsidiary: string
  warehouse: string
  condition: string
}

const activeTab = ref('single')
const partTypeOptions = ref<PartTypeOption[]>([])

// ======== 单件入库 ========
const singleFormRef = ref<FormInstance>()
const singleSubmitting = ref(false)
const singleForm = reactive({
  part_no: '',
  serial_number: '',
  subsidiary: '',
  warehouse: '',
  condition: '全新',
})
const singleRules = {
  part_no: [{ required: true, message: '请选择备件类型', trigger: 'change' }],
  serial_number: [{ required: true, message: '请输入序列号', trigger: 'blur' }],
  subsidiary: [{ required: true, message: '请输入子公司', trigger: 'blur' }],
  warehouse: [{ required: true, message: '请输入仓库', trigger: 'blur' }],
  condition: [{ required: true, message: '请选择成色', trigger: 'change' }],
}

// ======== 批量导入 ========
const fileName = ref('')
const batchPreview = ref<BatchItem[]>([])
const parseErrors = ref<{ row: number; message: string }[]>([])
const batchSubmitting = ref(false)
const batchResult = ref<{ success: number; failed: number; errors: { row: number; message: string }[] } | null>(null)

// ======== 扫码查询 ========
const scanSN = ref('')
const scanning = ref(false)
const scanRecord = ref<InventoryRecord | null>(null)
const scanSearched = ref(false)

// ---- 加载备件类型 ----
async function loadPartTypes() {
  try {
    const res: any = await http.get('/part-types', { params: { pageSize: 500 } })
    partTypeOptions.value = res.data.items.map((i: any) => ({
      part_no: i.part_no,
      part_name: i.part_name,
    }))
  } catch { /* ignore */ }
}

onMounted(loadPartTypes)

function formatTime(t: string) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

// ======== 单件入库 ========
async function handleSingleSubmit() {
  const valid = await singleFormRef.value?.validate().catch(() => false)
  if (!valid) return

  singleSubmitting.value = true
  try {
    await http.post('/inventory/inbound', { ...singleForm })
    ElMessage.success('入库成功')
    resetSingleForm()
  } finally {
    singleSubmitting.value = false
  }
}

function resetSingleForm() {
  singleFormRef.value?.resetFields()
  singleForm.condition = '全新'
}

// ======== 批量导入: Excel 解析 ========
const COLUMN_MAP: Record<string, string> = {
  '备件编号': 'part_no',
  'part_no': 'part_no',
  '序列号': 'serial_number',
  'serial_number': 'serial_number',
  'sn': 'serial_number',
  'SN': 'serial_number',
  '子公司': 'subsidiary',
  'subsidiary': 'subsidiary',
  '仓库': 'warehouse',
  'warehouse': 'warehouse',
  '成色': 'condition',
  'condition': 'condition',
}

function handleFileChange(file: UploadFile) {
  batchResult.value = null
  parseErrors.value = []
  batchPreview.value = []

  if (!file.raw) return
  fileName.value = file.name

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' })

      if (rows.length === 0) {
        ElMessage.warning('文件中没有数据')
        return
      }

      // Map column names
      const items: BatchItem[] = []
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
        if (!mapped.serial_number) missing.push('序列号')
        if (!mapped.subsidiary) missing.push('子公司')
        if (!mapped.warehouse) missing.push('仓库')

        if (missing.length > 0) {
          errors.push({ row: i + 2, message: `缺少: ${missing.join(', ')}` })
          continue
        }

        if (!mapped.condition) mapped.condition = '全新'

        items.push(mapped as BatchItem)
      }

      batchPreview.value = items
      parseErrors.value = errors

      if (items.length === 0) {
        ElMessage.warning('没有有效的数据行')
      }
    } catch {
      ElMessage.error('文件解析失败，请检查格式')
    }
  }
  reader.readAsArrayBuffer(file.raw)
}

async function handleBatchSubmit() {
  if (batchPreview.value.length === 0) return

  batchSubmitting.value = true
  try {
    const res: any = await http.post('/inventory/batch-import', {
      items: batchPreview.value,
    })
    batchResult.value = res.data
    if (res.data.failed === 0) {
      ElMessage.success(`成功导入 ${res.data.success} 条`)
      batchPreview.value = []
      fileName.value = ''
    } else {
      ElMessage.warning(`成功 ${res.data.success} 条，失败 ${res.data.failed} 条`)
    }
  } finally {
    batchSubmitting.value = false
  }
}

function clearBatch() {
  batchPreview.value = []
  parseErrors.value = []
  fileName.value = ''
  batchResult.value = null
}

// ======== 扫码查询 ========
async function handleScan() {
  const sn = scanSN.value.trim()
  if (!sn) {
    ElMessage.warning('请输入序列号')
    return
  }

  scanning.value = true
  scanSearched.value = true
  scanRecord.value = null
  try {
    const res: any = await http.get(`/inventory/scan/${encodeURIComponent(sn)}`)
    scanRecord.value = res.data
  } catch {
    scanRecord.value = null
  } finally {
    scanning.value = false
  }
}
</script>

<style scoped>
.inbound-page {
  padding: 0;
}
</style>
