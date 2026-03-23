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
            style="width: 140px"
            @change="handleListSearch"
          >
            <el-option label="待审批" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已驳回" value="rejected" />
            <el-option label="已撤回" value="cancelled" />
          </el-select>
          <el-button style="margin-left: 12px" @click="handleListReset">重置</el-button>
        </div>

        <!-- 申请列表 -->
        <el-table :data="listData" v-loading="listLoading" border stripe style="width: 100%">
          <el-table-column label="申请时间" min-width="160">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
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
          <el-table-column label="审批时间" min-width="160">
            <template #default="{ row }">{{ row.approved_at ? formatTime(row.approved_at) : '-' }}</template>
          </el-table-column>
          <el-table-column prop="reject_reason" label="驳回原因" min-width="140">
            <template #default="{ row }">{{ row.reject_reason || '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="140" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openDetail(row)">详情</el-button>
              <el-button
                v-if="row.status === 'pending'"
                size="small"
                type="danger"
                @click="handleCancel(row)"
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
              <span v-if="row.serial_numbers?.length">
                {{ row.serial_numbers.join(', ') }}
              </span>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
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

const activeTab = ref('create')
const partTypeOptions = ref<PartTypeOption[]>([])

// ======== 提交申请 ========
const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  project_location: '',
  outbound_reason: '',
  remark: '',
  items: [{ part_no: '', quantity: 1 }] as { part_no: string; quantity: number }[],
})
const formRules = {
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
      project_location: form.project_location,
      outbound_reason: form.outbound_reason,
      remark: form.remark,
    })
    ElMessage.success('申请提交成功')
    resetForm()
    // 自动切换到列表查看
    activeTab.value = 'list'
    fetchList()
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  formRef.value?.resetFields()
  form.items = [{ part_no: '', quantity: 1 }]
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

onMounted(() => {
  loadPartTypes()
  fetchList()
})
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
