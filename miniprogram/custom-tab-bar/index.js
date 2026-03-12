Component({
  data: {
    selectedPath: '',
    color: '#999',
    selectedColor: '#1890ff',
    // 完整 tab 列表（与 app.json 保持一致）
    allTabs: [
      { pagePath: 'pages/index/index', text: '首页', iconPath: '/images/tab-home.png', selectedIconPath: '/images/tab-home-active.png' },
      { pagePath: 'pages/scan/scan', text: '扫码', iconPath: '/images/tab-scan.png', selectedIconPath: '/images/tab-scan-active.png' },
      { pagePath: 'pages/inventory/inventory', text: '库存', iconPath: '/images/tab-inventory.png', selectedIconPath: '/images/tab-inventory-active.png' },
      { pagePath: 'pages/request/request', text: '申请', iconPath: '/images/tab-request.png', selectedIconPath: '/images/tab-request-active.png' },
      { pagePath: 'pages/approval/approval', text: '审批', iconPath: '/images/tab-approval.png', selectedIconPath: '/images/tab-approval-active.png' },
    ],
    tabs: [],
  },

  lifetimes: {
    attached() {
      this.applyRoleFilter();
    },
  },

  pageLifetimes: {
    show() {
      this.applyRoleFilter();
    },
  },

  methods: {
    /** 等待登录完成后再过滤 tab */
    async applyRoleFilter() {
      const app = getApp();
      // 等待静默登录完成，确保角色信息可用
      if (app.loginReady) {
        await app.loginReady;
      }
      this.updateTabs();
    },

    updateTabs() {
      const app = getApp();
      const isOperator = app.hasRole('operator') && !app.hasRole('admin', 'manager');

      let tabs;
      if (isOperator) {
        // operator 隐藏审批 tab
        tabs = this.data.allTabs.filter(t => t.pagePath !== 'pages/approval/approval');
      } else {
        tabs = this.data.allTabs.slice();
      }

      this.setData({ tabs });
    },

    switchTab(e) {
      const path = e.currentTarget.dataset.path;
      const url = '/' + path;
      wx.switchTab({ url });
    },
  },
});
