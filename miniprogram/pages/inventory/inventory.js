/**
 * 库存列表页 — 查询 + 筛选
 * 阶段 6-4 将完善此页面
 */
const api = require('../../utils/api');
const { formatTime, inventoryStatusText, debounce } = require('../../utils/util');

Page({
  data: {
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    loading: false,
    hasMore: true,
    // 筛选
    keyword: '',
    statusFilter: '', // '' | '0' | '1'
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      app.checkLogin();
      return;
    }
    this.loadData(true);
  },

  // 搜索
  onSearchInput: debounce(function (e) {
    this.setData({ keyword: e.detail.value });
    this.loadData(true);
  }, 500),

  // 状态筛选
  onStatusFilter(e) {
    const val = e.currentTarget.dataset.status;
    this.setData({ statusFilter: val === this.data.statusFilter ? '' : val });
    this.loadData(true);
  },

  // 加载数据
  async loadData(reset = false) {
    if (this.data.loading) return;

    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });

    const query = {
      page,
      pageSize: this.data.pageSize,
    };
    if (this.data.keyword) query.keyword = this.data.keyword;
    if (this.data.statusFilter !== '') query.status = Number(this.data.statusFilter);

    const res = await api.inventory.list(query);
    this.setData({ loading: false });

    if (res.code === 0) {
      const newItems = (res.data.items || []).map(item => ({
        ...item,
        statusText: inventoryStatusText(item.status),
        inboundTimeText: formatTime(item.inbound_time),
      }));

      this.setData({
        items: reset ? newItems : [...this.data.items, ...newItems],
        total: res.data.total || 0,
        page: page + 1,
        hasMore: newItems.length >= this.data.pageSize,
      });
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadData(true).then(() => wx.stopPullDownRefresh());
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadData(false);
    }
  },
});
