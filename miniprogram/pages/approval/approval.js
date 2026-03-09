/**
 * 审批页 — 待审批列表 + 审批/驳回操作
 * 阶段 6-5 将完善此页面（含订阅消息推送）
 */
const api = require('../../utils/api');
const { formatTime, statusText } = require('../../utils/util');

Page({
  data: {
    items: [],
    total: 0,
    page: 1,
    loading: false,
    hasMore: true,
    statusFilter: 'pending',
    // 审批弹窗
    showApprovalDialog: false,
    currentRequest: null,
    rejectReason: '',
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      app.checkLogin();
      return;
    }
    // 仅 admin/manager 可访问
    if (!app.hasRole('admin', 'manager')) {
      wx.showToast({ title: '权限不足', icon: 'none' });
      return;
    }
    this.loadList(true);
  },

  onStatusFilter(e) {
    const val = e.currentTarget.dataset.status;
    this.setData({ statusFilter: val });
    this.loadList(true);
  },

  async loadList(reset = false) {
    if (this.data.loading) return;
    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });

    const query = { page, pageSize: 20 };
    if (this.data.statusFilter) query.status = this.data.statusFilter;

    const res = await api.requests.list(query);
    this.setData({ loading: false });

    if (res.code === 0) {
      const newItems = (res.data.items || []).map(item => ({
        ...item,
        statusLabel: statusText(item.status),
        createdAtText: formatTime(item.created_at),
      }));
      this.setData({
        items: reset ? newItems : [...this.data.items, ...newItems],
        total: res.data.total || 0,
        page: page + 1,
        hasMore: newItems.length >= 20,
      });
    }
  },

  // 打开审批详情
  onTapRequest(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.items.find(i => i._id === id);
    this.setData({ showApprovalDialog: true, currentRequest: item, rejectReason: '' });
  },

  closeDialog() {
    this.setData({ showApprovalDialog: false, currentRequest: null });
  },

  // 审批通过
  async onApprove() {
    const id = this.data.currentRequest._id;
    const { confirm } = await wx.showModal({ title: '确认审批', content: '确定要批准此申请吗？' });
    if (!confirm) return;

    const res = await api.requests.approve(id);
    if (res.code === 0) {
      wx.showToast({ title: '已批准', icon: 'success' });
      this.closeDialog();
      this.loadList(true);
    } else {
      wx.showToast({ title: res.message || '审批失败', icon: 'none' });
    }
  },

  // 驳回
  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  async onReject() {
    if (!this.data.rejectReason) {
      wx.showToast({ title: '请填写驳回原因', icon: 'none' });
      return;
    }

    const id = this.data.currentRequest._id;
    const res = await api.requests.reject(id, this.data.rejectReason);
    if (res.code === 0) {
      wx.showToast({ title: '已驳回', icon: 'success' });
      this.closeDialog();
      this.loadList(true);
    } else {
      wx.showToast({ title: res.message || '驳回失败', icon: 'none' });
    }
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },
});
