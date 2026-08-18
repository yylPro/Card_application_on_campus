Page({
  data: { portals: [
    { key: 'student', title: '\u5b66\u751f\u7aef', subtitle: '\u6821\u56ed\u53f7\u7801\u9884\u7ea6\u3001\u67e5\u8be2\u672c\u673a\u8ba2\u5355', icon: '\u5b66', color: '#0b6cb7' },
    { key: 'operator', title: '\u8fd0\u8425\u5546\u540e\u53f0', subtitle: '\u67e5\u770b\u8ba2\u5355\u3001\u5904\u7406\u4e1a\u52a1\u3001\u5bfc\u51fa\u6570\u636e', icon: '\u5546', color: '#0b8f78' },
    { key: 'offline', title: '\u7ebf\u4e0b\u5b9e\u4f53\u7aef', subtitle: '\u5b9e\u540d\u6838\u9a8c\u3001\u63d0\u4ea4\u5957\u5361\u5b9e\u540d\u51ed\u8bc1', icon: '\u7ebf', color: '#d97724' },
    { key: 'merchant', title: '\u5546\u5bb6\u5151\u6362\u7aef', subtitle: '\u67e5\u8be2\u5df2\u6838\u9a8c\u8ba2\u5355\u3001\u786e\u8ba4\u6fc0\u6d3b', icon: '\u6362', color: '#7652b8' }
  ], arrow: '\u203a', title: '\u6821\u56ed\u901a\u4fe1\u670d\u52a1', heading: '\u8bf7\u9009\u62e9\u670d\u52a1\u5165\u53e3', copy: '\u5b66\u751f\u5728\u7ebf\u529e\u7406\uff0c\u5de5\u4f5c\u4eba\u5458\u5206\u7aef\u5904\u7406\u4e1a\u52a1' },
  choosePortal(event) { const key = event.currentTarget.dataset.key; wx.navigateTo({ url: key === 'student' ? '/pages/home/home' : key === 'operator' ? '/pages/operator/operator' : key === 'offline' ? '/pages/offline/offline' : '/pages/merchant/merchant' }); }
});
