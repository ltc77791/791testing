import { onMounted, onBeforeUnmount, ref, type Ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts/core'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  PieChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  CanvasRenderer,
])

export function useChart(domRef: Ref<HTMLElement | undefined>) {
  const chart = shallowRef<echarts.ECharts>()
  let ro: ResizeObserver | null = null

  onMounted(() => {
    if (!domRef.value) return
    chart.value = echarts.init(domRef.value)
    ro = new ResizeObserver(() => chart.value?.resize())
    ro.observe(domRef.value)
  })

  onBeforeUnmount(() => {
    ro?.disconnect()
    chart.value?.dispose()
  })

  function setOption(option: echarts.EChartsOption) {
    chart.value?.setOption(option, true)
  }

  return { chart, setOption }
}
