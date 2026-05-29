// 在浏览器控制台运行，导出缄默之秋世界书所有条目名
(async () => {
  const names = await TavernHelper.getCharWorldbookNames("current");
  console.log('绑定世界书:', names);
  const wbName = names[0];
  const entries = await TavernHelper.getWorldbook(wbName);
  const list = entries.map(e => e.name);
  console.log('条目总数:', list.length);
  console.log(JSON.stringify(list, null, 2));
  // 复制到剪贴板
  copy(JSON.stringify(list, null, 2));
  console.log('已复制到剪贴板');
})();
