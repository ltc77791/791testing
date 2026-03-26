<template>
  <div class="request-page">
    <el-tabs v-model="activeTab" type="border-card">
      <!-- ========== Tab 1: 提交申请 ========== -->
      <el-tab-pane label="提交申请" name="create">
        <el-form
          ref="formRef"
          :model="form"
          :rules="formRules"
          label-width="100px"
          style="max-width: 700px; margin-top: 12px"
        >
          <el-form-item label="项目号" prop="project_no">
            <el-select
              v-model="form.project_no"
              filterable
              placeholder="选择项目号"
              style="width: 100%"
            >
              <el-option
                v-for="p in projectOptions"
                :key="p"
                :label="p"
                :value="p"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="项目地点" prop="project_location">
            <el-input v-model="form.project_location" placeholder="如 张江IDC扩容" />
          </el-form-item>

          <el-form-item label="出库原因" prop="outbound_reason">
            <el-select v-model="form.outbound_reason" placeholder="请选择出库原因" style="width: 100%">
              <el-option label="维修" value="维修" />
              <el-option label="调用" value="调用" />
              <el-option label="销售" value="销售" />
            </el-select>
          </el-form-item>

          <!-- 动态申请明细 -->
          <el-form-item label="申请明细" required>
            <div
              v-for="(item, idx) in form.items"
              :key="idx"
              style="display: flex; gap: 8px; margin-bottom: 8px; width: 100%"
            >
              <el-form-item
                :prop="'items.' + idx + '.part_no'"
                :rules="[{ required: true, message: '请选择备件类型', trigger: 'change' }]"
                style="flex: 2; margin-bottom: 0"
              >
                <el-select
                  v-model="item.part_no"
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
              <el-form-item
                :prop="'items.' + idx + '.quantity'"
                :rules="[{ required: true, message: '请输入数量', trigger: 'blur' }, { type: 'number', min: 1, message: '数量至少为1', trigger: 'blur' }]"
                style="flex: 1; margin-bottom: 0"
              >
                <el-input-number
                  v-model="item.quantity"
                  :min="1"
                  :max="999"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
              <el-button
                v-if="form.items.length > 1"
                type="danger"
                :icon="Delete"
                circle
                @click="removeItem(idx)"
              />
            </div>
            <el-button type="primary" link @click="addItem">+ 添加备件</el-button>
          </el-form-item>

          <el-form-item label="备注">
            <el-input
              v-model="form.remark"
              type="textarea"
              :rows="2"
              placeholder="可选备注信息"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>

          <el-form-item>
            <el-button type="primary" :loading="submitting" @click="handleSubmit">
              提交申请
            </el-button>
            <el-button @click="resetForm">重置</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- ========== Tab 2: 我的申请 ========== -->
      <el-tab-pane label="我的申请" name="list">
        <!-- 筛选栏 -->
        <div class="filter-bar">
          <el-select
            v-model="listFilters.status"
            placeholder="申请状态"
            clearable
            style="width: 120px"
            @change="handleListSearch"
          >
            <el-option label="待审批" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="已撤回" value="cancelled" />
          </el-select>
          <el-button @click="handleListReset">重置</el-button>
        </div>

        <!-- 申请列表（按申请项展开，每行一个备件） -->
        <el-table
          :data="flatRows"
          v-loading="listLoading"
          border
          stripe
          size="small"
          class="compact-table"
          style="width: 100%"
          :span-method="spanMethod"
        >
          <el-table-column label="申请时间" width="135" show-overflow-tooltip>
            <template #default="{ row }">{{ formatTime(row._created_at) }}</template>
          </el-table-column>
          <el-table-column label="项目号" min-width="90" show-overflow-tooltip>
            <template #default="{ row }">{{ row._project_no || '-' }}</template>
          </el-table-column>
          <el-table-column label="出库原因" width="75" align="center">
            <template #default="{ row }">{{ row._outbound_reason || '-' }}</template>
          </el-table-column>
          <el-table-column prop="part_no" label="备件编号" min-width="95" show-overflow-tooltip />
          <el-table-column prop="part_name" label="备件名称" min-width="95" show-overflow-tooltip />
          <el-table-column label="序列号" min-width="120" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.serial_numbers?.length">{{ row.serial_numbers.join(', ') }}</span>
              <span v-else style="color: #909399">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="申请数量" width="65" align="center" />
          <el-table-column label="审批时间" width="135" show-overflow-tooltip>
            <template #default="{ row }">{{ row._approved_at ? formatTime(row._approved_at) : '-' }}</template>
          </el-table-column>
          <el-table-column label="审批人" width="70" show-overflow-tooltip>
            <template #default="{ row }">{{ row._approved_by || '-' }}</template>
          </el-table-column>
          <el-table-column label="审批结果" width="80" align="center">
            <template #default="{ row }">
              <el-tag v-if="row._status === 'approved'" :type="row._approval_type === 'partial' ? 'warning' : 'success'" size="small">
                {{ row._approval_type === 'partial' ? '部分通过' : '全量通过' }}
              </el-tag>
              <el-tag v-else-if="row._status === 'rejected'" type="danger" size="small">已驳回</el-tag>
              <el-tag v-else-if="row._status === 'cancelled'" type="info" size="small">已撤回</el-tag>
              <el-tag v-else type="warning" size="small">待审批</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="审批数量" width="65" align="center">
            <template #default="{ row }">
              <template v-if="row._status === 'approved'">
                <span :class="{ 'partial-qty': row.approved_quantity < row.quantity }">
                  {{ row.approved_quantity ?? row.quantity }}
                </span>
              </template>
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right" align="center">
            <template #default="{ row }">
              <el-button size="small" link type="primary" @click="openDetail(row._request)">详情</el-button>
              <el-button
                v-if="row._status === 'pending'"
                size="small"
                link
                type="danger"
                @click="handleCancel(row._request)"
              >
                撤回
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="pagination-wrapper">
          <el-pagination
            v-model:current-page="listPage"
            v-model:page-size="listPageSize"
            :total="listTotal"
            :page-sizes="[20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @size-change="fetchList"
            @current-change="fetchList"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 申请详情弹窗 -->
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import type { FormInstance } from 'element-plus'
import http from '../../utils/http'

