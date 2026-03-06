<template>
  <div v-loading="loading" class="age-page">
    <!-- 筛选器 -->
    <el-card class="filter-card">
      <el-form inline>
        <el-form-item label="呆滞天数">
          <el-input-number v-model="staleDays" :min="30" :max="365" :step="30" @change="fetchAge" />
        </el-form-item>
        <el-form-item label="周转率周期">
          <el-select v-model="turnoverMonths" @change="fetchTurnover">
            <el-option :value="3" label="近 3 个月" />
            <el-option :value="6" label="近 6 个月" />
            <el-option :value="12" label="近 12 个月" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 库龄分布柱图 -->
    <el-card class="section-card">
      <template #header>库龄分布</template>
      <div ref="ageRef" class="chart-container" />
    </el-card>

    <!-- 呆滞预警明细 -->
    <el-card class="section-card">
      <template #header>
        <div class="section-header">
          <span>呆滞预警</span>
          <el-tag v-if="staleCount > 0" type="warning" size="small">
            超过 {{ staleDays }} 天未出库: {{ staleCount }} 件
          </el-tag>
        </div>
      </template>
      <el-table v-if="staleItems.length > 0" :data="staleItems" stripe size="small" max-height="400">
        <el-table-column prop="part_no" label="备件编号" width="140" />
        <el-table-column prop="part_name" label="备件名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="serial_number" label="序列号" width="140" show-overflow-tooltip />
        <el-table-column prop="subsidiary" label="子公司" width="120" show-overflow-tooltip />
        <el-table-column prop="warehouse" label="仓库" width="120" show-overflow-tooltip />
        <el-table-column prop="age_days" label="库龄(天)" width="100" align="center" sortable>
          <template #default="{ row }">
            <span :style="{ color: ageDaysColor(row.age_days), fontWeight: 'bold' }">
              {{ row.age_days }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="无呆滞备件" :image-size="60" />
    </el-card>

    <!-- 备件周转率 -->
    <el-card class="section-card">
      <template #header>备件周转率</template>
      <el-table v-if="turnoverData.length > 0" :data="turnoverData" stripe size="small" max-height="400">
        <el-table-column prop="part_no" label="备件编号" width="140" />
        <el-table-column prop="part_name" label="备件名称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="out_qty" label="出库量" width="90" align="center" sortable />
        <el-table-column prop="in_qty" label="在库量" width="90" align="center" sortable />
        <el-table-column label="周转率" width="100" align="center" sortable :sort-by="(row: any) => row.turnover_rate ?? -1">
          <template #default="{ row }">
            <span v-if="row.turnover_rate !== null" :style="{ color: turnoverColor(row.turnover_rate), fontWeight: 'bold' }">
              {{ row.turnover_rate.toFixed(2) }}
            </span>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暂无周转数据" :image-size="60" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import http from '../../utils/http'
import { useChart } from '../../utils/chart'

const loading = ref(true)
const staleDays = ref(90)
const turnoverMonths = ref(6)

const staleCount = ref(0)
const staleItems = ref<any[]>([])
const turnoverData = ref<any[]>([])

const ageRef = ref<HTMLElement>()
const { setOption: setAgeOption } = useChart(ageRef)

const bucketColors = ['#67c23a', '#e6a23c', '#f89c3c', '#f56c6c']

function renderAgeChart(distribution: any[]) {
  setAgeOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 10, right: 20, bottom: 10, top: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: distribution.map((d: any) => d.bucket),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: '数量',
      nameTextStyle: { fontSize: 11 },
      minInterval: 1,
    },
    series: [{
      type: 'bar',
      data: distribution.map((d: any, i: number) => ({
        value: d.count,
        itemStyle: { color: bucketColors[i] || '#409eff' },
      })),
      barMaxWidth: 60,
      label: {
        show: true,
        position: 'top',
        fontSize: 12,
        fontWeight: 'bold',
      },
    }],
  })
}

function ageDaysColor(days: number): string {
  if (days > 180) return '#f56c6c'
  if (days > 90) return '#e6a23c'
  return '#303133'
}

function turnoverColor(rate: number): string {
  if (rate >= 1) return '#67c23a'
  if (rate < 0.5) return '#f56c6c'
  return '#e6a23c'
}

async function fetchAge() {
  try {
    const res = await http.get(`/analytics/age?stale_days=${staleDays.value}`)
    const data = res.data
    renderAgeChart(data.distribution || [])
    staleCount.value = data.stale_count || 0
    staleItems.value = data.stale_items || []
  } catch {
    // handled by interceptor
  }
}

async function fetchTurnover() {
  try {
    const res = await http.get(`/analytics/turnover?months=${turnoverMonths.value}`)
    turnoverData.value = res.data || []
  } catch {
    // handled by interceptor
  }
}

onMounted(async () => {
  try {
    await Promise.all([fetchAge(), fetchTurnover()])
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.age-page {
  padding-bottom: 20px;
}

.filter-card {
  margin-bottom: 16px;
}

.filter-card :deep(.el-card__body) {
  padding: 12px 16px;
}

.filter-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.section-card {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.chart-container {
  width: 100%;
  height: 320px;
  min-height: 240px;
}

@media (max-width: 768px) {
  .chart-container {
    height: 260px;
  }
}
</style>
