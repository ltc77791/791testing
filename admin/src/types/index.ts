/** 备件 */
export interface Part {
  id: number
  name: string
  model: string
  specification: string
  category: string
  quantity: number
  unit: string
  min_quantity: number
  location: string
  status: string
  created_at: string
  updated_at: string
}
