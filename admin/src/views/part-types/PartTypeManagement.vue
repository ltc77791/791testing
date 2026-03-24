<template>
  <div class="part-type-management">
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
import type { FormInstance } from 'element-plus'
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
