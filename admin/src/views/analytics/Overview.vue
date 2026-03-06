<template>
  <div v-loading="loading" class="overview-page">
    <!-- 导出按钮 -->
    <div class="export-bar">
      <el-button type="success" plain :loading="exporting" @click="handleExport">导出分析报告 CSV</el-button>
    </div>

    <!-- KPI 卡片 -->
    <div class="kpi-row">
      <el-card shadow="hover" class="kpi-card">
        <div class="kpi-icon" style="background: #409eff">
          <el-icon :size="28"><Box /></el-icon>
        </div>
        <div class="kpi-body">
          <div class="kpi-value">{{ kpi.in_stock }}</div>
          <div class="kpi-label">在库总数</div>
          <div v-if="kpi.net_change !== 0" class="kpi-delta" :class="kpi.net_change > 0 ? 'up' : 'down'">
            {{ kpi.net_change > 0 ? '+' : '' }}{{ kpi.net_change }} 本月净变化
          </div>
        </div>
      </el-card>
      <el-card shadow="hover" class="kpi-card">
        <div class="kpi-icon" style="background: #e6a23c">
          <el-icon :size="28"><Upload /></el-icon>
        </div>
        <div class="kpi-body">
          <div class="kpi-value">{{ kpi.out_of_stock }}</div>
          <div class="kpi-label">累计出库</div>
        </div>
      </el-card>
      <el-card shadow="hover" class="kpi-card">
        <div class="kpi-icon" :style="{ background: kpi.pending_requests > 0 ? '#f56c6c' : '#67c23a' }">
          <el-icon :size="28"><Bell /></el-icon>
        </div>
        <div class="kpi-body">
          <div class="kpi-value" :class="{ 'text-danger': kpi.pending_requests > 0 }">
            {{ kpi.pending_requests }}
          </div>
          <div class="kpi-label">待审批申请</div>
        </div>
      </el-card>
      <el-card shadow="hover" class="kpi-card">
        <div class="kpi-icon" style="background: #67c23a">
          <el-icon :size="28"><Sort /></el-icon>
        </div>
        <div class="kpi-body">
          <div class="kpi-value">
            <span>{{ kpi.month_inbound }}</span>
            <span class="kpi-sep">/</span>
            <span>{{ kpi.month_outbound }}</span>
          </div>
          <div class="kpi-label">本月入库 / 出库</div>
          <div class="kpi-delta-row">
            <span class="kpi-delta" :class="kpi.in_delta >= 0 ? 'up' : 'down'">
              入{{ kpi.in_delta >= 0 ? '↑' : '↓' }}{{ Math.abs(kpi.in_delta) }}
            </span>
            <span class="kpi-delta" :class="kpi.out_delta >= 0 ? 'up' : 'down'">
              出{{ kpi.out_delta >= 0 ? '↑' : '↓' }}{{ Math.abs(kpi.out_delta) }}
            </span>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 安全库存预警 -->
    <el-card class="section-card">
      <template #header>
        <div class="section-header">
          <el-icon color="#f56c6c"><WarningFilled /></el-icon>
          <span>安全库存预警</span>
          <el-tag v-if="safetyAlerts.length > 0" type="danger" size="small">{{ safetyAlerts.length }} 项</el-tag>
        </div>
      </template>
      <el-table v-if="safetyAlerts.length > 0" :data="safetyAlerts" stripe size="small">
        <el-table-column prop="part_no" label="备件编号" width="160" />
        <el-table-column prop="part_name" label="备件名称" />
        <el-table-column prop="min_stock" label="安全库存" width="100" align="center" />
        <el-table-column prop="actual_stock" label="实际库存" width="100" align="center" />
        <el-table-column label="缺口" width="100" align="center">
          <template #default="{ row }">
            <span style="color: #f56c6c; font-weight: bold">
              <el-icon><WarningFilled /></el-icon>
              {{ row.shortage }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="所有备件库存充足" :image-size="60" />
    </el-card>

    <!-- 库存分布图表 -->
    <div class="chart-row">
      <el-card class="section-card chart-card">
        <template #header>按备件类型分布</template>
        <div ref="pieRef" class="chart-container" />
      </el-card>
      <el-card class="section-card chart-card">
        <template #header>按子公司/仓库分布</template>
        <div ref="barRef" class="chart-container" />
      </el-card>
    </div>

    <!-- 按新旧状态分布 -->
    <el-card class="section-card">
      <template #header>按新旧状态分布</template>
      <div ref="condRef" class="chart-container" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Box, Upload, Bell, Sort, WarningFilled } from '@element-plus/icons-vue'
