const { request } = require('../../utils/api');
const app = getApp();

const labels = {
  pending: '待受理', contacting: '联系中', assigned: '已派单', scheduled: '已预约', processing: '处理中', completed: '已完成', cancelled: '已取消',
  not_applicable: '不适用', shipped: '已交付', delivered: '已送达', activated: '已实名激活', pending_manual: '待实名', pending_merchant: '待商家激活', verified: '已验证'
};

Page({
  data: { phone: '', records: [], emptyMessage: '', title: '查询服务进度', phoneLabel: '手机号', placeholder: '请输入提交服务时的手机号', queryText: '查询' },
  setField(event) { this.setData({ phone: event.detail.value }); },
  async lookup() {
    try {
      const result = await request('/api/student/records', 'POST', { schoolCode: app.globalData.schoolCode, phone: this.data.phone });
      const records = (result.records || []).map((item) => ({
        ...item,
        statusText: labels[item.status] || item.status,
        deliveryText: labels[item.deliveryStatus] || item.deliveryStatus,
        activationText: labels[item.activationStatus] || item.activationStatus,
        waitingOffline: Boolean(item.selectedNumber && !item.outletAddress),
        canConfirm: item.status === 'completed' && item.activationStatus !== 'pending_merchant' && !item.completionConfirmedAt
      }));
      this.setData({ records, emptyMessage: records.length ? '' : '暂无办理记录，请核对手机号后重试。' });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  confirm(event) { wx.navigateTo({ url: `/pages/confirm/confirm?id=${encodeURIComponent(event.currentTarget.dataset.id)}&phone=${this.data.phone}` }); }
});
