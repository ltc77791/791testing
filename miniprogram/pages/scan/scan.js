/**
 * 扫码页 — wx.scanCode 扫码入库 + 扫码查询
 * 支持扫码和手动输入序列号两种方式
 */
const api = require('../../utils/api');
const { formatTime, inventoryStatusText } = require('../../utils/util');

Page({
  data: {
    mode: 'query', // 'query' | 'inbound'
    scanResult: null,
    loading: false,
    manualSN: '', // 手动输入的序列号
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

  // 手动输入绑定
  onManualInput(e) {
    this.setData({ manualSN: e.detail.value });
  },

  // 手动查询
  onManualQuery() {
    const sn = (this.data.manualSN || '').trim();
    if (!sn) {
      wx.showToast({ title: '请输入序列号', icon: 'none' });
      return;
    }
    this.querySN(sn);
  },

  // 扫码
  async onScan() {
    try {
      const scanRes = await wx.scanCode({ scanType: ['barCode', 'qrCode'] });
      console.log('[scan] scanCode result:', scanRes.result, 'charSet:', scanRes.charSet, 'scanType:', scanRes.scanType);
      const sn = (scanRes.result || '').trim();
      if (!sn) return;
      this.querySN(sn);
    } catch (err) {
      this.setData({ loading: false });
      console.error('[scan] scanCode error:', err);
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: '扫码失败，请手动输入序列号', icon: 'none', duration: 2000 });
    }
  },

  // 统一查询逻辑
  async querySN(sn) {
    this.setData({ loading: true });
    console.log('[scan] querying SN:', sn);
    const res = await api.inventory.scan(sn);
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
  },
});