import http from '../../utils/http'
import { useChart } from '../../utils/chart'

const loading = ref(true)
const exporting = ref(false)

async function handleExport() {
  exporting.value = true
  try {
    const res = await http.get('/export/analytics', { responseType: 'blob' })
    const blob = new Blob([res as any], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'analytics_export.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // handled by interceptor
  } finally {
    exporting.value = false
  }
}

const kpi = ref({
  in_stock: 0,
  out_of_stock: 0,
  pending_requests: 0,
  month_inbound: 0,
  month_outbound: 0,
  net_change: 0,
  in_delta: 0,
  out_delta: 0,
})
const safetyAlerts = ref<any[]>([])

const pieRef = ref<HTMLElement>()
const barRef = ref<HTMLElement>()
const condRef = ref<HTMLElement>()

const { setOption: setPieOption } = useChart(pieRef)
const { setOption: setBarOption } = useChart(barRef)
const { setOption: setCondOption } = useChart(condRef)

onMounted(async () => {
  try {
    const [kpiRes, safetyRes, distRes] = await Promise.all([
      http.get('/analytics/kpi'),
      http.get('/analytics/safety-stock'),
      http.get('/analytics/distribution'),
    ])

    kpi.value = kpiRes.data
    safetyAlerts.value = safetyRes.data

    const dist = distRes.data

    // 饼图 — 按备件类型
    setPieOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['0%', '55%'],
        center: ['50%', '45%'],
        data: dist.by_part_type.map((d: any) => ({
          name: d.part_name,
          value: d.count,
        })),
        label: {
          formatter: '{b}\n{c}',
          fontSize: 11,
          overflow: 'truncate',
          ellipsis: '…',
        },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.2)' } },
      }],
    })

    // 柱图 — 按子公司/仓库
    const barData = dist.by_location.map((d: any) => ({
      name: `${d.subsidiary}-${d.warehouse}`,
      value: d.count,
    }))
    setBarOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 10, right: 10, bottom: 50, top: 30, containLabel: true },
      xAxis: {
        type: 'category',
        data: barData.map((d: any) => d.name),
        axisLabel: {
          rotate: 30,
          fontSize: 11,
          overflow: 'truncate',
          width: 70,
        },
      },
      yAxis: { type: 'value', name: '数量', nameTextStyle: { fontSize: 11 } },
      series: [{
        type: 'bar',
        data: barData.map((d: any) => d.value),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: '#409eff' },
              { offset: 1, color: '#79bbff' },
            ],
          },
        },
        barMaxWidth: 50,
      }],
    })

    // 环形图 — 按新旧状态
    setCondOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['40%', '60%'],
        center: ['50%', '42%'],
        data: dist.by_condition.map((d: any) => ({
          name: d.condition,
          value: d.count,
        })),
        label: { formatter: '{b}: {c}', fontSize: 11 },
      }],
    })
  } catch {
    // http 拦截器已处理错误
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.overview-page {
  padding-bottom: 20px;
}

.export-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

/* ── KPI 卡片: flex-wrap 自适应 ── */
.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}

.kpi-card {
  flex: 1 1 200px;
  min-width: 200px;
}

.kpi-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  width: 100%;
}

.kpi-icon {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.kpi-body {
  flex: 1;
  min-width: 0;
}

.kpi-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
  line-height: 1.2;
  white-space: nowrap;
}

.kpi-sep {
  font-size: 18px;
  color: #909399;
  margin: 0 2px;
}

.kpi-label {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
  white-space: nowrap;
}

.kpi-delta {
  font-size: 11px;
  margin-top: 2px;
  white-space: nowrap;
}

.kpi-delta.up {
  color: #67c23a;
}

.kpi-delta.down {
  color: #f56c6c;
}

.kpi-delta-row {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.text-danger {
  color: #f56c6c !important;
}

.section-card {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

/* ── 图表行: flex 并排, 窄屏竖排 ── */
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

/* ── 窄屏: 图表竖排 ── */
@media (max-width: 768px) {
  .chart-row {
    flex-direction: column;
  }

  .chart-container {
    height: 280px;
  }

  .kpi-card {
    flex: 1 1 calc(50% - 16px);
  }
}
</style>
