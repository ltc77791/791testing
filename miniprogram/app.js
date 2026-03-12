/**
 * 备件管理系统 — 小程序入口
 */
App({
  globalData: {
    user: null,     // { username, roles }
    openId: null,
    isLoggedIn: false,
    // 订阅消息模板 ID
    tmplIds: {
      STOCK_ALERT: 'vopU72-_cp3VgTejH4OvJ7g99w61aP0qSQ16mnFd1vA',
      APPROVAL_RESULT: 'giSmlLFMc32RwQY2xCAo4CveYAAb1n4vfnjVJpH5D-s',
      REQUEST_SUBMIT: 'si2C9NcsJFPpJk4dOoDcUjoaRdTOw_d0p4lpstizeOQ',
    },
  },

  /** silentLogin 的 Promise，供页面 await */
  loginReady: null,

  onLaunch() {
    // 初始化云开发环境
    if (wx.cloud) {
      wx.cloud.init({
        env: 'ophkspareparts-3g71vrjmdc6fa0a0',
        traceUser: true,
      });
    } else {
      console.error('请使用 2.2.3 以上基础库以使用云能力');
    }

    // 尝试静默登录，保存 Promise 供页面等待
    this.loginReady = this.silentLogin();
  },

  /**
   * 静默登录 — 检查 openId 是否已绑定系统账号
   */
  async silentLogin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'auth',
        data: { action: 'POST /wx-login' },
      });

      const result = res.result;
      if (result.code === 0 && result.data && !result.data.needBind) {
        this.globalData.user = result.data.user;
        this.globalData.isLoggedIn = true;
      } else {
        // openId 已被清空或未绑定，重置登录状态
        this.globalData.user = null;
        this.globalData.isLoggedIn = false;
      }
    } catch (err) {
      console.error('静默登录失败:', err);
    }
  },

  /**
   * 重新验证登录状态（每次页面显示时调用）
   * 返回 true 表示已登录，false 表示未登录并已跳转
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
