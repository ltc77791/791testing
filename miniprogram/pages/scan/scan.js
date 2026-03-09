/**
 * 扫码页 — wx.scanCode 扫码入库 + 扫码查询
 * 阶段 6-3 将完善此页面
 */
const api = require('../../utils/api');
const { formatTime, inventoryStatusText } = require('../../utils/util');

Page({
  data: {
    mode: 'query', // 'query' | 'inbound'
    scanResult: null,
    loading: false,
  },

  onShow() {
    const app = getApp();
    if (!app.globalData.isLoggedIn) {
      app.checkLogin();
    }
  },

  // 切换模式
  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode, scanResult: null });
  },

  // 扫码
  async onScan() {
    try {
      const { result } = await wx.scanCode({ scanType: ['barCode', 'qrCode'] });
      if (!result) return;

      this.setData({ loading: true });
      const res = await api.inventory.scan(result);
      this.setData({ loading: false });

      if (res.code === 0) {
        const item = res.data;
        this.setData({
          scanResult: {
            ...item,
            statusText: inventoryStatusText(item.status),
            inboundTimeText: formatTime(item.inbound_time),
          },
        });
      } else {
        wx.showToast({ title: res.message || '未找到该序列号', icon: 'none' });
        this.setData({ scanResult: null });
      }
    } catch (err) {
      this.setData({ loading: false });
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },
});
