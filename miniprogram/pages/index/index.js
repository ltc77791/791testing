/**
 * 首页 — 登录绑定 + KPI 概览
 */
const api = require('../../utils/api');

Page({
  data: {
    isLoggedIn: false,
    needBind: false,
    user: null,
    // 绑定表单
    username: '',
    password: '',
    binding: false,
    // KPI
    kpi: null,
    safetyAlerts: [],
    loading: true,
  },

  onLoad(options) {
    if (options.needBind === '1') {
      this.setData({ needBind: true });
    }
  },

  async onShow() {
    const app = getApp();

    // 等待静默登录完成（含重新验证），避免竞态条件
    await app.silentLogin();

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selectedPath: 'pages/index/index' });
    }

    if (app.globalData.isLoggedIn) {
      this.setData({
        isLoggedIn: true,
        needBind: false,
        user: app.globalData.user,
      });
      this.loadDashboard();
    } else {
      this.setData({ isLoggedIn: false, needBind: true, loading: false });
    }
  },

  // ── 绑定账号 ──
  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  async onBind() {
    const { username, password } = this.data;
    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }

    this.setData({ binding: true });
    const res = await api.auth.bind(username, password);
    this.setData({ binding: false });

    if (res.code === 0) {
      const app = getApp();
      app.globalData.user = res.data.user;
      app.globalData.isLoggedIn = true;

      this.setData({
        isLoggedIn: true,
        needBind: false,
        user: res.data.user,
      });

      wx.showToast({ title: '绑定成功', icon: 'success' });
      this.loadDashboard();
    } else {
      wx.showToast({ title: res.message || '绑定失败', icon: 'none' });
    }
  },

  // ── 加载仪表盘数据 ──
  async loadDashboard() {
    this.setData({ loading: true });

    const [kpiRes, safetyRes] = await Promise.all([
      api.analytics.kpi(),
      api.analytics.safetyStock(),
    ]);

    this.setData({
      loading: false,
      kpi: kpiRes.code === 0 ? kpiRes.data : null,
      safetyAlerts: safetyRes.code === 0 ? (safetyRes.data || []) : [],
    });
  },

  onPullDownRefresh() {
    this.loadDashboard().then(() => {
      wx.stopPullDownRefresh();
    });
  },
});
