/**
 * 出库申请页 — 提交申请 + 我的申请列表
 * 阶段 6-4 将完善此页面
 */
const api = require('../../utils/api');
const { formatTime, statusText } = require('../../utils/util');

Page({
  data: {
    isOperator: true,  // 是否为操作员角色
    currentUser: '',   // 当前登录用户名
    tab: 'list',   // 'list' | 'create'
    // 列表
    items: [],
    total: 0,
    page: 1,
    loading: false,
    hasMore: true,
    statusFilter: '',
    // 创建表单
    partTypes: [],
    formItems: [{ part_no: '', quantity: 1 }],
    projectNo: '',
    projectOptions: [],
    projectLocation: '',
    outboundReason: '',
    reasonOptions: ['维修', '调用', '销售'],
    remark: '',
    submitting: false,
  },

  async onShow() {
    const app = getApp();
    if (!(await app.reCheckLogin())) return;
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selectedPath: 'pages/request/request' });
    }
    // 权限检查：仅 operator 可提交申请
    const isOperator = app.hasRole('operator') && !app.hasRole('admin', 'manager');
    this.setData({
      isOperator,
      currentUser: app.globalData.user?.username || '',
    });
    if (!isOperator) {
      // admin/manager 只能查看所有申请列表，不可创建
      this.setData({ tab: 'list' });
    }
    this.loadList(true);
  },

  // Tab 切换
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'create' && !this.data.isOperator) {
      wx.showToast({ title: '审批角色不可提交申请', icon: 'none' });
      return;
    }
    this.setData({ tab });
    if (tab === 'create') {
      if (this.data.partTypes.length === 0) this.loadPartTypes();
      if (this.data.projectOptions.length === 0) this.loadProjectOptions();
    }
  },

  // ── 列表 ──
  onStatusFilter(e) {
    const val = e.currentTarget.dataset.status;
    this.setData({ statusFilter: val === this.data.statusFilter ? '' : val });
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

  // 撤回申请
  async onCancel(e) {
    const id = e.currentTarget.dataset.id;
    const { confirm } = await wx.showModal({ title: '确认撤回', content: '确定要撤回此申请吗？' });
    if (!confirm) return;

    const res = await api.requests.cancel(id);
    if (res.code === 0) {
      wx.showToast({ title: '已撤回', icon: 'success' });
      this.loadList(true);
    } else {
      wx.showToast({ title: res.message || '撤回失败', icon: 'none' });
    }
  },

  // ── 创建申请 ──
  async loadProjectOptions() {
    const res = await api.dictionaries.options('project_no');
    if (res.code === 0) {
      this.setData({ projectOptions: res.data || [] });
    }
  },

  onProjectSelect(e) {
    const idx = e.detail.value;
    this.setData({ projectNo: this.data.projectOptions[idx] });
  },

  async loadPartTypes() {
    const res = await api.partTypes.list({ pageSize: 100 });
    if (res.code === 0) {
      const list = (res.data.items || []).map(pt => ({
        ...pt,
        displayName: `[${pt.part_no}] ${pt.part_name}`,
      }));
      this.setData({ partTypes: list });
    }
  },

  onProjectInput(e) {
    this.setData({ projectLocation: e.detail.value });
  },

  onReasonSelect(e) {
    const idx = e.detail.value;
    this.setData({ outboundReason: this.data.reasonOptions[idx] });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  onPartSelect(e) {
    const idx = e.currentTarget.dataset.idx;
    const ptIdx = e.detail.value;
    const pt = this.data.partTypes[ptIdx];
    const key = `formItems[${idx}].part_no`;
    const nameKey = `formItems[${idx}]._part_name`;
    const labelKey = `formItems[${idx}]._part_label`;
    this.setData({ [key]: pt.part_no, [nameKey]: pt.part_name, [labelKey]: `[${pt.part_no}] ${pt.part_name}` });
  },

  onQtyInput(e) {
    const idx = e.currentTarget.dataset.idx;
    const key = `formItems[${idx}].quantity`;
    const raw = e.detail.value;
    this.setData({ [key]: raw === '' ? '' : Number(raw) });
  },

  addItem() {
    this.setData({ formItems: [...this.data.formItems, { part_no: '', quantity: 1 }] });
  },

  removeItem(e) {
    const idx = e.currentTarget.dataset.idx;
    const items = this.data.formItems.filter((_, i) => i !== idx);
    this.setData({ formItems: items.length ? items : [{ part_no: '', quantity: 1 }] });
  },

  async onSubmit() {
    const { formItems, projectNo, projectLocation, outboundReason, remark } = this.data;

    if (!projectNo) {
      wx.showToast({ title: '请选择项目号', icon: 'none' });
      return;
    }

    if (!projectLocation) {
      wx.showToast({ title: '请填写项目地点', icon: 'none' });
      return;
    }

    if (!outboundReason) {
      wx.showToast({ title: '请选择出库原因', icon: 'none' });
      return;
    }

    const items = formItems.filter(i => i.part_no && i.quantity > 0);
    if (items.length === 0) {
      wx.showToast({ title: '请至少添加一项备件', icon: 'none' });
      return;
    }

    // 请求订阅消息授权（审批结果通知），不阻塞提交
    const app = getApp();
    const tmplIds = app.globalData.tmplIds;
    try {
      await wx.requestSubscribeMessage({ tmplIds: [tmplIds.APPROVAL_RESULT] });
    } catch (e) {
      // 用户拒绝或不支持，静默忽略
    }

    this.setData({ submitting: true });
    const res = await api.requests.create({
      items: items.map(i => ({ part_no: i.part_no, quantity: i.quantity })),
      project_no: projectNo,
      project_location: projectLocation,
      outbound_reason: outboundReason,
      remark,
    });
    this.setData({ submitting: false });

    if (res.code === 0) {
      wx.showToast({ title: '申请提交成功', icon: 'success' });
      this.setData({
        tab: 'list',
        formItems: [{ part_no: '', quantity: 1 }],
        projectNo: '',
        projectLocation: '',
        outboundReason: '',
        remark: '',
      });
      this.loadList(true);
    } else {
      wx.showToast({ title: res.message || '提交失败', icon: 'none', duration: 3000 });
    }
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.tab === 'list' && this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },
});
