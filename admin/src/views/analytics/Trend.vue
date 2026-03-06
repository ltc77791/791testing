<template>
  <div v-loading="loading" class="trend-page">
    <!-- 筛选器 -->
    <el-card class="filter-card">
      <el-form inline>
        <el-form-item label="消耗统计周期">
          <el-select v-model="months" @change="fetchConsumption">
            <el-option :value="3" label="近 3 个月" />
            <el-option :value="6" label="近 6 个月" />
            <el-option :value="12" label="近 12 个月" />
          </el-select>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 月度出入库趋势 -->
    <el-card class="section-card">
      <template #header>月度出入库趋势</template>
      <div ref="trendRef" class="chart-container chart-wide" />
    </el-card>

    <!-- 消耗排行 + 项目用量 -->
    <div class="chart-row">
      <el-card class="section-card chart-card">
        <template #header>备件消耗排行 Top 10</template>
        <div ref="topRef" class="chart-container" />
      </el-card>
      <el-card class="section-card chart-card">
        <template #header>项目用量统计</template>
        <el-table
          v-if="byProject.length > 0"
          :data="byProject"
          stripe
          size="small"
          max-height="320"
        >
          <el-table-column prop="project_location" label="项目地点" min-width="140" show-overflow-tooltip />
          <el-table-column prop="total_qty" label="用量" width="90" align="center" sortable />
          <el-table-column prop="request_count" label="申请次数" width="100" align="center" sortable />
        </el-table>
        <el-empty v-else description="暂无项目用量数据" :image-size="60" />
      </el-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import http from '../../utils/http'
import { useChart } from '../../utils/chart'

const loading = ref(true)
const months = ref(6)

const byProject = ref<any[]>([])

const trendRef = ref<HTMLElement>()
const topRef = ref<HTMLElement>()

const { setOption: setTrendOption } = useChart(trendRef)
const { setOption: setTopOption } = useChart(topRef)

function renderTrend(data: any[]) {
  setTrendOption({
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      bottom: 0,
      data: ['入库', '出库'],
      textStyle: { fontSize: 11 },
    },
    grid: { left: 10, right: 20, bottom: 40, top: 30, containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.month),
      axisLabel: { fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      name: '数量',
      nameTextStyle: { fontSize: 11 },
      minInterval: 1,
    },
    series: [
      {
        name: '入库',
        type: 'line',
        data: data.map((d: any) => d.inbound),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#409eff' },
        areaStyle: { color: 'rgba(64,158,255,0.1)' },
      },
      {
        name: '出库',
        type: 'line',
        data: data.map((d: any) => d.outbound),
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#e6a23c' },
        areaStyle: { color: 'rgba(230,162,60,0.1)' },
      },
    ],
  })
}

function renderTop10(data: any[]) {
  setTopOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 10, right: 30, bottom: 10, top: 10, containLabel: true },
    xAxis: {
      type: 'value',
      name: '数量',
      nameTextStyle: { fontSize: 11 },
      minInterval: 1,
    },
    yAxis: {
      type: 'category',
      data: data.map((d: any) => d.part_name).reverse(),
      axisLabel: {
        fontSize: 11,
        overflow: 'truncate',
        width: 80,
      },
    },
    series: [
      {
        type: 'bar',
        data: data.map((d: any) => d.total_qty).reverse(),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#f56c6c' },
              { offset: 1, color: '#e6a23c' },
            ],
          },
        },
        barMaxWidth: 30,
      },
    ],
  })
}

async function fetchConsumption() {
  try {
    const res = await http.get(`/analytics/consumption?months=${months.value}`)
    const data = res.data
    renderTop10(data.top_parts || [])
    byProject.value = data.by_project || []
  } catch {
    // handled by interceptor
  }
}

onMounted(async () => {
  try {
    const [trendRes] = await Promise.all([
      http.get('/analytics/trend'),
      fetchConsumption(),
    ])
    renderTrend(trendRes.data || [])
  } catch {
    // handled by interceptor
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.trend-page {
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

.chart-row {
  display: flex;
  gap: 16px;
  margin-bottom: 0;
}

.chart-card {
  flex: 1 1 0;
  min-width: 0;
}

.chart-container {
  width: 100%;
  height: 320px;
  min-height: 240px;
}

.chart-wide {
  height: 360px;
}

@media (max-width: 768px) {
  .chart-row {
    flex-direction: column;
  }

  .chart-container {
    height: 280px;
  }

  .chart-wide {
    height: 300px;
  }
}
</style>
