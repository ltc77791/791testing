<template>
  <div class="log-viewer">
    <!-- 筛选栏 -->
    <div class="filter-bar">
      <el-select
        v-model="filters.category"
        placeholder="操作类型"
        clearable
        multiple
        collapse-tags
        style="width: 200px"
        @change="handleSearch"
      >
        <el-option label="用户管理" value="UserMgmt" />
        <el-option label="入库" value="Inbound" />
        <el-option label="出库" value="Outbound" />
        <el-option label="备件类型" value="PartType" />
        <el-option label="库存编辑" value="InventoryEdit" />
      </el-select>

      <el-input
        v-model="filters.operator"
        placeholder="操作员"
        clearable
        style="width: 140px; margin-left: 12px"
        @keyup.enter="handleSearch"
        @clear="handleSearch"
      />

      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        format="YYYY-MM-DD"
        value-format="YYYY-MM-DD"
        style="width: 260px; margin-left: 12px"
        @change="handleSearch"
      />

      <el-button style="margin-left: 12px" type="primary" @click="handleSearch">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
    </div>

    <!-- 日志表格 -->
    <el-table :data="tableData" v-loading="loading" border stripe style="width: 100%">
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column prop="category" label="类型" width="110">
        <template #default="{ row }">
          <el-tag :type="categoryTag(row.category)" size="small">{{ categoryLabel(row.category) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="action_type" label="操作" width="120" />
      <el-table-column prop="operator" label="操作员" width="100" />
      <el-table-column prop="details" label="详情" min-width="300" show-overflow-tooltip />
    </el-table>

    <!-- 分页 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[20, 50, 100]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="fetchData"
        @size-change="fetchData"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import http from '../../utils/http'

const loading = ref(false)
const tableData = ref<any[]>([])
const dateRange = ref<string[] | null>(null)

const filters = reactive({
  category: [] as string[],
  operator: '',
})

const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
})

const categoryMap: Record<string, { label: string; tag: string }> = {
  UserMgmt: { label: '用户管理', tag: '' },
  Inbound: { label: '入库', tag: 'success' },
  Outbound: { label: '出库', tag: 'warning' },
  PartType: { label: '备件类型', tag: 'info' },
  InventoryEdit: { label: '库存编辑', tag: 'danger' },
}

function categoryLabel(cat: string) {
  return categoryMap[cat]?.label || cat
}

function categoryTag(cat: string) {
  return (categoryMap[cat]?.tag || '') as any
}

function formatTime(t: string) {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN', { hour12: false })
}

async function fetchData() {
  loading.value = true
  try {
    const params: any = {
      page: pagination.page,
      page_size: pagination.pageSize,
    }
    if (filters.category.length) params.category = filters.category.join(',')
    if (filters.operator) params.operator = filters.operator
    if (dateRange.value && dateRange.value[0]) params.start_date = dateRange.value[0]
    if (dateRange.value && dateRange.value[1]) params.end_date = dateRange.value[1]

    const res = await http.get('/logs', { params })
    tableData.value = res.data.items
    pagination.total = res.data.total
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.page = 1
  fetchData()
}

function handleReset() {
  filters.category = []
  filters.operator = ''
  dateRange.value = null
  handleSearch()
}

onMounted(() => fetchData())
</script>

<style scoped>
.log-viewer {
  padding-bottom: 20px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 16px;
  gap: 0;
}

.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