interface PartTypeOption {
  part_no: string
  part_name: string
}

interface RequestItem {
  part_no: string
  part_name?: string
  quantity: number
  serial_numbers?: string[]
  approved_quantity?: number
  approved_serial_numbers?: string[]
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
  _outbound_reason: string
  _approved_at: string | null
  _approved_by: string | null
  _status: string
  _approval_type: string
  _rowSpan: number
  _rowIndex: number
  part_no: string
  part_name: string
  serial_numbers: string[]
  quantity: number
  approved_quantity?: number
  approved_serial_numbers?: string[]
}

const activeTab = ref('create')
const partTypeOptions = ref<PartTypeOption[]>([])
const projectOptions = ref<string[]>([])

// ======== 提交申请 ========
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  project_no: '',
  project_location: '',
  outbound_reason: '',
  remark: '',
  items: [{ part_no: '', quantity: 1 }] as { part_no: string; quantity: number }[],
})
const formRules = {
  project_no: [{ required: true, message: '请选择项目号', trigger: 'change' }],
  project_location: [{ required: true, message: '请输入项目地点', trigger: 'blur' }],
  outbound_reason: [{ required: true, message: '请选择出库原因', trigger: 'change' }],
}

function addItem() {
  form.items.push({ part_no: '', quantity: 1 })
}

function removeItem(idx: number) {
  form.items.splice(idx, 1)
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await http.post('/requests', {
      items: form.items.map(i => ({ part_no: i.part_no, quantity: i.quantity })),
      project_no: form.project_no,
      project_location: form.project_location,
      outbound_reason: form.outbound_reason,
      remark: form.remark,
    })
    ElMessage.success('申请提交成功')
    resetForm()
    activeTab.value = 'list'
    fetchList()
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  formRef.value?.resetFields()
  form.items = [{ part_no: '', quantity: 1 }]
  form.project_no = ''
  form.outbound_reason = ''
  form.remark = ''
}

// ======== 我的申请列表 ========
const listLoading = ref(false)
const listData = ref<RequestRecord[]>([])
const listPage = ref(1)
const listPageSize = ref(20)
const listTotal = ref(0)
const listFilters = reactive({
  status: '' as string,
})

// 展平为每行一个备件项
const flatRows = computed<FlatRow[]>(() => {
  const rows: FlatRow[] = []
  for (const req of listData.value) {
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
const REQUEST_LEVEL_COLS = [0, 1, 2, 7, 8, 9, 11] // 申请时间, 项目号, 出库原因, 审批时间, 审批人, 审批结果, 操作
function spanMethod({ row, columnIndex }: { row: FlatRow; column: any; rowIndex: number; columnIndex: number }) {
  if (REQUEST_LEVEL_COLS.includes(columnIndex)) {
    if (row._rowIndex === 0) {
      return { rowspan: row._rowSpan, colspan: 1 }
    }
    return { rowspan: 0, colspan: 0 }
  }
  return { rowspan: 1, colspan: 1 }
}

async function fetchList() {
  listLoading.value = true
  try {
    const params: any = {
      page: listPage.value,
      pageSize: listPageSize.value,
    }
    if (listFilters.status) params.status = listFilters.status

    const res: any = await http.get('/requests', { params })
    listData.value = res.data.items
    listTotal.value = res.data.total
  } finally {
    listLoading.value = false
  }
}

function handleListSearch() {
  listPage.value = 1
  fetchList()
}

function handleListReset() {
  listFilters.status = ''
  handleListSearch()
}

// ======== 详情弹窗 ========
const detailVisible = ref(false)
const detailData = ref<RequestRecord | null>(null)

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

// ======== 撤回 ========
async function handleCancel(row: RequestRecord) {
  try {
    await ElMessageBox.confirm('确定要撤回此申请吗？撤回后预留的库存将被释放。', '确认撤回', {
      type: 'warning',
      confirmButtonText: '确认撤回',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  try {
    await http.post(`/requests/${row._id}/cancel`)
    ElMessage.success('申请已撤回')
    fetchList()
  } catch { /* error handled by interceptor */ }
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

async function loadPartTypes() {
  try {
    const res: any = await http.get('/part-types', { params: { pageSize: 100 } })
    partTypeOptions.value = res.data.items.map((i: any) => ({
      part_no: i.part_no,
      part_name: i.part_name,
    }))
  } catch { /* ignore */ }
}

async function loadProjectOptions() {
  try {
    const res: any = await http.get('/dictionaries/options', { params: { category: 'project_no' } })
    projectOptions.value = res.data || []
  } catch { /* ignore */ }
}

onMounted(() => {
  loadPartTypes()
  loadProjectOptions()
  fetchList()
})
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
.partial-qty {
  color: #e6a23c;
  font-weight: bold;
}
</style>
