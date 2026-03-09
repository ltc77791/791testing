/**
 * 备件管理系统 — 小程序入口
 */
App({
  globalData: {
    user: null,     // { username, roles }
    openId: null,
    isLoggedIn: false,
  },

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

    // 尝试静默登录
    this.silentLogin();
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
      }
    } catch (err) {
      console.error('静默登录失败:', err);
    }
  },

  /**
   * 检查是否已登录，未登录则跳转绑定页
   */
  checkLogin() {
    if (!this.globalData.isLoggedIn) {
      wx.navigateTo({ url: '/pages/index/index?needBind=1' });
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
