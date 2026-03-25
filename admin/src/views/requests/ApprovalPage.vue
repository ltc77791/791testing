<template>
  <div class="approval-page">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select
        v-model="filters.status"
        placeholder="申请状态"
        clearable
        style="width: 140px"
        @change="handleSearch"
      >
        <el-option label="待审批" value="pending" />
        <el-option label="已通过" value="approved" />
        <el-option label="已驳回" value="rejected" />
        <el-option label="已撤回" value="cancelled" />
      </el-select>

      <el-input
        v-model="filters.applicant"
        placeholder="申请人"
        clearable
        style="width: 140px; margin-left: 12px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />

      <el-button style="margin-left: 12px" type="primary" @click="handleSearch">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
      <el-button style="margin-left: auto" type="success" plain :loading="exporting" @click="handleExport">导出 CSV</el-button>
    </div>

    <!-- 申请列表（按申请项展开，每行一个备件） -->
    <el-table
      :data="flatRows"
      v-loading="loading"
      border
      stripe
      style="width: 100%"
      :span-method="spanMethod"
    >
      <el-table-column label="申请时间" min-width="160">
        <template #default="{ row }">{{ formatTime(row._created_at) }}</template>
      </el-table-column>
      <el-table-column label="项目号" min-width="120">
        <template #default="{ row }">{{ row._project_no || '-' }}</template>
      </el-table-column>
      <el-table-column label="申请人" width="90">
        <template #default="{ row }">{{ row._applicant }}</template>
      </el-table-column>
      <el-table-column label="出库原因" width="90" align="center">
        <template #default="{ row }">{{ row._outbound_reason || '-' }}</template>
      </el-table-column>
      <el-table-column prop="part_no" label="备件编号" min-width="120" />
      <el-table-column prop="part_name" label="备件名称" min-width="120" />
      <el-table-column label="序列号" min-width="180">
        <template #default="{ row }">
          <span v-if="row.serial_numbers?.length">{{ row.serial_numbers.join(', ') }}</span>
          <span v-else style="color: #909399">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="quantity" label="申请数量" width="85" align="center" />
      <el-table-column label="审批时间" min-width="160">
        <template #default="{ row }">{{ row._approved_at ? formatTime(row._approved_at) : '-' }}</template>
      </el-table-column>
      <el-table-column label="审批人" width="90">
        <template #default="{ row }">{{ row._approved_by || '-' }}</template>
      </el-table-column>
      <el-table-column label="审批结果" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="row._status === 'approved'" :type="row._approval_type === 'partial' ? 'warning' : 'success'" size="small">
            {{ row._approval_type === 'partial' ? '部分通过' : '全量通过' }}
          </el-tag>
          <el-tag v-else-if="row._status === 'rejected'" type="danger" size="small">已驳回</el-tag>
          <el-tag v-else-if="row._status === 'cancelled'" type="info" size="small">已撤回</el-tag>
          <el-tag v-else type="warning" size="small">待审批</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="审批数量" width="85" align="center">
        <template #default="{ row }">
          <template v-if="row._status === 'approved'">
            <span :class="{ 'partial-qty': row.approved_quantity < row.quantity }">
              {{ row.approved_quantity ?? row.quantity }}
            </span>
          </template>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row._request)">详情</el-button>
          <template v-if="row._status === 'pending'">
            <el-button size="small" type="success" @click="openApproveDialog(row._request)">审批</el-button>
            <el-button size="small" type="danger" @click="openRejectDialog(row._request)">驳回</el-button>
          </template>
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

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="申请详情" width="750px">
      <el-descriptions v-if="detailData" :column="2" border>
        <el-descriptions-item label="申请人">{{ detailData.applicant }}</el-descriptions-item>
        <el-descriptions-item label="审批结果">
          <el-tag v-if="detailData.status === 'approved'" :type="detailData.approval_type === 'partial' ? 'warning' : 'success'" size="small">
            {{ detailData.approval_type === 'partial' ? '部分通过' : '全量通过' }}
          </el-tag>
          <el-tag v-else :type="statusTagType(detailData.status)" size="small">
            {{ statusLabel(detailData.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="项目号">{{ detailData.project_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="项目地点">{{ detailData.project_location }}</el-descriptions-item>
        <el-descriptions-item label="出库原因">{{ detailData.outbound_reason || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ formatTime(detailData.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="审批人">{{ detailData.approved_by || '-' }}</el-descriptions-item>
        <el-descriptions-item label="审批时间">{{ detailData.approved_at ? formatTime(detailData.approved_at) : '-' }}</el-descriptions-item>
        <el-descriptions-item v-if="detailData.reject_reason" label="驳回原因" :span="2">
          {{ detailData.reject_reason }}
        </el-descriptions-item>
        <el-descriptions-item v-if="detailData.remark" label="备注" :span="2">
          {{ detailData.remark }}
        </el-descriptions-item>
      </el-descriptions>

      <el-table
        v-if="detailData"
        :data="detailItemRows"
        border
        stripe
        style="width: 100%; margin-top: 16px"
      >
        <el-table-column prop="part_no" label="备件编号" min-width="120" />
        <el-table-column prop="part_name" label="备件名称" min-width="130" />
        <el-table-column label="序列号" min-width="200">
          <template #default="{ row }">
            <span v-if="row.serial_numbers?.length">{{ row.serial_numbers.join(', ') }}</span>
            <span v-else style="color: #909399">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="quantity" label="申请数量" width="85" align="center" />
        <el-table-column label="审批数量" width="85" align="center">
          <template #default="{ row }">
            <template v-if="detailData!.status === 'approved'">
              <span :class="{ 'partial-qty': row.approved_quantity < row.quantity }">
                {{ row.approved_quantity ?? row.quantity }}
              </span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="审批序列号" min-width="200">
          <template #default="{ row }">
            <template v-if="detailData!.status === 'approved'">
              <span v-if="row.approved_serial_numbers?.length">{{ row.approved_serial_numbers.join(', ') }}</span>
              <span v-else style="color: #909399">-</span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 审批弹窗 -->
    <el-dialog v-model="approveVisible" title="审批通过" width="600px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px">
        <template #title>
          申请人: {{ approveTarget?.applicant }} | 项目号: {{ approveTarget?.project_no || '-' }} | 项目: {{ approveTarget?.project_location }} | 原因: {{ approveTarget?.outbound_reason || '-' }}
        </template>
      </el-alert>

      <el-radio-group v-model="approveMode" style="margin-bottom: 16px">
        <el-radio value="full">全部批准</el-radio>
        <el-radio value="partial">部分批准</el-radio>
      </el-radio-group>

      <el-table
        v-if="approveTarget"
        :data="approveItems"
        border
        stripe
        style="width: 100%"
      >
        <el-table-column prop="part_no" label="备件编号" min-width="130" />
        <el-table-column prop="part_name" label="备件名称" min-width="140" />
        <el-table-column prop="quantity" label="申请数量" width="100" align="center" />
        <el-table-column label="批准明细" min-width="200">
          <template #default="{ row }">
            <!-- 高价值备件：序列号选择 -->
            <template v-if="(row.value_type || '高价值') === '高价值'">
              <el-select
                v-model="row.approve_sns"
                multiple
                clearable
                :placeholder="approveMode === 'full' ? '已全选所有预留序列号' : '请勾选批准的序列号'"
                :disabled="approveMode === 'full'"
                style="width: 100%"
              >
                <el-option
                  v-for="sn in row.reserved_sns"
                  :key="sn"
                  :label="sn"
                  :value="sn"
                />
              </el-select>
            </template>
            <!-- 低价值备件：数量输入 -->
            <template v-else>
              <div v-if="approveMode === 'full'" style="color: #67c23a">
                全部批准 ({{ row.quantity }} 件)
              </div>
              <el-input-number
                v-else
                v-model="row.approve_qty"
                :min="0"
                :max="row.quantity"
                controls-position="right"
                style="width: 160px"
              />
              <div style="font-size: 12px; color: #909399; margin-top: 2px">
                低价值备件，按数量审批
              </div>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <template #footer>
        <el-button @click="approveVisible = false">取消</el-button>
        <el-button type="success" :loading="approving" @click="handleApprove">确认批准</el-button>
      </template>
    </el-dialog>

    <!-- 驳回弹窗 -->
    <el-dialog v-model="rejectVisible" title="驳回申请" width="480px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px">
        <template #title>
          申请人: {{ rejectTarget?.applicant }} | 项目: {{ rejectTarget?.project_location }}
        </template>
      </el-alert>
      <el-form ref="rejectFormRef" :model="rejectForm" :rules="rejectRules">
        <el-form-item prop="reason" label="驳回原因">
          <el-input
            v-model="rejectForm.reason"
            type="textarea"
            :rows="3"
            placeholder="请填写驳回原因"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectVisible = false">取消</el-button>
        <el-button type="danger" :loading="rejecting" @click="handleReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import http from '../../utils/http'

interface RequestItem {
  part_no: string
  part_name?: string
  value_type?: string
  quantity: number
  serial_numbers?: string[]
  approved_quantity?: number
  approved_serial_numbers?: string[]
}

interface ApproveItem extends RequestItem {
  reserved_sns: string[]
  approve_sns: string[]
  approve_qty: number
}

interface RequestRecord {
  _id: string
  applicant: string
  status: string
  items: RequestItem[]
  approved_items?: RequestItem[]
  approval_type?: string
  project_location: string
  project_no?: string
  outbound_reason?: string
  remark: string
  created_at: string
  updated_at: string
  approved_by: string | null
  approved_at: string | null
  reject_reason: string | null
}

interface FlatRow {
  _request: RequestRecord
  _requestId: string
  _created_at: string
  _project_no: string
  _applicant: string
  _outbound_reason: string
  _approved_at: string | null
  _approved_by: string | null
  _status: string
  _approval_type: string
  _rowSpan: number
  _rowIndex: number
  // item-level
  part_no: string
  part_name: string
  serial_numbers: string[]
  quantity: number
  approved_quantity?: number
  approved_serial_numbers?: string[]
}

// ======== 列表 ========
const loading = ref(false)
const exporting = ref(false)
const tableData = ref<RequestRecord[]>([])
const currentPage = ref(1)
const pageSize = ref(20)
const total = ref(0)

const filters = reactive({
  status: '' as string,
  applicant: '',
})

// 将请求数据展平为每行一个备件项
const flatRows = computed<FlatRow[]>(() => {
  const rows: FlatRow[] = []
  for (const req of tableData.value) {
    // Use approved_items if available (shows actual approval result), fall back to items
    const displayItems = (req.status === 'approved' && req.approved_items?.length)
      ? req.approved_items
      : req.items
    const itemCount = displayItems.length || 1

    displayItems.forEach((item, idx) => {
      rows.push({
        _request: req,
        _requestId: req._id,
        _created_at: req.created_at,
        _project_no: req.project_no || '',
        _applicant: req.applicant,
        _outbound_reason: req.outbound_reason || '',
        _approved_at: req.approved_at,
        _approved_by: req.approved_by,
        _status: req.status,
        _approval_type: req.approval_type || '',
        _rowSpan: itemCount,
        _rowIndex: idx,
        part_no: item.part_no,
        part_name: item.part_name || item.part_no,
        serial_numbers: item.serial_numbers || [],
        quantity: item.quantity,
        approved_quantity: item.approved_quantity,
        approved_serial_numbers: item.approved_serial_numbers,
      })
    })
  }
  return rows
})

// 合并请求级别列的单元格
const REQUEST_LEVEL_COLS = [0, 1, 2, 3, 8, 9, 10, 12] // 申请时间, 项目号, 申请人, 出库原因, 审批时间, 审批人, 审批结果, 操作
function spanMethod({ row, columnIndex }: { row: FlatRow; column: any; rowIndex: number; columnIndex: number }) {
  if (REQUEST_LEVEL_COLS.includes(columnIndex)) {
    if (row._rowIndex === 0) {
      return { rowspan: row._rowSpan, colspan: 1 }
    }
    return { rowspan: 0, colspan: 0 }
  }
  return { rowspan: 1, colspan: 1 }
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = {
      page: currentPage.value,
      pageSize: pageSize.value,
    }
    if (filters.status) params.status = filters.status
    if (filters.applicant) params.applicant = filters.applicant

    const res: any = await http.get('/requests', { params })
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
  filters.status = ''
  filters.applicant = ''
  handleSearch()
}

async function handleExport() {
  exporting.value = true
  try {
    const res = await http.get('/export/requests', { responseType: 'blob' })
    const blob = new Blob([res as any], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'requests_export.csv'
    a.click()
    URL.revokeObjectURL(url)
    ElMessage.success('导出成功')
  } catch {
    // handled by interceptor
  } finally {
    exporting.value = false
  }
}

// ======== 详情 ========
const detailVisible = ref(false)
const detailData = ref<RequestRecord | null>(null)

// 详情弹窗中的明细行
const detailItemRows = computed<RequestItem[]>(() => {
  if (!detailData.value) return []
  if (detailData.value.status === 'approved' && detailData.value.approved_items?.length) {
    return detailData.value.approved_items
  }
  return detailData.value.items
})

function openDetail(row: RequestRecord) {
  detailData.value = row
  detailVisible.value = true
}

// ======== 审批 ========
const approveVisible = ref(false)
const approving = ref(false)
const approveTarget = ref<RequestRecord | null>(null)
const approveMode = ref<'full' | 'partial'>('full')
const approveItems = ref<ApproveItem[]>([])

function openApproveDialog(row: RequestRecord) {
  approveTarget.value = row
  approveMode.value = 'full'
  approveItems.value = row.items.map(it => ({
    ...it,
    reserved_sns: it.serial_numbers || [],
    approve_sns: it.serial_numbers || [],
    approve_qty: it.quantity,
  }))
  approveVisible.value = true
}

async function handleApprove() {
  if (!approveTarget.value) return

  const id = approveTarget.value._id
  let body: any = {}

  if (approveMode.value === 'partial') {
    const partialItems: any[] = []
    for (const it of approveItems.value) {
      const isLowValue = (it.value_type || '高价值') === '低价值'
      if (isLowValue) {
        if (it.approve_qty > 0) {
          partialItems.push({ part_no: it.part_no, quantity: it.approve_qty })
        }
      } else {
        if (it.approve_sns.length > 0) {
          partialItems.push({ part_no: it.part_no, serial_numbers: it.approve_sns })
        }
      }
    }
    if (partialItems.length === 0) {
      ElMessage.warning('请至少批准一项备件')
      return
    }
    body = { partial_items: partialItems }
  }

  approving.value = true
  try {
    const res: any = await http.post(`/requests/${id}/approve`, body)
    ElMessage.success(res.message || '审批通过')
    approveVisible.value = false
    fetchData()
  } finally {
    approving.value = false
  }
}

// ======== 驳回 ========
const rejectVisible = ref(false)
const rejecting = ref(false)
const rejectTarget = ref<RequestRecord | null>(null)
const rejectFormRef = ref<FormInstance>()
const rejectForm = reactive({ reason: '' })
const rejectRules = {
  reason: [{ required: true, message: '请填写驳回原因', trigger: 'blur' }],
}

function openRejectDialog(row: RequestRecord) {
  rejectTarget.value = row
  rejectForm.reason = ''
  rejectVisible.value = true
}

async function handleReject() {
  const valid = await rejectFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!rejectTarget.value) return

  rejecting.value = true
  try {
    await http.post(`/requests/${rejectTarget.value._id}/reject`, {
      reason: rejectForm.reason,
    })
    ElMessage.success('申请已驳回')
    rejectVisible.value = false
    fetchData()
  } finally {
    rejecting.value = false
  }
}

// ======== 辅助 ========
function formatTime(t: string) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已驳回',
    cancelled: '已撤回',
  }
  return map[s] || s
}

function statusTagType(s: string) {
  const map: Record<string, string> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    cancelled: 'info',
  }
  return map[s] || ''
}

onMounted(fetchData)
</script>

<style scoped>
.filter-bar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
.partial-qty {
  color: #e6a23c;
  font-weight: bold;
}
</style>
