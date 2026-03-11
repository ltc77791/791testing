/**
 * 审批页 — 待审批列表 + 审批/驳回操作（含部分批准）
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
    // 部分批准
    approveMode: 'full', // 'full' | 'partial'
    approveItems: [],     // 每项的 SN 选择状态
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

    // 构建审批项（含 SN 选择状态）
    const approveItems = (item.items || []).map(sub => ({
      part_no: sub.part_no,
      part_name: sub.part_name,
      quantity: sub.quantity,
      serial_numbers: sub.serial_numbers || [],
      // 默认全选
      selected_sns: [...(sub.serial_numbers || [])],
    }));

    this.setData({
      showApprovalDialog: true,
      currentRequest: item,
      rejectReason: '',
      approveMode: 'full',
      approveItems,
    });
  },

  closeDialog() {
    this.setData({ showApprovalDialog: false, currentRequest: null });
  },

  // 切换审批模式
  onApproveModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ approveMode: mode });

    // 切回全部批准时，重置所有选择为全选
    if (mode === 'full') {
      const approveItems = this.data.approveItems.map(item => ({
        ...item,
        selected_sns: [...item.serial_numbers],
      }));
      this.setData({ approveItems });
    }
  },

  // 切换单个 SN 的选中状态
  onToggleSN(e) {
    const { itemIdx, sn } = e.currentTarget.dataset;
    const key = `approveItems[${itemIdx}].selected_sns`;
    const current = this.data.approveItems[itemIdx].selected_sns;

    if (current.includes(sn)) {
      this.setData({ [key]: current.filter(s => s !== sn) });
    } else {
      this.setData({ [key]: [...current, sn] });
    }
  },

  // 全选/取消全选某个备件的所有 SN
  onToggleAllSN(e) {
    const idx = e.currentTarget.dataset.itemIdx;
    const item = this.data.approveItems[idx];
    const key = `approveItems[${idx}].selected_sns`;

    if (item.selected_sns.length === item.serial_numbers.length) {
      this.setData({ [key]: [] });
    } else {
      this.setData({ [key]: [...item.serial_numbers] });
    }
  },

  // 审批通过
  async onApprove() {
    const { approveMode, approveItems, currentRequest } = this.data;
    const id = currentRequest._id;

    let partialItems = null;

    if (approveMode === 'partial') {
      const selected = approveItems.filter(item => item.selected_sns.length > 0);
      if (selected.length === 0) {
        wx.showToast({ title: '请至少选择一个序列号', icon: 'none' });
        return;
      }
      partialItems = selected.map(item => ({
        part_no: item.part_no,
        serial_numbers: item.selected_sns,
      }));
    }

    const modeText = approveMode === 'full' ? '全部批准' : '部分批准';
    const { confirm } = await wx.showModal({
      title: '确认审批',
      content: `确定要${modeText}此申请吗？`,
    });
    if (!confirm) return;

    const res = await api.requests.approve(id, partialItems);
    if (res.code === 0) {
      wx.showToast({ title: res.message || '已批准', icon: 'success' });
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
