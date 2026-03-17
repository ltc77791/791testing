/**
 * 备件管理系统 — 小程序入口
 *
 * 7-5/7-6 改造: 移除 wx.cloud 依赖，使用 wx.request + JWT 认证
 */
const api = require('./utils/api');

App({
  globalData: {
    user: null,     // { username, roles }
    isLoggedIn: false,
    // 订阅消息模板 ID
    tmplIds: {
      STOCK_ALERT: 'vopU72-_cp3VgTejH4OvJwvTPdmZw0U07oqnrwFPf_Q',
      APPROVAL_RESULT: 'giSmlLFMc32RwQY2xCAo4Lnf4ZzurdzcXMMkhr-rIBQ',
      REQUEST_SUBMIT: '9fsxaUqwRByLo6Ed6RQlkMOENU_FWunc9766WN1eB2E',
    },
  },

  /** silentLogin 的 Promise，供页面 await */
  loginReady: null,

  onLaunch() {
    // 尝试静默登录，保存 Promise 供页面等待
    this.loginReady = this.silentLogin();
  },

  /**
   * 静默登录 — 调用 Express /api/auth/wx-login
   * wx.login() 获取 code → 后端换 openId → 查找绑定用户 → 返回 JWT
   */
  async silentLogin() {
    try {
      const result = await api.auth.wxLogin();

      if (result.code === 0 && result.data && !result.data.needBind) {
        this.globalData.user = result.data.user;
        this.globalData.isLoggedIn = true;
      } else {
        this.globalData.user = null;
        this.globalData.isLoggedIn = false;
      }
    } catch (err) {
      console.error('静默登录失败:', err);
    }
  },

  /**
   * 重新验证登录状态（每次页面显示时调用）
   */
  async reCheckLogin() {
    await this.silentLogin();
    if (!this.globalData.isLoggedIn) {
      wx.reLaunch({ url: '/pages/index/index?needBind=1' });
      return false;
    }
    return true;
  },

  /**
   * 检查是否已登录，未登录则跳转绑定页
   */
  checkLogin() {
    if (!this.globalData.isLoggedIn) {
      wx.reLaunch({ url: '/pages/index/index?needBind=1' });
      return false;
    }
    return true;
  },

  /**
   * 检查角色权限
   */
  hasRole(...roles) {
    const userRoles = this.globalData.user?.roles || [];
    return roles.some(r => userRoles.includes(r));
  },
});
