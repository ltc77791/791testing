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

    <!-- 申请列表 -->
    <el-table :data="tableData" v-loading="loading" border stripe style="width: 100%">
      <el-table-column label="申请时间" min-width="160">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column prop="applicant" label="申请人" width="100" />
      <el-table-column label="申请明细" min-width="220">
        <template #default="{ row }">
          <span v-for="(it, i) in row.items" :key="i">
            {{ it.part_name || it.part_no }} x{{ it.quantity }}
            <span v-if="i < row.items.length - 1">; </span>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="project_location" label="项目地点" min-width="140" />
      <el-table-column prop="outbound_reason" label="出库原因" width="100" align="center">
        <template #default="{ row }">{{ row.outbound_reason || '-' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="approved_by" label="审批人" width="100">
        <template #default="{ row }">{{ row.approved_by || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">详情</el-button>
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="success" @click="openApproveDialog(row)">审批</el-button>
            <el-button size="small" type="danger" @click="openRejectDialog(row)">驳回</el-button>
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
    <el-dialog v-model="detailVisible" title="申请详情" width="650px">
      <el-descriptions v-if="detailData" :column="2" border>
        <el-descriptions-item label="申请人">{{ detailData.applicant }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusTagType(detailData.status)" size="small">
            {{ statusLabel(detailData.status) }}
          </el-tag>
        </el-descriptions-item>
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
        :data="detailData.items"
        border
        stripe
        style="width: 100%; margin-top: 16px"
      >
        <el-table-column prop="part_no" label="备件编号" min-width="130" />
        <el-table-column prop="part_name" label="备件名称" min-width="140" />
        <el-table-column prop="quantity" label="申请数量" width="100" align="center" />
        <el-table-column label="价值类型" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="(row.value_type || '高价值') === '高价值' ? 'danger' : 'info'" size="small">
              {{ row.value_type || '高价值' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="预留序列号" min-width="200">
          <template #default="{ row }">
            <template v-if="(row.value_type || '高价值') === '高价值'">
              <span v-if="row.serial_numbers?.length">{{ row.serial_numbers.join(', ') }}</span>
              <span v-else>-</span>
            </template>
            <span v-else style="color: #909399">低价值备件，无需序列号</span>
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
          申请人: {{ approveTarget?.applicant }} | 项目: {{ approveTarget?.project_location }} | 原因: {{ approveTarget?.outbound_reason || '-' }}
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
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import http from '../../utils/http'

interface RequestItem {
  part_no: string
  part_name?: string
  value_type?: string
  quantity: number
  serial_numbers?: string[]
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
  project_location: string
  remark: string
  created_at: string
  updated_at: string
  approved_by: string | null
  approved_at: string | null
  reject_reason: string | null
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
  // 提取预留序列号供下拉使用
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
  } else {
    // 这里是为了确保即使在 activeTab 从 partial 切换回 full 时，
    // 依然能覆盖之前可能被取消掉的 SN 选项。
    // 但是后端实际在 partial_items = undefined 的时候也是 full_approve 挂满
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
</style>
