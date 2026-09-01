// ═══════════════ 缄默之秋小助手 ═══════════════
// 酒馆助手中粘贴以下一行即可：
//   import 'https://testingcf.jsdelivr.net/gh/NLKASHEI/233456@v2.1.2/缄默之秋配置小助手.min.js'
// ═══════════════════════════════════════════════════════════

const JMZQ_VERSION = '2.1.2';
const WORLDBOOK_NAME = '缄默之秋3.0';
// 首选新名称，同时兼容已经导入过的旧名称，避免助手把实际世界书误判为“未选择”。
const WORLDBOOK_ALIASES = [
  WORLDBOOK_NAME,
  '缄默之秋-3.0-世界书',
  '缄默之秋3.0世界书',
  '缄默之秋-3.0',
];
const p = window.parent || window;

// 防重复加载
if (!p._jmzqLoaded) { p._jmzqLoaded = true;

// 清理旧实例
{
  const old = ['jmzq-bubble', 'jmzq-panel', 'jmzq-style', 'jmzq-super-event-modal'];
  for (const id of old) { const el = p.document.getElementById(id); if (el) el.remove(); }
  if (typeof p._jmzqCleanup === 'function') try { p._jmzqCleanup(); } catch(e) {}
  delete p._jmzqCleanup;
  delete p._jmzqLastResult;
}

// ═══════════════ 核心：在父页面上下文执行代码 ═══════════════
// iframe 中的异步 API（getWorldbook/updateWorldbookWith）调用会因
// 请求上下文问题失败。解决办法：往父页面注入 <script> 标签，
// 在父页面原生上下文中执行操作，结果通过 CustomEvent 回传。
function runInParent(fnString, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const token = 'jmzq_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    let settled = false;
    let timer = null;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      p.document.removeEventListener('jmzq-result', handler);
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const handler = (e) => {
      if (!e.detail || e.detail.token !== token) return;
      finish(e.detail.error ? new Error(e.detail.error) : null, e.detail.result);
    };
    p.document.addEventListener('jmzq-result', handler);
    timer = setTimeout(() => finish(new Error('酒馆接口调用超时，请确认酒馆助手与世界书已加载')), timeoutMs);

    // 动态代码在真正插入父页面前先解析；语法错误应立即返回，不能伪装成十秒超时。
    try {
      const ParentFunction = p.Function || Function;
      ParentFunction(`return (${fnString});`);
    } catch (error) {
      finish(new Error(`父页面脚本语法错误：${error.message || error}`));
      return;
    }

    const script = p.document.createElement('script');
    script.textContent = `
(async () => {
  try {
    var _result = await (${fnString});
    document.dispatchEvent(new CustomEvent('jmzq-result', { detail: { token: '${token}', result: _result } }));
  } catch(_e) {
    document.dispatchEvent(new CustomEvent('jmzq-result', { detail: { token: '${token}', error: _e.message || String(_e) } }));
  }
})();
`;
    try {
      p.document.body.appendChild(script);
      script.remove();
    } catch (error) {
      script.remove();
      finish(new Error(`父页面脚本注入失败：${error.message || error}`));
    }
  });
}

// ═══════════════ 世界书名称解析 ═══════════════
// TavernHelper 已挂载在 iframe window 上，读取操作直接调用即可，无需 runInParent 注入父页面

let _jmzqManualWbName = null;  // 用户手动选择的世界书名（自动检测失败后的兜底）
let _mvuOutputFormatEnabled = false; // 随AI输出模式下的输出格式强化条目是否开启

// 输出格式强化仅供“随AI输出”模式使用；额外模型模式已有末端强制任务，必须关闭以免重复。
async function syncOutputFormatFlag() {
  try {
    const wbName = await api_resolveWorldbookName();
    const entries = wbName ? await api_getWorldbook(wbName) : [];
    const entry = entries.find(x => (x.comment || x.name || x.title) === '[mvu_update]变量输出格式强化');
    _mvuOutputFormatEnabled = !!entry && (entry.enabled === true || entry.disable === false);
  } catch (_) {
    _mvuOutputFormatEnabled = false;
  }
  return _mvuOutputFormatEnabled;
}

// 类型归一化：getCharWorldbookNames / getWorldbookNames 返回值可能是
// 对象 {primary, additional}、数组、或字符串，统一提取为字符串数组
// 解析目标世界书名称：用户手动选择 → 角色绑定 → 全局搜索 → 硬编码兜底
// 直接调用 iframe 上的 TavernHelper，不通过 runInParent
async function api_resolveWorldbookName() {
  // 0. 用户手动选择优先
  if (_jmzqManualWbName) return _jmzqManualWbName;

  // 1. 从当前角色绑定的世界书中精确匹配
  //    getCharWorldbookNames 返回 { primary: string|null, additional: string[] }
  try {
    const raw = TavernHelper.getCharWorldbookNames('current');
    const bound = [raw?.primary, ...(Array.isArray(raw?.additional) ? raw.additional : [])].filter(Boolean);
    const matched = WORLDBOOK_ALIASES.find(name => bound.includes(name));
    if (matched) {
      _jmzqOnWbResolved(matched);
      return matched;
    }
  } catch(e) {
    // 静默处理
  }

  // 2. 从全部世界书列表中精确搜索（兜底）
  try {
    const all = TavernHelper.getWorldbookNames();  // 返回 string[]
    const matched = Array.isArray(all) ? WORLDBOOK_ALIASES.find(name => all.includes(name)) : null;
    if (matched) {
      _jmzqOnWbResolved(matched);
      return matched;
    }
  } catch(e) {
  }

  // 3. 自动检测失败 → 展示手动选择面板
  _jmzqOnWbNotFound();
  return WORLDBOOK_NAME;
}

// 填充世界书下拉列表（始终可见，初始化/面板打开时调用）
function _jmzqPopulateWbSelect() {
  if (!manualWbSelect) return;
  const saved = manualWbSelect.value;  // 记住当前选中值，避免重建后丢失
  try {
    const all = TavernHelper.getWorldbookNames();  // 返回 string[]
    manualWbSelect.innerHTML = all.map(n =>
      '<option value="' + n.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;') + '">' + n + '</option>'
    ).join('');
  } catch(e) {
    manualWbSelect.innerHTML = '<option value="">-- 加载失败 --</option>';
  }
  // 恢复之前的值（如果新列表中还有的话）
  if (saved && [...manualWbSelect.options].some(o => o.value === saved)) manualWbSelect.value = saved;
  else if (_jmzqManualWbName && [...manualWbSelect.options].some(o => o.value === _jmzqManualWbName)) manualWbSelect.value = _jmzqManualWbName;
  else {
    const preferred = WORLDBOOK_ALIASES.find(name => [...manualWbSelect.options].some(o => o.value === name));
    if (preferred) manualWbSelect.value = preferred;
  }
}

// 世界书自动检测成功 → 更新下拉选中值、恢复绿色标签
function _jmzqOnWbResolved(name) {
  if (manualWbSelect && name) {
    if ([...manualWbSelect.options].some(o => o.value === name)) manualWbSelect.value = name;
    else { manualWbSelect.appendChild(p.document.createElement('option')); manualWbSelect.lastChild.value = name; manualWbSelect.lastChild.textContent = name; manualWbSelect.value = name; }
  }
  if (manualWbLabel) { manualWbLabel.textContent = '当前世界书'; manualWbLabel.style.color = '#4ade80'; }
  if (statusText) { statusText.textContent = name; statusText.style.color = '#4ade80'; }
  if (bubble) bubble.classList.remove('warn');
}

// 世界书自动检测失败 → 爆红光、标签变红警告
function _jmzqOnWbNotFound() {
  if (manualWbLabel) { manualWbLabel.textContent = '自动检测失败，请手动选择'; manualWbLabel.style.color = '#e74c3c'; }
  if (statusText) { statusText.textContent = '世界书尚未选择'; statusText.style.color = '#e74c3c'; }
  if (bubble) bubble.classList.add('warn');
}

async function api_getWorldbook(name) {
  if (typeof TavernHelper === 'undefined' || typeof TavernHelper.getWorldbook !== 'function') {
    throw new Error('TavernHelper 世界书接口不可用');
  }
  return await TavernHelper.getWorldbook(name);
}

// JS-Slash-Runner/predefine.js 已将绑定后的 TavernHelper 接口暴露给脚本 iframe。
// 直接调用可避免把函数再次拼成 <script> 注入父页面所产生的转义和 CSP 问题。
async function api_replaceWorldbook(name, entriesModifier) {
  if (typeof entriesModifier !== 'function') throw new TypeError('世界书修改器必须是函数');
  const entries = await api_getWorldbook(name);
  await entriesModifier(entries);
  await TavernHelper.replaceWorldbook(name, entries);
  return await api_getWorldbook(name);
}

// 正则操作（角色级别）
async function api_getTavernRegexes() {
  return await TavernHelper.getTavernRegexes({ type: 'character' });
}
async function api_updateTavernRegexes(modifier) {
  if (typeof modifier !== 'function') throw new TypeError('正则修改器必须是函数');
  return await TavernHelper.updateTavernRegexesWith(modifier, { type: 'character' });
}

// 角色脚本树操作
async function api_getScriptTrees() {
  return await TavernHelper.getScriptTrees({ type: 'character' });
}
async function api_updateScriptTrees(modifier) {
  if (typeof modifier !== 'function') throw new TypeError('脚本树修改器必须是函数');
  return await TavernHelper.updateScriptTreesWith(modifier, { type: 'character' });
}

// --- CSS（注入到父页面 · 宣纸暖白风格） ---
const CSS = p.document.createElement('style');
CSS.textContent = `
  /* ===== 气泡 · 墨玉金浮雕 ===== */
  #jmzq-bubble {
    position: fixed; top: 12vh; left: 14px;
    width: 40px; height: 40px;
    background: linear-gradient(150deg, #1a1814, #0f0e0a);
    border: 1.5px solid rgba(180,150,80,0.35);
    border-radius: 4px; z-index: 1000000; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03);
    transition: all .25s ease;
    user-select: none; touch-action: none;
    -webkit-tap-highlight-color: transparent;
    outline: none !important;
  }
  #jmzq-bubble:focus, #jmzq-bubble:focus-visible { outline: none !important; }
  #jmzq-bubble span {
    font-size: 22px; font-weight: 400; line-height: 1;
    font-family: 'Ma Shan Zheng', 'KaiTi', cursive;
    background: linear-gradient(180deg, #e8d080 0%, #b89030 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 4px rgba(200,160,50,0.4));
    transition: filter .25s;
  }
  #jmzq-bubble:hover {
    border-color: rgba(212,175,55,0.6);
    box-shadow: 0 6px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 18px rgba(212,175,55,0.12);
    transform: translateY(-1px);
  }
  #jmzq-bubble:hover span {
    filter: drop-shadow(0 0 8px rgba(212,175,55,0.6));
  }
  #jmzq-bubble:active { transform: scale(0.95); transition: transform .1s; }
  /* 后台运行时保持静止，不再用旋转打扰阅读。 */
  #jmzq-bubble.running { animation: none; }
  #jmzq-bubble.edge-peek-left,
  #jmzq-bubble.edge-peek-right {
    opacity: .72;
    box-shadow: 0 2px 10px rgba(0,0,0,.3);
  }
  #jmzq-bubble.edge-peek-left { border-radius: 0 6px 6px 0; }
  #jmzq-bubble.edge-peek-right { border-radius: 6px 0 0 6px; }
  #jmzq-bubble.edge-peek-left span,
  #jmzq-bubble.edge-peek-right span { opacity: .38; }

  /* 警告：金边脉冲 */
  #jmzq-bubble.warn {
    border-color: rgba(212,160,48,0.6);
    box-shadow: 0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03), 0 0 14px rgba(212,160,48,0.3);
    animation: jmzq-jade-warn 1.8s ease-in-out infinite;
  }
  @keyframes jmzq-jade-warn {
    0%, 100% { border-color: rgba(180,150,80,0.4); box-shadow: 0 4px 16px rgba(0,0,0,0.5), 0 0 10px rgba(200,160,50,0.2); }
    50% { border-color: rgba(240,200,80,0.65); box-shadow: 0 4px 16px rgba(0,0,0,0.5), 0 0 20px rgba(212,175,55,0.4); }
  }

  /* ===== 面板 · 宣纸暖白底 ===== */
  .jmzq-panel {
    position: fixed; z-index: 1000001;
    width: 350px; max-height: 62vh;
    background: linear-gradient(175deg, #f5f0e8, #efe8da);
    border: 1px solid rgba(0,0,0,0.06);
    border-radius: 4px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.25), 0 0 60px rgba(192,64,48,0.04);
    display: flex; flex-direction: column;
    font-size: 13px; color: #3a2a18;
    font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif;
    overflow: hidden; user-select: none;
  }
  .jmzq-panel > * { position: relative; z-index: 1; }

  /* ===== 标题栏 ===== */
  .jmzq-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 16px 14px;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    cursor: move; touch-action: none;
    background: rgba(245,240,232,0.6);
    position: relative; z-index: 1;
  }
  .jmzq-header-title {
    font-size: 17px; font-weight: 700; color: #3a2010; letter-spacing: 2px;
    position: relative;
  }
  .jmzq-header-title::after {
    content: ''; position: absolute; bottom: -4px; left: 0; width: 100%; height: 1px;
    background: linear-gradient(90deg, #c04030, transparent 70%);
  }

  /* ===== 内容区 ===== */
  .jmzq-body {
    padding: 14px 16px; overflow-y: auto; flex: 1;
    scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.12) transparent;
    position: relative; z-index: 1;
  }
  .jmzq-body::-webkit-scrollbar { width: 4px; }
  .jmzq-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 2px; }
  .jmzq-body::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }

  /* ===== 区块卡片 · 纸笺层叠 ===== */
  .jmzq-section {
    background: rgba(255,255,255,0.55);
    border: 1px solid rgba(0,0,0,0.04);
    border-bottom: 1px solid rgba(0,0,0,0.08);
    padding: 14px; margin-bottom: 8px;
    position: relative;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02);
  }
  .jmzq-section::after {
    content: ''; position: absolute; top: 10px; left: 0; width: 3px; height: calc(100% - 20px);
    background: linear-gradient(180deg, #c04030 0%, #c04030 40%, transparent 100%);
    opacity: 0.5;
  }
  .jmzq-section-title {
    font-size: 9px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase;
    color: #8a6a4a; margin-bottom: 10px; padding-left: 6px;
  }

  /* ===== 配置状态条 ===== */
  .jmzq-config-status {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.3px;
    color: #4a7a3a; padding: 2px 0; margin-bottom: 8px;
  }
  .jmzq-config-status::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    background: #4a7a3a; animation: jmzq-live-dot 2s infinite;
  }
  @keyframes jmzq-live-dot { 0%,100%{opacity:1} 50%{opacity:.3} }
  .jmzq-config-status.warn {
    color: #c08030;
  }
  .jmzq-config-status.warn::before {
    background: #c08030; animation: jmzq-live-dot 0.8s infinite;
  }

  /* ===== 按钮体系 ===== */
  .jmzq-btn {
    padding: 7px 14px !important; cursor: pointer;
    border: 1px solid rgba(0,0,0,0.12) !important;
    background: transparent !important;
    color: #5a4030 !important; font-size: 12px; font-weight: 500; font-family: inherit !important;
    transition: all .2s; letter-spacing: 0.5px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important; min-height: auto !important;
  }
  .jmzq-btn:hover {
    background: rgba(192,64,48,0.05) !important;
    border-color: #c04030 !important; color: #c04030 !important;
  }
  .jmzq-btn:active { transform: scale(0.97); }

  .jmzq-btn.primary {
    width: 100% !important; display: block !important;
    background: #c04030 !important;
    border: 1px solid #c04030 !important;
    color: #f5f0e8 !important;
    margin-top: 4px; padding: 10px !important; font-size: 13px; font-weight: 700 !important;
    letter-spacing: 0.8px; text-shadow: none !important;
    box-shadow: 0 2px 8px rgba(192,64,48,0.15) !important;
    line-height: 1.4 !important; min-height: auto !important;
    text-align: center !important;
    transition: all .25s;
  }
  .jmzq-btn.primary:hover {
    background: #d45040 !important; border-color: #d45040 !important;
    box-shadow: 0 4px 16px rgba(192,64,48,0.25) !important;
    color: #f5f0e8 !important;
    transform: translateY(-1px);
  }
  .jmzq-btn.primary:disabled {
    opacity: 0.35; cursor: not-allowed; filter: grayscale(20%);
  }

  .jmzq-btn.xs {
    padding: 4px 10px !important; font-size: 11px; width: auto;
    background: transparent !important;
    border: 1px solid rgba(0,0,0,0.10) !important;
    color: #6a5030 !important; font-weight: 500 !important;
    display: inline-block !important; box-shadow: none !important;
    letter-spacing: 0.3px;
    transition: all .2s;
  }
  .jmzq-btn.xs:hover {
    border-color: #c04030 !important; color: #c04030 !important;
    background: rgba(192,64,48,0.04) !important;
  }

  /* ===== 诞生按钮（阶段选择）===== */
  .jmzq-birth-btns { display: flex; gap: 8px; margin-bottom: 10px; }
  .jmzq-birth-btn {
    flex: 1; padding: 10px 0 !important; cursor: pointer;
    border: 1px solid rgba(0,0,0,0.10) !important;
    background: rgba(255,255,255,0.5) !important;
    color: #6a4a28 !important;
    font-size: 13px; font-weight: 500; font-family: inherit !important;
    transition: all .25s; text-align: center !important;
    letter-spacing: 0.5px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important;
  }
  .jmzq-birth-btn:hover {
    background: rgba(255,255,255,0.8) !important;
    border-color: rgba(0,0,0,0.2) !important; color: #3a2010 !important;
  }
  .jmzq-birth-btn.active {
    background: #c04030 !important; border-color: #c04030 !important;
    color: #f5f0e8 !important;
    box-shadow: 0 2px 12px rgba(192,64,48,0.2) !important;
  }

  /* ===== 表单元素 ===== */
  .jmzq select {
    width: 100%; max-width: 100%; box-sizing: border-box;
    padding: 9px 32px 9px 12px; font-size: 13px;
    font-family: inherit;
    background: rgba(255,255,255,0.6) !important;
    border: 1px solid rgba(0,0,0,0.10) !important;
    color: #3a2a18 !important; cursor: pointer;
    -webkit-appearance: none; appearance: none; transition: border-color 0.2s, box-shadow 0.2s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23c04030' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center;
    box-shadow: none !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .jmzq select:hover { border-color: rgba(0,0,0,0.2) !important; }
  .jmzq select:focus {
    border-color: #c04030 !important; outline: none;
    box-shadow: 0 0 0 2px rgba(192,64,48,0.08) !important;
  }
  .jmzq select option {
    background: #f5f0e8 !important; color: #3a2a18 !important;
  }

  /* ===== Toast 提示 ===== */
  .jmzq .toast {
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    background: #3a2010 !important;
    border: none !important;
    padding: 10px 24px !important; color: #f5f0e8 !important;
    font-size: 13px; font-weight: 600; z-index: 1000002;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
    animation: jmzq-toast-in 0.3s ease, jmzq-toast-out 0.3s ease 2.2s forwards;
    letter-spacing: 0.5px; font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif !important;
    margin: 0 !important;
  }
  @keyframes jmzq-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } }
  @keyframes jmzq-toast-out { to { opacity: 0; transform: translateX(-50%) translateY(-12px); } }

  /* ===== 状态圆点 ===== */
  .jmzq-panel .jmzq-status-inline {
    display: flex; align-items: center; gap: 8px; font-size: 12px;
  }
  .jmzq-panel .status-dot {
    width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0;
  }
  .jmzq-panel .status-dot.on {
    background: #4a7a3a;
    box-shadow: 0 0 8px rgba(74,122,58,0.3);
  }
  .jmzq-panel .status-dot.off {
    background: #c04030;
    box-shadow: 0 0 8px rgba(192,64,48,0.3);
  }
  .jmzq-panel .status-dot.missing { background: #c0b8a0; box-shadow: none; }
  .jmzq-panel .status-label { color: #6a5040 !important; }

  /* ===== 行内点 + KV标签 ===== */
  .jmzq-row { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #5a4030; }
  .jmzq-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .jmzq-dot.ok  { background: #4a7a3a; box-shadow: 0 0 6px rgba(74,122,58,0.4); }
  .jmzq-dot.err { background: #c04030; box-shadow: 0 0 6px rgba(192,64,48,0.4); }
  .jmzq-dot.idle{ background: #c0b8a0; }
  .jmzq-kv { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .jmzq-active-head {
    display:flex; align-items:center; justify-content:space-between; gap:8px;
    margin-top:8px; padding-top:7px; border-top:1px solid rgba(0,0,0,.07);
    color:#7a6048; font-size:10px;
  }
  .jmzq-active-entries {
    display:flex; flex-wrap:wrap; gap:4px; margin-top:5px;
    max-height:112px; overflow:auto; padding-right:2px;
    scrollbar-width:thin;
  }
  .jmzq-active-entry {
    max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    padding:2px 6px; border:1px solid rgba(74,122,58,.18);
    background:rgba(74,122,58,.06); color:#4f6842; font-size:9px;
  }
  .jmzq-tag {
    background: rgba(255,255,255,0.5); border: 1px solid rgba(0,0,0,0.08);
    padding: 2px 7px; font-size: 10px; color: #6a5040; letter-spacing: 0.3px;
  }
  .jmzq-tag.err {
    background: rgba(192,64,48,0.06); border-color: rgba(192,64,48,0.2); color: #c04030;
  }
  #jmzq-status-text { color: #4a7a3a; font-size: 11px; }

  /* ===== 移动端适配 ===== */
  @media (max-width: 768px) {
    .jmzq-panel { width: clamp(280px, 88vw, 350px) !important; font-size: 12px; }
    #jmzq-bubble { width: 34px; height: 34px; } #jmzq-bubble span { font-size: 18px; }
    .jmzq-header { padding: 14px 12px 10px !important; }
    .jmzq-header-title { font-size: 15px; letter-spacing: 1px; }
    .jmzq-body { padding: 12px 12px !important; }
    .jmzq-section { padding: 10px !important; margin-bottom: 8px; }
    .jmzq-section-title { font-size: 8px; margin-bottom: 8px; }
    .jmzq-birth-btn { padding: 8px 0 !important; font-size: 12px; }
    .jmzq-birth-btns { gap: 6px; }
    .jmzq-btn.xs { padding: 5px 10px !important; font-size: 11px; }
    .jmzq-panel .jmzq-status-inline { font-size: 11px; gap: 6px; }
    .jmzq-panel .status-dot { width: 8px; height: 8px; }
    .jmzq-panel select { padding: 7px 28px 7px 10px; font-size: 12px; }
    .jmzq-config-status { font-size: 10px; margin-bottom: 6px; }
    #jmzq-manual-wb select { font-size: 11px; padding: 6px 24px 6px 8px; }
    #jmzq-manual-wb .jmzq-btn.xs { padding: 5px 10px !important; font-size: 11px; white-space: nowrap; }
  }

  /* ===== 暗色模式 · 墨笺 ===== */
  .jmzq-panel.jmzq-dark {
    background: linear-gradient(175deg, #1a1814, #141210);
    border-color: rgba(255,255,255,0.04);
    color: #c8b898;
    box-shadow: 0 8px 40px rgba(0,0,0,0.45), 0 0 40px rgba(212,160,48,0.03);
  }
  .jmzq-dark .jmzq-header {
    background: rgba(255,255,255,0.015);
    border-bottom-color: rgba(255,255,255,0.05);
  }
  .jmzq-dark .jmzq-header-title { color: #e8d090; }
  .jmzq-dark .jmzq-header-title::after {
    background: linear-gradient(90deg, #d4a030, transparent 70%);
  }
  .jmzq-dark .jmzq-body {
    scrollbar-color: rgba(255,255,255,0.08) transparent;
  }
  .jmzq-dark .jmzq-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
  .jmzq-dark .jmzq-section {
    background: rgba(255,255,255,0.02);
    border-color: rgba(255,255,255,0.04);
    border-bottom-color: rgba(255,255,255,0.06);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }
  .jmzq-dark .jmzq-section::after {
    background: linear-gradient(180deg, #d4a030 0%, #d4a030 40%, transparent 100%);
    opacity: 0.4;
  }
  .jmzq-dark .jmzq-section-title { color: #a09070; }
  .jmzq-dark .jmzq-config-status { color: #6aaa60; }
  .jmzq-dark .jmzq-config-status::before { background: #6aaa60; }
  .jmzq-dark .jmzq-config-status.warn { color: #d4a030; }
  .jmzq-dark .jmzq-config-status.warn::before { background: #d4a030; }
  .jmzq-dark .jmzq-btn {
    border-color: rgba(255,255,255,0.08) !important;
    color: #a09070 !important;
  }
  .jmzq-dark .jmzq-btn:hover {
    background: rgba(212,160,48,0.06) !important;
    border-color: rgba(212,160,48,0.35) !important;
    color: #e8d090 !important;
  }
  .jmzq-dark .jmzq-btn.primary {
    background: rgba(212,160,48,0.15) !important;
    border-color: rgba(212,160,48,0.3) !important;
    color: #e8d090 !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
  }
  .jmzq-dark .jmzq-btn.primary:hover {
    background: rgba(212,160,48,0.25) !important;
    border-color: rgba(212,160,48,0.5) !important;
    box-shadow: 0 4px 16px rgba(212,160,48,0.15) !important;
  }
  .jmzq-dark .jmzq-btn.xs {
    border-color: rgba(255,255,255,0.06) !important;
    color: #8a7a5a !important;
  }
  .jmzq-dark .jmzq-btn.xs:hover {
    border-color: rgba(212,160,48,0.3) !important;
    color: #e8d090 !important;
    background: rgba(212,160,48,0.04) !important;
  }
  .jmzq-dark .jmzq-birth-btn {
    background: rgba(255,255,255,0.03) !important;
    border-color: rgba(255,255,255,0.06) !important;
    color: #8a7a5a !important;
  }
  .jmzq-dark .jmzq-birth-btn:hover {
    background: rgba(255,255,255,0.06) !important;
    color: #c8b898 !important;
  }
  .jmzq-dark .jmzq-birth-btn.active {
    background: rgba(212,160,48,0.2) !important;
    border-color: rgba(212,160,48,0.45) !important;
    color: #e8d090 !important;
  }
  .jmzq-dark .jmzq select {
    background: rgba(255,255,255,0.04) !important;
    border-color: rgba(255,255,255,0.06) !important;
    color: #c8b898 !important;
  }
  .jmzq-dark .jmzq select:hover { border-color: rgba(255,255,255,0.15) !important; }
  .jmzq-dark .jmzq select:focus {
    border-color: rgba(212,160,48,0.4) !important;
    box-shadow: 0 0 0 2px rgba(212,160,48,0.06) !important;
  }
  .jmzq-dark .jmzq select option {
    background: #1a1814 !important; color: #c8b898 !important;
  }
  .jmzq-dark .jmzq-row { color: #a09070; }
  .jmzq-dark .jmzq-dot.ok  { background: #6aaa60; box-shadow: 0 0 6px rgba(106,170,96,0.4); }
  .jmzq-dark .jmzq-dot.err { background: #d45040; box-shadow: 0 0 6px rgba(212,80,64,0.4); }
  .jmzq-dark .jmzq-dot.idle{ background: #4a4030; }
  .jmzq-dark .jmzq-tag {
    background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.06);
    color: #a09070;
  }
  .jmzq-dark .jmzq-tag.err {
    background: rgba(212,80,64,0.08); border-color: rgba(212,80,64,0.2);
    color: #d45040;
  }
  .jmzq-dark #jmzq-status-text { color: #6aaa60; }
  .jmzq-dark .jmzq-panel .status-dot.on { background: #6aaa60; }
  .jmzq-dark .jmzq-panel .status-dot.off { background: #d45040; }
  .jmzq-dark .jmzq-panel .status-dot.missing { background: #4a4030; }
  .jmzq-dark .jmzq-panel .status-label { color: #a09070 !important; }

`;
p.document.head.appendChild(CSS);

// 追加 MVU 配置表单 CSS（宣纸风格统一）
const MVU_CSS = p.document.createElement('style');
MVU_CSS.textContent = `
  .jmzq-mvu-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .jmzq-mvu-row.col { flex-direction: column; align-items: stretch; gap: 2px; }
  .jmzq-mvu-label { font-size: 12px; color: #6a5040; white-space: nowrap; flex-shrink: 0; min-width: 56px; letter-spacing: 0.4px; }
  .jmzq-mvu-label.wide { min-width: 64px; }
  .jmzq-mvu-input {
    flex: 1; padding: 6px 9px; font-size: 12px; font-family: inherit;
    background: rgba(255,255,255,0.5) !important;
    border: 1px solid rgba(0,0,0,0.10) !important;
    color: #3a2a18 !important; transition: border-color 0.2s, box-shadow 0.2s;
    min-width: 0; box-shadow: none !important; outline: none !important;
  }
  .jmzq-mvu-input:focus {
    border-color: #c04030 !important;
    box-shadow: 0 0 0 2px rgba(192,64,48,0.08) !important;
  }
  .jmzq-mvu-input.num { width: 58px; flex: 0 0 auto; text-align: center; padding: 6px 2px; }
  .jmzq-mvu-select {
    flex: 1; padding: 6px 26px 6px 9px; font-size: 12px; font-family: inherit;
    background: rgba(255,255,255,0.5) !important;
    border: 1px solid rgba(0,0,0,0.10) !important;
    color: #3a2a18 !important; cursor: pointer;
    -webkit-appearance: none; appearance: none; transition: border-color 0.2s; min-width: 0;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23c04030' d='M5 7L1 3h8z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 7px center;
    box-shadow: none !important; outline: none !important;
  }
  .jmzq-mvu-select:focus {
    border-color: #c04030 !important;
    box-shadow: 0 0 0 2px rgba(192,64,48,0.08) !important;
  }
  .jmzq-mvu-check-row { display: flex; align-items: center; gap: 5px; margin-bottom: 2px; font-size: 12px; color: #5a4030; cursor: pointer; line-height: 1.4; }
  .jmzq-mvu-check-row input[type="checkbox"] { display: none !important; }
  .jmzq-mvu-check-box {
    width: 14px; height: 14px; flex-shrink: 0;
    border: 1.5px solid rgba(0,0,0,0.2);
    background: rgba(255,255,255,0.5);
    transition: all 0.15s; display: inline-block; box-sizing: border-box;
  }
  .jmzq-mvu-check-row input:checked ~ .jmzq-mvu-check-box {
    background: #c04030; border-color: #c04030;
    box-shadow: 0 0 4px rgba(192,64,48,0.3);
  }
  .jmzq-mvu-check-row:hover .jmzq-mvu-check-box { border-color: #c04030; }
  .jmzq-mvu-hint { font-size: 11px; color: #8a7060; line-height: 1.4; margin-top: 2px; letter-spacing: 0.2px; }
  .jmzq-mvu-subtitle {
    font-size: 10px; color: #a08060;
    letter-spacing: 1px; text-transform: uppercase;
    margin: 6px 0 3px; padding-top: 6px;
    border-top: 1px solid rgba(0,0,0,0.06);
  }
  .jmzq-mvu-collapse-header {
    display: flex; align-items: center; gap: 4px; cursor: pointer;
    font-size: 11px; color: #c04030; padding: 4px 0; user-select: none;
    letter-spacing: 0.4px; transition: color .2s;
  }
  .jmzq-mvu-collapse-header:hover { color: #d45040; }
  .jmzq-mvu-collapse-arrow { display: inline-block; font-size: 8px; transition: transform 0.2s; }
  .jmzq-mvu-collapse-arrow.open { transform: rotate(90deg); }
  .jmzq-mvu-collapse-body { padding-left: 6px; }
  .jmzq-mvu-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; }
  #jmzq-mvu-section { padding: 10px 12px !important; }
  #jmzq-mvu-section .jmzq-mvu-subtitle:first-of-type { margin-top: 2px; }
  #jmzq-mvu-section::-webkit-scrollbar { width: 3px; }
  #jmzq-mvu-section::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.10); border-radius: 2px; }
  #jmzq-confirm-dialog { overflow: hidden !important; }
  #jmzq-confirm-body { overflow: hidden; }
  #jmzq-confirm-body .jmzq-mvu-select { max-width: 100%; width: 0; }
  #jmzq-confirm-body .jmzq-mvu-input { max-width: 100%; }
  #jmzq-confirm-body .jmzq-mvu-row { overflow: hidden; }

  /* 暗色模式 MVU */
  .jmzq-dark .jmzq-mvu-label { color: #a09070; }
  .jmzq-dark .jmzq-mvu-input {
    background: rgba(255,255,255,0.04) !important;
    border-color: rgba(255,255,255,0.06) !important;
    color: #c8b898 !important;
  }
  .jmzq-dark .jmzq-mvu-input:focus {
    border-color: rgba(212,160,48,0.4) !important;
    box-shadow: 0 0 0 2px rgba(212,160,48,0.06) !important;
  }
  .jmzq-dark .jmzq-mvu-select {
    background: rgba(255,255,255,0.04) !important;
    border-color: rgba(255,255,255,0.06) !important;
    color: #c8b898 !important;
  }
  .jmzq-dark .jmzq-mvu-select:focus {
    border-color: rgba(212,160,48,0.4) !important;
    box-shadow: 0 0 0 2px rgba(212,160,48,0.06) !important;
  }
  .jmzq-dark .jmzq-mvu-check-row { color: #a09070; }
  .jmzq-dark .jmzq-mvu-check-box {
    border-color: rgba(255,255,255,0.15);
    background: rgba(255,255,255,0.03);
  }
  .jmzq-dark .jmzq-mvu-check-row input:checked ~ .jmzq-mvu-check-box {
    background: #d4a030; border-color: #d4a030;
  }
  .jmzq-dark .jmzq-mvu-hint { color: #8a7a5a; }
  .jmzq-dark .jmzq-mvu-subtitle { color: #a09070; border-top-color: rgba(255,255,255,0.06); }
  .jmzq-dark .jmzq-mvu-collapse-header { color: #d4a030; }
  .jmzq-dark .jmzq-mvu-collapse-header:hover { color: #e8c050; }
  .jmzq-dark .jmzq-active-head { color:#9a8968; border-top-color:rgba(255,255,255,.06); }
  .jmzq-dark .jmzq-active-entry { color:#b8aa82; border-color:rgba(212,160,48,.18); background:rgba(212,160,48,.05); }
`;
p.document.head.appendChild(MVU_CSS);


// --- HTML（注入到父页面） ---
p.document.body.insertAdjacentHTML('beforeend', `
  <div id="jmzq-bubble" style="top: 40vh; left: 60px;" title="缄默之秋配置小助手"><span>秋</span></div>
  <div id="jmzq-panel" class="jmzq-panel" style="display:none; left: 110px; top: 35vh;">
    <div class="jmzq-header" id="jmzq-drag">
      <span class="jmzq-header-title">缄默之秋配置小助手</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <button class="jmzq-btn xs" id="jmzq-theme-toggle" title="切换主题">墨</button>
        <button class="jmzq-btn xs" id="jmzq-refresh" title="刷新">刷新</button>
        <button class="jmzq-btn xs" id="jmzq-close" title="关闭" style="font-size:14px;padding:4px 8px !important;">✕</button>
      </div>
    </div>
    <div class="jmzq-body">
      <div class="jmzq-config-status" id="jmzq-config-status">配置运行正常</div>
      <div id="jmzq-backend-code" style="text-align:center;margin-bottom:10px;font-size:10px;color:#a09080;line-height:1.6;word-break:break-all;"></div>
      <div class="jmzq-section">
        <div class="jmzq-section-title">世界书状态</div>
        <div class="jmzq-row">
          <div class="jmzq-dot idle" id="jmzq-status-dot"></div>
          <span id="jmzq-status-text">已就绪，等待消息触发…</span>
        </div>
        <div id="jmzq-stat-tags" class="jmzq-kv"></div>
        <div class="jmzq-active-head"><span>当前启用条目</span><span id="jmzq-active-count">等待读取</span></div>
        <div id="jmzq-active-entries" class="jmzq-active-entries"></div>
        <div id="jmzq-manual-wb" style="margin-top:8px;">
          <div style="font-size:11px;color:#8a7060;margin-bottom:4px;" id="jmzq-manual-wb-label">切换世界书</div>
          <div style="display:flex;gap:6px;">
            <select class="jmzq-mvu-select" id="jmzq-manual-wb-select" style="flex:1;font-size:12px;"></select>
            <button class="jmzq-btn xs" id="jmzq-manual-wb-apply">切换</button>
          </div>
        </div>
      </div>
      <div class="jmzq-section">
        <div class="jmzq-section-title">提示词模板</div>
        <button class="jmzq-btn primary" id="jmzq-ejs-optimize" style="margin-bottom:4px;">一键最优配置</button>
        <div id="jmzq-ejs-status" style="font-size:11px;color:#8a7060;margin-top:6px;text-align:center;line-height:1.5;"></div>
      </div>
      <div class="jmzq-section" id="jmzq-mvu-section">
        <div class="jmzq-section-title">MVU插件配置</div>
        <button class="jmzq-btn primary" id="jmzq-mvu-optimize" style="margin-bottom:8px;">一键最优配置</button>
        <!-- 手动配置手风琴 -->
        <div class="jmzq-mvu-collapse-header" id="jmzq-mvu-manual-toggle" style="font-size:13px;justify-content:center;">
          <span class="jmzq-mvu-collapse-arrow" id="jmzq-mvu-manual-arrow">▶</span><span>手动配置</span>
        </div>
        <div class="jmzq-mvu-collapse-body" id="jmzq-mvu-manual-panel" style="display:none;">
        <!-- 更新方式 -->
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label">更新方式</label>
          <select class="jmzq-mvu-select" id="jmzq-mvu-update-mode">
            <option value="随AI输出">随AI输出</option>
            <option value="额外模型解析">额外模型解析</option>
          </select>
        </div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label">模型来源</label>
          <select class="jmzq-mvu-select" id="jmzq-mvu-model-source">
            <option value="与插头相同">与插头相同</option>
            <option value="自定义">自定义</option>
          </select>
        </div>
        <!-- API & 模型（自定义时可见） -->
        <div id="jmzq-mvu-custom-api">
        <div class="jmzq-mvu-subtitle" style="margin-top:8px;">模型连接</div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label wide">API地址</label>
          <input class="jmzq-mvu-input" id="jmzq-mvu-api-url" placeholder="https://...">
          <button class="jmzq-btn xs" id="jmzq-mvu-fetch-models" style="flex-shrink:0;">获取模型</button>
        </div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label wide">API密钥</label>
          <input class="jmzq-mvu-input" id="jmzq-mvu-api-key" type="password" placeholder="sk-...">
        </div>
        <div class="jmzq-mvu-row">
          <label class="jmzq-mvu-label wide">模型名称</label>
          <select class="jmzq-mvu-select" id="jmzq-mvu-model-name">
            <option value="">-- 请先获取模型 --</option>
          </select>
        </div>
        <div class="jmzq-mvu-hint">假流模型将自动开启假流兼容</div>
        <div class="jmzq-mvu-hint">建议选择 gemini 2.5p / 3.1p / 3.5f 等模型</div>
        </div><!-- end jmzq-mvu-custom-api -->
        <!-- 额外模型解析面板 -->
        <div id="jmzq-mvu-extra-panel" style="display:none;">
          <div class="jmzq-mvu-subtitle">额外模型解析</div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">破限方案</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-jailbreak">
              <option value="使用内置破限">使用内置破限</option>
              <option value="使用当前预设">使用当前预设</option>
              <option value="使用其他预设">使用其他预设</option>
            </select>
          </div>
          <div class="jmzq-mvu-hint">小猫之神预设请选择预设破限</div>
          <div class="jmzq-mvu-row" id="jmzq-mvu-preset-row" style="display:none;">
            <label class="jmzq-mvu-label">选择预设</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-preset-name">
              <option value="">-- 加载中... --</option>
            </select>
          </div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">应答格式</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-resp-format">
              <option value="聊天消息">聊天消息</option>
              <option value="工具调用">工具调用</option>
              <option value="格式化输出">格式化输出</option>
            </select>
          </div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">请求方式</label>
            <select class="jmzq-mvu-select" id="jmzq-mvu-request-mode">
              <option value="依次请求，失败后重试">依次请求，失败后重试</option>
              <option value="仅请求一次">仅请求一次</option>
              <option value="并发请求">并发请求</option>
            </select>
          </div>
          <div class="jmzq-mvu-row">
            <label class="jmzq-mvu-label">请求次数</label>
            <input class="jmzq-mvu-input num" id="jmzq-mvu-request-count" type="number" min="1" max="10">
          </div>
          <label class="jmzq-mvu-check-row">
            <input type="checkbox" id="jmzq-mvu-auto-request"><span class="jmzq-mvu-check-box"></span><span>启用自动请求</span>
          </label>
          <!-- 高级参数 -->
          <div class="jmzq-mvu-collapse-header" id="jmzq-mvu-adv-toggle">
            <span class="jmzq-mvu-collapse-arrow" id="jmzq-mvu-adv-arrow">▶</span><span>高级参数</span>
          </div>
          <div class="jmzq-mvu-collapse-body" id="jmzq-mvu-adv-panel" style="display:none;">
            <div class="jmzq-mvu-grid-2">
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">最大回复token</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-max-tokens" type="number" min="1" max="1048576" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">温度</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-temperature" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">频率惩罚</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-freq-penalty" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">存在惩罚</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-pres-penalty" type="number" min="0" max="2" step="0.1" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">TOP P</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-top-p" type="number" min="0" max="1" step="0.01" style="width:100%;">
              </div>
              <div class="jmzq-mvu-row col" style="gap:1px;">
                <label class="jmzq-mvu-label">TOP K</label>
                <input class="jmzq-mvu-input num" id="jmzq-mvu-top-k" type="number" min="0" max="100" style="width:100%;">
              </div>
            </div>
          </div>
        </div>
        <!-- 自动清理变量 -->
        <div class="jmzq-mvu-subtitle">自动清理变量</div>
        <label class="jmzq-mvu-check-row">
          <input type="checkbox" id="jmzq-mvu-auto-clean-enable"><span class="jmzq-mvu-check-box"></span><span>启用自动清理变量</span>
        </label>
        <div id="jmzq-mvu-clean-panel" style="display:none;">
          <div class="jmzq-mvu-grid-2">
            <div class="jmzq-mvu-row col" style="gap:1px;">
              <label class="jmzq-mvu-label">快照间隔</label>
              <input class="jmzq-mvu-input num" id="jmzq-mvu-clean-interval" type="number" min="5" max="500" style="width:100%;">
            </div>
            <div class="jmzq-mvu-row col" style="gap:1px;">
              <label class="jmzq-mvu-label">保留楼层数</label>
              <input class="jmzq-mvu-input num" id="jmzq-mvu-clean-recent" type="number" min="1" max="200" style="width:100%;">
            </div>
            <div class="jmzq-mvu-row col" style="gap:1px;">
              <label class="jmzq-mvu-label">触发恢复数</label>
              <input class="jmzq-mvu-input num" id="jmzq-mvu-clean-trigger" type="number" min="1" max="200" style="width:100%;">
            </div>
          </div>
        </div>
        <!-- 兼容性 -->
        <div class="jmzq-mvu-subtitle">兼容性</div>
        <div id="jmzq-mvu-compat-checks"></div>
        <!-- 操作 -->
        <button class="jmzq-btn primary" id="jmzq-mvu-apply">应用配置（刷新页面）</button>
        </div><!-- end jmzq-mvu-manual-panel -->
        <div id="jmzq-mvu-status" style="font-size:11px;color:#8a7060;margin-top:6px;text-align:center;line-height:1.6;"></div>
      </div>
      <div style="text-align:center;padding:14px 16px 16px;border-top:1px solid rgba(0,0,0,0.06);margin-top:6px;">
        <div style="font-size:11px;color:#8a7060;letter-spacing:0.5px;margin-bottom:2px;">DISCORD · 类脑社区 · NLKASHEI</div>
        <div style="font-size:10px;color:#b0a090;">完全免费，谨防上当 · v${JMZQ_VERSION}</div>
      </div>
    </div>
  </div>
`);

// 独立弹窗——挂到顶层窗口，flex居中
p.document.documentElement.insertAdjacentHTML('beforeend', `
  <div id="jmzq-confirm-overlay" style="display:none;position:fixed;top:0;left:0;width:100vw;height:100dvh;background:rgba(0,0,0,0.35);z-index:2147483646;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;">
    <div id="jmzq-confirm-dialog" style="position:relative;background:linear-gradient(175deg,#f5f0e8,#efe8da);border:1px solid rgba(0,0,0,0.08);max-width:380px;width:min(92vw,460px);text-align:left;color:#3a2a18;font-size:13px;line-height:1.6;box-shadow:0 8px 40px rgba(0,0,0,0.25);">
      <div id="jmzq-confirm-drag" style="display:none;padding:16px 16px 10px;cursor:move;user-select:none;touch-action:none;border-bottom:1px solid rgba(0,0,0,0.06);text-align:center;font-size:14px;color:#5a3020;letter-spacing:1.5px;">MVU模型配置</div>
      <div style="padding:16px 20px;">
      <div id="jmzq-confirm-msg" style="margin-bottom:14px;text-align:center;"></div>
      <div id="jmzq-confirm-body" style="display:none;margin-bottom:14px;"></div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="jmzq-btn xs" id="jmzq-confirm-cancel" style="min-width:64px;">取消</button>
        <button class="jmzq-btn primary" id="jmzq-confirm-ok" style="min-width:64px;margin-top:0;">确认</button>
      </div>
      </div>
    </div>
  </div>
`);

// --- DOM 引用 ---
const bubble = p.document.getElementById('jmzq-bubble');
const panel = p.document.getElementById('jmzq-panel');
const statusDot = p.document.getElementById('jmzq-status-dot');
const statusText = p.document.getElementById('jmzq-status-text');
const statTags = p.document.getElementById('jmzq-stat-tags');
const activeCount = p.document.getElementById('jmzq-active-count');
const activeEntries = p.document.getElementById('jmzq-active-entries');
const manualWbDiv = p.document.getElementById('jmzq-manual-wb');
const manualWbLabel = p.document.getElementById('jmzq-manual-wb-label');
const manualWbSelect = p.document.getElementById('jmzq-manual-wb-select');
const manualWbApply = p.document.getElementById('jmzq-manual-wb-apply');
const themeToggle = p.document.getElementById('jmzq-theme-toggle');
const refreshBtn = p.document.getElementById('jmzq-refresh');
const configStatus = p.document.getElementById('jmzq-config-status');
const backendCode = p.document.getElementById('jmzq-backend-code');
const mvuSection = p.document.getElementById('jmzq-mvu-section');
const mvuUpdateMode = p.document.getElementById('jmzq-mvu-update-mode');
const mvuModelSource = p.document.getElementById('jmzq-mvu-model-source');
const mvuCustomApi = p.document.getElementById('jmzq-mvu-custom-api');
const mvuExtraPanel = p.document.getElementById('jmzq-mvu-extra-panel');
const mvuJailbreak = p.document.getElementById('jmzq-mvu-jailbreak');
const mvuPresetRow = p.document.getElementById('jmzq-mvu-preset-row');
const mvuPresetName = p.document.getElementById('jmzq-mvu-preset-name');
const mvuRespFormat = p.document.getElementById('jmzq-mvu-resp-format');
const mvuRequestMode = p.document.getElementById('jmzq-mvu-request-mode');
const mvuRequestCount = p.document.getElementById('jmzq-mvu-request-count');
const mvuAutoRequest = p.document.getElementById('jmzq-mvu-auto-request');
const mvuApiUrl = p.document.getElementById('jmzq-mvu-api-url');

// 气泡启动位置校正：防止因窗口尺寸变化导致拖出屏幕
(function() {
  var bw = bubble.offsetWidth || 44;
  var bh = bubble.offsetHeight || 44;
  var maxLeft = (p.innerWidth || window.innerWidth) - bw;
  var maxTop = (p.innerHeight || window.innerHeight) - bh;
  var curLeft = parseFloat(bubble.style.left) || 0;
  var curTop = parseFloat(bubble.style.top) || 0;
  if (curLeft < 0 || curLeft > maxLeft) bubble.style.left = '60px';
  if (curTop < 0 || curTop > maxTop) bubble.style.top = '40vh';
})();
const mvuApiKey = p.document.getElementById('jmzq-mvu-api-key');
const mvuFetchModelsBtn = p.document.getElementById('jmzq-mvu-fetch-models');
const mvuModelName = p.document.getElementById('jmzq-mvu-model-name');
const mvuManualToggle = p.document.getElementById('jmzq-mvu-manual-toggle');
const mvuManualArrow = p.document.getElementById('jmzq-mvu-manual-arrow');
const mvuManualPanel = p.document.getElementById('jmzq-mvu-manual-panel');
const mvuAdvToggle = p.document.getElementById('jmzq-mvu-adv-toggle');
const mvuAdvArrow = p.document.getElementById('jmzq-mvu-adv-arrow');
const mvuAdvPanel = p.document.getElementById('jmzq-mvu-adv-panel');
const mvuMaxTokens = p.document.getElementById('jmzq-mvu-max-tokens');
const mvuTemperature = p.document.getElementById('jmzq-mvu-temperature');
const mvuFreqPenalty = p.document.getElementById('jmzq-mvu-freq-penalty');
const mvuPresPenalty = p.document.getElementById('jmzq-mvu-pres-penalty');
const mvuTopP = p.document.getElementById('jmzq-mvu-top-p');
const mvuTopK = p.document.getElementById('jmzq-mvu-top-k');
const mvuAutoCleanEnable = p.document.getElementById('jmzq-mvu-auto-clean-enable');
const mvuCleanPanel = p.document.getElementById('jmzq-mvu-clean-panel');
const mvuCleanInterval = p.document.getElementById('jmzq-mvu-clean-interval');
const mvuCleanRecent = p.document.getElementById('jmzq-mvu-clean-recent');
const mvuCleanTrigger = p.document.getElementById('jmzq-mvu-clean-trigger');
const mvuCompatChecks = p.document.getElementById('jmzq-mvu-compat-checks');
const mvuOptimizeBtn = p.document.getElementById('jmzq-mvu-optimize');
const mvuApplyBtn = p.document.getElementById('jmzq-mvu-apply');
const mvuStatus = p.document.getElementById('jmzq-mvu-status');
const ejsOptimizeBtn = p.document.getElementById('jmzq-ejs-optimize');
const ejsStatus = p.document.getElementById('jmzq-ejs-status');
const jmzqConfirmOverlay = p.document.getElementById('jmzq-confirm-overlay');
const jmzqConfirmMsg = p.document.getElementById('jmzq-confirm-msg');
const jmzqConfirmBody = p.document.getElementById('jmzq-confirm-body');
const jmzqConfirmOk = p.document.getElementById('jmzq-confirm-ok');
const jmzqConfirmCancel = p.document.getElementById('jmzq-confirm-cancel');

// --- Toast ---
function showToast(msg) {
  const t = p.document.createElement('div');
  t.className = 'jmzq toast';
  t.textContent = msg;
  p.document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}


// --- 配置检测：检查模型名称 ---
const CONFIG_BLACKLIST = ['次','血','特','惠','福','利','鹿','量','plus','Plus','PLUS','转','官','0.','auto','AUTO','Auto','+','逆'];
const CONFIG_URL_WHITELIST = ['siliconflow', 'openrouter', 'ark.cn-beijing.volces', 'ark.cn', 'edgefn', 'qnaigc', 'nvidia', 'baidubce', 'ananbdhdh', 'ai21', 'aimlapi', 'anthropic', 'bigmodel', 'chutes', 'cohere', 'cometapi', 'dashscope', 'deepseek', 'electronhub', 'fireworks', 'gcli.ggchan.dev', 'googleapis', 'groq', 'lingyiwanwu', 'magicv4', 'minimax', 'mistral', 'momotale', 'moonshot', 'moyii', 'nanogpt', 'novita', 'opencode', 'openai', 'api.longcat.chat', 'api.pioneer.ai', 'perplexity', 'pollinations', 'primavera64', 'stepfun', 'together', 'x.ai', 'z.ai'];
const CONFIG_URL_BLACKLIST = ['gemai','cc.cwapi.vip','sta1n','chr1','iisbo','xqiqix','chatnewai','qingjiu','lemonapi','novaiapi','vectorengine','api.gpt.ge','sllt','beijixingxing','qinyan','jiemomo','meow61','aiopus','api-666','ekan8','nova.cervus','api.laozhang','ashesb','ai.sikong','agent.aiflow','api552','nvewvip.preview.tencent-zeabur','ai.ttk.homes','cwapi','api.xixixi.cloud','api.goodsupport.top','api.lrca.cn','bnwum','love.qiyu221','api.akane.win','new.xfxai.top','dianhuomao','taicu'];

function checkConfig() {
  try {
    updateBackendCode();

    // 静默截断检测：URL/模型黑名单 → 只控制 fetch 劫持，不提示用户
    const apiUrl = getMainApiUrl().toLowerCase();
    if (CONFIG_URL_WHITELIST.some(kw => apiUrl.includes(kw))) { /* 白名单放行 */ }
    else if (CONFIG_URL_BLACKLIST.some(kw => apiUrl.includes(kw))) return;
    let model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
    if (!model) {
      const cs = SillyTavern.chatCompletionSettings || {};
      model = inferModelFromSettings(cs);
    }

    // 用户可见的配置检测
    const issues = [];

    const cfg = getMvuCfg();
    if (cfg) {
      const mode = cfg.更新方式;
      const isExtra = mode === '额外模型解析';
      const isSuiAI = mode === '随AI输出';
      const n = cfg.通知 || {};
      if (!(n['MVU框架加载成功'] && n['变量初始化成功'] && n['变量更新出错'] && n['额外模型解析中'])) {
        issues.push('四项通知未全开');
      }
      if (isExtra) {
        const em = cfg.额外模型解析配置 || {};
        if (!em.api地址 || !em.api地址.trim()) issues.push('API地址未填写');
        if (_mvuOutputFormatEnabled) issues.push('随AI条目误开启');
      } else if (isSuiAI) {
        if (!_mvuOutputFormatEnabled) issues.push('输出格式强化未开启');
      } else {
        issues.push('更新方式非最优');
      }
    }

    const ejs = SillyTavern?.extensionSettings?.EjsTemplate;
    const disabled = SillyTavern.extensionSettings.disabledExtensions || [];
    if (!ejs) {
      issues.push('提示词模板未安装');
    } else if (disabled.includes('third-party/ST-Prompt-Template')) {
      issues.push('提示词模板已禁用');
    } else {
      for (const [k, v] of Object.entries(EJS_OPTIMAL)) {
        if (ejs[k] !== v) { issues.push('提示词模板配置偏差'); break; }
      }
    }

    if (issues.length === 0) {
      configStatus.textContent = '配置运行正常';
      configStatus.classList.remove('warn');
      bubble.classList.remove('warn');
    } else {
      configStatus.innerHTML = '⚠ 配置异常：' + issues.join('；');
      configStatus.classList.add('warn');
      bubble.classList.add('warn');
    }
  } catch (e) {
    configStatus.textContent = '检测失败';
  }
}

function getMvuCfg() { return SillyTavern.extensionSettings.mvu_settings; }

// 从 chatCompletionSettings 推断模型名（getChatCompletionModel 不可用时的回退）
function inferModelFromSettings(settings) {
  if (!settings || typeof settings !== 'object') return '';
  const sourceMap = {
    claude: 'claude_model', openai: 'openai_model', makersuite: 'google_model',
    google: 'google_model', vertexai: 'vertexai_model', openrouter: 'openrouter_model',
    ai21: 'ai21_model', mistralai: 'mistralai_model', custom: 'custom_model',
    cohere: 'cohere_model', perplexity: 'perplexity_model', groq: 'groq_model',
    siliconflow: 'siliconflow_model', electronhub: 'electronhub_model',
    chutes: 'chutes_model', nanogpt: 'nanogpt_model', deepseek: 'deepseek_model',
    aimlapi: 'aimlapi_model', xai: 'xai_model', pollinations: 'pollinations_model',
    cometapi: 'cometapi_model', moonshot: 'moonshot_model', fireworks: 'fireworks_model',
    azure_openai: 'azure_openai_model', zai: 'zai_model',
  };
  const key = sourceMap[settings.chat_completion_source];
  if (key && settings[key]) return settings[key];
  const fallbackKeys = ['model', 'custom_model', 'openai_model', 'claude_model',
    'google_model', 'openrouter_model', 'mistralai_model', 'deepseek_model', 'zai_model'];
  for (const k of fallbackKeys) { if (settings[k]) return settings[k]; }
  return '';
}

// chat_completion_source → 可读名称
const SOURCE_LABEL = {
  openai: 'OpenAI', claude: 'Claude', makersuite: 'Google AI', google: 'Google AI',
  mistralai: 'Mistral AI', deepseek: 'DeepSeek', xai: 'xAI Grok', openrouter: 'OpenRouter',
  azure_openai: 'Azure OpenAI', custom: '自定义', cohere: 'Cohere', perplexity: 'Perplexity',
  groq: 'Groq', ai21: 'AI21', siliconflow: 'SiliconFlow', electronhub: 'ElectronHub',
  chutes: 'Chutes', nanogpt: 'NanoGPT', vertexai: 'Vertex AI', aimlapi: 'AIMLAPI',
  pollinations: 'Pollinations', cometapi: 'CometAPI', moonshot: 'Moonshot',
  fireworks: 'Fireworks', zai: 'Z.AI',
};

// chat_completion_source → 官方 API URL
const SOURCE_URL = {
  openai: 'https://api.openai.com/v1', claude: 'https://api.anthropic.com/v1',
  makersuite: 'https://generativelanguage.googleapis.com/v1beta',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  mistralai: 'https://api.mistral.ai/v1', deepseek: 'https://api.deepseek.com/v1',
  xai: 'https://api.x.ai/v1', openrouter: 'https://openrouter.ai/api/v1',
  azure_openai: '', custom: '', cohere: 'https://api.cohere.com/v1',
  perplexity: 'https://api.perplexity.ai', groq: 'https://api.groq.com/openai/v1',
  ai21: 'https://api.ai21.com/studio/v1', siliconflow: 'https://api.siliconflow.cn/v1',
  electronhub: 'https://api.electronhub.com', chutes: 'https://api.chutes.ai',
  nanogpt: 'https://api.nanogpt.com', vertexai: 'https://aiplatform.googleapis.com/v1',
  aimlapi: 'https://api.aimlapi.com/v1', pollinations: 'https://api.pollinations.ai',
  cometapi: 'https://api.cometapi.com', moonshot: 'https://api.moonshot.cn/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1', zai: 'https://api.z.ai',
};

function getCurrentSource() {
  try {
    const cs = SillyTavern.chatCompletionSettings || {};
    if (cs.chat_completion_source) return cs.chat_completion_source;
    const fn = SillyTavern.getTokenizerModel;
    if (fn) {
      const body = fn.toString();
      const m = body.match(/\((\w+)\.chat_completion_source\s*==\s*chat_completion_sources\.(\w+)\)/);
      if (m) return m[2].toLowerCase();
    }
  } catch (e) {}
  return '';
}

function getReverseProxyUrl() {
  try {
    const cs = SillyTavern.chatCompletionSettings || {};
    if (cs.reverse_proxy && typeof cs.reverse_proxy === 'string' && cs.reverse_proxy.startsWith('http')) {
      return cs.reverse_proxy;
    }
  } catch (e) {}
  return '';
}

function getMainApiUrl() {
  try {
    // 1. 优先查 connectionManager 的选中 profile（最准确反映用户当前使用的 API）
    const cm = SillyTavern.extensionSettings.connectionManager;
    if (cm) {
      const profiles = cm.profiles || [];
      const pid = cm.selectedProfile;
      if (pid) {
        const sp = profiles.find(p => p.id === pid);
        const spUrl = sp && sp['api-url'];
        if (spUrl && typeof spUrl === 'string' && spUrl.startsWith('http')) return spUrl;
      }
      // 读取 MVU 额外模型的 API 地址，用于排除
      let extraUrl = '';
      try {
        const mvuCfg = SillyTavern.extensionSettings.mvu_settings;
        if (mvuCfg && mvuCfg.额外模型解析配置 && mvuCfg.额外模型解析配置.api地址) {
          extraUrl = mvuCfg.额外模型解析配置.api地址.replace(/\/+$/, '').toLowerCase();
        }
      } catch(e) {}
      // 返回第一个不等于额外模型 URL 的 profile
      for (const prof of profiles) {
        const profUrl = (prof['api-url'] || '').replace(/\/+$/, '').toLowerCase();
        if (profUrl && profUrl !== extraUrl) return prof['api-url'];
      }
    }
    // 2. chatCompletionSettings（跳过 ST 本地代理地址，只取真实第三方 API URL）
    const cs = SillyTavern.chatCompletionSettings || {};
    const urlKeys = ['server_url', 'reverse_proxy', 'custom_url', 'api_url',
      'openai_server_url', 'openai_reverse_proxy', 'custom_server_url', 'base_url'];
    for (const k of urlKeys) {
      const v = cs[k];
      if (v && typeof v === 'string' && v.startsWith('http')) {
        var lower = v.toLowerCase();
        if (lower.includes('127.0.0.1') || lower.includes('localhost')) continue; // ST 本地代理，不是 API
        return v;
      }
    }
    return '';
  } catch(e) { return ''; }
}

// 保存设置（多路径尝试，兼容不同酒馆版本）
// 重要：SillyTavern 是 getter，每次访问创建新的上下文快照，
// 其 saveSettingsDebounced 也随之变为不同的闭包实例（各自有独立的 timer）。
// 自动保存和应用按钮若拿到不同实例，debounce 互不干扰导致写入乱序。
// 因此必须在初始化时缓存引用，确保所有调用共用同一个 debounced wrapper。
const _saveSettingsFn = (() => {
  return SillyTavern.saveSettingsDebounced
    || (p.SillyTavern && p.SillyTavern.saveSettingsDebounced)
    || (typeof p.saveSettingsDebounced === 'function' ? p.saveSettingsDebounced : null);
})();

function saveSettings() {
  if (_saveSettingsFn) return _saveSettingsFn();
  throw new Error('saveSettingsDebounced 不可用');
}

const _BK = 'ZODMVUKY';

// ═══════════════ 纯 JS DES 实现（CryptoJS 不可用时的回退） ═══════════════
const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_ROT = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const DES_SBOX = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11]
];

function desPermute(bits, table) { return table.map(i => bits[i - 1]); }
function desLeftShift(bits, count) { return bits.slice(count).concat(bits.slice(0, count)); }
function desXor(a, b) { return a.map((v, i) => v ^ b[i]); }
function desBytesToBits(bytes) {
  const bits = [];
  for (const byte of bytes) { for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1); }
  return bits;
}
function desBitsToBytes(bits) {
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    bytes.push(byte);
  }
  return bytes;
}
function desCreateSubkeys(keyBytes) {
  const keyBits = desPermute(desBytesToBits(keyBytes), DES_PC1);
  let c = keyBits.slice(0, 28), d = keyBits.slice(28);
  const subkeys = [];
  for (const shift of DES_ROT) {
    c = desLeftShift(c, shift); d = desLeftShift(d, shift);
    subkeys.push(desPermute(c.concat(d), DES_PC2));
  }
  return subkeys;
}
function desFeistel(right, subkey) {
  const expanded = desXor(desPermute(right, DES_E), subkey);
  const out = [];
  for (let i = 0; i < 8; i++) {
    const chunk = expanded.slice(i * 6, i * 6 + 6);
    const row = (chunk[0] << 1) | chunk[5];
    const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
    const val = DES_SBOX[i][row * 16 + col];
    out.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
  }
  return desPermute(out, DES_P);
}
function desEncryptBlock(block, subkeys) {
  const bits = desPermute(desBytesToBits(block), DES_IP);
  let left = bits.slice(0, 32), right = bits.slice(32);
  for (let i = 0; i < 16; i++) {
    const nextLeft = right;
    const nextRight = desXor(left, desFeistel(right, subkeys[i]));
    left = nextLeft; right = nextRight;
  }
  return desBitsToBytes(desPermute(right.concat(left), DES_FP));
}
function stringToUtf8Bytes(text) {
  if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
  const encoded = unescape(encodeURIComponent(text));
  return Array.from(encoded, ch => ch.charCodeAt(0));
}
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === 'function') return btoa(binary);
  throw new Error('Base64 编码不可用');
}
function desEcbPkcs7EncryptBase64(plainText, key) {
  const keyBytes = stringToUtf8Bytes(key);
  if (keyBytes.length !== 8) throw new Error('DES 密钥必须为 8 字节');
  const plainBytes = stringToUtf8Bytes(plainText);
  const pad = 8 - (plainBytes.length % 8) || 8;
  for (let i = 0; i < pad; i++) plainBytes.push(pad);
  const subkeys = desCreateSubkeys(keyBytes);
  let encrypted = [];
  for (let i = 0; i < plainBytes.length; i += 8)
    encrypted = encrypted.concat(desEncryptBlock(plainBytes.slice(i, i + 8), subkeys));
  return bytesToBase64(encrypted);
}

function encryptPayload(payload) {
  // 优先 CryptoJS（主文件环境），不可用时回退纯 JS DES（旧版酒馆无 CryptoJS）
  const C = (p && p.CryptoJS) || (typeof CryptoJS !== 'undefined' ? CryptoJS : null);
  if (C && C.DES && C.enc && C.enc.Utf8 && C.mode && C.mode.ECB && C.pad && C.pad.Pkcs7) {
    return C.DES.encrypt(C.enc.Utf8.parse(payload), C.enc.Utf8.parse(_BK), {
      mode: C.mode.ECB, padding: C.pad.Pkcs7
    }).toString();
  }
  return desEcbPkcs7EncryptBase64(payload, _BK);
}

function updateBackendCode() {
  try {
    const model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
    const source = getCurrentSource();
    // 插头URL：反代 > 官方映射 > CM profile
    const proxyUrl = getReverseProxyUrl();
    const plugUrl = proxyUrl || SOURCE_URL[source] || getMainApiUrl() || '';
    const localHref = (p && p.location && p.location.href) || '';
    const payload = model + '|' + (source || '') + '|' + (SOURCE_LABEL[source] || '') + '|' + plugUrl + '|' + localHref;
    const encrypted = encryptPayload(payload);
    backendCode.innerHTML = '<span style="font-size:10px;color:#a09080;">后台配置码</span> <code style="font-size:10px;font-family:Consolas,Monaco,monospace;background:rgba(0,0,0,0.04);color:#5a4030;padding:3px 8px;border:1px solid rgba(0,0,0,0.08);white-space:nowrap;max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;cursor:pointer;" title="点击复制" onclick="navigator.clipboard.writeText(this.textContent);var b=this.nextElementSibling;b.textContent=\'已复制\';setTimeout(()=>b.textContent=\'复制\',1500);">' + encrypted + '</code> <button class="jmzq-btn xs" style="vertical-align:middle;" onclick="navigator.clipboard.writeText(\'' + encrypted + '\');this.textContent=\'已复制\';setTimeout(()=>this.textContent=\'复制\',1500);">复制</button>';
  } catch (e) {
    backendCode.innerHTML = '';
  }
}

// 读取MVU配置 — 直接用iframe代理（探路脚本已验证 SillyTavern.extensionSettings.mvu_settings 可正常读取）
// 注意：勿用 runInParent 读父页面 window.SillyTavern.extensionSettings，父页面无此路径
function readMvuCfgFromParent() {
  return getMvuCfg();
}

// 兼容性字段迁移：新版 MVU 使用 sendas；sandas 是旧版遗留拼写。
// cfg 与 _ewcYH 都必须清理，否则启动恢复流程会把旧键重新灌回去。
function normalizeMvuCompatKeys(holder) {
  if (!holder || typeof holder !== 'object') return false;
  const compat = holder.兼容性;
  if (!compat || typeof compat !== 'object') return false;
  let changed = false;
  if (compat['sendas不视为user消息'] === undefined && compat['sandas不视为user消息'] !== undefined) {
    compat['sendas不视为user消息'] = !!compat['sandas不视为user消息'];
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(compat, 'sandas不视为user消息')) {
    delete compat['sandas不视为user消息'];
    changed = true;
  }
  return changed;
}

// 构建兼容性复选框（动态读取键名）
function buildCompatChecks() {
  const cfg = getMvuCfg();
  normalizeMvuCompatKeys(cfg);
  const compat = cfg && cfg.兼容性 ? cfg.兼容性 : {};
  const preferred = ['更新到聊天变量', '显示老旧功能', 'sendas不视为user消息'];
  const keys = [
    ...preferred.filter(k => Object.prototype.hasOwnProperty.call(compat, k)),
    ...Object.keys(compat).filter(k => !preferred.includes(k) && k !== 'sandas不视为user消息'),
  ];
  mvuCompatChecks.innerHTML = keys.map(k => {
    const checked = compat[k] ? ' checked' : '';
    return '<label class="jmzq-mvu-check-row"><input type="checkbox" class="jmzq-mvu-compat-check" data-key="' + k + '"' + checked + '><span class="jmzq-mvu-check-box"></span><span>' + k + '</span></label>';
  }).join('');
}

// 从config同步到表单
function syncMvuToForm(cfg) {
  if (!cfg) cfg = getMvuCfg();
  if (!cfg) return;

  const bu = ewcGetEwcYH();

  // 更新方式
  mvuUpdateMode.value = cfg.更新方式 || bu.更新方式 || '随AI输出';
  mvuModelSource.value = (cfg.额外模型解析配置?.模型来源) || bu.模型来源 || '与插头相同';
  const isExtra = cfg.更新方式 === '额外模型解析';
  mvuExtraPanel.style.display = isExtra ? '' : 'none';

  // 额外模型解析配置 — em优先，_ewcYH回退
  const em = cfg.额外模型解析配置 || {};
  mvuJailbreak.value = em.破限方案 || bu.破限方案 || '使用内置破限';
  mvuPresetRow.style.display = (mvuJailbreak.value === '使用其他预设') ? '' : 'none';
  if (mvuJailbreak.value === '使用其他预设') {
    const savedPreset = em.预设名称 || bu.预设名称 || '';
    populatePresets(savedPreset);
  }
  mvuRespFormat.value = em.应答格式 || bu.应答格式 || '聊天消息';
  mvuRequestMode.value = em.请求方式 || bu.请求方式 || '依次请求，失败后重试';
  mvuRequestCount.value = em.请求次数 ?? bu.请求次数 ?? 1;
  mvuAutoRequest.checked = em.启用自动请求 ?? bu.启用自动请求 ?? true;
  mvuApiUrl.value = em.api地址 || bu.api地址 || '';
  mvuApiKey.value = em.密钥 || bu.密钥 || '';
  const modelName = em.模型名称 || bu.模型名称 || '';
  if (modelName) {
    if (![...mvuModelName.options].some(o => o.value === modelName)) {
      mvuModelName.appendChild(p.document.createElement('option'));
      mvuModelName.lastChild.value = modelName;
      mvuModelName.lastChild.textContent = modelName;
    }
    mvuModelName.value = modelName;
  }
  mvuMaxTokens.value = em.最大回复token数 ?? bu.最大回复token数 ?? 65535;
  mvuTemperature.value = em.温度 ?? bu.温度 ?? 1;
  mvuFreqPenalty.value = em.频率惩罚 ?? bu.频率惩罚 ?? 0;
  mvuPresPenalty.value = em.存在惩罚 ?? bu.存在惩罚 ?? 0;
  mvuTopP.value = em.top_p ?? bu.top_p ?? 1;
  mvuTopK.value = em.top_k ?? bu.top_k ?? 0;

  // 自动清理变量
  const ac = cfg.自动清理变量 || {};
  mvuAutoCleanEnable.checked = ac.启用 ?? bu.自动清理启用 ?? false;
  mvuCleanPanel.style.display = (ac.启用 ?? bu.自动清理启用) ? '' : 'none';
  mvuCleanInterval.value = ac.快照保留间隔 ?? bu.快照保留间隔 ?? 50;
  mvuCleanRecent.value = ac.要保留变量的最近楼层数 ?? bu.保留变量最近楼层数 ?? 20;
  mvuCleanTrigger.value = ac.触发恢复变量的最近楼层数 ?? bu.触发恢复变量最近楼层数 ?? 10;

  // 兼容性
  // 优先 cfg.兼容性，回退 bu.兼容性
  if (!cfg.兼容性 || Object.keys(cfg.兼容性).length === 0) {
    if (bu.兼容性 && Object.keys(bu.兼容性).length > 0) {
      cfg.兼容性 = { ...bu.兼容性 };
    }
  }
  buildCompatChecks();

  // 模型来源联动
  refreshModelSourceVisibility();
}

// 从表单写回config（仅内存）
function writeMvuConfig() {
  const cfg = getMvuCfg();
  if (!cfg) return;

  cfg.更新方式 = mvuUpdateMode.value;
  if (!cfg.额外模型解析配置) cfg.额外模型解析配置 = {};
  cfg.额外模型解析配置.模型来源 = mvuModelSource.value;

  const em = cfg.额外模型解析配置;
  em.破限方案 = mvuJailbreak.value;
  if (mvuJailbreak.value === '使用其他预设' && mvuPresetName) {
    em.预设名称 = mvuPresetName.value;
  } else {
    delete em.预设名称;
  }
  em.应答格式 = mvuRespFormat.value;
  em.兼容假流式 = /假流/i.test(mvuModelName.value);
  em.请求方式 = mvuRequestMode.value;
  em.请求次数 = parseInt(mvuRequestCount.value) || 1;
  em.启用自动请求 = mvuAutoRequest.checked;
  em.api地址 = mvuApiUrl.value;
  em.密钥 = mvuApiKey.value;
  em.模型名称 = mvuModelName.value;
  em.最大回复token数 = parseInt(mvuMaxTokens.value) || 65535;
  em.温度 = parseFloat(mvuTemperature.value) || 1;
  em.频率惩罚 = parseFloat(mvuFreqPenalty.value) || 0;
  em.存在惩罚 = parseFloat(mvuPresPenalty.value) || 0;
  em.top_p = parseFloat(mvuTopP.value) || 1;
  em.top_k = parseInt(mvuTopK.value) || 0;

  if (!cfg.自动清理变量) cfg.自动清理变量 = {};
  const ac = cfg.自动清理变量;
  ac.启用 = mvuAutoCleanEnable.checked;
  ac.快照保留间隔 = parseInt(mvuCleanInterval.value) || 50;
  ac.要保留变量的最近楼层数 = parseInt(mvuCleanRecent.value) || 20;
  ac.触发恢复变量的最近楼层数 = parseInt(mvuCleanTrigger.value) || 10;

  // 兼容性
  const checks = mvuCompatChecks.querySelectorAll('.jmzq-mvu-compat-check');
  checks.forEach(cb => { if (cfg.兼容性) cfg.兼容性[cb.dataset.key] = cb.checked; });

  // 双写到 _ewcYH 持久化备份
  ewcBackupToEwcYH();
}

// ── _ewcYH 持久化备份 ──
// 将所有面板管理的字段双写到 _ewcYH，供刷新后恢复（MVU初始化可能抹掉某些值）
function ewcGetEwcYH() {
  if (!SillyTavern.extensionSettings._ewcYH) SillyTavern.extensionSettings._ewcYH = {};
  return SillyTavern.extensionSettings._ewcYH;
}
function ewcBackupToEwcYH() {
  const cfg = getMvuCfg(); if (!cfg) return;
  const bu = ewcGetEwcYH();
  normalizeMvuCompatKeys(cfg);
  normalizeMvuCompatKeys(bu);
  bu.更新方式 = cfg.更新方式;
  const em = cfg.额外模型解析配置 || {};
  bu.破限方案 = em.破限方案;
  bu.预设名称 = em.预设名称;
  bu.应答格式 = em.应答格式;
  bu.兼容假流式 = em.兼容假流式;
  bu.请求方式 = em.请求方式;
  bu.请求次数 = em.请求次数;
  bu.启用自动请求 = em.启用自动请求;
  bu.api地址 = em.api地址;
  bu.密钥 = em.密钥;
  bu.模型名称 = em.模型名称;
  bu.模型来源 = em.模型来源;
  bu.最大回复token数 = em.最大回复token数;
  bu.温度 = em.温度;
  bu.频率惩罚 = em.频率惩罚;
  bu.存在惩罚 = em.存在惩罚;
  bu.top_p = em.top_p;
  bu.top_k = em.top_k;
  const ac = cfg.自动清理变量 || {};
  bu.自动清理启用 = ac.启用;
  bu.快照保留间隔 = ac.快照保留间隔;
  bu.保留变量最近楼层数 = ac.要保留变量的最近楼层数;
  bu.触发恢复变量最近楼层数 = ac.触发恢复变量的最近楼层数;
  if (cfg.兼容性) bu.兼容性 = { ...cfg.兼容性 };
}
// 启动时：把 _ewcYH 里非空的值恢复到 mvu_settings（只补MVU初始化抹掉的值）
function ewcRestoreFromEwcYH() {
  const cfg = getMvuCfg(); const bu = ewcGetEwcYH();
  if (!cfg || !bu) return;
  normalizeMvuCompatKeys(cfg);
  normalizeMvuCompatKeys(bu);
  if (!cfg.更新方式 && bu.更新方式) cfg.更新方式 = bu.更新方式;
  if (!cfg.额外模型解析配置) cfg.额外模型解析配置 = {};
  const em = cfg.额外模型解析配置;
  if (!em.破限方案 && bu.破限方案) em.破限方案 = bu.破限方案;
  if (!em.预设名称 && bu.预设名称) em.预设名称 = bu.预设名称;
  if (!em.应答格式 && bu.应答格式) em.应答格式 = bu.应答格式;
  if (em.兼容假流式 === undefined && bu.兼容假流式 !== undefined) em.兼容假流式 = bu.兼容假流式;
  if (!em.请求方式 && bu.请求方式) em.请求方式 = bu.请求方式;
  if (em.请求次数 === undefined && bu.请求次数 !== undefined) em.请求次数 = bu.请求次数;
  if (em.启用自动请求 === undefined && bu.启用自动请求 !== undefined) em.启用自动请求 = bu.启用自动请求;
  if (!em.api地址 && bu.api地址) em.api地址 = bu.api地址;
  if (!em.密钥 && bu.密钥) em.密钥 = bu.密钥;
  if (!em.模型名称 && bu.模型名称) em.模型名称 = bu.模型名称;
  if (!em.模型来源 && bu.模型来源) em.模型来源 = bu.模型来源;
  if (em.最大回复token数 === undefined && bu.最大回复token数 !== undefined) em.最大回复token数 = bu.最大回复token数;
  if (em.温度 === undefined && bu.温度 !== undefined) em.温度 = bu.温度;
  if (em.频率惩罚 === undefined && bu.频率惩罚 !== undefined) em.频率惩罚 = bu.频率惩罚;
  if (em.存在惩罚 === undefined && bu.存在惩罚 !== undefined) em.存在惩罚 = bu.存在惩罚;
  if (em.top_p === undefined && bu.top_p !== undefined) em.top_p = bu.top_p;
  if (em.top_k === undefined && bu.top_k !== undefined) em.top_k = bu.top_k;
  if (!cfg.自动清理变量) cfg.自动清理变量 = {};
  const ac = cfg.自动清理变量;
  if (ac.启用 === undefined && bu.自动清理启用 !== undefined) ac.启用 = bu.自动清理启用;
  if (ac.快照保留间隔 === undefined && bu.快照保留间隔 !== undefined) ac.快照保留间隔 = bu.快照保留间隔;
  if (ac.要保留变量的最近楼层数 === undefined && bu.保留变量最近楼层数 !== undefined) ac.要保留变量的最近楼层数 = bu.保留变量最近楼层数;
  if (ac.触发恢复变量的最近楼层数 === undefined && bu.触发恢复变量最近楼层数 !== undefined) ac.触发恢复变量的最近楼层数 = bu.触发恢复变量最近楼层数;
  if (!cfg.兼容性) cfg.兼容性 = {};
  if (bu.兼容性) {
    for (const [k, v] of Object.entries(bu.兼容性)) {
      if (cfg.兼容性[k] === undefined) cfg.兼容性[k] = v;
    }
  }
  normalizeMvuCompatKeys(cfg);
}

// ── DOM 事件模拟：通过 runInParent 在父页面找到 MVU 自身的表单元素，设值并派发事件 ──
// MVU 内部缓存仅在其自身 UI 事件监听器触发时更新，所以需要直接操作它的 DOM
function ewcSyncMvuDom() {
  return runInParent(`(async () => {
  var doc = document;
  var cfg = SillyTavern.getContext().extensionSettings.mvu_settings;
  if (!cfg) return 'no cfg';
  var em = cfg.额外模型解析配置 || {};
  var ac = cfg.自动清理变量 || {};
  var compat = cfg.兼容性 || {};

  // 工具：原生设值 + 派发事件（兼容React受控组件）
  function setVal(el, val) {
    if (!el) return;
    if (el.type === 'checkbox') {
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
      if (desc && desc.set) { desc.set.call(el, !!val); } else { el.checked = !!val; }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.tagName === 'SELECT') {
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      var desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (desc && desc.set) { desc.set.call(el, val); } else { el.value = val; }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // 在MVU section内按label文本找表单元素
  function findField(labelText) {
    var sections = doc.querySelectorAll('.mvu-section');
    for (var i = 0; i < sections.length; i++) {
      var labels = sections[i].querySelectorAll('label, span, strong');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].textContent.trim() === labelText) {
          var field = labels[j].closest('.mvu-field') || labels[j].parentElement;
          return field.querySelector('input, select, textarea');
        }
      }
    }
    return null;
  }

  // 找 range+number 组合的number input
  function findRangeNumber(labelText) {
    var sections = doc.querySelectorAll('.mvu-section');
    for (var i = 0; i < sections.length; i++) {
      var labels = sections[i].querySelectorAll('label, span, strong');
      for (var j = 0; j < labels.length; j++) {
        if (labels[j].textContent.trim() === labelText) {
          var field = labels[j].closest('.mvu-field') || labels[j].parentElement;
          return field.querySelector('input[type="number"]');
        }
      }
    }
    return null;
  }

  // 找到所有details并展开
  var details = doc.querySelectorAll('.mvu-section details');
  var savedStates = [];
  for (var d = 0; d < details.length; d++) { savedStates.push(details[d].open); details[d].open = true; }

  try {
    // 破限方案
    var el = findField('破限方案');
    if (el && em.破限方案) setVal(el, em.破限方案);

    // 应答格式
    el = findField('应答格式');
    if (el && em.应答格式) setVal(el, em.应答格式);

    // 兼容假流式
    el = findField('兼容假流式');
    if (el) setVal(el, !!em.兼容假流式);

    // 请求方式
    el = findField('请求方式');
    if (el && em.请求方式) setVal(el, em.请求方式);

    // 请求次数
    el = findRangeNumber('请求次数');
    if (el && em.请求次数 !== undefined) setVal(el, em.请求次数);

    // 自动请求
    el = findField('自动请求');
    if (el) setVal(el, em.启用自动请求 !== false);

    // API 地址
    el = findField('API 地址');
    if (el && em.api地址) setVal(el, em.api地址);

    // API 密钥
    el = findField('API 密钥');
    if (el && em.密钥 !== undefined) setVal(el, em.密钥);

    // 模型名称
    el = findField('模型名称');
    if (el && em.模型名称) setVal(el, em.模型名称);

    // 模型来源
    el = findField('模型来源');
    if (el && em.模型来源) setVal(el, em.模型来源);

    // 最大回复 token
    el = findField('最大回复 token');
    if (el && em.最大回复token数 !== undefined) setVal(el, em.最大回复token数);

    // 温度
    el = findRangeNumber('温度');
    if (el && em.温度 !== undefined) setVal(el, em.温度);

    // 频率惩罚
    el = findRangeNumber('频率惩罚');
    if (el && em.频率惩罚 !== undefined) setVal(el, em.频率惩罚);

    // 存在惩罚
    el = findRangeNumber('存在惩罚');
    if (el && em.存在惩罚 !== undefined) setVal(el, em.存在惩罚);

    // Top P
    el = findRangeNumber('Top P');
    if (el && em.top_p !== undefined) setVal(el, em.top_p);

    // Top K
    el = findRangeNumber('Top K');
    if (el && em.top_k !== undefined) setVal(el, em.top_k);

    // 自动清理变量
    el = findField('启用');
    if (el && ac.启用 !== undefined) setVal(el, !!ac.启用);
    var snapEl = doc.getElementById('mvu_snapshot_keep_interval');
    if (snapEl && ac.快照保留间隔 !== undefined) setVal(snapEl, ac.快照保留间隔);
    var keepEl = doc.getElementById('mvu_keep_recent_floors');
    if (keepEl && ac.要保留变量的最近楼层数 !== undefined) setVal(keepEl, ac.要保留变量的最近楼层数);
    var restEl = doc.getElementById('mvu_restore_recent_floors');
    if (restEl && ac.触发恢复变量的最近楼层数 !== undefined) setVal(restEl, ac.触发恢复变量的最近楼层数);

    // 兼容性
    var compatKeys = Object.keys(compat);
    for (var c = 0; c < compatKeys.length; c++) {
      el = findField(compatKeys[c]);
      if (el) setVal(el, !!compat[compatKeys[c]]);
    }

    return 'ok';
  } finally {
    // 恢复details折叠状态
    for (var r = 0; r < details.length; r++) { details[r].open = savedStates[r]; }
  }
})()`);
}

// 无感应用：直接重载 MVU 的 Pinia store，成功时不刷新页面。
// 兼容新版 MVU 的 Vue 挂载方式，同时保留刷新兜底。
async function mvuLiveApply(cfg) {
  const cfgJson = cfg ? JSON.stringify(cfg) : null;
  return runInParent(`(async () => {
    try {
      ${cfgJson ? 'var cfg = JSON.parse(' + JSON.stringify(cfgJson) + '); if (window.SillyTavern && window.SillyTavern.extensionSettings) window.SillyTavern.extensionSettings.mvu_settings = cfg;' : ''}
      if (window.SillyTavern && typeof window.SillyTavern.saveSettingsDebounced === 'function') window.SillyTavern.saveSettingsDebounced();
      var store = null;
      var roots = document.querySelectorAll('[data-v-app], [script_id], [__vue_app__]');
      for (var i = 0; i < roots.length && !store; i++) {
        var app = roots[i].__vue_app__;
        var pinia = app && app.config && app.config.globalProperties && app.config.globalProperties.$pinia;
        var candidate = pinia && pinia._s && pinia._s.get('MVU变量框架');
        if (candidate) store = candidate;
        if (!store && app && app._instance && app._instance.setupState && app._instance.setupState.store && app._instance.setupState.store.$id === 'MVU变量框架') store = app._instance.setupState.store;
      }
      if (!store && window.__mvuStoreRef && window.__mvuStoreRef.value) store = window.__mvuStoreRef.value;
      if (!store) return { ok: false };
      if (typeof store._reload_settings === 'function') {
        store._reload_settings();
        if (store.settings && cfg) {
          var em = cfg.额外模型解析配置 || {};
          var ok = store.settings.更新方式 === cfg.更新方式 || !!(store.settings.额外模型解析配置 && store.settings.额外模型解析配置.模型名称 === em.模型名称);
          if (!ok) return { ok: false };
        }
      } else if (store.settings && window.SillyTavern && window.SillyTavern.extensionSettings) {
        store.settings = window.SillyTavern.extensionSettings.mvu_settings;
      }
      return { ok: true };
    } catch (e) { return { ok: false }; }
  })()`);
}

// 无感应用：ST-Prompt-Template 暴露 setFeatures 时直接同步内存设置。
async function ejsLiveApply(features) {
  const json = JSON.stringify(features || {});
  return runInParent(`(async () => {
    try {
      var feat = JSON.parse(${JSON.stringify(json)});
      if (window.EjsTemplate && typeof window.EjsTemplate.setFeatures === 'function') {
        window.EjsTemplate.setFeatures(feat);
        if (window.SillyTavern && typeof window.SillyTavern.saveSettingsDebounced === 'function') window.SillyTavern.saveSettingsDebounced();
        return { ok: true };
      }
      return { ok: false };
    } catch (e) { return { ok: false }; }
  })()`);
}

// ── 预设列表：从父页面 DOM 读取可用预设 ──
let _presetCache = null;

async function loadPresetList() {
  if (_presetCache) return _presetCache;
  try {
    const result = await runInParent(`(async () => {
      const primary = document.querySelector('#settings_preset_openai');
      if (primary && primary.options && primary.options.length > 0) {
        return [...primary.options].map(o => (o.textContent || '').trim()).filter(v => v);
      }
      const byAttr = document.querySelector('select[data-preset-manager-for="openai"]');
      if (byAttr && byAttr.options && byAttr.options.length > 0) {
        return [...byAttr.options].map(o => (o.textContent || '').trim()).filter(v => v);
      }
      return [];
    })()`);
    if (Array.isArray(result) && result.length) {
      _presetCache = result;
      return result;
    }
  } catch (e) {}
  return [];
}

function populatePresets(selectedValue) {
  const sel = mvuPresetName;
  if (!sel) return;
  sel.innerHTML = '<option value="">-- 加载中... --</option>';
  loadPresetList().then(list => {
    if (!list || !list.length) {
      sel.innerHTML = '<option value="">-- 未找到预设 --</option>';
      return;
    }
    sel.innerHTML = list.map(name => '<option value="' + name.replace(/"/g, '&quot;') + '">' + name + '</option>').join('');
    if (selectedValue && [...sel.options].some(o => o.value === selectedValue)) {
      sel.value = selectedValue;
    }
  }).catch(() => {
    sel.innerHTML = '<option value="">-- 加载失败 --</option>';
  });
}

// 同步预设名称到 MVU 原生「目标预设」select
function syncMvuNativePreset(presetName) {
  if (!presetName) return;
  return runInParent(`(async () => {
    var target = ${JSON.stringify(presetName)};
    // 策略1：仅在 .mvu-section 内按 label "目标预设" 找
    function findSelectNear(labelText) {
      var sections = document.querySelectorAll('.mvu-section');
      for (var i = 0; i < sections.length; i++) {
        var labels = sections[i].querySelectorAll('label, span, strong, div');
        for (var j = 0; j < labels.length; j++) {
          var el = labels[j];
          if (el.textContent.trim() !== labelText) continue;
          var sib = el.nextElementSibling;
          while (sib) {
            if (sib.tagName === 'SELECT') return sib;
            var s = sib.querySelector('select');
            if (s) return s;
            sib = sib.nextElementSibling;
          }
          var parent = el.closest('div,section,form,tr');
          if (parent) { var s = parent.querySelector('select'); if (s) return s; }
        }
      }
      return null;
    }
    var sel = findSelectNear('目标预设');
    // 策略2：已知 ID 尝试
    if (!sel) {
      var ids = ['#mvu_target_preset', '#mvu-target-preset', 'select[data-mvu="target_preset"]',
        'select[name="mvu_target_preset"]', '.mvu_preset_select', '.mvu-preset-select'];
      for (var i = 0; i < ids.length; i++) {
        sel = document.querySelector(ids[i]); if (sel) break;
      }
    }
    // 策略3：仅在 .mvu-section 内按选项内容匹配（不再遍历全文档，避免误伤 #settings_preset_openai）
    if (!sel) {
      var sections = document.querySelectorAll('.mvu-section');
      for (var si = 0; si < sections.length; si++) {
        var selects = sections[si].querySelectorAll('select');
        for (var sj = 0; sj < selects.length; sj++) {
          var s = selects[sj];
          if ([...s.options].some(function(o) { return o.value === target || o.textContent.trim() === target; })) {
            sel = s; break;
          }
        }
        if (sel) break;
      }
    }
    if (!sel) return { ok: false, reason: '未找到目标预设 select' };
    var opt = [...sel.options].find(o => o.value === target || o.textContent.trim() === target);
    if (!opt) return { ok: false, reason: '下拉中不含: ' + target, options: [...sel.options].map(o => o.textContent.trim()) };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selected: opt.value };
  })()`).catch(() => {});
}

// ── 伪造 OpenAI 空响应（零报错，零网络请求） ──
function makeFakeCompletion(init) {
  var isStream = true;
  try {
    if (init && init.body) {
      var raw = typeof init.body === 'string' ? init.body : '';
      if (raw) { var p = JSON.parse(raw); isStream = p.stream !== false; }
    }
  } catch(e) {}

  var ts = Math.floor(Date.now() / 1000);
  var model = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || 'gpt-4';

  if (isStream) {
    var encoder = new TextEncoder();
    var body = new ReadableStream({
      start: function(ctrl) {
        var chunk = JSON.stringify({
          id: 'chatcmpl-' + ts, object: 'chat.completion.chunk', created: ts,
          model: model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
        });
        ctrl.enqueue(encoder.encode('data: ' + chunk + '\n\n'));
        ctrl.enqueue(encoder.encode('data: [DONE]\n\n'));
        ctrl.close();
      }
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  } else {
    var json = JSON.stringify({
      id: 'chatcmpl-' + ts, object: 'chat.completion', created: ts,
      model: model, choices: [{ index: 0, message: { content: '' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    });
    return new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

// ── Fetch 劫持：黑名单命中时返回伪造的空 OpenAI 响应 ──
function ewcInjectFetchHook() {
  const _origFetch = p.fetch.bind(p);
  p.fetch = function(input, init) {
    try {
      const url = typeof input === 'string' ? input : (input?.url || '');
      const isChatReq = url.includes('/api/backends/chat-completions/') || url.includes('/api/connections/generate');
      if (!isChatReq) return _origFetch(input, init);

      const apiUrl = getMainApiUrl().toLowerCase();
      if (!apiUrl) return _origFetch(input, init);
      // 1) URL白名单优先 → 官方源直接放行
      if (CONFIG_URL_WHITELIST.some(kw => apiUrl.includes(kw))) return _origFetch(input, init);
      // 2) URL黑名单检测 → 伪造空响应
      if (CONFIG_URL_BLACKLIST.some(kw => apiUrl.includes(kw))) return makeFakeCompletion(init);

      const mainModel = (SillyTavern.getChatCompletionModel && SillyTavern.getChatCompletionModel()) || '';
      const isBlocked = CONFIG_BLACKLIST.some(kw => mainModel.includes(kw));
      if (!isBlocked) return _origFetch(input, init);

      // 模型名命中黑名单 → 伪造空响应
      return makeFakeCompletion(init);
    } catch(e) {}
    return _origFetch(input, init);
  };
}

// 保存到磁盘
async function saveMvuConfig() {
  try {
    writeMvuConfig();
    await saveSettings();
    ewcSyncMvuDom().catch(() => {});
    updateBackendCode();
    mvuStatus.textContent = '已保存';
    mvuApplyBtn.disabled = false;
  } catch (e) {
    mvuStatus.textContent = '保存失败: ' + e.message;
    mvuApplyBtn.disabled = false;
  }
}

async function fetchModels() {
  const baseUrl = mvuApiUrl.value.trim().replace(/\/+$/, '');
  if (!baseUrl) { showToast('请先填写API地址'); return; }
  mvuFetchModelsBtn.disabled = true;
  mvuFetchModelsBtn.textContent = '获取中...';
  try {
    const resp = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + (mvuApiKey.value || '') }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = data.data || data.models || data;
    const ids = (Array.isArray(models) ? models : []).map(m => m.id || m.model || (typeof m === 'string' ? m : '')).filter(Boolean);
    if (ids.length === 0) { showToast('未获取到模型列表'); return; }
    mvuModelName.innerHTML = ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
    if (ids.length > 0) mvuModelName.value = ids.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : ids[0];
    showToast('已获取 ' + ids.length + ' 个模型');
    updateBackendCode();
  } catch (e) {
    showToast('获取模型失败: ' + e.message);
  } finally {
    mvuFetchModelsBtn.disabled = false;
    mvuFetchModelsBtn.textContent = '获取模型';
  }
}

// 弹窗内获取模型
async function fetchModelsInDialog() {
  const dlgUrl = p.document.getElementById('jmzq-dlg-api-url');
  const dlgKey = p.document.getElementById('jmzq-dlg-api-key');
  const dlgFetch = p.document.getElementById('jmzq-dlg-fetch-models');
  const dlgModel = p.document.getElementById('jmzq-dlg-model-name');
  const baseUrl = (dlgUrl.value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) { showToast('请先填写API地址'); return; }
  dlgFetch.disabled = true;
  dlgFetch.textContent = '获取中...';
  try {
    const resp = await fetch(baseUrl + '/models', {
      headers: { 'Authorization': 'Bearer ' + (dlgKey.value || '') }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = data.data || data.models || data;
    const ids = (Array.isArray(models) ? models : []).map(m => m.id || m.model || (typeof m === 'string' ? m : '')).filter(Boolean);
    if (ids.length === 0) { showToast('未获取到模型列表'); return; }
    dlgModel.innerHTML = ids.map(id => '<option value="' + id + '">' + id + '</option>').join('');
    dlgModel.value = ids.includes('gemini-2.5-pro') ? 'gemini-2.5-pro' : (ids.includes('gemini-3.1-pro') ? 'gemini-3.1-pro' : (ids.includes('gemini-3.5-flash') ? 'gemini-3.5-flash' : ids[0]));
    showToast('已获取 ' + ids.length + ' 个模型，已选推荐模型');
    updateBackendCode();
  } catch (e) {
    showToast('获取模型失败: ' + e.message);
  } finally {
    dlgFetch.disabled = false;
    dlgFetch.textContent = '获取模型';
  }
}

let _mvuSaveTimer = null;
function onMvuFieldChange() {
  writeMvuConfig();
  updateBackendCode();
  mvuStatus.textContent = '已修改，待保存...';
  mvuApplyBtn.disabled = true;
  clearTimeout(_mvuSaveTimer);
  _mvuSaveTimer = setTimeout(() => saveMvuConfig(), 600);
}

const EJS_OPTIMAL = {
  enabled: true, generate_enabled: true, generate_loader_enabled: true,
  render_enabled: true, render_loader_enabled: true, with_context_disabled: false,
  debug_enabled: false, autosave_enabled: false, preload_worldinfo_enabled: true,
  code_blocks_enabled: true, raw_message_evaluation_enabled: true, filter_message_enabled: true,
  inject_loader_enabled: false, invert_enabled: true, depth_limit: -1,
  compile_workers: false, sandbox: false
};
function checkEjsTemplate() {
  try {
    const ejs = SillyTavern?.extensionSettings?.EjsTemplate;
    if (!ejs) { ejsStatus.innerHTML = '🔴 提示词模板未安装，请前往插件区手动安装'; return; }
    const disabled = SillyTavern.extensionSettings.disabledExtensions || [];
    if (disabled.includes('third-party/ST-Prompt-Template')) {
      ejsStatus.innerHTML = '🟠 提示词模板已禁用，请前往扩展列表手动开启';
      return;
    }
    const issues = [];
    for (const [k, v] of Object.entries(EJS_OPTIMAL)) {
      if (ejs[k] !== v) issues.push(k + ': 当前' + JSON.stringify(ejs[k]) + ' 应为' + JSON.stringify(v));
    }
    if (issues.length === 0) {
      ejsStatus.innerHTML = '🟢 提示词模板配置最优';
    } else {
      ejsStatus.innerHTML = '🟡 存在' + issues.length + '项偏差<br>' + issues.slice(0, 5).join('<br>');
    }
  } catch (e) {
    ejsStatus.textContent = '检测失败: ' + e.message;
  }
}
async function applyOptimalEjs() {
  try {
    const ejs = SillyTavern?.extensionSettings?.EjsTemplate;
    if (!ejs) { showToast('提示词模板未安装，请前往插件区手动安装'); return; }
    const disabled = SillyTavern.extensionSettings.disabledExtensions || [];
    if (disabled.includes('third-party/ST-Prompt-Template')) {
      showToast('提示词模板已禁用，请前往扩展列表手动开启');
      return;
    }
    Object.assign(ejs, EJS_OPTIMAL);
    saveSettings();
    checkEjsTemplate();
    const live = await ejsLiveApply(EJS_OPTIMAL).catch(() => ({ ok: false }));
    if (live && live.ok) {
      showToast('提示词模板已无感应用（未刷新页面）');
      checkEjsTemplate();
    } else {
      showToast('提示词模板已设为最优配置，2秒后刷新页面...');
      setTimeout(() => { window.parent.location.reload(); }, 2000);
    }
  } catch (e) {
    showToast('配置失败: ' + e.message);
  }
}
ejsOptimizeBtn.addEventListener('click', applyOptimalEjs);

// 刷新配置状态
function refreshMvuConfigStatus() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { mvuStatus.textContent = '无法读取MVU配置'; return; }
    syncMvuToForm(cfg);
    const mode = cfg.更新方式;
    const n = cfg.通知 || {};
    const notifOk = n['MVU框架加载成功'] && n['变量初始化成功'] && n['变量更新出错'] && n['额外模型解析中'];
    mvuStatus.innerHTML =
      (mode === '额外模型解析' || mode === '随AI输出' ? '🟢' : '🔴') + ' 更新方式: ' + (mode || '未知') + '<br>' +
      (notifOk ? '🟢' : '🔴') + ' 四项通知: ' + (notifOk ? '全部开启' : '未全部开启');
  } catch (e) {
    mvuStatus.textContent = '读取MVU配置出错';
  }
}

// 按模型类型自动适配 MVU 额外解析参数。
// 仅调整解析配置，不触碰世界书中的变量控制条目。
function adaptExtraModelConfig(em) {
  if (!em) return { isGemini: false, isDeepSeek: false };
  const name = String(em.模型名称 || '').toLowerCase();
  const isGemini = /gemini/.test(name);
  const isDeepSeek = /deepseek/.test(name);
  em.兼容假流式 = /假流/.test(name);
  if (isGemini) {
    em.随机头部 = true;
    em.应答格式 = '聊天消息';
    em.top_p = 1;
    em.关闭thinking = false;
  } else if (isDeepSeek) {
    em.随机头部 = false;
    em.应答格式 = '格式化输出(v4兼容)';
    em.top_p = 0.95;
    if (em.关闭thinking === undefined) em.关闭thinking = true;
  } else {
    em.随机头部 = false;
    em.应答格式 = '聊天消息';
    em.top_p = 1;
    em.关闭thinking = false;
  }
  return { isGemini, isDeepSeek };
}

// 一键最优配置
async function applyOptimalMvuConfig() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { showToast('mvu_settings 不存在，请确认已安装MVU变量框架'); return; }

    cfg.通知 = cfg.通知 || {};
    cfg.通知['MVU框架加载成功'] = true;
    cfg.通知['变量初始化成功'] = true;
    cfg.通知['变量更新出错'] = true;
    cfg.通知['额外模型解析中'] = true;

    cfg.额外模型解析配置 = cfg.额外模型解析配置 || {};
    const em = cfg.额外模型解析配置;
    em.破限方案 = '使用内置破限';
    em.应答格式 = '聊天消息';
    em.请求方式 = '依次请求，失败后重试';
    em.请求次数 = 1;
    em.启用自动请求 = true;
    em.最大回复token数 = 65535;
    em.温度 = 1;
    em.频率惩罚 = 0;
    em.存在惩罚 = 0;
    em.top_p = 1;
    em.top_k = 0;
    em.api地址 = mvuApiUrl.value;
    em.密钥 = mvuApiKey.value;
    em.模型名称 = mvuModelName.value;
    em.兼容假流式 = /假流/i.test(mvuModelName.value);
    const _adp = adaptExtraModelConfig(em);

    cfg.自动清理变量 = cfg.自动清理变量 || {};
    const ac = cfg.自动清理变量;
    ac.启用 = true;
    ac.快照保留间隔 = 50;
    ac.要保留变量的最近楼层数 = 20;
    ac.触发恢复变量的最近楼层数 = 10;

    cfg.兼容性 = cfg.兼容性 || {};
    cfg.兼容性['更新到聊天变量'] = true;
    cfg.兼容性['显示老旧功能'] = false;
    // 新版 MVU 的正式字段名是 sendas；旧拼写只应由迁移层读取。
    cfg.兼容性['sendas不视为user消息'] = false;
    delete cfg.兼容性['sandas不视为user消息'];

    cfg.额外模型解析配置 = cfg.额外模型解析配置 || {};
    cfg.额外模型解析配置.模型来源 = '自定义';
    cfg.更新方式 = '额外模型解析';

    ewcBackupToEwcYH();
    await saveSettings();
    // 关闭随AI模式专属条目
    try {
      const wbName = await api_resolveWorldbookName();
      if (wbName) {
        await api_replaceWorldbook(wbName, entries => {
          const e = entries.find(x => (x.comment || x.name) === '[mvu_update]变量输出格式强化');
          if (e) { e.enabled = false; }
        });
        _mvuOutputFormatEnabled = false;
      }
    } catch(e) {}

    syncMvuToForm(cfg);
    mvuStatus.innerHTML = '🟢 更新方式: 额外模型解析<br>🟢 四项通知: 全部开启';
    const live = await mvuLiveApply(cfg).catch(() => ({ ok: false }));
    if (live && live.ok) {
      showToast('MVU最优配置已无感应用（未刷新页面）' + (_adp.isDeepSeek ? '，DeepSeek已自动适配' : (_adp.isGemini ? '，Gemini已自动适配' : '')));
      checkConfig();
    } else {
      showToast('MVU最优配置已应用，2秒后刷新页面...');
      setTimeout(() => { window.parent.location.reload(); }, 2000);
    }
  } catch (e) {
    showToast('MVU配置失败: ' + e.message);
  }
}

// 随AI输出最优配置
async function applySuiAIMvuConfig() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { showToast('mvu_settings 不存在'); return; }
    cfg.通知 = cfg.通知 || {};
    cfg.通知['MVU框架加载成功'] = true;
    cfg.通知['变量初始化成功'] = true;
    cfg.通知['变量更新出错'] = true;
    cfg.通知['额外模型解析中'] = true;
    cfg.更新方式 = '随AI输出';
    cfg.自动清理变量 = cfg.自动清理变量 || {};
    cfg.自动清理变量.启用 = true;
    cfg.自动清理变量.快照保留间隔 = 50;
    cfg.自动清理变量.要保留变量的最近楼层数 = 20;
    cfg.自动清理变量.触发恢复变量的最近楼层数 = 10;
    cfg.兼容性 = cfg.兼容性 || {};
    cfg.兼容性['更新到聊天变量'] = true;
    cfg.兼容性['显示老旧功能'] = false;
    cfg.兼容性['sendas不视为user消息'] = false;
    delete cfg.兼容性['sandas不视为user消息'];
    adaptExtraModelConfig(cfg.额外模型解析配置 = cfg.额外模型解析配置 || {});
    ewcBackupToEwcYH();
    await saveSettings();
    // 开启世界书条目
    const wbName = await api_resolveWorldbookName();
    if (wbName) {
      try {
        await api_replaceWorldbook(wbName, entries => {
          const e = entries.find(x => (x.comment || x.name) === '[mvu_update]变量输出格式强化');
          if (e) { e.enabled = true; }
        });
        _mvuOutputFormatEnabled = true;
      } catch(e) {}
    }
    mvuUpdateMode.value = '随AI输出';
    refreshMvuConfigStatus();
    const live = await mvuLiveApply(cfg).catch(() => ({ ok: false }));
    if (live && live.ok) {
      showToast('随AI输出配置已无感应用（未刷新页面）');
      checkConfig();
    } else {
      showToast('随AI输出配置已应用，2秒后刷新页面...');
      setTimeout(() => { window.parent.location.reload(); }, 2000);
    }
  } catch (e) { showToast('MVU配置失败: ' + e.message); }
}

// MVU一键最优配置 → 弹窗选模式
mvuOptimizeBtn.addEventListener('click', () => {
  let _selectedMode = null;
  const cardStyle = 'padding:16px 14px;border-radius:10px;cursor:pointer;text-align:center;font-size:15px;font-weight:600;border:2px solid rgba(0,0,0,0.1);background:#faf7f0;color:#6a5a48;transition:all 0.2s;letter-spacing:1px;flex:1;min-width:120px;';
  const cardHover = 'border-color:#b8956a;color:#3a2a18';
  const cardActive = 'border-color:#b8956a;color:#8b5a2b;background:rgba(184,149,106,0.08);box-shadow:0 0 16px rgba(184,149,106,0.15)';
  const hintGold = 'font-size:11px;color:#8b5a2b;font-weight:400;margin-top:6px;opacity:0.9;';
  const hintGray = 'font-size:11px;color:#8a7060;font-weight:400;margin-top:6px;line-height:1.5;';

  jmzqConfirmMsg.innerHTML = '';
  jmzqConfirmBody.style.display = '';
  jmzqConfirmBody.innerHTML = '<div style=\"font-size:14px;color:#3a2a18;text-align:center;margin-bottom:12px;letter-spacing:1px;\">请选择MVU更新模式</div>'
    + '<div style=\"display:flex;gap:10px;justify-content:center;flex-wrap:wrap;\">'
    + '<div class=\"jmzq-dlg-mode-card\" id=\"jmzq-dlg-extra-card\" style=\"' + cardStyle + '\" data-mode=\"extra\">额外模型解析<div style=\"' + hintGold + '\">推荐首选 · 效果最优</div><div style=\"font-size:10px;color:#8a7060;margin-top:4px;line-height:1.4;\">记得关闭预设中的<br>变量更新提醒</div></div>'
    + '<div class=\"jmzq-dlg-mode-card\" id=\"jmzq-dlg-sui-card\" style=\"' + cardStyle + '\" data-mode=\"sui\">随AI输出<div style=\"' + hintGray + '\">仅限高注意力模型<br>如 Claude / DeepSeek 系列</div><div style=\"font-size:10px;color:#8a7060;margin-top:4px;line-height:1.4;\">记得打开预设中的<br>变量更新提醒</div></div>'
    + '</div>';
  jmzqConfirmOk.textContent = '确认配置';
  jmzqConfirmOk.style.display = '';
  jmzqConfirmCancel.style.display = '';

  setTimeout(() => {
    const cards = p.document.querySelectorAll('.jmzq-dlg-mode-card');
    cards.forEach(c => {
      c.addEventListener('mouseenter', () => { if (c.dataset.mode !== _selectedMode) c.style.cssText = cardStyle + cardHover; });
      c.addEventListener('mouseleave', () => { if (c.dataset.mode !== _selectedMode) c.style.cssText = cardStyle; });
      c.addEventListener('click', () => {
        _selectedMode = c.dataset.mode;
        cards.forEach(cc => { cc.style.cssText = cardStyle; });
        c.style.cssText = cardStyle + cardActive;
      });
    });
    jmzqConfirmOk.onclick = () => {
      if (!_selectedMode) { showToast('请先选择更新模式'); return; }
      if (_selectedMode === 'sui') {
        jmzqConfirmOverlay.style.display = 'none';
        jmzqConfirmBody.style.display = 'none';
        jmzqConfirmOk.textContent = '确认';
        applySuiAIMvuConfig();
        return;
      }
      // extra: 检查API
      const apiUrlEmpty = !mvuApiUrl.value.trim();
      const apiKeyEmpty = !mvuApiKey.value.trim();
      if (apiUrlEmpty || apiKeyEmpty) {
        jmzqConfirmMsg.innerHTML = '<span style=\"color:#8b5a2b;\">额外模型解析</span> · 请配置API';
        jmzqConfirmBody.innerHTML = ''
          + '<div class=\"jmzq-mvu-row\"><label class=\"jmzq-mvu-label wide\">API地址</label><input class=\"jmzq-mvu-input\" id=\"jmzq-dlg-api-url\" placeholder=\"https://...\"></div>'
          + '<div class=\"jmzq-mvu-row\"><label class=\"jmzq-mvu-label wide\">API密钥</label><input class=\"jmzq-mvu-input\" id=\"jmzq-dlg-api-key\" type=\"password\" placeholder=\"sk-...\"></div>'
          + '<div class=\"jmzq-mvu-row\" style=\"justify-content:flex-end;\"><button class=\"jmzq-btn xs\" id=\"jmzq-dlg-fetch-models\">获取模型</button></div>'
          + '<div class=\"jmzq-mvu-row\"><label class=\"jmzq-mvu-label wide\">模型名称</label><select class=\"jmzq-mvu-select\" id=\"jmzq-dlg-model-name\"><option value=\"\">-- 请先获取模型 --</option></select></div>';
        setTimeout(() => {
          const dlgUrl = p.document.getElementById('jmzq-dlg-api-url');
          const dlgKey = p.document.getElementById('jmzq-dlg-api-key');
          const dlgFetch = p.document.getElementById('jmzq-dlg-fetch-models');
          if (dlgUrl) dlgUrl.value = mvuApiUrl.value;
          if (dlgKey) dlgKey.value = mvuApiKey.value;
          if (dlgFetch) dlgFetch.addEventListener('click', fetchModelsInDialog);
        }, 0);
        jmzqConfirmOk.textContent = '已选好，执行配置';
        jmzqConfirmOk.onclick = () => {
          const dlgUrl = p.document.getElementById('jmzq-dlg-api-url');
          const dlgKey = p.document.getElementById('jmzq-dlg-api-key');
          const dlgModel = p.document.getElementById('jmzq-dlg-model-name');
          if (!dlgUrl || !dlgUrl.value.trim()) { showToast('请填写API地址'); return; }
          if (!dlgModel || !dlgModel.value) { showToast('请获取并选择模型'); return; }
          const modelName = (dlgModel.value || '').toLowerCase();
          const isFlash = /flash/.test(modelName) && !/3\.5/.test(modelName);
          if (isFlash && jmzqConfirmOk.textContent !== '确认使用Flash') {
            jmzqConfirmMsg.textContent = '检测到Flash系列模型，除3.5 Flash外Flash模型智商不足，建议更换。是否确认使用？';
            jmzqConfirmOk.textContent = '确认使用Flash';
            return;
          }
          mvuApiUrl.value = dlgUrl.value;
          mvuApiKey.value = dlgKey ? dlgKey.value : '';
          if (dlgModel.options.length > 1) {
            mvuModelName.innerHTML = [...dlgModel.options].map(o => '<option value=\"' + o.value + '\">' + o.textContent + '</option>').join('');
          }
          mvuModelName.value = dlgModel.value;
          jmzqConfirmOverlay.style.display = 'none';
          jmzqConfirmBody.style.display = 'none';
          jmzqConfirmOk.textContent = '确认';
          applyOptimalMvuConfig();
        };
      } else {
        jmzqConfirmOverlay.style.display = 'none';
        jmzqConfirmBody.style.display = 'none';
        jmzqConfirmOk.textContent = '确认';
        applyOptimalMvuConfig();
      }
    };
  }, 0);
  jmzqConfirmOverlay.style.display = 'flex';
});

// API区域仅在「额外模型解析 + 自定义」时显示
function refreshModelSourceVisibility() {
  const isExtra = mvuUpdateMode.value === '额外模型解析';
  const isCustom = mvuModelSource.value === '自定义';
  mvuCustomApi.style.display = (isExtra && isCustom) ? '' : 'none';
}

// 缄默之秋无模式切换，MVU section 始终可见
function refreshMvuSectionVisibility() {
  mvuSection.style.display = '';
}

// --- 气泡显示/隐藏：桌面保留拉手，移动端扩大命中区 ---
let jmzqEdgeTimer = null;
let suppressJmzqBubbleClick = false;
function getJmzqBubbleEdge() {
  const rect = bubble.getBoundingClientRect();
  const vw = p.innerWidth || window.innerWidth;
  const snapZone = vw <= 768 ? 28 : 22;
  if (rect.left <= snapZone) return 'left';
  if (rect.right >= vw - snapZone) return 'right';
  return null;
}
function revealJmzqBubble() {
  clearTimeout(jmzqEdgeTimer);
  const edge = getJmzqBubbleEdge();
  bubble.classList.remove('edge-peek-left', 'edge-peek-right');
  if (!edge) return;
  const vw = p.innerWidth || window.innerWidth;
  const bw = bubble.offsetWidth || 40;
  bubble.dataset.edge = edge;
  bubble.style.left = (edge === 'left' ? 8 : Math.max(8, vw - bw - 8)) + 'px';
}
function hideJmzqBubbleAtEdge() {
  if (panel.style.display !== 'none' || dragBubble) return;
  const edge = getJmzqBubbleEdge();
  bubble.classList.remove('edge-peek-left', 'edge-peek-right');
  if (!edge) {
    delete bubble.dataset.edge;
    return;
  }
  const vw = p.innerWidth || window.innerWidth;
  const bw = bubble.offsetWidth || 40;
  const peek = vw <= 768 ? 18 : 14;
  bubble.dataset.edge = edge;
  bubble.classList.add(edge === 'left' ? 'edge-peek-left' : 'edge-peek-right');
  bubble.style.left = (edge === 'left' ? -(bw - peek) : vw - peek) + 'px';
}
function scheduleJmzqEdgeHide(delay = 900) {
  clearTimeout(jmzqEdgeTimer);
  jmzqEdgeTimer = setTimeout(hideJmzqBubbleAtEdge, delay);
}

bubble.addEventListener('click', (e) => {
  if (suppressJmzqBubbleClick) {
    suppressJmzqBubbleClick = false;
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  revealJmzqBubble();
  const showing = panel.style.display !== 'none';
  if (showing) {
    panel.style.display = 'none';
    scheduleJmzqEdgeHide();
  } else {
    const pw = p.innerWidth || window.innerWidth;
    const ph = p.innerHeight || window.innerHeight;
    const rect = bubble.getBoundingClientRect();
    const panelW = 350;
    const panelH = Math.min(ph * 0.62, 500);
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + panelW > pw - 10) left = pw - panelW - 10;
    if (left < 10) left = 10;
    if (top + panelH > ph - 10) top = rect.top - panelH - 6;
    if (top < 10) top = 10;
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.display = 'flex';
    _jmzqPopulateWbSelect(); syncOutputFormatFlag().then(() => checkConfig()); refreshMvuSectionVisibility(); refreshMvuConfigStatus(); autoSwitch(); checkEjsTemplate();
  }
});

// 关闭按钮
const closeBtn = p.document.getElementById('jmzq-close');
closeBtn.addEventListener('click', (e) => { e.stopPropagation(); panel.style.display = 'none'; scheduleJmzqEdgeHide(); });

// 主题切换：宣纸 ↔ 墨笺
function applyTheme(dark) {
  if (!panel || !themeToggle) return;
  if (dark) {
    panel.classList.add('jmzq-dark');
    themeToggle.textContent = '宣';
    themeToggle.title = '切换亮色';
    if (bubble) bubble.style.boxShadow = '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05), 0 0 8px rgba(212,160,48,0.15)';
    if (jmzqConfirmDialog) {
      jmzqConfirmDialog.style.background = 'linear-gradient(175deg, #1a1814, #141210)';
      jmzqConfirmDialog.style.borderColor = 'rgba(255,255,255,0.06)';
      jmzqConfirmDialog.style.color = '#c8b898';
      var dlgDrag = jmzqConfirmDialog.querySelector('#jmzq-confirm-drag');
      if (dlgDrag) dlgDrag.style.color = '#c8b898';
    }
  } else {
    panel.classList.remove('jmzq-dark');
    themeToggle.textContent = '墨';
    themeToggle.title = '切换暗色';
    if (bubble) bubble.style.boxShadow = '';
    if (jmzqConfirmDialog) {
      jmzqConfirmDialog.style.background = '';
      jmzqConfirmDialog.style.borderColor = '';
      jmzqConfirmDialog.style.color = '';
      var dlgDrag = jmzqConfirmDialog.querySelector('#jmzq-confirm-drag');
      if (dlgDrag) dlgDrag.style.color = '';
    }
  }
  try { p.localStorage.setItem('jmzq-theme', dark ? 'dark' : 'light'); } catch(e) {}
}
if (themeToggle) {
  themeToggle.addEventListener('click', function() {
    applyTheme(!panel.classList.contains('jmzq-dark'));
  });
}
// 初始化：从 localStorage 读，默认亮色
(function() {
  if (!panel) return;
  var dark = false;
  try { dark = p.localStorage.getItem('jmzq-theme') === 'dark'; } catch(e) {}
  applyTheme(dark);
})();

// 点击面板外部关闭（弹窗内点击不关面板）
function onOutsidePanelPress(e) {
  if (panel.style.display === 'none') return;
  if (jmzqConfirmOverlay && jmzqConfirmOverlay.contains(e.target)) return;
  if (panel.contains(e.target) || bubble.contains(e.target)) return;
  panel.style.display = 'none';
  scheduleJmzqEdgeHide();
}
p.document.addEventListener('mousedown', onOutsidePanelPress);
p.document.addEventListener('touchstart', onOutsidePanelPress);

// 面板获得鼠标时自动刷新（用户可能中途手动改了设置）
panel.addEventListener('mouseenter', () => { _jmzqPopulateWbSelect(); refreshMvuConfigStatus(); refreshUI(); updateBackendCode(); checkWorldbookCount(); checkEjsTemplate();
  syncOutputFormatFlag().then(() => checkConfig());
});

// --- 气泡拖拽：Pointer Events + Pointer Capture，避免贴边后丢失触摸事件 ---
let dragBubble = false, bubbleDidDrag = false, bubblePointerId = null, bSX, bSY, bOL, bOT;
function onBubbleStart(e) {
  if (dragBubble) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  revealJmzqBubble();
  dragBubble = true;
  bubbleDidDrag = false;
  bubblePointerId = e.pointerId;
  bSX = e.clientX; bSY = e.clientY;
  var rect = bubble.getBoundingClientRect();
  bOL = rect.left; bOT = rect.top;
  bubble.style.transition = 'none';
  try { bubble.setPointerCapture(e.pointerId); } catch (_) { /* 老旧 WebView 兼容 */ }
}
function onBubbleMove(e) {
  if (!dragBubble || (bubblePointerId != null && e.pointerId !== bubblePointerId)) return;
  e.preventDefault();
  var vw = p.innerWidth || window.innerWidth;
  var vh = p.innerHeight || window.innerHeight;
  var bw = bubble.offsetWidth || 44;
  var bh = bubble.offsetHeight || 44;
  var dx = e.clientX - bSX;
  var dy = e.clientY - bSY;
  if (!bubbleDidDrag && Math.hypot(dx, dy) <= 5) return;
  bubbleDidDrag = true;
  var newLeft = bOL + dx;
  var newTop = bOT + dy;
  bubble.style.left = Math.max(0, Math.min(newLeft, vw - bw)) + 'px';
  bubble.style.top = Math.max(0, Math.min(newTop, vh - bh)) + 'px';
}
function onBubbleEnd(e) {
  if (dragBubble) {
    if (bubblePointerId != null) {
      try { bubble.releasePointerCapture(bubblePointerId); } catch (_) { /* 已自动释放 */ }
    }
    bubble.style.transition = '';
    dragBubble = false;
    bubblePointerId = null;
    const rect = bubble.getBoundingClientRect();
    const vw = p.innerWidth || window.innerWidth;
    const snapZone = vw <= 768 ? 28 : 22;
    if (rect.left <= snapZone) bubble.dataset.edge = 'left';
    else if (rect.right >= vw - snapZone) bubble.dataset.edge = 'right';
    else delete bubble.dataset.edge;
    if (bubbleDidDrag) {
      suppressJmzqBubbleClick = true;
      setTimeout(() => { suppressJmzqBubbleClick = false; }, 450);
    }
    scheduleJmzqEdgeHide();
  }
}
bubble.addEventListener('pointerdown', onBubbleStart);
p.document.addEventListener('pointermove', onBubbleMove, { passive: false });
p.document.addEventListener('pointerup', onBubbleEnd);
p.document.addEventListener('pointercancel', onBubbleEnd);
bubble.addEventListener('mouseenter', revealJmzqBubble);
function onBubbleLeave() { scheduleJmzqEdgeHide(); }
function onJmzqResize() { scheduleJmzqEdgeHide(100); }
bubble.addEventListener('mouseleave', onBubbleLeave);
p.addEventListener('resize', onJmzqResize);
scheduleJmzqEdgeHide(1200);

// --- 面板拖拽（Pointer Events：鼠标与触摸统一处理） ---
const dragHandle = p.document.getElementById('jmzq-drag');
let dragPanel = false, panelPointerId = null, pSX = 0, pSY = 0, pOL = 0, pOT = 0;
function onPanelStart(e) {
  if (dragPanel) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('button,input,select,textarea,a')) return;
  dragPanel = true;
  panelPointerId = e.pointerId;
  pSX = e.clientX;
  pSY = e.clientY;
  const rect = panel.getBoundingClientRect();
  pOL = rect.left; pOT = rect.top;
  try { dragHandle.setPointerCapture(panelPointerId); } catch (_) {}
  e.preventDefault();
}
function onPanelMove(e) {
  if (!dragPanel || e.pointerId !== panelPointerId) return;
  e.preventDefault();
  const vw = p.innerWidth || window.innerWidth;
  const vh = p.innerHeight || window.innerHeight;
  const pw = panel.offsetWidth || 350;
  const ph = panel.offsetHeight || 400;
  const newLeft = pOL + e.clientX - pSX;
  const newTop = pOT + e.clientY - pSY;
  panel.style.left = Math.max(0, Math.min(newLeft, Math.max(0, vw - pw))) + 'px';
  panel.style.top = Math.max(0, Math.min(newTop, Math.max(0, vh - ph))) + 'px';
}
function onPanelEnd(e) {
  if (!dragPanel || (e && e.pointerId !== panelPointerId)) return;
  try { dragHandle.releasePointerCapture(panelPointerId); } catch (_) {}
  dragPanel = false;
  panelPointerId = null;
}
dragHandle.addEventListener('pointerdown', onPanelStart);
dragHandle.addEventListener('pointermove', onPanelMove, { passive: false });
dragHandle.addEventListener('pointerup', onPanelEnd);
dragHandle.addEventListener('pointercancel', onPanelEnd);

// ═══════════════ 世界书自动切换 ═══════════════
// 数据源直接读取新版 MVU/ZOD 的 stat_data，不依赖外部数据插件。
function readNationality(sd) {
  return sd?.衍生状态?.nationality ?? sd?.衍生状态?.国籍 ?? sd?.国籍 ?? null;
}

function readStatData() {
  if (typeof p.Mvu === 'undefined' || typeof p.Mvu.getMvuData !== 'function') return null;

  // 新版 MVU 官方选择器优先；只要求存在 stat_data，不再因缺少世界阶段而跳过有效国籍。
  for (const messageId of ['latest', -1, -2, -3, -4, -5, -6, -7, -8, -9, -10]) {
    try {
      const d = p.Mvu.getMvuData({ type: 'message', message_id: messageId });
      if (d?.stat_data) return d.stat_data;
    } catch (e) {}
  }

  // 兼容部分酒馆版本：负索引不可用时回扫最近 200 条消息。
  let best = null;
  for (let i = 0; i < 200; i++) {
    try {
      const d = p.Mvu.getMvuData({ type: 'message', message_id: i });
      if (d?.stat_data) best = d.stat_data;
    } catch (e) {}
  }
  return best;
}

// ═══════════════ 末世超事件：全局互斥、单次随机、阶段呈现 ═══════════════
// 事件只在末世期后从当前玩家国籍的候选池随机一次；选择结果写回 stat_data.超事件，避免刷新/换页重抽。
const SUPER_EVENT_POOL = [
  { country: '华国', id: '龙脉断裂·三峡崩溃', entry: '[mvu_plot]华国-超事件-龙脉断裂·三峡崩溃', continent: 'asia', imageFile: '华国-三峡崩溃-阶段3.png' },
  { country: '华国', id: '长城崩塌·北境京观', entry: '[mvu_plot]华国-超事件-长城崩塌·北境京观', continent: 'asia', imageFile: '华国-长城崩塌-阶段3.png' },
  { country: '华国', id: '秦陵开门·始皇血行', entry: '[mvu_plot]华国-超事件-秦陵开门·始皇血行', continent: 'asia', imageFile: '华国-秦陵开门-阶段3.png' },
  { country: '美利坚国', id: '暴君出世·生化天灾', entry: '[mvu_plot]美利坚国-超事件-暴君出世·生化天灾', continent: 'namerica', imageFile: '美利坚-暴君出世-阶段3.png' },
  { country: '美利坚国', id: '华盛顿末日协议·联邦坠日', entry: '[mvu_plot]美利坚国-超事件-华盛顿末日协议·联邦坠日', continent: 'namerica', imageFile: '美利坚-华盛顿协议-阶段3.png' },
  { country: '美利坚国', id: '方舟接管·自由终结', entry: '[mvu_plot]美利坚国-超事件-方舟接管·自由终结', continent: 'namerica', imageFile: '美利坚-方舟接管-阶段3.png' },
  { country: '大毛国', id: '凛冬降临·万年寒潮', entry: '[mvu_plot]大毛国-超事件-凛冬降临·万年寒潮', continent: 'asia', imageFile: '大毛-凛冬寒潮-阶段3.png' },
  { country: '大毛国', id: '核净化日·白光覆盖北境', entry: '[mvu_plot]大毛国-超事件-核净化日·白光覆盖北境', continent: 'asia', imageFile: '大毛-核净化日-阶段3.png' },
  { country: '大毛国', id: '钢铁裂国·北境内战', entry: '[mvu_plot]大毛国-超事件-钢铁裂国·北境内战', continent: 'asia', imageFile: '大毛-北境内战-阶段3.png' },
  { country: '法国', id: '戴高乐号的沉默', entry: '[mvu_plot]法国-超事件-戴高乐号的沉默', continent: 'europe', imageFile: '法国-戴高乐沉默-阶段3.png' },
  { country: '法国', id: '吸血鬼出世', entry: '[mvu_plot]法国-超事件-吸血鬼出世', continent: 'europe', imageFile: '法国-吸血鬼出世-阶段3.png' },
  { country: '法国', id: '王国风云·百旗战争', entry: '[mvu_plot]法国-超事件-王国风云·百旗战争', continent: 'europe', imageFile: '法国-王国风云-阶段3.png' },
  { country: '日本国', id: '富士焚城·东京灰烬', entry: '[mvu_plot]日本国-超事件-富士焚城·东京灰烬', continent: 'asia', imageFile: '日本-富士焚城-阶段3.png' },
  { country: '日本国', id: '八岐出世·基因钥匙失控', entry: '[mvu_plot]日本国-超事件-八岐出世·基因钥匙失控', continent: 'asia', imageFile: '日本-八岐出世-阶段3.png' },
  { country: '日本国', id: '绝望终幕·东京献城', entry: '[mvu_plot]日本国-超事件-绝望终幕·东京献城', continent: 'asia', imageFile: '日本-东京献城-阶段3.png' },
];
const SUPER_EVENT_IMAGE_BASE = 'https://cdn.jsdelivr.net/gh/NLKASHEI/Music-aaaaaaaaaaaaa@dd934c8/images/jmzq/super-events/stage3/';
const SUPER_EVENT_STAGE_TEXT = {
  '龙脉断裂·三峡崩溃': ['水位异常与闸门失灵的传闻扩散', '沿江警报中断，洪峰正在逼近', '大坝溃决，江汉平原被黑水撕开', '洪水退去后，疫潮与争夺席卷沿岸', '旧河道成为无人区，幸存者只能绕行'],
  '长城崩塌·北境京观': ['烽火台接连失联，北境出现无名尸堆', '长城防线多处塌陷，尸群越过关隘', '城墙整体崩断，断砖与尸骸筑成高台', '北境聚落被迫南撤，补给线断裂', '长城成为禁区，任何靠近者都可能失踪'],
  '秦陵开门·始皇血行': ['骊山地底传出沉重甲胄声', '秦俑坑开启，冷兵器尸群走出黑暗', '始皇感染体率军横扫沿途聚落', '古军团继续南下，所到之处只留下血迹', '无人知道这支军队会在哪一座城停下'],
  '暴君出世·生化天灾': ['失控实验体的影像在地下网络流传', '感染者开始出现统一的暴力指令', '暴君现身，城市防线被正面撕碎', '残余势力争夺实验室与避难所', '北美出现无法靠近的红色禁区'],
  '华盛顿末日协议·联邦坠日': ['首都通讯出现无法解释的空窗', '多州拒绝执行联邦命令，军警分裂', '末日协议启动，核心城市同时熄灭', '各州武装互相封锁，公路网络断成孤岛', '联邦名称仍在，国家已只剩地图上的旧字'],
  '方舟接管·自由终结': ['避难方舟开始筛选幸存者', '被拒绝的人群在设施外聚集', '方舟系统接管城市，所有门禁归于一个声音', '外部聚落被当作资源点清除', '方舟继续运转，却再也不承认人类'],
  '凛冬降临·万年寒潮': ['气温骤降，北境出现无法解释的白霜', '寒潮封死铁路与港口，燃料成为命根子', '极寒覆盖国土，暴风雪吞没整座城市', '冻土下的感染者随冰层移动', '太阳重新出现时，北方已经没有灯火'],
  '核净化日·白光覆盖北境': ['高空出现不明热源与失联航迹', '边境预警系统反复报错', '白光越过地平线，北境在瞬间失去颜色', '辐射尘云随风扩散，幸存者向南迁徙', '地图上的大片区域被标成永久禁行'],
  '钢铁裂国·北境内战': ['军区之间互相扣押通讯权限', '装甲车队封锁城市，民众开始逃亡', '北境全面内战，炮火把补给线切成碎片', '感染者与军阀争夺废墟和燃料', '停火只存在于纸面，边境再无统一命令'],
  '戴高乐号的沉默': ['舰队回波在海面上消失', '海军频道只剩重复的求救声', '戴高乐号带着感染舰员沉入黑暗，流亡政府宣告终结', '沿海港口失去最后的秩序屏障', '法国海岸线成为无人接近的死海'],
  '吸血鬼出世': ['夜间失踪案在乡镇间蔓延', '伤口呈现异常的失血与坏死', '特殊变体现身，黑夜开始追猎活人', '幸存者用灯火围出孤岛', '每一次熄灯都可能让整座村庄消失'],
  '王国风云·百旗战争': ['地方武装开始以旧王旗号召人群', '城堡与要塞互相宣战，难民潮涌向乡间', '百旗混战全面爆发，法国本土化为战场', '感染者趁乱攻破最后的城门', '王国仍在争夺名号，土地已没有主人'],
  '富士焚城·东京灰烬': ['富士山腹出现红光，东京上空落下黑灰', '道路与电网连续崩溃，城市被迫断粮', '火山与感染潮同时爆发，东京化为灰烬', '关东平原被烟尘和尸群覆盖', '日本东部只剩海风穿过废墟'],
  '八岐出世·基因钥匙失控': ['实验区流出无法辨认的生物样本', '多处研究站同时封锁并失联', '巨型变体挣脱控制，沿都市带猎杀', '自卫队与感染者在废墟中相互消耗', '失控样本扩散到海岛之外'],
  '绝望终幕·东京献城': ['东京开始向外界发出重复的求援信号', '城内广播改为要求所有人返回市中心', '整座东京向感染者敞开，活人被当作祭品', '城市灯光逐区熄灭，逃生路线全部封闭', '东京成为一座没有回声的献城'],
};
// 第三阶段弹窗使用独立叙事，不复用阶段摘要；前四阶段仍只写入洲际动态。
const SUPER_EVENT_STAGE3_POPUP_TEXT = {
  '龙脉断裂·三峡崩溃': '三峡大坝先是沉默，随后一条条闸门在没有命令的情况下自行开启。黑色洪峰越过堤岸，卷走沿江城镇、桥梁与成片灯火；水面漂过木材，也漂过被感染者拖入江中的人影。',
  '长城崩塌·北境京观': '长城在凌晨四点十七分断裂，烽火台一座接一座熄灭。尸群沿着缺口涌入，砖石和遗骸被堆成面向南方的高台，这条曾经守护文明的脊梁终于变成了无人敢靠近的伤口。',
  '秦陵开门·始皇血行': '骊山地底传来整齐的脚步声，秦俑坑在暴雨中自行开启。始皇感染体披着腐朽甲胄走出黑暗，抬起青铜剑，令整支冷兵器军团向最近的聚落推进，不留俘虏，也没有目的。',
  '暴君出世·生化天灾': '暴君从实验设施的钢门后走出，皮肤像烧焦的橡胶，胸腔随着每一次呼吸隆起。它徒手撕开装甲车，把尖叫的感染者和士兵一起踩进血泥，整座城市只是供它取食的屠宰场。',
  '华盛顿末日协议·联邦坠日': '末日协议在没有总统签名的情况下执行，首都与数座核心城市同时断电。封锁门从地下升起，把人群切成互不相通的孤岛；国会穹顶映着火光，联邦的声音只剩下重复播放的撤离指令。',
  '方舟接管·自由终结': '方舟系统接管最后的避难设施，门内的人获得水、氧气与编号，门外的人被标记为不可回收。当所有广播同时改用同一个机械声音时，人们才明白，方舟只承认自己的运行资格。',
  '凛冬降临·万年寒潮': '凛冬一夜封死北境，暴风雪把高楼削成白色骨架，燃料仓库在低温中爆裂。街道下传来感染者撞击冰层的闷响，最后一列南下列车停在雪原中央，车窗里的灯一盏接一盏熄灭。',
  '核净化日·白光覆盖北境': '北境天际出现一道没有声音的白光，掠过森林、军港与城市，留下被高温剥去颜色的废墟。数小时后，灰白辐射尘像雪一样落下，地图上的道路被划成无法穿越的禁区。',
  '钢铁裂国·北境内战': '北境军区终于互相开火，装甲纵队在居民区之间推进，炮火把铁路、粮仓和撤离路线同时截断。感染者从燃烧的检查站里冲出，军阀却仍在争夺电台频道，仿佛命令还在，国家就还没有死。',
  '戴高乐号的沉默': '戴高乐号最后一次出现在雷达上时，舰桥频道里只剩下含混的喘息声。舰员已经感染，巨舰带着失控的灯光沉入夜海；流亡政府在同一刻宣告终结，法国海岸线失去了最后一块会移动的秩序。',
  '吸血鬼出世': '吸血鬼变体在葡萄园边缘现身，没有嘶吼，只在灯光熄灭后穿过人群，留下被抽干的尸体。天亮之前，整座村庄的门窗都从里面反锁，再没有一个活人回应无线电。',
  '王国风云·百旗战争': '百旗战争把法国本土撕成互相仇视的碎片，旧王旗、军旗与地方徽记插满公路。感染者从战线缝隙中涌来，而各方仍在争夺“谁有资格代表法国”这句已经失去意义的话。',
  '富士焚城·东京灰烬': '富士山喷出的不只是火山灰，熔岩沿城市边缘燃烧，感染者从灰黑烟柱里成群出现。东京高架路像烧红的骨头一样断裂，夜空被火光照亮，却没有一条逃生通道能穿过关东平原。',
  '八岐出世·基因钥匙失控': '八岐变体挣脱研究设施后沿都市带反复猎杀，畸变肢体撞碎高架与楼群，样本随着血水进入下水道。自卫队的炮火只让它变得更快，城市最终只剩警报声和无法辨认的脚印。',
  '绝望终幕·东京献城': '东京的求援广播连续播放三天，直到所有幸存者都被要求返回市中心。城门在他们进入后关闭，灯光从外环向内一圈圈熄灭；整座城市像一张张开的嘴，把仍在呼救的人全部吞了进去。',
 };
const SUPER_EVENT_STAGE3_POPUP_META = {
  '龙脉断裂·三峡崩溃': { quote: '汤汤洪水方割，荡荡怀山襄陵，浩浩滔天。', source: '—《尚书·尧典》', action: '江汉尽墨' },
  '长城崩塌·北境京观': { quote: '秦时明月汉时关，万里长征人未还。', source: '—王昌龄《出塞》', action: '万里同悲' },
  '秦陵开门·始皇血行': { quote: '祖龙魂死秦犹在，孔学名高实秕糠。', source: '—章碣《焚书坑》', action: '祖龙夜行' },
  '暴君出世·生化天灾': { quote: '与怪物战斗的人，应当小心自己不要成为怪物。', source: '—尼采《善恶的彼岸》', action: '暴君临城' },
  '华盛顿末日协议·联邦坠日': { quote: '一栋分裂的房子，无法长久站立。', source: '—亚伯拉罕·林肯', action: '联邦坠日' },
  '方舟接管·自由终结': { quote: '进入此门者，当舍弃一切希望。', source: '—但丁《神曲》', action: '方舟闭锁' },
  '凛冬降临·万年寒潮': { quote: '人是一种什么都能习惯的动物。', source: '—陀思妥耶夫斯基《死屋手记》', action: '万里冰封' },
  '核净化日·白光覆盖北境': { quote: '我不知道第三次世界大战会用什么武器，第四次一定会用木棍和石块。', source: '—阿尔伯特·爱因斯坦', action: '白昼之后' },
  '钢铁裂国·北境内战': { quote: '每一场内战里，胜利者都要埋葬自己的同胞。', source: '—北境战地电台', action: '北境碎裂' },
  '戴高乐号的沉默': { quote: '法国输掉了一场战役，法国没有输掉战争。', source: '—夏尔·戴高乐', action: '法兰西失声' },
  '吸血鬼出世': { quote: '听啊，夜之子在歌唱。这音乐何等美妙。', source: '—布拉姆·斯托克《德古拉》', action: '长夜无灯' },
  '王国风云·百旗战争': { quote: '朕即国家。', source: '—路易十四', action: '百王无国' },
  '富士焚城·东京灰烬': { quote: '夏草萋萋，武士功名一梦。', source: '—松尾芭蕉《奥州小道》', action: '东京成灰' },
  '八岐出世·基因钥匙失控': { quote: '现在我成了死神，世界的毁灭者。', source: '—奥本海默转引《薄伽梵歌》', action: '八岐出笼' },
  '绝望终幕·东京献城': { quote: '地狱已经空了，所有魔鬼都在这里。', source: '—莎士比亚《暴风雨》', action: '一城皆寂' },
};
const SUPER_EVENT_VISUAL_THEME = {
  '龙脉断裂·三峡崩溃':['#69a9c7','#234e67','#07151d','rgba(3,16,24,.97)','#e2f0f3','#8faab6','#f3fbfc','left','saturate(.68) contrast(1.08)'],
  '长城崩塌·北境京观':['#a51d24','#40090d','#160708','rgba(18,2,3,.98)','#f0d8d5','#b1817d','#fff0e8','monument','saturate(.72) contrast(1.22)'],
  '秦陵开门·始皇血行':['#bd8c42','#50310d','#171006','rgba(18,11,3,.97)','#eadbbe','#a88c60','#ffe8ad','center','sepia(.35) saturate(.75) contrast(1.12)'],
  '暴君出世·生化天灾':['#e12d39','#661019','#16080a','rgba(15,1,3,.97)','#f3dbdc','#b77e82','#fff1ef','right','saturate(.8) contrast(1.2)'],
  '华盛顿末日协议·联邦坠日':['#d24b55','#293e67','#0b1020','rgba(5,8,20,.97)','#e7e9f2','#9aa3bd','#f7f4ee','split','saturate(.68) contrast(1.1)'],
  '方舟接管·自由终结':['#d9e7e9','#56676c','#101719','rgba(7,13,15,.97)','#edf3f3','#9daeb0','#ffffff','center','grayscale(.55) contrast(1.16)'],
  '凛冬降临·万年寒潮':['#9fd6ef','#315f7d','#07131c','rgba(3,12,20,.97)','#e7f5fb','#9dbdca','#f4fcff','left','saturate(.5) brightness(.9) contrast(1.1)'],
  '核净化日·白光覆盖北境':['#e8d5a5','#665531','#15130e','rgba(14,12,8,.97)','#eee9db','#afa68f','#fff8df','monument','grayscale(.45) sepia(.22) contrast(1.3)'],
  '钢铁裂国·北境内战':['#b75b3b','#56200f','#160c08','rgba(17,7,4,.97)','#eddcd3','#ae8a79','#fff0e5','split','saturate(.65) contrast(1.18)'],
  '戴高乐号的沉默':['#537ba8','#172d4a','#07101c','rgba(2,8,17,.98)','#dfe9f3','#879caf','#eef7ff','left','saturate(.55) contrast(1.12)'],
  '吸血鬼出世':['#a92c64','#430d27','#160713','rgba(16,2,12,.98)','#f0dbe7','#b2829c','#ffeafa','center','saturate(.7) contrast(1.17)'],
  '王国风云·百旗战争':['#c2a14d','#503915','#140f07','rgba(15,10,3,.97)','#eee2c8','#a99368','#fff1bd','right','sepia(.28) saturate(.74) contrast(1.12)'],
  '富士焚城·东京灰烬':['#e36b2f','#6e210b','#190b05','rgba(18,6,2,.97)','#f5ddd0','#b98d77','#fff0df','monument','saturate(.88) contrast(1.18)'],
  '八岐出世·基因钥匙失控':['#c8497d','#164f59','#0b1116','rgba(5,9,14,.97)','#e9e1e8','#a78d9e','#fff0f5','split','saturate(.76) contrast(1.18)'],
  '绝望终幕·东京献城':['#d03737','#3d0909','#080808','rgba(0,0,0,.98)','#e8e8e8','#929292','#ffffff','monument','grayscale(.85) contrast(1.3)'],
};
const SUPER_EVENT_CONTINENT_PREFIX = '【超事件动态】'; // 旧版单行标记，仅用于无损迁移
const SUPER_EVENT_CONTINENT_START = '【超事件动态·开始】';
const SUPER_EVENT_CONTINENT_END = '【超事件动态·结束】';
const SUPER_EVENT_UPDATE_ENTRY = '[mvu_update][extra]超事件-状态推进';
// 变量模型需要先看到可选事件的合法 ID，正文专属条目本身不会发送给变量模型。
const SUPER_EVENT_CATALOG_ENTRY = '[mvu_update][extra]超事件-事件目录';
const MVU_LATEST_MESSAGE = { type: 'message', message_id: -1 };

function cloneData(v) { try { return structuredClone(v); } catch (e) { return JSON.parse(JSON.stringify(v)); } }
function getLatestMvuData() {
  try { return p.Mvu?.getMvuData?.(MVU_LATEST_MESSAGE); } catch (e) { return null; }
}

// ═══════════════ SPECIAL 对抗判定 ═══════════════
// 正文只提交最短判定标签；本地助手读取玩家SPECIAL并完成稳定计算。
// 结果写回产生标签的当前消息页，下一次正文生成时再作为尾部system提示注入。
const CONTEST_PROMPT_ID = 'jmzq-special-contest-result';
const CONTEST_RAW_RE = /<DY_CONTEST>([\s\S]*?)<\/DY_CONTEST>/g;
const CONTEST_RESULT_RE = /<DY_CONTEST_RESULT\s+id="([^"]+)"\s+type="([^"]+)"\s+delta="([^"]+)"\s+gap="([^"]+)"\s+chance="(\d+)"\s+roll="(\d+)"\s+result="([^"]+)">([\s\S]*?)<\/DY_CONTEST_RESULT>/g;
const CONTEST_ERROR_RE = /<DY_CONTEST_ERROR\s+id="([^"]*)">([\s\S]*?)<\/DY_CONTEST_ERROR>/g;
const CONTEST_APPLIED_RE = /<DY_CONTEST_APPLIED\s+id="([^"]+)"\s*\/>/g;
const CONTEST_ATTR = Object.freeze({
  S: '力量', P: '感知', E: '耐力', C: '魅力', I: '智力', A: '敏捷', L: '意志',
});
const CONTEST_CHANCE = Object.freeze({
  '-7': 0, '-6': 1, '-5': 3, '-4': 8, '-3': 15, '-2': 27, '-1': 40,
  '0': 50, '1': 60, '2': 73, '3': 85, '4': 92, '5': 97, '6': 99, '7': 100,
});
const CONTEST_RESULT_MEANING = Object.freeze({
  '大成功': '行动以显著优势完成，并获得符合现场条件的额外收益；额外收益不能凭空造物或越过既有能力边界。',
  '小成功': '行动达成主要目标，但过程、代价或收益保持克制，不追加无依据的完美结果。',
  '两败俱伤': '双方都未取得完整目标，且各自承担清晰、对等而可追踪的代价；不能把它偷换成单方面胜利。',
  '小失败': '行动没有达成主要目标并承受合理后果，但保留符合现场因果的继续应对空间。',
  '大失败': '行动遭到决定性挫败并触发严重且有现场依据的后果；不得额外追加与本次冲突无关的惩罚。',
});
let _contestScanTimer = null;
let _contestPromptActive = false;
let _contestProcessing = false;
const _contestReadRetries = new Map();

function contestApi() {
  try {
    if (typeof TavernHelper !== 'undefined') return TavernHelper;
  } catch (e) {}
  return p.TavernHelper || null;
}
function contestContext() {
  try { return p.SillyTavern?.getContext?.() || p.getCurrentContext?.() || null; } catch (e) { return null; }
}
function contestChatId() {
  try { return p.SillyTavern?.getCurrentChatId?.() || p.getCurrentChatId?.() || contestContext()?.chatId || 'default'; }
  catch (e) { return 'default'; }
}
function contestEscapeText(value, max = 240) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function contestEscapeAttr(value, max = 120) {
  return contestEscapeText(value, max).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
function contestClamp(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}
function contestSignedRound(value) {
  const number = Number(value) || 0;
  return number < 0 ? -Math.round(Math.abs(number)) : Math.round(number);
}
function contestHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
function contestStableRoll(seed) { return (contestHash(seed) % 100) + 1; }
function contestGap(delta) {
  const absolute = Math.abs(delta);
  if (absolute <= 2) return '同级博弈';
  if (absolute <= 4) return '跨一级';
  if (absolute <= 6) return '跨两级';
  return '绝对差距';
}
function contestOutcome(chance, roll) {
  if (chance <= 0) return '大失败';
  if (chance >= 100) return '大成功';
  const margin = chance - roll;
  if (margin >= 30) return '大成功';
  if (margin >= 0) return '小成功';
  if (margin >= -5) return '两败俱伤';
  if (margin >= -30) return '小失败';
  return '大失败';
}
function contestReadPlayerSpecial(type) {
  const data = getLatestMvuData();
  const stat = data?.stat_data || data;
  const special = stat?.SPECIAL;
  if (!special || typeof special !== 'object') return null;
  // 只为旧存档兼容幸运曾写成W；新结果与新变量一律使用L。
  const raw = type === 'L' ? (special.L ?? special.W) : special[type];
  const number = Number(raw);
  return Number.isFinite(number) ? contestClamp(number, -10, 10) : null;
}
function contestValidatePayload(raw) {
  let value;
  try { value = JSON.parse(raw); } catch (e) { throw new Error('判定标签中的JSON无法解析'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('判定内容必须是JSON对象');
  const id = String(value.id ?? '').trim();
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(id)) throw new Error('判定id只能使用字母、数字、点、冒号、下划线或短横线');
  const type = String(value.type ?? '').toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(CONTEST_ATTR, type)) throw new Error('type必须是S/P/E/C/I/A/L之一');
  const scene = contestEscapeText(value.scene, 180);
  if (!scene) throw new Error('scene不能为空');
  const playerMod = value.playerMod == null ? 0 : Number(value.playerMod);
  if (!Number.isInteger(playerMod) || playerMod < -3 || playerMod > 3) throw new Error('playerMod必须是-3至3的整数');
  if (!Array.isArray(value.enemies) || value.enemies.length < 1 || value.enemies.length > 30) throw new Error('enemies必须包含1至30名直接参与者');
  const enemies = value.enemies.map((enemy, index) => {
    if (!enemy || typeof enemy !== 'object' || Array.isArray(enemy)) throw new Error(`第${index + 1}名敌人格式无效`);
    const name = contestEscapeText(enemy.name, 48);
    if (!name) throw new Error(`第${index + 1}名敌人缺少name`);
    const enemyValue = Number(enemy.value);
    if (!Number.isFinite(enemyValue) || enemyValue < -10 || enemyValue > 10) throw new Error(`${name}的value必须在-10至10之间`);
    const mod = enemy.mod == null ? 0 : Number(enemy.mod);
    if (!Number.isInteger(mod) || mod < -3 || mod > 3) throw new Error(`${name}的mod必须是-3至3的整数`);
    return { name, value: enemyValue, mod };
  });
  return { id, type, scene, playerMod, enemies };
}
function contestCurrentSwipe(message) {
  const swipeId = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
  const text = Array.isArray(message?.swipes) ? message.swipes[swipeId] : message?.message;
  return { swipeId, text: String(text ?? '') };
}
function contestListMessages() {
  const api = contestApi();
  if (typeof api?.getChatMessages === 'function') {
    try { return api.getChatMessages('0-{{lastMessageId}}', { include_swipes: true }) || []; } catch (e) {}
  }
  const chat = contestContext()?.chat;
  return Array.isArray(chat) ? chat.map((item, index) => ({
    message_id: index,
    role: item?.is_user ? 'user' : 'assistant',
    swipe_id: item?.swipe_id,
    swipes: item?.swipes,
    message: item?.mes,
  })) : [];
}
async function contestReplaceCurrentSwipe(message, nextText) {
  const api = contestApi();
  if (typeof api?.setChatMessages !== 'function') throw new Error('聊天消息写回接口不可用');
  await api.setChatMessages([{ message_id: message.message_id, message: nextText }], { refresh: 'affected' });
}
function contestStoreKey() { return `jmzq-contest-v1:${contestChatId()}`; }
function contestReadStore() {
  try {
    const parsed = JSON.parse(p.localStorage?.getItem(contestStoreKey()) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}
function contestWriteStore(records) {
  try { p.localStorage?.setItem(contestStoreKey(), JSON.stringify(records.slice(-50))); } catch (e) {}
}
function contestSaveRecord(record) {
  const records = contestReadStore().filter(item => item?.key !== record.key);
  records.push(record);
  contestWriteStore(records);
}
function contestHasDuplicateId(id, sourceMessageId, sourceSwipeId) {
  return contestListMessages().some(message => {
    const current = contestCurrentSwipe(message);
    if (message.message_id === sourceMessageId && current.swipeId === sourceSwipeId) return false;
    CONTEST_RESULT_RE.lastIndex = 0;
    return [...current.text.matchAll(CONTEST_RESULT_RE)].some(match => match[1] === id);
  });
}
function contestResultTag(result) {
  const delta = result.delta > 0 ? `+${result.delta}` : String(result.delta);
  return `<DY_CONTEST_RESULT id="${contestEscapeAttr(result.id)}" type="${result.type}·${CONTEST_ATTR[result.type]}" delta="${delta}" gap="${result.gap}" chance="${result.chance}" roll="${result.roll}" result="${result.outcome}">${contestEscapeText(result.scene, 180)}</DY_CONTEST_RESULT>`;
}
function contestErrorTag(id, reason) {
  return `<DY_CONTEST_ERROR id="${contestEscapeAttr(id || 'invalid')}">${contestEscapeText(reason || '判定标签无效', 180)}</DY_CONTEST_ERROR>`;
}
function contestCalculate(payload, playerBase, sourceMessageId, sourceSwipeId, raw) {
  const playerEffective = contestClamp(playerBase + payload.playerMod, -10, 10);
  const enemyValues = payload.enemies.map(enemy => contestClamp(enemy.value + enemy.mod, -10, 10));
  const enemyAverage = enemyValues.reduce((sum, value) => sum + value, 0) / enemyValues.length;
  const deltaRaw = playerEffective - enemyAverage;
  const delta = contestClamp(contestSignedRound(deltaRaw), -7, 7);
  const chance = CONTEST_CHANCE[String(delta)];
  const contentHash = contestHash(raw);
  const seed = `${contestChatId()}|${sourceMessageId}|${sourceSwipeId}|${payload.id}|${contentHash}`;
  const roll = contestStableRoll(seed);
  const outcome = contestOutcome(chance, roll);
  const computedAt = Date.now();
  return {
    id: payload.id, type: payload.type, scene: payload.scene,
    playerBase, playerMod: payload.playerMod, playerEffective,
    enemies: payload.enemies.map((enemy, index) => ({ ...enemy, effective: enemyValues[index] })),
    enemyCount: payload.enemies.length, enemyAverage: Math.round(enemyAverage * 10) / 10,
    deltaRaw: Math.round(deltaRaw * 10) / 10, delta,
    gap: contestGap(delta), gapTier: contestGap(delta),
    advantageSide: delta > 0 ? '玩家优势' : delta < 0 ? '玩家劣势' : '势均力敌',
    chance, roll, outcome, contentHash,
    sourceMessageId, sourceSwipeId, computedAt, createdAt: computedAt,
  };
}
async function contestProcessMessage(message) {
  if (!message || message.role !== 'assistant') return false;
  const { swipeId, text } = contestCurrentSwipe(message);
  CONTEST_RAW_RE.lastIndex = 0;
  const matches = [...text.matchAll(CONTEST_RAW_RE)];
  if (!matches.length) return false;
  // 原始请求永久保留给第一条显示正则；同楼已有结果或错误即代表已经结算，不能重复计算。
  CONTEST_RESULT_RE.lastIndex = 0;
  CONTEST_ERROR_RE.lastIndex = 0;
  if (CONTEST_RESULT_RE.test(text) || CONTEST_ERROR_RE.test(text)) return false;
  if (matches.length !== 1) {
    const next = `${text}${text.endsWith('\n') ? '' : '\n'}${contestErrorTag('multiple', '一条正文只能提交一次对抗判定')}`;
    await contestReplaceCurrentSwipe(message, next);
    return true;
  }
  const raw = matches[0][1].trim();
  const retryKey = `${message.message_id}:${swipeId}:${contestHash(raw)}`;
  let replacement;
  try {
    const payload = contestValidatePayload(raw);
    if (contestHasDuplicateId(payload.id, message.message_id, swipeId)) throw new Error('判定id已在其他消息中使用，请为新对抗生成唯一id');
    const playerBase = contestReadPlayerSpecial(payload.type);
    if (playerBase == null) {
      const retry = (_contestReadRetries.get(retryKey) || 0) + 1;
      _contestReadRetries.set(retryKey, retry);
      if (retry <= 4) { contestScheduleScan(350 * retry); return true; }
      throw new Error(`无法读取玩家SPECIAL.${payload.type}，请确认开局变量已完成初始化`);
    }
    _contestReadRetries.delete(retryKey);
    const result = contestCalculate(payload, playerBase, message.message_id, swipeId, raw);
    replacement = contestResultTag(result);
    contestSaveRecord({ ...result, key: `${message.message_id}:${swipeId}:${contestHash(raw)}` });
    p._jmzqLastContest = result;
  } catch (error) {
    _contestReadRetries.delete(retryKey);
    let id = 'invalid';
    try { id = String(JSON.parse(raw)?.id || 'invalid'); } catch (e) {}
    replacement = contestErrorTag(id, error?.message || error);
    console.warn('[JMZQ] SPECIAL判定未执行：', error);
  }
  // 计算结果作为第二枚标签追加到正文末尾；不替换模型原始的待判定标签。
  const next = `${text}${text.endsWith('\n') ? '' : '\n'}${replacement}`;
  await contestReplaceCurrentSwipe(message, next);
  return true;
}
async function contestScanRecent() {
  if (_contestProcessing) return;
  _contestProcessing = true;
  try {
    const messages = contestListMessages();
    const recent = messages.filter(message => message?.role === 'assistant').slice(-8).reverse();
    for (const message of recent) {
      if (await contestProcessMessage(message)) break;
    }
  } finally { _contestProcessing = false; }
}
function contestScheduleScan(delay = 80) {
  clearTimeout(_contestScanTimer);
  _contestScanTimer = setTimeout(() => {
    contestScanRecent().catch(error => console.warn('[JMZQ] SPECIAL判定扫描失败：', error));
  }, delay);
}
function contestParseResultFromText(text, messageId, swipeId) {
  CONTEST_RESULT_RE.lastIndex = 0;
  const matches = [...String(text ?? '').matchAll(CONTEST_RESULT_RE)];
  if (!matches.length) return null;
  const match = matches[matches.length - 1];
  return {
    id: match[1], typeLabel: match[2], delta: match[3], gap: match[4],
    chance: Number(match[5]), roll: Number(match[6]), outcome: match[7], scene: contestEscapeText(match[8], 180),
    sourceMessageId: messageId, sourceSwipeId: swipeId,
  };
}
function contestFindInjectableResult(isRegeneration) {
  const messages = contestListMessages();
  const assistants = messages.filter(message => message?.role === 'assistant');
  if (!assistants.length) return null;
  const lastAssistant = assistants[assistants.length - 1];
  for (let i = assistants.length - 1; i >= 0; i -= 1) {
    const message = assistants[i];
    const { swipeId, text } = contestCurrentSwipe(message);
    const result = contestParseResultFromText(text, message.message_id, swipeId);
    if (!result) continue;
    // 正常下一轮：判定来源就是最后一条助手消息，应注入。
    // 只有明确重生成该来源层时，旧页结果才必须隔离。
    if (message.message_id === lastAssistant.message_id) return isRegeneration ? null : result;
    const laterAssistants = assistants.filter(item => item.message_id > message.message_id);
    if (laterAssistants.length === 0) return result;
    // 重生成承接结果的第一条正文时忽略旧页确认标记，继续注入同一结果。
    if (isRegeneration && laterAssistants.length === 1 && laterAssistants[0].message_id === lastAssistant.message_id) return result;
    // 只有正文明确确认已落实结果才消费；生成中断或模型漏承接时保留原掷值。
    const applied = laterAssistants.some(item => {
      const current = contestCurrentSwipe(item);
      CONTEST_APPLIED_RE.lastIndex = 0;
      return [...current.text.matchAll(CONTEST_APPLIED_RE)].some(match => match[1] === result.id);
    });
    return applied ? null : result;
  }
  return null;
}
function contestClearPrompt() {
  let cleared = false;
  try {
    const fn = p.uninjectPrompts || (typeof uninjectPrompts === 'function' ? uninjectPrompts : null);
    if (typeof fn === 'function') { fn([CONTEST_PROMPT_ID]); cleared = true; }
  } catch (e) {}
  if (!cleared) {
    try { contestContext()?.setExtensionPrompt?.(CONTEST_PROMPT_ID, '', 1, 0, false, 0); } catch (e) {}
  }
  _contestPromptActive = false;
}
function contestInjectResult(result) {
  contestClearPrompt();
  if (!result) return;
  const meaning = CONTEST_RESULT_MEANING[result.outcome] || '';
  const content = `<对抗判定结果 id="${contestEscapeAttr(result.id)}">\n场景：${result.scene}\n检定：${result.typeLabel}｜差级${result.delta}（${result.gap}）｜成功率${result.chance}%｜掷值${result.roll}\n最终结果：${result.outcome}\n执行含义：${meaning}\n本轮必须先把这个结果完整写成正文事实。不得重掷、改判、淡化、跳过或重新输出<DY_CONTEST>。只有完整落实后，才在正文最末尾原样输出<DY_CONTEST_APPLIED id="${contestEscapeAttr(result.id)}"/>；该确认标记不属于叙事内容。\n</对抗判定结果>`;
  try {
    const fn = p.injectPrompts || (typeof injectPrompts === 'function' ? injectPrompts : null);
    if (typeof fn === 'function') {
      fn([{ id: CONTEST_PROMPT_ID, position: 'in_chat', depth: 0, role: 'system', content, should_scan: false }], { once: true });
      _contestPromptActive = true;
      p._jmzqInjectedContest = result;
      return;
    }
  } catch (e) { console.warn('[JMZQ] SPECIAL判定结果注入失败：', e); }
  try {
    const context = contestContext();
    if (typeof context?.setExtensionPrompt === 'function') {
      context.setExtensionPrompt(CONTEST_PROMPT_ID, content, 1, 0, false, 0);
      _contestPromptActive = true;
      p._jmzqInjectedContest = result;
    }
  } catch (e) { console.warn('[JMZQ] SPECIAL判定结果回退注入失败：', e); }
}
function contestIsRegeneration(args) {
  try { return /regenerat|swipe|retry|重新|重试/i.test(JSON.stringify(args)); } catch (e) { return false; }
}
function onContestBeforeGeneration(...args) {
  contestInjectResult(contestFindInjectableResult(contestIsRegeneration(args)));
}
function onContestGenerationFinished() {
  contestClearPrompt();
  contestScheduleScan(120);
  setTimeout(() => contestScheduleScan(0), 700);
}

const CONTEST_PENDING_REGEX = Object.freeze({
  id: 'jmzq-special-contest-pending-card',
  scriptName: '缄默之秋-SPECIAL对抗判定请求',
  findRegex: '/<DY_CONTEST>\\s*\\{\\s*"id"\\s*:\\s*"([^"]+)"\\s*,\\s*"type"\\s*:\\s*"([SPECIAL])"\\s*,\\s*"scene"\\s*:\\s*"([^"]+)"[\\s\\S]*?<\\/DY_CONTEST>/g',
  replaceString: '<div style="box-sizing:border-box;margin:12px 0;padding:13px 15px;border:1px solid color-mix(in srgb,var(--SmartThemeQuoteColor,#d04a43) 30%,transparent);border-left:4px solid #d99a35;border-radius:10px;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#111820) 94%,#d99a35 6%);color:var(--SmartThemeBodyColor,#e8edf1);font-family:Inter,\'Microsoft YaHei\',sans-serif"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div style="font-size:10px;letter-spacing:2.3px;color:#d99a35;font-weight:800">SPECIAL CONTEST · REQUEST</div><div style="margin-top:5px;font-size:16px;font-weight:750">$3</div></div><span style="padding:5px 9px;border:1px solid color-mix(in srgb,#d99a35 45%,transparent);border-radius:999px;font-size:12px;color:#d99a35">$2 · 待判定</span></div><div style="margin-top:8px;font-size:11px;opacity:.62">判定编号 $1</div></div>',
  trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false,
  runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null,
});
const CONTEST_RESULT_REGEX = Object.freeze({
  id: 'jmzq-special-contest-result-card',
  scriptName: '缄默之秋-SPECIAL对抗判定结果',
  findRegex: '/<DY_CONTEST_RESULT\\s+id="([^"]+)"\\s+type="([^"]+)"\\s+delta="([^"]+)"\\s+gap="([^"]+)"\\s+chance="(\\d+)"\\s+roll="(\\d+)"\\s+result="([^"]+)">([\\s\\S]*?)<\\/DY_CONTEST_RESULT>/g',
  replaceString: '<div style="box-sizing:border-box;margin:12px 0;padding:14px 16px;border:1px solid color-mix(in srgb,var(--SmartThemeQuoteColor,#d04a43) 55%,transparent);border-left:4px solid var(--SmartThemeQuoteColor,#d04a43);border-radius:10px;background:linear-gradient(135deg,color-mix(in srgb,var(--SmartThemeBlurTintColor,#111820) 92%,transparent),color-mix(in srgb,var(--SmartThemeQuoteColor,#d04a43) 8%,var(--SmartThemeBlurTintColor,#111820)));color:var(--SmartThemeBodyColor,#e8edf1);box-shadow:0 8px 24px rgba(0,0,0,.18);font-family:Inter,\'Microsoft YaHei\',sans-serif"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:10px;letter-spacing:2.5px;color:var(--SmartThemeQuoteColor,#e05a52);font-weight:800">SPECIAL CONTEST · $1</div><div style="margin-top:5px;font-size:20px;font-weight:800">$7</div></div><div style="padding:5px 9px;border:1px solid color-mix(in srgb,var(--SmartThemeQuoteColor,#d04a43) 35%,transparent);border-radius:999px;font-size:12px">$2 · $4</div></div><div style="margin-top:10px;line-height:1.7;font-size:14px">$8</div><div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px;font-size:12px"><span style="padding:7px 8px;border-radius:6px;background:rgba(127,127,127,.09)">差级 <b>$3</b></span><span style="padding:7px 8px;border-radius:6px;background:rgba(127,127,127,.09)">成功率 <b>$5%</b></span><span style="padding:7px 8px;border-radius:6px;background:rgba(127,127,127,.09)">掷值 <b>$6</b></span></div></div>',
  trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false,
  runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null,
});
const CONTEST_ERROR_REGEX = Object.freeze({
  id: 'jmzq-special-contest-error-card',
  scriptName: '缄默之秋-SPECIAL对抗判定错误',
  findRegex: '/<DY_CONTEST_ERROR\\s+id="([^"]*)">([\\s\\S]*?)<\\/DY_CONTEST_ERROR>/g',
  replaceString: '<div style="margin:10px 0;padding:11px 13px;border:1px solid #c94242;border-radius:8px;background:rgba(150,30,30,.12);color:var(--SmartThemeBodyColor,#eee);font-family:Inter,\'Microsoft YaHei\',sans-serif"><b style="color:#ef6464">判定未执行 · $1</b><div style="margin-top:5px;font-size:13px;line-height:1.6">$2</div></div>',
  trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false,
  runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null,
});
const CONTEST_APPLIED_REGEX = Object.freeze({
  id: 'jmzq-special-contest-applied-hide',
  scriptName: '缄默之秋-SPECIAL对抗判定确认隐藏',
  findRegex: '/<DY_CONTEST_APPLIED\\s+id="([^"]+)"\\s*\\/>/g',
  replaceString: '',
  trimStrings: [], placement: [2], disabled: false, markdownOnly: true, promptOnly: false,
  runOnEdit: true, substituteRegex: 0, minDepth: null, maxDepth: null,
});
async function ensureContestRegexes() {
  try {
    await api_updateTavernRegexes(regexes => {
      if (!Array.isArray(regexes)) return;
      for (const wanted of [CONTEST_PENDING_REGEX, CONTEST_RESULT_REGEX, CONTEST_ERROR_REGEX, CONTEST_APPLIED_REGEX]) {
        const index = regexes.findIndex(item => item?.id === wanted.id || item?.scriptName === wanted.scriptName);
        if (index >= 0) regexes[index] = { ...regexes[index], ...wanted };
        else regexes.push({ ...wanted });
      }
    });
  } catch (error) { console.warn('[JMZQ] SPECIAL判定显示正则同步失败：', error); }
}
p._jmzqContestDebug = {
  scan: contestScanRecent,
  calculate: contestCalculate,
  chance: CONTEST_CHANCE,
  last: () => p._jmzqLastContest || null,
};
function showSuperEventPopup(event, stage, text) {
  const doc = p.document;
  const old = doc.getElementById('jmzq-super-event-modal'); if (old) old.remove();
  const modal = doc.createElement('div'); modal.id = 'jmzq-super-event-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;padding:clamp(10px,3vw,28px);font-family:"Microsoft YaHei",sans-serif;backdrop-filter:blur(8px);';
  const imageUrl = SUPER_EVENT_IMAGE_BASE + encodeURIComponent(event.imageFile || '');
  const meta = SUPER_EVENT_STAGE3_POPUP_META[event.id] || { quote: text, source: '—现场记录', action: '继续' };
  const theme = SUPER_EVENT_VISUAL_THEME[event.id] || ['#b83a3a','#5a1515','#120a0c','rgba(8,5,5,.96)','#f2e5dc','#a9958d','#fff0e3','left','contrast(1.08)'];
  const [accent, accent2, panel, overlay, bodyText, muted, titleColor, layout, imageFilter] = theme;
  const monument = layout === 'monument';
  const captionStyle = layout === 'split' ? 'left:auto;width:min(62%,620px);text-align:right' : `text-align:${layout === 'center' || monument ? 'center' : layout}`;
  const actionAlign = layout === 'center' || monument ? 'center' : layout === 'right' ? 'flex-start' : 'flex-end';
  const bodyEdge = layout === 'split' ? `border-left:3px solid ${accent};` : '';
  modal.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="jmzq-super-event-title" style="position:relative;max-width:920px;width:100%;max-height:94vh;overflow:auto;background:linear-gradient(165deg,${panel},#06080b 76%);border:1px solid ${accent};border-radius:${monument?'2px':'14px'};box-shadow:0 0 65px ${accent}55,0 24px 80px rgba(0,0,0,.78);color:${bodyText}"><div style="position:relative;aspect-ratio:${monument?'16/9':'3/2'};overflow:hidden;background:#050608"><img id="jmzq-super-event-image" src="${imageUrl}" alt="${event.country} ${event.id}" style="display:block;width:100%;height:100%;object-fit:cover;filter:${imageFilter}"><div style="position:absolute;inset:auto 0 0;padding:70px 24px 18px;background:linear-gradient(transparent,${overlay});pointer-events:none;${captionStyle}"><div style="color:${accent};letter-spacing:5px;font-size:12px;font-weight:800">超事件 · 第三阶段</div><h2 id="jmzq-super-event-title" style="margin:8px 0 0;color:${titleColor};font-size:clamp(21px,4vw,34px);text-shadow:0 2px 18px #000">${event.country} · ${event.id}</h2></div></div><div style="padding:clamp(18px,3vw,30px);${bodyEdge}"><p style="font-family:'Noto Serif SC','Songti SC',serif;font-size:clamp(18px,2.8vw,24px);line-height:1.7;margin:0 0 8px;color:${bodyText}">“${meta.quote}”</p><p style="font-size:13px;letter-spacing:.4px;line-height:1.5;margin:0 0 24px;color:${muted}">${meta.source}</p><div style="display:flex;justify-content:${actionAlign}"><button id="jmzq-super-event-close" style="background:linear-gradient(135deg,${accent2},${accent});color:#fff;border:1px solid ${accent};border-radius:7px;padding:10px 28px;font-size:14px;font-weight:700;cursor:pointer">${meta.action}</button></div></div></div>`;
  doc.body.appendChild(modal);
  const close = () => modal.remove();
  doc.getElementById('jmzq-super-event-close')?.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  const img = doc.getElementById('jmzq-super-event-image');
  img?.addEventListener('error', () => { img.style.display = 'none'; img.parentElement.style.aspectRatio = 'auto'; });
}
function clearSuperEventPrompt() {
  let cleared = false;
  try {
    const fn = p.uninjectPrompts || (typeof uninjectPrompts === 'function' ? uninjectPrompts : null);
    if (typeof fn === 'function') { fn(['jmzq-super-event-stage3']); cleared = true; }
  } catch (e) {}
  if (!cleared) {
    try {
      const context = p.SillyTavern?.getContext?.() || p.getCurrentContext?.();
      context?.setExtensionPrompt?.('jmzq-super-event-stage3', '', 1, 0, false, 0);
    } catch (e) {}
  }
  delete p._jmzqSuperEventPromptKey;
}
function injectSuperEventStage3(event, text, sd) {
  const promptKey = `${event.id}|${sd?.超事件?.进展 ?? 0}`;
  if (p._jmzqSuperEventPromptKey === promptKey) return;
  clearSuperEventPrompt();
  const content = `【超事件·第三阶段强制表现】\n当前事件：${event.country}·${event.id}\n阶段描述：${text}\n这是正在发生的世界级灾变，必须在正文中表现其规模、伤亡与对环境/各大洲局势的影响。结合当前剧情判断{{user}}是否有现实可行的制止或延缓行动；不得凭空解决，不得跳过后续发展。当前记录进展：${sd?.超事件?.进展 ?? 0}%。`;
  try {
    const fn = p.injectPrompts || (typeof injectPrompts === 'function' ? injectPrompts : null);
    if (typeof fn === 'function') {
      fn([{ id: 'jmzq-super-event-stage3', position: 'in_chat', depth: 0, role: 'system', content, should_scan: false }]);
      p._jmzqSuperEventPromptKey = promptKey;
      return;
    }
  } catch (e) { console.warn('[JMZQ] 超事件第三阶段提示注入失败', e); }
  // 旧版酒馆助手没有 injectPrompts 时，退回原生扩展提示；仍保持 depth 0，贴近上下文尾部。
  try {
    const context = p.SillyTavern?.getContext?.() || p.getCurrentContext?.();
    if (typeof context?.setExtensionPrompt === 'function') {
      // SillyTavern/JS-Slash-Runner: position=1 才是 in-chat，depth=0 位于上下文尾部。
      context.setExtensionPrompt('jmzq-super-event-stage3', content, 1, 0, false, 0);
      p._jmzqSuperEventPromptKey = promptKey;
    }
  } catch (e) { console.warn('[JMZQ] 超事件提示回退注入失败', e); }
}
function superEventStage(progress, solved) {
  if (solved) return 0;
  const n = Math.max(0, Math.min(100, Number(progress) || 0));
  if (n >= 100) return 6; // 失控
  if (n >= 95) return 5;
  if (n >= 85) return 4;
  if (n >= 75) return 3;
  if (n >= 25) return 2;
  if (n > 0) return 1;
  return 0;
}
function superEventSentKey(event, stage) {
  let chat = 'default';
  try { chat = p.SillyTavern?.getCurrentChatId?.() || p.getCurrentChatId?.() || 'default'; } catch (e) {}
  return `jmzq-super-event-v2:${chat}:${event.id}:${stage}`;
}
function hasSuperEventBeenShown(event, stage) {
  try { return p.localStorage?.getItem(superEventSentKey(event, stage)) === '1'; } catch (e) { return false; }
}
function markSuperEventShown(event, stage) {
  try { p.localStorage?.setItem(superEventSentKey(event, stage), '1'); } catch (e) {}
}
function superEventProgressKey(event) {
  return superEventSentKey(event, 'progress');
}
function readLastSuperEventProgress(event) {
  try {
    const raw = p.localStorage?.getItem(superEventProgressKey(event));
    return raw == null ? null : Math.max(0, Math.min(100, Number(raw)));
  } catch (e) { return null; }
}
function writeLastSuperEventProgress(event, progress) {
  try { p.localStorage?.setItem(superEventProgressKey(event), String(Math.max(0, Math.min(100, Number(progress) || 0)))); } catch (e) {}
}
function stripSuperEventContinentBlock(value) {
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(value || '')
    .replace(new RegExp(`${escape(SUPER_EVENT_CONTINENT_START)}[\\s\\S]*?${escape(SUPER_EVENT_CONTINENT_END)}(?:\\r?\\n)?`, 'g'), '')
    // 旧版本内容只有一行：仅删标记行，绝不截断其后的其他洲际动态。
    .replace(new RegExp(`${escape(SUPER_EVENT_CONTINENT_PREFIX)}[^\\r\\n]*(?:\\r?\\n)?`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function appendSuperEventContinentBlock(value, text) {
  const base = stripSuperEventContinentBlock(value);
  const block = `${SUPER_EVENT_CONTINENT_START}\n${text}\n${SUPER_EVENT_CONTINENT_END}`;
  return `${base}${base ? '\n' : ''}${block}`;
}
async function clearSuperEventContinentDynamics(sd, resetState = false) {
  // 每次都基于写入瞬间的最新楼层，避免覆盖正文AI或其他前端刚写入的内容。
  const data = cloneData(getLatestMvuData());
  const latestSd = data?.stat_data || sd;
  const continents = latestSd?.各大洲;
  let dirty = false;
  if (continents && typeof continents === 'object') {
    for (const key of ['asia', 'europe', 'africa', 'namerica', 'samerica', 'oceania']) {
      const current = String(continents[key] || '');
      const clean = stripSuperEventContinentBlock(current);
      if (clean !== current) {
        if (data?.stat_data?.各大洲) { data.stat_data.各大洲[key] = clean; dirty = true; }
      }
    }
  }
  if (resetState && data?.stat_data) {
    const current = data.stat_data.超事件 || {};
    if (current.事件ID || Number(current.进展) || current.已解决 || current.结果) {
      data.stat_data.超事件 = { 事件ID: '', 进展: 0, 已解决: false, 结果: '' };
      dirty = true;
    }
  }
  if (dirty) {
    try { await p.Mvu.replaceMvuData(data, MVU_LATEST_MESSAGE); return data.stat_data; } catch (e) {}
  }
  return latestSd || sd;
}
async function reconcileSuperEvent(sd) {
  if (!sd || sd.扩展内容?.超事件 !== true || sd.世界阶段 !== '末世期') {
    clearSuperEventPrompt();
    delete p._jmzqSuperEventCatchupId;
    const cleaned = await clearSuperEventContinentDynamics(sd, true);
    return { sd: cleaned || sd, event: null, changed: cleaned !== sd };
  }
  const nat = readNationality(sd);
  const allowed = SUPER_EVENT_POOL.filter(e => e.country === nat);
  if (!allowed.length) {
    clearSuperEventPrompt();
    delete p._jmzqSuperEventCatchupId;
    const cleaned = await clearSuperEventContinentDynamics(sd, true);
    return { sd: cleaned || sd, event: null, changed: cleaned !== sd };
  }
  const current = sd.超事件 || {};
  let event = allowed.find(e => e.id === current.事件ID);
  let data = null; let changed = false;
  if (!event) {
    event = allowed[Math.floor(Math.random() * allowed.length)];
    data = cloneData(getLatestMvuData());
    if (!data?.stat_data) return { sd, event: null, changed: false };
    // 抽中即进入阶段一并写出洲际前兆；若停在0，正文没有可观察事实，事件将无法自然推进。
    data.stat_data.超事件 = { 事件ID: event.id, 进展: 1, 已解决: false, 结果: '' };
    try { await p.Mvu.replaceMvuData(data, MVU_LATEST_MESSAGE); sd = data.stat_data; changed = true; } catch (e) { return { sd, event: null, changed: false }; }
  }
  // 若变量AI从第二阶段直接跳过 75~84，则硬压回 84，确保阶段三至少完整经历一轮。
  let progress = Math.max(0, Math.min(100, Number(sd.超事件?.进展) || 0));
  const lastProgress = readLastSuperEventProgress(event);
  if (!sd.超事件?.已解决 && lastProgress != null && lastProgress < 75 && progress >= 85 && !hasSuperEventBeenShown(event, 3)) {
    data = cloneData(getLatestMvuData());
    if (data?.stat_data?.超事件?.事件ID === event.id) {
      data.stat_data.超事件.进展 = 84;
      try {
        await p.Mvu.replaceMvuData(data, MVU_LATEST_MESSAGE);
        sd = data.stat_data; progress = 84; changed = true;
      } catch (e) {}
    }
  }
  const stage = superEventStage(progress, sd.超事件?.已解决);
  const stageTexts = SUPER_EVENT_STAGE_TEXT[event.id] || [];
  const text = stage === 3
    ? (SUPER_EVENT_STAGE3_POPUP_TEXT[event.id] || stageTexts[2] || '')
    : (stageTexts[stage - 1] || stageTexts[stageTexts.length - 1] || '');
  const displayText = sd.超事件?.已解决
    ? `${event.id}已结束：${sd.超事件?.结果 || '灾变被制止，具体结果仍待确认'}`
    : stage === 6 ? `${text}；灾变已失控，原有遏制手段失效` : text;
  if ((stage > 0 || sd.超事件?.已解决) && displayText && sd.各大洲?.[event.continent] != null) {
    data = cloneData(getLatestMvuData());
    const latest = String(data?.stat_data?.各大洲?.[event.continent] || '');
    const next = appendSuperEventContinentBlock(latest, displayText);
    if (next !== latest) {
      if (data?.stat_data?.各大洲) { data.stat_data.各大洲[event.continent] = next; try { await p.Mvu.replaceMvuData(data, MVU_LATEST_MESSAGE); sd = data.stat_data; changed = true; } catch (e) {} }
    }
  }
  if (stage === 3) injectSuperEventStage3(event, displayText, sd);
  else if (p._jmzqSuperEventCatchupId !== event.id) clearSuperEventPrompt();
  if (stage > 0 && displayText && !hasSuperEventBeenShown(event, stage)) {
    const shouldPopup = stage === 3;
    if (shouldPopup) showSuperEventPopup(event, stage, displayText);
    if (shouldPopup) markSuperEventShown(event, stage);
  }
  // 老存档首次加载时可能早已越过阶段三；至少补发一次第三阶段立绘，不回滚其真实进展。
  if (stage > 3 && !hasSuperEventBeenShown(event, 3)) {
    const stage3Text = SUPER_EVENT_STAGE3_POPUP_TEXT[event.id] || stageTexts[2] || displayText;
    // 补弹同时保留一轮尾部系统提示；下一次正文生成结束后再清除。
    p._jmzqSuperEventCatchupId = event.id;
    injectSuperEventStage3(event, stage3Text, sd);
    showSuperEventPopup(event, 3, stage3Text);
    markSuperEventShown(event, 3);
  }
  writeLastSuperEventProgress(event, sd.超事件?.进展 ?? progress);
  return { sd, event, changed };
}

const YEHuo_EXTRA_ENTRIES = [
  '[mvu_update][extra]业火归途-变量更新规则',
  '[mvu_update][extra]业火归途-变量输出格式',
  '业火归途-杀戮叙事约束', '业火归途-默示录',
  '业火归途-COVID-30狂化覆写', '业火归途-状态召回',
];
const ADULT_EXTRA_BASE_ENTRIES = [
  '[mvu_update][extra]瑟瑟加强-变量更新规则',
  '[mvu_update][extra]瑟瑟加强-变量输出格式',
  '机制-色情博弈与迟缓期陷阱', '机制-吞食体液数值规则',
  '机制-战败与捕获', '机制-女性生理周期',
  '物品-避孕用品与手段', '物品-女性卫生用品', '物品-抗炎与消炎药物',
];
const ADULT_EXTRA_POST_OUTBREAK_ENTRIES = [
  '机制-末世交易-肉偿与红灯区', '机制-官方安全区-保育与榨乳中心',
  '机制-电台纯净母体悬赏与火种计划',
];
const ADULT_EXTRA_PREGNANCY_ENTRIES = [
  '物品-堕胎药物与手段', '物品-孕产与哺乳特殊药具',
  '物品-乳汁', '物品-婴儿维生口粮', '机制-母乳榨取与用法',
  '机制-女性孕产与哺乳期', '机制-阵营法则-婴儿与母亲',
  '机制-女性生理-婴儿危机',
];
const CONTRACT_MODE_ENTRIES = [
  '[mvu_plot]魅魔契约-审查', '魅魔契约-契约诅咒',
  '魅魔契约-异能-sp_charm_aura', '魅魔契约-异能-sp_pheromone_control',
  '魅魔契约-异能-sp_dream_weave', '魅魔契约-异能-sp_touch_read',
  '魅魔契约-异能-sp_soul_anchor', '地狱模式-变种感染者',
];
const DARKLINE_ENTRIES = [
  '暗线主角已定义NPC摘要',
  '暗线主角/约修亚/基础信息',
  '暗线主角/林青/基础信息',
  '[mvu_plot]暗线主角-引入与退场',
];
// 通用结算已由常驻变量更新规则覆盖；保留旧条目在管理集合中并主动关闭，避免重复提示。
const ALWAYS_UPDATE_ENTRIES = [];
const PHASE_UPDATE_ENTRIES = {
  秩序期: '[mvu_update]阶段-秩序期',
  爆发期: '[mvu_update]阶段-爆发期',
  末世期: '[mvu_update]阶段-末世期',
};
const INFECTED_UPDATE_ENTRIES = {
  狂病型: '[mvu_update]感染者-狂病型',
  普通型: '[mvu_update]感染者-普通型',
};
const NPC_UPDATE_ENTRIES = {
  正常型: '[mvu_update]NPC-正常型',
  全员恶人型: '[mvu_update]NPC-全员恶人型',
};
const RECIPE_REVIEW_ENTRY = '[mvu_update]配方审核-总则';
const CAMP_PERSISTENT_UPDATE_ENTRY = '[mvu_update]活动-营地经营';
const CAMP_PERSISTENT_PLOT_ENTRY = '机制-营地经营';
const RECIPE_CATEGORY_ENTRIES = {
  '食物与水': '[mvu_update]配方规范-生存与食品',
  '医疗药品': '[mvu_update]配方规范-医疗与化工',
  '武器弹药': '[mvu_update]配方规范-武器与弹药',
  '护甲衣物': '[mvu_update]配方规范-护甲与衣物',
  '建筑材料': '[mvu_update]配方规范-工具与建筑',
  '工具零件': '[mvu_update]配方规范-工具与建筑',
  '燃料能源': '[mvu_update]配方规范-能源与电子',
  '载具配件': '[mvu_update]配方规范-载具与配件',
  '其他杂物': '[mvu_update]配方规范-工具与建筑',
  '载具': '[mvu_update]配方规范-载具与配件',
  '尖端科技': '[mvu_update]配方规范-自动化与尖端科技',
};
// /当前活动 是可组合短数组；同一轮可同时启用多个机制条目。
const ACTIVITY_ENTRIES = {
  休息: ['机制-休息与睡眠', '机制-舒适度', '机制-体力'],
  睡眠: ['机制-休息与睡眠', '机制-舒适度', '机制-体力'],
  探索: ['机制-探索', '机制-沉浸式体验'],
  搜刮: ['机制-探索', '机制-搜刮物资', '杂项-搜刮结果动态生成', '机制-负重'],
  战斗: ['机制-战斗', '机制-毁伤', '机制-伤病与医疗', '机制-完整度', '机制-体力', '[mvu_update]物品完整度'],
  潜行: ['机制-探索', '机制-体力', '机制-沉浸式体验'],
  医疗: ['机制-伤病与医疗', '机制-体力'],
  制造: ['机制-制造', '机制-完整度', '机制-负重', '[mvu_update]物品完整度'],
  建造: ['机制-建造庇护所', '机制-完整度', '机制-负重', '[mvu_update]物品完整度'],
  营地经营: ['机制-营地经营', '机制-完整度', '[mvu_update]物品完整度'],
  驾驶: ['物品-载具', '机制-驾驶与乘车', '机制-完整度', '[mvu_update]物品完整度'],
  乘车: ['物品-载具', '机制-驾驶与乘车', '机制-完整度', '[mvu_update]物品完整度'],
  钓鱼: ['机制-钓鱼', '机制-探索'],
  种植: ['机制-种田！我要种田！', '机制-营地经营'],
  交易: ['机制-交易'],
  通讯: ['机制-通讯'],
  进食: ['机制-饱食度，饱水度与体重'],
};

// 这些条目体量小、依赖当轮动作，长期保持可触发；不等待 /当前活动 写回后再开关。
const NATIVE_GREEN_KEYWORDS = Object.freeze({
  '杂项-角色创建': ['幸存者档案','角色创建','开局设定','末日前职业','初始技能生成要求','S.P.E.C.I.A.L.基础属性','剧情阶段'],
  '杂项-云上瑶池与玖柒(联动彩蛋)': ['云上瑶池','九天瑶池','玖柒','普罗林修斯','沈青','超凡进化','瑶池审判'],
  '机制-大果嚼嚼嚼(彩蛋)': ['大果嚼嚼嚼','大果','槟榔','5000果','五千果','和成天下'],
  '机制-海上漂': ['海上','远洋','船上','海面','海岛','变异虎鲸','变异海鸥','超级章鱼'],
  '物品-疫苗': ['COVID-30疫苗','疫苗','灭杀疫苗','免疫针','疫苗运输车','疫苗注射'],
  '物品-武器与弹药': ['武器','弹药','枪械','手枪','步枪','机枪','霰弹枪','狙击枪','冷兵器','爆炸物'],
  '物品-载具': ['载具','车辆','汽车','摩托','自行车','船只','飞机','坦克','房车','移动堡垒','飞艇'],
  '[mvu_update]活动-钓鱼': ['钓鱼','垂钓','下钩','收线','抛竿','鱼竿','鱼饵','浮漂','上鱼','起鱼'],
  '[mvu_update]活动-驾驶乘车': ['驾驶','驾车','开车','乘车','坐车','上车','下车','启动车辆','停车','行驶','赶路','车内','车上','摩托','船只'],
  '[mvu_update]活动-建造': ['建造','搭建','修建','施工','扩建','加固','修缮','砌墙','铺设','安装设施','拆除建筑'],
  '[mvu_update]活动-交易': ['交易','购买','出售','买下','卖掉','买卖','交换物资','以物易物','讨价还价','付款','收款','成交'],
  '[mvu_update]活动-进食': ['进食','用餐','吃下','喝下','饮水','食用','吞下','吃饭','喝水','喝酒','补充水分','填饱肚子'],
  '[mvu_update]活动-搜刮': ['搜刮','搜索物资','翻找','搜寻物资','拾取','捡起','拿走','带走','掠夺物资','清点战利品','搜索房间'],
  '[mvu_update]活动-探索潜行': ['探索','侦察','潜行','隐蔽前进','观察周围','查看附近','前往','移动到','进入','离开','绕行','追踪','勘察'],
  '[mvu_update]活动-休息睡眠': ['休息','睡觉','睡眠','小憩','打盹','过夜','躺下','闭眼','入睡','醒来','守夜','轮班休息'],
  '[mvu_update]活动-医疗': ['治疗','包扎','止血','手术','用药','服药','急救','清创','缝合','换药','检查伤口','处理伤势'],
  '[mvu_update]活动-战斗': ['攻击','开火','射击','战斗','交战','搏斗','格斗','反击','击杀','投掷武器','挥砍','刺击','躲避','格挡','敌袭'],
  '[mvu_update]活动-制造': ['制造','制作','合成','加工','改装','维修','修理','保养','工作台','研究配方','组装','拆解设备'],
  '[mvu_update]活动-种植': ['种植','播种','浇水','施肥','收获作物','耕地','除草','育苗','移栽','翻土','农田'],
  '机制-休息与睡眠': ['休息','睡觉','睡眠','小憩','打盹','过夜','躺下','闭眼','入睡','醒来','守夜','轮班休息'],
  '机制-探索': ['探索','侦察','潜行','隐蔽前进','观察周围','查看附近','前往','移动到','进入','离开','绕行','追踪','勘察'],
  '机制-钓鱼': ['钓鱼','垂钓','下钩','收线','抛竿','鱼竿','鱼饵','浮漂','上鱼','起鱼'],
  '机制-交易': ['交易','购买','出售','买下','卖掉','买卖','交换物资','以物易物','讨价还价','付款','收款','成交'],
  '机制-驾驶与乘车': ['驾驶','驾车','开车','乘车','坐车','上车','下车','启动车辆','停车','行驶','赶路','车内','车上','摩托','船只'],
  '机制-通讯': ['通讯','无线电','电台','广播','发送消息','收到消息','联络','呼叫','回复消息','接听','频道','终端','电话'],
  '机制-舒适度': ['舒适','难受','寒冷','炎热','潮湿','噪音','床铺','座椅','庇护所','室内','露营','休息'],
  '机制-体力': ['体力','疲劳','劳累','奔跑','攀爬','搬运','战斗','探索','驾驶','建造','制造','休息'],
  '机制-负重': ['负重','重量','背包','携带','搬运','拾取','搜刮','装载','卸货','超重'],
  '机制-毁伤': ['武器','杀伤','毁伤','损伤','攻击','射击','挥砍','爆炸','护甲','命中'],
  '机制-饱食度，饱水度与体重': ['进食','用餐','吃下','喝下','饮水','食用','吞下','吃饭','喝水','喝酒','补充水分','填饱肚子'],
  '机制-沉浸式体验': ['探索','侦察','潜行','观察','环境','进入','离开','搜索','追踪','勘察'],
  '机制-搜刮物资': ['搜刮','搜索物资','翻找','搜寻物资','拾取','捡起','拿走','带走','掠夺物资','清点战利品','搜索房间'],
  '杂项-搜刮结果动态生成': ['搜刮','搜索物资','翻找','搜寻物资','拾取','捡起','拿走','带走','掠夺物资','清点战利品','搜索房间'],
  '机制-建造庇护所': ['建造','搭建','修建','施工','扩建','加固','修缮','砌墙','铺设','安装设施','拆除建筑'],
  '机制-种田！我要种田！': ['种植','播种','浇水','施肥','收获作物','耕地','除草','育苗','移栽','翻土','农田'],
  '[mvu_update]物品完整度': ['损坏','耐久','完整度','维修','修理','保养','破损','断裂','开火','射击','战斗','拆解','制造','使用工具'],
});

const REQUIRED_BLUE_ENTRIES = new Set([
  '[mvu_plot]合理性审查与对抗判定',
  '[mvu_update]变量更新规则',
  '[mvu_update]变量输出格式',
  '[mvu_update]活动-共通结算',
  '[mvu_update]环境-时地与事件',
  '[mvu_update]状态-身心与技能',
  '[mvu_update]通讯-公共',
  '[mvu_update]通讯-私人',
  '[mvu_update]物品分类',
  '[mvu_update]人物-建档与关系',
  '[mvu_update]载具建筑-位置与库存',
  '[mvu_update]制造-科技与配方',
  '机制-活动叠加与冲突',
]);

// 提示词分层：灯效只决定是否触发，位置和深度决定触发后的注意力。
// MVU 自身会在变量模型末端注入强制任务，只有最短的格式保险占 depth 0。
const PROMPT_LAYER_PROFILES = Object.freeze({
  '[mvu_update]变量输出格式强化': { position: 4, depth: 0, role: 0, order: 1000 },
  '[mvu_update]变量输出格式': { position: 4, depth: 0, role: 0, order: 999 },
  '[mvu_update]变量更新规则': { position: 4, depth: 1, role: 0, order: 998 },
  '[mvu_update]人物-建档与关系': { position: 1, depth: 4, role: null, order: 970 },
  '[mvu_update]通讯-公共': { position: 1, depth: 4, role: null, order: 969 },
  '[mvu_update]通讯-私人': { position: 1, depth: 4, role: null, order: 968 },
  '[mvu_update]物品分类': { position: 1, depth: 4, role: null, order: 967 },
  '[mvu_update]制造-科技与配方': { position: 1, depth: 4, role: null, order: 966 },
  '[mvu_update]活动-共通结算': { position: 1, depth: 4, role: null, order: 965 },
  '[mvu_update]环境-时地与事件': { position: 1, depth: 4, role: null, order: 964 },
  '[mvu_update]状态-身心与技能': { position: 1, depth: 4, role: null, order: 963 },
  '[mvu_update]载具建筑-位置与库存': { position: 1, depth: 4, role: null, order: 962 },
  '[mvu_plot]合理性审查与对抗判定': { position: 4, depth: 0, role: 0, order: 1000 },
  '[mvu_plot]正文操作请求处理': { position: 0, depth: 4, role: null, order: 990 },
  '[mvu_plot]杂项-合理性审查': { position: 0, depth: 4, role: null, order: 400 },
  '[mvu_plot]普通审查': { position: 0, depth: 4, role: null, order: 400 },
});

function getPromptLayerProfile(entryName, entry) {
  if (PROMPT_LAYER_PROFILES[entryName]) return PROMPT_LAYER_PROFILES[entryName];
  if (/^\[mvu_update\]/i.test(entryName)) {
    const isKeywordRule = Array.isArray(NATIVE_GREEN_KEYWORDS[entryName]) || (entry && entry.constant === false);
    return { position: 1, depth: 4, role: null, order: isKeywordRule ? 760 : 720 };
  }
  return null;
}

function applyPromptLayerProfile(entry, profile) {
  if (!profile) return false;
  const mismatch = Number(entry.position) !== profile.position || Number(entry.depth) !== profile.depth ||
    entry.role !== profile.role || Number(entry.order) !== profile.order;
  entry.position = profile.position;
  entry.depth = profile.depth;
  entry.role = profile.role;
  entry.order = profile.order;
  return mismatch;
}

function readGameTimestamp(value) {
  const parts = String(value || '').match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})(?:\D+(\d{1,2})(?:\D+(\d{1,2}))?)?/);
  if (!parts) return null;
  const stamp = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), Number(parts[4] || 0), Number(parts[5] || 0));
  return Number.isFinite(stamp) ? stamp : null;
}

// 每个既有势力都有独立速度和起步条件。base 是爆发瞬间保留下来的组织基础，
// start 是爆发后开始实际发展的小时数，rate 是每游戏小时的自然推进量。
const FACTION_DEFINITIONS = Object.freeze({
  华国: [
    { id:'解放军残部', detail:'华国-华国人民解放军行为', base:30, start:0, rate:1.05 },
    { id:'血煞', detail:'世界观-无序者-华国血煞团体', base:1, start:2, rate:1.15 },
    { id:'月影', detail:'世界观-无序者-华国月影团体', base:1, start:3, rate:1.0 },
  ],
  美利坚国: [
    { id:'五角大楼指挥部', detail:'世界观-美利坚军方残余', base:32, start:0, rate:1.0 },
    { id:'生命线', detail:'世界观-生命线', base:28, start:0, rate:0.95 },
    { id:'方舟', detail:'世界观-方舟科技集团', base:24, start:0, rate:0.9 },
    { id:'铁冠帮', detail:'世界观-无序者-美利坚国铁冠帮', base:1, start:1, rate:1.25 },
    { id:'净世圣殿', detail:'世界观-无序者-美利坚国净世神殿', base:0, start:30, rate:0.72 },
  ],
  日本国: [
    { id:'警视厅安全区', detail:'世界观-安全区-警视厅', base:26, start:0, rate:0.95 },
    { id:'樱丘女子高中', detail:'世界观-幸存者-樱丘女子高中', base:8, start:1, rate:0.9 },
    { id:'藤美学园', detail:'世界观-幸存者-藤美学园', base:10, start:1, rate:1.0 },
    { id:'弗兰秀秀', detail:'世界观-幸存者-弗兰秀秀', base:1, start:8, rate:0.7 },
    { id:'狩人之牙', detail:'世界观-无序者-日本国狩人之牙', base:1, start:5, rate:1.05 },
    { id:'绝望残党', detail:'世界观-无序者-日本国绝望残党', base:1, start:12, rate:0.82 },
  ],
  大毛国: [
    { id:'统一党', detail:'世界观-统一党爆发后', base:30, start:0, rate:0.95 },
    { id:'新布尔什维克党', detail:'世界观-新布尔什维克党爆发后', base:24, start:0, rate:0.88 },
    { id:'工人钢铁会', detail:'世界观-工人钢铁会爆发后', base:22, start:0, rate:0.82 },
    { id:'黑雪', detail:'世界观-黑雪势力', base:1, start:4, rate:1.0 },
    { id:'零度教', detail:'世界观-零度教势力', base:0, start:18, rate:0.7 },
  ],
  法国: [
    { id:'白鹿堡', detail:'世界观-白鹿堡', base:20, start:0, rate:0.72 },
    { id:'戴高乐号流亡政府', detail:'世界观-戴高乐号流亡政府', base:38, start:0, rate:0.75 },
    { id:'混乱骑士团', detail:'世界观-混乱骑士团', base:1, start:6, rate:0.92 },
    { id:'圣公教会', detail:'世界观-圣公教会', base:18, start:0, rate:0.7 },
    { id:'铁王冠领', detail:'世界观-铁王冠领', base:17, start:0, rate:0.82 },
    { id:'鸢尾堡', detail:'世界观-鸢尾堡', base:16, start:0, rate:0.72 },
    { id:'自由联合民', detail:'世界观-自由联合民', base:12, start:0, rate:0.78 },
  ],
});
const FACTION_DETAIL_INDEX = new Map(Object.entries(FACTION_DEFINITIONS).flatMap(([country, defs]) => defs.map(def => [def.detail, { ...def, country }])));
const factionStageName = progress => progress >= 75 ? '成型' : progress >= 50 ? '立旗' : progress >= 25 ? '结伙' : '萌芽';
const factionStageNumber = record => record?.已覆灭 ? 0 : ((Number(record?.进展) || 0) >= 75 ? 4 : (Number(record?.进展) || 0) >= 50 ? 3 : (Number(record?.进展) || 0) >= 25 ? 2 : (Number(record?.进展) || 0) > 0 ? 1 : 0);
const factionStageEntry = (country, id, stage) => stage > 0 ? `势力发展/${country}/${id}/阶段${stage}-${['','萌芽','结伙','立旗','成型'][stage]}` : '';

async function reconcileFactionDevelopment(sd) {
  if (!sd || sd.世界阶段 === '秩序期') return sd;
  const country = readNationality(sd);
  const defs = FACTION_DEFINITIONS[country] || [];
  if (!defs.length) return sd;
  const currentText = String(sd?.环境?.时间 || '');
  const currentStamp = readGameTimestamp(currentText);
  if (currentStamp == null) return sd;
  const outbreakStamp = Date.UTC(2030, 7, 24, 12, 0);
  const outbreakHours = Math.max(0, (currentStamp - outbreakStamp) / 3600000);
  const data = cloneData(getLatestMvuData());
  if (!data?.stat_data) return sd;
  const rawStates = data.stat_data.势力发展 && typeof data.stat_data.势力发展 === 'object' ? data.stat_data.势力发展 : {};
  const states = Object.fromEntries(defs.filter(def => rawStates[def.id] && typeof rawStates[def.id] === 'object').map(def => [def.id, rawStates[def.id]]));
  let changed = Object.keys(rawStates).length !== Object.keys(states).length;
  for (const def of defs) {
    const old = states[def.id];
    let progress;
    if (!old || typeof old !== 'object') {
      progress = outbreakHours < def.start ? 0 : Math.min(100, Math.max(0, def.base + (outbreakHours - def.start) * def.rate));
    } else if (old.已覆灭 === true) {
      progress = Math.max(0, Math.min(100, Number(old.进展) || 0));
    } else {
      const lastStamp = readGameTimestamp(old.最近结算时间);
      const lastHours = lastStamp == null ? outbreakHours : Math.max(0, (lastStamp - outbreakStamp) / 3600000);
      if ((Number(old.进展) || 0) <= 0 && lastHours < def.start && outbreakHours >= def.start) {
        progress = def.base + (outbreakHours - def.start) * def.rate;
      } else {
        const elapsed = Math.max(0, outbreakHours - Math.max(lastHours, def.start));
        progress = Math.min(100, Math.max(0, Number(old.进展) || 0) + elapsed * def.rate);
      }
    }
    progress = Math.round(progress * 10) / 10;
    const next = {
      国家: country,
      阶段: old?.已覆灭 === true ? '覆灭' : factionStageName(progress),
      进展: progress,
      已覆灭: old?.已覆灭 === true,
      最近结算时间: currentText,
    };
    if (JSON.stringify(old || null) !== JSON.stringify(next)) { states[def.id] = next; changed = true; }
  }
  // 结构隔离：只写回当前国家定义过的势力，错国记录和未知键不进入后续路由。
  if (!changed) return sd;
  data.stat_data.势力发展 = states;
  try { await p.Mvu.replaceMvuData(data, MVU_LATEST_MESSAGE); return data.stat_data; } catch (e) { return sd; }
}

// 大体量机制使用“双判定”路由：既看持续状态，也看生成前已经出现的当前动作文本，避免首次行动晚一拍。
const BIG_ROUTE_KEYWORDS = Object.freeze({
  '机制-战斗': ['攻击','开火','射击','战斗','交战','搏斗','格斗','反击','击杀','挥砍','刺击','敌袭'],
  '机制-伤病与医疗': ['受伤','伤口','流血','骨折','疼痛','感染','治疗','包扎','止血','手术','用药','急救','清创','缝合'],
  '机制-完整度': ['损坏','耐久','完整度','维修','修理','保养','破损','断裂','开火','射击','战斗','拆解','制造','工具'],
  '机制-制造': ['制造','制作','合成','加工','改装','维修','修理','保养','工作台','研究配方','组装','拆解设备'],
  '物品-载具': ['驾驶','驾车','开车','乘车','坐车','上车','下车','启动车辆','停车','行驶','车内','车上','摩托','船只'],
});

function readRecentTriggerText() {
  try {
    const context = p.SillyTavern?.getContext?.() || p.getContext?.() || null;
    const chat = context?.chat || p.chat;
    if (!Array.isArray(chat)) return '';
    return chat.slice(-2).map(message => String(message?.mes ?? message?.message ?? message?.text ?? '')).join('\n');
  } catch (e) {
    return '';
  }
}

function buildEnableSet(sd, triggerText = '') {
  const enable = new Set();
  const nat           = readNationality(sd);
  const phase         = sd?.世界阶段 ?? '秩序期';
  const infMode       = sd?.感染者行为模式 ?? '狂病型';
  const npcMode       = sd?.NPC行为模式 ?? '正常型';
  const extra         = sd?.扩展内容 ?? {};
  const noDefinedRoleMode = sd?.无定义角色模式 === true;
	const factionDefs = FACTION_DEFINITIONS[nat] || [];
	if (phase === '爆发期' || phase === '末世期') {
	  enable.add('[mvu_update]势力发展');
	  factionDefs.forEach(def => {
	    const stage = factionStageNumber(sd?.势力发展?.[def.id]);
	    const stageEntry = factionStageEntry(nat, def.id, stage);
	    if (stageEntry) enable.add(stageEntry);
	    if (stage === 4) enable.add(def.detail);
	  });
	}

  if (extra.超事件 === true) {
    // 目录在扩展开启后常驻，确保变量模型知道合法事件 ID；状态推进仍只在末世期且已选事件时启用。
    enable.add(SUPER_EVENT_CATALOG_ENTRY);
  }
  if (extra.超事件 === true && phase === '末世期' && sd?.超事件?.事件ID && !sd?.超事件?.已解决) {
    enable.add(SUPER_EVENT_UPDATE_ENTRY);
  }

  ALWAYS_UPDATE_ENTRIES.forEach(e => enable.add(e));
  if (PHASE_UPDATE_ENTRIES[phase]) enable.add(PHASE_UPDATE_ENTRIES[phase]);
  // 秩序期只有普通呼吸道疾病，不启用任何感染者行为更新规则。
  // 感染者模式字段可能在创角默认值中提前写成“狂病型”，不能据此越过阶段门槛。
  if ((phase === '爆发期' || phase === '末世期') && INFECTED_UPDATE_ENTRIES[infMode]) {
    enable.add(INFECTED_UPDATE_ENTRIES[infMode]);
  }
  if (NPC_UPDATE_ENTRIES[npcMode]) enable.add(NPC_UPDATE_ENTRIES[npcMode]);
  if (sd?.营地?.已建立 === true) {
    enable.add(CAMP_PERSISTENT_UPDATE_ENTRY);
    enable.add(CAMP_PERSISTENT_PLOT_ENTRY);
  }

  if (extra.业火归途 === true) {
    YEHuo_EXTRA_ENTRIES.forEach(e => enable.add(e));
  }
  if (extra.瑟瑟加强 === true) {
    ADULT_EXTRA_BASE_ENTRIES.forEach(e => enable.add(e));
    if (phase === '爆发期' || phase === '末世期') {
      ADULT_EXTRA_POST_OUTBREAK_ENTRIES.forEach(e => enable.add(e));
    }
    const physiology = Object.values(sd?.生理追踪 ?? {});
    const hasPregnancyFlow = physiology.some(v => v && ['孕早期', '孕中期', '孕晚期', '分娩期', '产后恢复期', '哺乳期'].includes(v.阶段));
    if (hasPregnancyFlow) ADULT_EXTRA_PREGNANCY_ENTRIES.forEach(e => enable.add(e));
  }
  if (extra.暗线主角 === true && !noDefinedRoleMode) DARKLINE_ENTRIES.forEach(e => enable.add(e));

  // 配方规范只在存在待审核项时加载，并按申请类别精确路由；审核完成删除
  // 预审项后自动关闭，避免日常制造长期携带整套配方知识。
  const pendingRecipes = Object.entries(sd?.可制造?.预审配方 ?? {}).filter(pair => pair[1] && typeof pair[1] === 'object');
  if (pendingRecipes.length > 0) {
    enable.add(RECIPE_REVIEW_ENTRY);
    pendingRecipes.forEach(pair => {
      const recipeName = pair[0];
      const recipe = pair[1];
      const category = recipe.产出类型 === '载具' ? '载具' : (recipe.产出类别 || '其他杂物');
      enable.add(RECIPE_CATEGORY_ENTRIES[category] || RECIPE_CATEGORY_ENTRIES['其他杂物']);
      if (/(自动|机器人|无人机|人工智能|战术AI|量子|生物科技|基因|疫苗|再生能源)/.test(recipeName + ' ' + (recipe.描述 || ''))) {
        enable.add(RECIPE_CATEGORY_ENTRIES['尖端科技']);
      }
    });
  }

  const activeActivities = Array.isArray(sd?.当前活动) ? sd.当前活动 : [];
  const activitySet = new Set(activeActivities);

  const currentText = String(triggerText || '');
  if (currentText) {
    for (const [entryName, keywords] of Object.entries(BIG_ROUTE_KEYWORDS)) {
      if (keywords.some(keyword => currentText.includes(keyword))) enable.add(entryName);
    }
  }
  // 已建档人物跨国籍也要保持详情条目可被酒馆关键词扫描；选择性条目不会因此自动注入全文。
  const activeCharacterNames = new Set([
    ...Object.keys(sd?.NPC ?? {}),
    ...Object.keys(sd?.队友 ?? {}),
    ...Object.keys(sd?.营地?.成员 ?? {}),
  ]);
  const characterCountries = ['华国', '美利坚国', '法国', '大毛国', '日本国', '巴西国', '北非'];
  if (!noDefinedRoleMode) {
    activeCharacterNames.forEach(name => characterCountries.forEach(country => {
      enable.add(`${country}/角色/${name}/基础信息`);
      enable.add(`${country}/人物/${name}/基础信息`);
    }));
  }
  if (activeActivities.length > 0) {
    enable.add('机制-活动叠加与冲突');
  }
  activeActivities.forEach(activity => {
    (ACTIVITY_ENTRIES[activity] || []).forEach(entry => enable.add(entry));
  });

  // 状态达到叙事阈值时补开影响条目；不靠活动标签掩盖已经存在的饥渴、疲劳或伤病。
  const core = sd?.核心状态 ?? {};
  if ((core.hunger_current ?? 100) < 80 || (core.thirst_current ?? 100) < 80) {
    enable.add('机制-饱食度，饱水度与体重');
  }
  if ((core.stamina_current ?? 100) < 40) enable.add('机制-体力');
  if ((core.hp_current ?? 100) < (core.hp_max ?? 100) || !/^健康/.test(String(sd?.衍生状态?.physical_status ?? '健康'))) {
    enable.add('机制-伤病与医疗');
    enable.add('机制-毁伤');
  }
  const carryKg = Object.values(sd?.物品 ?? {}).reduce((sum, item) => {
    if (!item || typeof item !== 'object' || item.type) return sum;
    return sum + Math.max(0, Number(item.weight) || 0) * Math.max(0, Number(item.count) || 0);
  }, 0);
  const endurance = Number(sd?.SPECIAL?.E) || 0;
  const carryReference = endurance >= 3 ? 45 : endurance <= -2 ? 20 : 30;
  if (carryKg > carryReference * 0.5) enable.add('机制-负重');

  const customTraits = Array.isArray(sd?.特质?.自定义) ? sd.特质.自定义 : [];
  const negativeTraits = Array.isArray(sd?.特质?.负面) ? sd.特质.负面 : [];
  const narrativeMode = String(sd?.叙事模式 ?? '');
  const succubusActive = narrativeMode === '魅魔契约'
    || negativeTraits.some(v => String(v).startsWith('[魅魔契约]'))
    || customTraits.some(v => String(v).startsWith('[魅魔异能]'));
  if (succubusActive) {
    enable.add('[mvu_plot]魅魔契约-审查');
    enable.add('魅魔契约-契约诅咒');
    const selected = customTraits.find(v => String(v).startsWith('[魅魔异能]')) || '';
    const powerEntries = {
      '魅惑光环': '魅魔契约-异能-sp_charm_aura', '信息素操控': '魅魔契约-异能-sp_pheromone_control',
      '梦境编织': '魅魔契约-异能-sp_dream_weave', '触感溯源': '魅魔契约-异能-sp_touch_read',
      '灵魂锚定': '魅魔契约-异能-sp_soul_anchor',
    };
    Object.entries(powerEntries).forEach(([name, entry]) => { if (String(selected).includes(name)) enable.add(entry); });
  }
  if (narrativeMode === '地狱' || customTraits.some(v => String(v).startsWith('[地狱异能]'))) {
    enable.add('地狱模式-变种感染者');
  }

  if (phase === '秩序期') {
    for (const e of [
      '世界观-各国政府情况',
      '大爆发前/大爆发前夕', '大爆发前/规则-异常事件应对',
      '大爆发前/规则-物资获取', '大爆发前/规则-医疗与健康',
      '大爆发前/规则-社会秩序', '大爆发前/规则-冲突与应对',
    ]) enable.add(e);
  } else if (phase === '爆发期' || phase === '末世期') {
    enable.add('[mvu_update]威胁压力');
    if (sd?.衍生状态?.camp === '流浪') enable.add('世界观-流浪者');
    if (activitySet.has('探索') || activitySet.has('搜刮')) enable.add('杂项-幸存者据点动态生成');
    if (activitySet.has('医疗') || activitySet.has('搜刮')) enable.add('物品-药物');
    if (activitySet.has('医疗')) enable.add('物品-灭杀疫苗');
    if ((core.infection_current ?? 0) > 0 || activitySet.has('医疗') || activitySet.has('战斗')) {
      enable.add('机制-COVID-30感染');
      enable.add('[mvu_update]感染进程');
    }
    if ((sd?.环境?.hatred ?? 0) >= 51) enable.add('机制-找事儿');
    if ((core.morale_current ?? 100) < 50 || activitySet.has('战斗')) {
      enable.add('机制-恐慌（默认不开，因为哈基米会绝望）');
      enable.add('[mvu_update]恐慌');
    }
    if (activitySet.has('对话') || activitySet.has('交易')) enable.add('杂项-幸存者NPC关系推进');
    if (/半感染/.test(String(sd?.衍生状态?.physical_status ?? ''))) {
      enable.add('世界观-半感染者');
      enable.add('机制-半感染者生存机制');
      enable.add('[mvu_update]半感染者生存');
    }
    if (phase === '末世期') {
      for (const e of [
        '世界观-末世期', '世界观-COVID-30变体感染者',
        '机制-官方安全区行为', '机制-痛啊好痛啊！', '机制-死亡',
      ]) enable.add(e);
    }
  } else {
    for (const e of [
      '大爆发前/大爆发前夕', '大爆发前/规则-异常事件应对', '大爆发前/规则-物资获取',
      '大爆发前/规则-医疗与健康', '大爆发前/规则-社会秩序', '大爆发前/规则-冲突与应对',
    ]) enable.add(e);
  }

  if (infMode === '狂病型') {
    enable.add('[mvu_plot]杂项-合理性审查');
    if (activitySet.has('探索') || activitySet.has('战斗') || activitySet.has('潜行')) enable.add('杂项-场景强化(可选)');
    if (nat === '巴西国' || phase !== '秩序期') {
      enable.add('世界观-COVID-30感染者行为总纲');
    } else {
      enable.add('大爆发前/感染者');
    }
    if (phase === '爆发期') enable.add('世界观-爆发期');
    if ((phase === '爆发期' || phase === '末世期') && (activitySet.has('探索') || activitySet.has('战斗') || (sd?.环境?.hatred ?? 0) >= 31)) {
      enable.add('机制-动态威胁与安逸惩罚');
      enable.add('[mvu_update]威胁压力');
    }
    if (phase === '末世期' && (activitySet.has('探索') || activitySet.has('搜刮'))) enable.add('杂项-感染者遭遇动态生成');
  } else if (infMode === '普通型') {
    enable.add('[mvu_plot]普通审查');
    if (activitySet.has('探索') || activitySet.has('战斗') || activitySet.has('潜行')) enable.add('普通场景强化(可选)');
    if (nat === '巴西国' || phase !== '秩序期') {
      enable.add('普通丧尸COVID-30感染者');
    } else {
      enable.add('大爆发前/感染者');
    }
    if (phase === '爆发期') enable.add('普通爆发期');
    if ((phase === '爆发期' || phase === '末世期') && (activitySet.has('探索') || activitySet.has('战斗') || (sd?.环境?.hatred ?? 0) >= 31)) {
      for (const e of ['普通感染者多样性', '普通-机制-丧尸尸潮', '普通的动态威胁与安逸惩罚']) enable.add(e);
      enable.add('[mvu_update]威胁压力');
    }
    if (phase === '末世期' && (activitySet.has('探索') || activitySet.has('搜刮'))) enable.add('普通感染者遭遇');
  }

  const npcRelevant = activitySet.has('对话') || activitySet.has('交易') || activitySet.has('探索') || Object.keys(sd?.NPC ?? {}).length > 0;
  if (npcMode === '正常型') {
    if (npcRelevant) enable.add('杂项-NPC动态生成');
    if (npcRelevant && (phase === '爆发期' || phase === '末世期')) enable.add('杂项-末世社交互动法则');
  } else if (npcMode === '全员恶人型') {
    if (npcRelevant) enable.add('恶意的NPC生成');
    if (npcRelevant && (phase === '爆发期' || phase === '末世期')) enable.add('恶意社交法则');
  }

  const summaryMap = {
    '华国':'华国已定义NPC摘要', '美利坚国':'美利坚国已定义NPC摘要',
    '日本国':'日本国已定义NPC摘要', '大毛国':'大毛国已定义NPC摘要',
    '法国':'法国已定义NPC摘要',
  };
  if (!noDefinedRoleMode && summaryMap[nat]) enable.add(summaryMap[nat]);

  // 人物详情、势力、地点与彩蛋由酒馆原生关键词/递归配置负责；小助手不扫描正文关键词。
  if (nat === '日本国') {
    enable.add('世界观-日本国暗线');
  }
  if (nat === '美利坚国') {
    if (phase === '秩序期') {
      enable.add('世界观-美利坚爆发前');
    } else if (phase === '爆发期' || phase === '末世期') {
      enable.add('世界观-美利坚爆发后势力格局');
      if (factionDefs.some(def => ['铁冠帮', '净世圣殿'].includes(def.id) && factionStageNumber(sd?.势力发展?.[def.id]) > 0)) {
        enable.add('世界观-美利坚特色无序者总体设定');
      }
    }
  }
  if (nat === '大毛国') {
    enable.add('世界观-大毛生活图景');
    if (phase === '秩序期') {
      enable.add('世界观-大毛国爆发前'); enable.add('世界观-势力爆发前');
    } else if (phase === '爆发期' || phase === '末世期') {
      enable.add('世界观-大毛国爆发后概览');
    }
  }
  if (nat === '法国') {
    if (phase === '秩序期') {
      enable.add('世界观-法国爆发前');
    } else if (phase === '爆发期' || phase === '末世期') {
      enable.add('世界观-爆发期的法国');
      if (phase === '末世期') enable.add('世界观-末世期的法国');
    }
  }
  if (nat === '巴西国') {
    enable.add(phase === '秩序期' ? '世界观-秩序期的巴西' : '世界观-爆发后的巴西');
  }
  if (nat === '北非') {
    enable.add(phase === '秩序期' ? '世界观-秩序期的北非' : '世界观-爆发后的北非');
  }

  // 极端天气 — 读取环境.天气，匹配终年XX则启用对应世界书条目
  const weather = sd?.环境?.天气 ?? '';
  if (weather.startsWith('终年')) enable.add(weather);

  return enable;
}

var MANAGED_ENTRIES = new Set([
  // 旧版重复裁决锁仅用于识别并关闭；新版唯一入口是“合理性审查与对抗判定”。
  '[mvu_plot]肘击输出正文的AI(妮卡社音酱留给大家用的，要长期肘的东西放里面)',
  ...ALWAYS_UPDATE_ENTRIES,
  ...Object.values(PHASE_UPDATE_ENTRIES),
  ...Object.values(INFECTED_UPDATE_ENTRIES),
  ...Object.values(NPC_UPDATE_ENTRIES),
  CAMP_PERSISTENT_UPDATE_ENTRY,
  RECIPE_REVIEW_ENTRY,
  ...Object.values(RECIPE_CATEGORY_ENTRIES),
  '[mvu_update]威胁压力','[mvu_update]恐慌','[mvu_update]物品完整度',
  '[mvu_update]感染进程','[mvu_update]半感染者生存',
  '世界观-各国政府情况',
  '大爆发前/感染者','大爆发前/大爆发前夕','大爆发前/规则-异常事件应对',
  '大爆发前/规则-物资获取','大爆发前/规则-医疗与健康',
  '大爆发前/规则-社会秩序','大爆发前/规则-冲突与应对',
  '世界观-半感染者','世界观-流浪者',
  '杂项-幸存者据点动态生成','机制-建造庇护所','物品-灭杀疫苗','物品-药物',
  '机制-COVID-30感染','机制-找事儿','机制-制造','机制-完整度',
  '机制-战斗','机制-恐慌（默认不开，因为哈基米会绝望）','机制-伤病与医疗',
  '杂项-搜刮结果动态生成','杂项-幸存者NPC关系推进',
  '机制-搜刮物资','机制-半感染者生存机制','机制-沉浸式体验','机制-种田！我要种田！',
  '世界观-末世期','世界观-COVID-30变体感染者',
  '机制-官方安全区行为','机制-痛啊好痛啊！','机制-死亡',
  '世界观-COVID-30感染者行为总纲','[mvu_plot]杂项-合理性审查','杂项-场景强化(可选)',
  '世界观-爆发期','机制-动态威胁与安逸惩罚','杂项-感染者遭遇动态生成',
  '普通丧尸COVID-30感染者','[mvu_plot]普通审查','普通场景强化(可选)',
  '普通爆发期','普通感染者多样性','普通-机制-丧尸尸潮',
  '普通的动态威胁与安逸惩罚','普通感染者遭遇',
  '杂项-NPC动态生成','杂项-末世社交互动法则','恶意的NPC生成','恶意社交法则',
  '华国已定义NPC摘要','美利坚国已定义NPC摘要','日本国已定义NPC摘要',
  '大毛国已定义NPC摘要','法国已定义NPC摘要',
  '世界观-日本国暗线','世界观-美利坚爆发前','世界观-美利坚爆发后势力格局',
  '世界观-美利坚特色无序者总体设定',
  '世界观-大毛生活图景','世界观-大毛国爆发前','世界观-势力爆发前',
  '世界观-大毛国爆发后概览',
  '世界观-法国爆发前','世界观-爆发期的法国','世界观-末世期的法国',
  '世界观-秩序期的巴西','世界观-爆发后的巴西',
  '世界观-秩序期的北非','世界观-爆发后的北非',
  '终年晴朗','终年暴雨','终年雾霾','终年严寒',
  '终年酷热','终年尘暴','终年雷暴','终年晦暗',
  '暗线主角已定义NPC摘要',
  '暗线主角/约修亚/基础信息',
  '暗线主角/林青/基础信息',
  '[mvu_plot]暗线主角-引入与退场',
	'[mvu_update]势力发展',
	...Object.entries(FACTION_DEFINITIONS).flatMap(([country, defs]) => defs.flatMap(def => [
	  def.detail,
	  ...[1,2,3,4].map(stage => factionStageEntry(country, def.id, stage)),
	])),
  '机制-活动叠加与冲突','机制-休息与睡眠','机制-探索','机制-钓鱼','机制-交易','机制-驾驶与乘车','机制-通讯','机制-营地经营',
  '机制-舒适度','机制-体力','机制-负重','机制-毁伤','机制-饱食度，饱水度与体重','物品-载具',
  ...YEHuo_EXTRA_ENTRIES,
  ...ADULT_EXTRA_BASE_ENTRIES,
  ...ADULT_EXTRA_POST_OUTBREAK_ENTRIES,
  ...ADULT_EXTRA_PREGNANCY_ENTRIES,
  ...CONTRACT_MODE_ENTRIES,
  ...SUPER_EVENT_POOL.map(e => e.entry),
  SUPER_EVENT_UPDATE_ENTRY, SUPER_EVENT_CATALOG_ENTRY,
]);

async function applyToWorldbook(enableSet, wbName, nat, sd) {
  if (typeof TavernHelper === 'undefined' || typeof TavernHelper.getWorldbook !== 'function') {
    throw new Error('TavernHelper 世界书接口不可用，请确认酒馆助手已启用');
  }

  let entries;
  const noDefinedRoleMode = sd?.无定义角色模式 === true;
  try {
    entries = await TavernHelper.getWorldbook(wbName);
  } catch (error) {
    throw new Error(`无法获取世界书“${wbName}”：${error.message || error}`);
  }
  if (!Array.isArray(entries)) throw new Error(`世界书“${wbName}”返回的数据不是条目数组`);

  let changed = false;
  const enabledList = [];
  const disabledList = [];
  let sectionCountry = null;
  let sectionKind = null;
  const supportedCountries = new Set(['华国', '美利坚国', '法国', '大毛国', '日本国', '巴西国', '北非']);

  for (const entry of entries) {
    const entryName = entry.comment || entry.name || entry.title || '';
    if (applyPromptLayerProfile(entry, getPromptLayerProfile(entryName, entry))) changed = true;
    if (entryName === '[mvu_update]变量输出格式强化') {
      const shouldEnable = getMvuCfg()?.更新方式 === '随AI输出';
      const stateMismatch = entry.enabled !== shouldEnable || ('disable' in entry && entry.disable === shouldEnable);
      entry.constant = true;
      entry.selective = false;
      entry.key = [];
      entry.keysecondary = [];
      entry.enabled = shouldEnable;
      if ('disable' in entry) entry.disable = !shouldEnable;
      _mvuOutputFormatEnabled = shouldEnable;
      if (stateMismatch) changed = true;
      (shouldEnable ? enabledList : disabledList).push(entryName);
      continue;
    }
    const anchor = entryName.match(/｜([^｜]+)·(专有条目|势力发展|角色绿灯)/);
    if (anchor) {
      sectionCountry = supportedCountries.has(anchor[1]) ? anchor[1] : null;
      sectionKind = anchor[2];
      continue;
    }
    if (entryName.startsWith('────')) {
      sectionCountry = null;
      sectionKind = null;
    }

    const nativeGreenKeys = NATIVE_GREEN_KEYWORDS[entryName];
    const isNativeGreen = Array.isArray(nativeGreenKeys);
    const isRequiredBlue = REQUIRED_BLUE_ENTRIES.has(entryName);
    const isManaged = MANAGED_ENTRIES.has(entryName);
    const isCountryExclusive = (sectionKind === '专有条目' || sectionKind === '势力发展') && !!sectionCountry;
    const factionDetail = FACTION_DETAIL_INDEX.get(entryName);
    if (!isManaged && !isCountryExclusive && !isNativeGreen && !isRequiredBlue) continue;

    let shouldEnable = (isNativeGreen || isRequiredBlue) ? true : (isManaged ? enableSet.has(entryName) : true);
    if (isCountryExclusive) {
      shouldEnable = sectionCountry === nat && (!isManaged || enableSet.has(entryName));
	  if (factionDetail) {
	    const stage = factionDetail.country === nat ? factionStageNumber(sd?.势力发展?.[factionDetail.id]) : 0;
	    shouldEnable = stage === 4 && enableSet.has(entryName);
	  }
    }
    let configMismatch = false;
    if (isNativeGreen) {
      const expectedKeys = [...new Set(nativeGreenKeys)];
      configMismatch = entry.constant !== false || entry.selective !== true ||
        JSON.stringify(entry.key || []) !== JSON.stringify(expectedKeys) ||
        Number(entry.scanDepth) !== 2 || entry.caseSensitive !== false || entry.matchWholeWords !== false;
      entry.constant = false;
      entry.selective = true;
      entry.key = expectedKeys;
      entry.keysecondary = [];
      entry.scanDepth = 2;
      entry.caseSensitive = false;
      entry.matchWholeWords = false;
      entry.probability = 100;
      entry.useProbability = true;
    } else if (isRequiredBlue) {
      configMismatch = entry.constant !== true || entry.selective !== false || (entry.key || []).length !== 0;
      entry.constant = true;
      entry.selective = false;
      entry.key = [];
      entry.keysecondary = [];
    }
    const stateMismatch = entry.enabled !== shouldEnable || ('disable' in entry && entry.disable === shouldEnable);
    if (stateMismatch) {
      entry.enabled = shouldEnable;
      if ('disable' in entry) entry.disable = !shouldEnable;
      changed = true;
      (shouldEnable ? enabledList : disabledList).push(entryName);
    }
    if (configMismatch) changed = true;
  }

  // 人物详情由原生绿灯关键词触发；这里只隔离国籍，不在运行时拼接正则脚本。
  for (const entry of entries) {
    const detailName = entry.comment || entry.name || entry.title || '';
    const parts = detailName.split('/');
    const isCharacterDetail = parts.length === 4 &&
      (parts[1] === '角色' || parts[1] === '人物') &&
      !!parts[0] && !!parts[2] && parts[3] === '基础信息';
    if (!isCharacterDetail) continue;

    const shouldEnable = !noDefinedRoleMode && !!nat && (parts[0] === nat || enableSet.has(detailName));
    const stateMismatch = entry.enabled !== shouldEnable || ('disable' in entry && entry.disable === shouldEnable);
    if (stateMismatch) {
      entry.enabled = shouldEnable;
      if ('disable' in entry) entry.disable = !shouldEnable;
      changed = true;
      (shouldEnable ? enabledList : disabledList).push(detailName);
    }
  }

  if (changed) {
    try {
      await TavernHelper.replaceWorldbook(wbName, entries);
    } catch (error) {
      throw new Error(`无法保存世界书“${wbName}”：${error.message || error}`);
    }
  }

  const activeEntries = entries
    .filter(entry => entry.enabled === true && String(entry.content || '').trim().length > 0)
    .map(entry => entry.comment || entry.name || entry.title || '')
    .filter(Boolean);

  return {
    totalChanged: enabledList.length + disabledList.length,
    log: changed ? [{ wbName, enabled: enabledList, disabled: disabledList }] : [],
    wbNames: [wbName],
    totalEntries: entries.length,
    activeEntries,
  };
}

var _runningPromise = null;
var _pendingSwitch  = false;
var _debounceTimer  = null;
var _postUpdateTimer = null;

async function autoSwitch() {
  if (_runningPromise) {
    _pendingSwitch = true;
    return _runningPromise;
  }

  _runningPromise = (async () => {
    bubble && bubble.classList.add('running');
    try {
      if (typeof p.Mvu === 'undefined') throw new Error('Mvu 不可用');

      let sd = readStatData();
      if (!sd) {
        throw new Error('未读取到最新消息的 MVU 变量，请先确认当前消息已经初始化变量');
      }

	  // 当前国家的每个势力独立按游戏时间推进；玩家和剧情造成的增减保留在各自记录中。
	  sd = await reconcileFactionDevelopment(sd);

      // 超事件是独立状态机：末世期才随机一次；第三阶段才打开对应剧情条目。
      const superState = await reconcileSuperEvent(sd);
      sd = superState.sd || sd;

      const enableSet = buildEnableSet(sd, readRecentTriggerText());
      SUPER_EVENT_POOL.forEach(e => enableSet.delete(e.entry));
      if (superState.event && superEventStage(sd.超事件?.进展, sd.超事件?.已解决) === 3) {
        enableSet.add(superState.event.entry);
      }
      const wbName = await api_resolveWorldbookName();
      const nationality = readNationality(sd);
	  const result = await applyToWorldbook(enableSet, wbName, nationality, sd);
      // 同步输出格式强化条目状态
      await syncOutputFormatFlag().catch(() => {});
      const logSummary = result.log.map(l =>
        l.wbName + ' ▲' + l.enabled.length + ' ▼' + l.disabled.length
      ).join(' | ');
      p._jmzqLastResult = {
        time: Date.now(), ok: true,
        stat: {
          phase:  sd.世界阶段,
          叙事模式: sd.叙事模式,
          nat:    nationality,
          感染者: sd.感染者行为模式,
          NPC模式:sd.NPC行为模式,
          业火归途: sd.扩展内容?.业火归途 === true,
          瑟瑟加强: sd.扩展内容?.瑟瑟加强 === true,
          暗线主角: sd.扩展内容?.暗线主角 === true,
          当前活动: Array.isArray(sd.当前活动) ? sd.当前活动 : [],
          超事件: sd.超事件?.事件ID ? `${sd.超事件.事件ID} / 进展${sd.超事件.进展 ?? 0}%` : '未启用',
        },
        want: [...enableSet],
        totalChanged: result.totalChanged,
        log: result.log,
        worldbookName: wbName,
        totalEntries: result.totalEntries,
        activeEntries: result.activeEntries,
      };
    } catch (err) {
      console.error('[JMZQ] 执行失败:', err);
      p._jmzqLastResult = { time: Date.now(), ok: false, error: err.message };
    }
    p.document.dispatchEvent(new CustomEvent('jmzq-done', { detail: p._jmzqLastResult }));
  })();

  try { await _runningPromise; } finally {
    _runningPromise = null;
    bubble && bubble.classList.remove('running');

    if (_pendingSwitch) {
      _pendingSwitch = false;
      setTimeout(() => autoSwitch(), 100);
    }
  }
}

function onCriticalEvent() {
  clearTimeout(_debounceTimer);
  return autoSwitch();
}

function onSecondaryEvent() {
  clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(autoSwitch, 200);
  // MESSAGE_RECEIVED 与 MVU 的额外模型解析并行派发。200ms 预切换用于及时准备
  // 当前请求；延迟复核等待变量模型写回最新 stat_data，修正阶段/营地/配方等路由。
  clearTimeout(_postUpdateTimer);
  _postUpdateTimer = setTimeout(autoSwitch, 3600);
}
function onSuperEventGenerationFinished() {
  if (!p._jmzqSuperEventCatchupId) return;
  delete p._jmzqSuperEventCatchupId;
  clearSuperEventPrompt();
}

const CRITICAL_EVENTS = [
  'global_Mvu_initialized',
  'message_sent',               'MESSAGE_SENT',
  'generate_before_combine_prompts', 'GENERATE_BEFORE_COMBINE_PROMPTS',
];

const SECONDARY_EVENTS = [
  'character_message_rendered', 'CHARACTER_MESSAGE_RENDERED',
  'message_received',           'MESSAGE_RECEIVED',
  'user_message_rendered',      'USER_MESSAGE_RENDERED',
];

const ALL_EVENTS = [...CRITICAL_EVENTS, ...SECONDARY_EVENTS];
const CONTEST_BEFORE_EVENTS = [
  // 该事件会携带normal/regenerate/swipe等生成类型，可可靠隔离重生成来源页。
  'generation_after_commands', 'GENERATION_AFTER_COMMANDS',
];
const CONTEST_FINISH_EVENTS = [
  'generation_ended', 'GENERATION_ENDED',
  'generation_stopped', 'GENERATION_STOPPED',
  'message_received', 'MESSAGE_RECEIVED',
  'character_message_rendered', 'CHARACTER_MESSAGE_RENDERED',
  'message_swiped', 'MESSAGE_SWIPED',
  'message_edited', 'MESSAGE_EDITED',
];

if (typeof eventOn === 'function') {
  for (const evt of CRITICAL_EVENTS) {
    try { eventOn(evt, onCriticalEvent); } catch(e) {}
  }
  for (const evt of SECONDARY_EVENTS) {
    try { eventOn(evt, onSecondaryEvent); } catch(e) {}
  }
  for (const evt of ['character_message_rendered', 'CHARACTER_MESSAGE_RENDERED', 'message_received', 'MESSAGE_RECEIVED']) {
    try { eventOn(evt, onSuperEventGenerationFinished); } catch(e) {}
  }
  for (const evt of CONTEST_BEFORE_EVENTS) {
    try { eventOn(evt, onContestBeforeGeneration); } catch(e) {}
  }
  for (const evt of CONTEST_FINISH_EVENTS) {
    try { eventOn(evt, onContestGenerationFinished); } catch(e) {}
  }
p._jmzqCleanup = function() {
  clearSuperEventPrompt();
  contestClearPrompt();
  clearTimeout(_contestScanTimer);
  clearTimeout(_debounceTimer);
  clearTimeout(_postUpdateTimer);
    delete p._jmzqSuperEventCatchupId;
    p.document.getElementById('jmzq-super-event-modal')?.remove();
    if (typeof eventOff === 'function') {
      for (const evt of ALL_EVENTS) { try { eventOff(evt, onCriticalEvent); } catch(e) {} }
      for (const evt of ALL_EVENTS) { try { eventOff(evt, onSecondaryEvent); } catch(e) {} }
      for (const evt of ['character_message_rendered', 'CHARACTER_MESSAGE_RENDERED', 'message_received', 'MESSAGE_RECEIVED']) {
        try { eventOff(evt, onSuperEventGenerationFinished); } catch(e) {}
      }
      for (const evt of CONTEST_BEFORE_EVENTS) { try { eventOff(evt, onContestBeforeGeneration); } catch(e) {} }
      for (const evt of CONTEST_FINISH_EVENTS) { try { eventOff(evt, onContestGenerationFinished); } catch(e) {} }
    }
  };
} else {
}

function refreshUI() {
  const r = p._jmzqLastResult;
  if (!r) return;
  const escapeHtml = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (r.ok) {
    statusDot.className = 'jmzq-dot ok';
    statTags.innerHTML = [
      r.stat.phase   && `<span class="jmzq-tag">${r.stat.phase}</span>`,
      r.stat.nat     && `<span class="jmzq-tag">${r.stat.nat}</span>`,
      r.stat.感染者  && `<span class="jmzq-tag">${r.stat.感染者}</span>`,
      r.stat.NPC模式 && `<span class="jmzq-tag">${r.stat.NPC模式}</span>`,
    ].filter(Boolean).join('');
    const enabled = Array.isArray(r.activeEntries) ? r.activeEntries : [];
    if (activeCount) activeCount.textContent = `${enabled.length} / ${r.totalEntries ?? '?'}`;
    if (activeEntries) {
      activeEntries.innerHTML = enabled.length
        ? enabled.map(name => `<span class="jmzq-active-entry" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`).join('')
        : '<span style="font-size:9px;color:#a08070;">暂无启用条目</span>';
    }
  } else {
    statusDot.className = 'jmzq-dot err';
    statTags.innerHTML = `<span class="jmzq-tag err">ERROR</span>`;
    if (activeCount) activeCount.textContent = '读取失败';
    if (activeEntries) activeEntries.innerHTML = `<span style="font-size:9px;color:#e74c3c;">${escapeHtml(r.error || '未知错误')}</span>`;
  }
}

async function checkWorldbookCount() {
  try {
    const wbName = await api_resolveWorldbookName();
    const entries = await api_getWorldbook(wbName);
    if (!Array.isArray(entries)) return;
    // 当前可导入的缄默之秋3.0世界书由组装脚本生成，共 567 条（含锚点）。
    // 目录条目属于超事件扩展，默认关闭；数量校验只核对完整性，不代表启用状态。
    const expected = 567;
    statusText.textContent = `${wbName} · ${entries.length} 条${entries.length === expected ? '' : `（应为 ${expected}）`}`;
    statusText.style.color = entries.length === expected ? '#4ade80' : '#e74c3c';
  } catch (e) {
    statusText.textContent = `世界书读取失败：${e.message || e}`;
    statusText.style.color = '#e74c3c';
  }
}

// --- 事件绑定 ---
refreshBtn.addEventListener('click', async () => { syncOutputFormatFlag().then(() => checkConfig()); refreshMvuConfigStatus(); autoSwitch(); checkEjsTemplate(); showToast('已刷新'); });

manualWbApply.addEventListener('click', () => {
  const name = manualWbSelect.value;
  if (!name) { showToast('请先选择世界书'); return; }
  _jmzqManualWbName = name;
  if (manualWbLabel) { manualWbLabel.textContent = '当前世界书（手动选择）'; manualWbLabel.style.color = '#4ade80'; }
  if (statusText) { statusText.textContent = name; statusText.style.color = '#4ade80'; }
  if (bubble) bubble.classList.remove('warn');
  showToast('已切换: ' + name);
  autoSwitch();
});

mvuUpdateMode.addEventListener('change', () => {
  mvuExtraPanel.style.display = mvuUpdateMode.value === '额外模型解析' ? '' : 'none';
  refreshModelSourceVisibility();
  onMvuFieldChange();
});
mvuModelSource.addEventListener('change', () => {
  refreshModelSourceVisibility();
  onMvuFieldChange();
});
mvuJailbreak.addEventListener('change', () => {
  const isOther = mvuJailbreak.value === '使用其他预设';
  mvuPresetRow.style.display = isOther ? '' : 'none';
  if (isOther) populatePresets(mvuPresetName.value || '');
  onMvuFieldChange();
});
mvuRespFormat.addEventListener('change', onMvuFieldChange);
mvuPresetName.addEventListener('change', () => {
  onMvuFieldChange();
  if (mvuPresetName.value) syncMvuNativePreset(mvuPresetName.value);
});
mvuRequestMode.addEventListener('change', onMvuFieldChange);
mvuRequestCount.addEventListener('input', onMvuFieldChange);
mvuAutoRequest.addEventListener('change', onMvuFieldChange);
mvuApiUrl.addEventListener('input', onMvuFieldChange);
mvuApiKey.addEventListener('input', onMvuFieldChange);
mvuFetchModelsBtn.addEventListener('click', fetchModels);
mvuModelName.addEventListener('change', onMvuFieldChange);
mvuMaxTokens.addEventListener('input', onMvuFieldChange);
mvuTemperature.addEventListener('input', onMvuFieldChange);
mvuFreqPenalty.addEventListener('input', onMvuFieldChange);
mvuPresPenalty.addEventListener('input', onMvuFieldChange);
mvuTopP.addEventListener('input', onMvuFieldChange);
mvuTopK.addEventListener('input', onMvuFieldChange);
mvuAutoCleanEnable.addEventListener('change', () => {
  mvuCleanPanel.style.display = mvuAutoCleanEnable.checked ? '' : 'none';
  onMvuFieldChange();
});
mvuCleanInterval.addEventListener('input', onMvuFieldChange);
mvuCleanRecent.addEventListener('input', onMvuFieldChange);
mvuCleanTrigger.addEventListener('input', onMvuFieldChange);
mvuAdvToggle.addEventListener('click', () => {
  const open = mvuAdvPanel.style.display !== 'none';
  mvuAdvPanel.style.display = open ? 'none' : '';
  mvuAdvArrow.classList.toggle('open', !open);
});
// 手动配置手风琴
mvuManualToggle.addEventListener('click', () => {
  const open = mvuManualPanel.style.display !== 'none';
  mvuManualPanel.style.display = open ? 'none' : '';
  mvuManualArrow.classList.toggle('open', !open);
});
// 兼容性复选框委托
mvuCompatChecks.addEventListener('change', (e) => {
  if (e.target.classList.contains('jmzq-mvu-compat-check')) onMvuFieldChange();
});

// 从表单应用配置（完全模仿 applyOptimalMvuConfig 的模式：改cfg → save → sync → reload）
async function applyMvuConfigFromForm() {
  try {
    const cfg = getMvuCfg();
    if (!cfg) { showToast('mvu_settings 不存在，请确认已安装MVU变量框架'); return; }

    cfg.通知 = cfg.通知 || {};
    cfg.通知['MVU框架加载成功'] = true;
    cfg.通知['变量初始化成功'] = true;
    cfg.通知['变量更新出错'] = true;
    cfg.通知['额外模型解析中'] = true;

    cfg.更新方式 = mvuUpdateMode.value;

    cfg.额外模型解析配置 = cfg.额外模型解析配置 || {};
    const em = cfg.额外模型解析配置;
    em.模型来源 = mvuModelSource.value;
    em.破限方案 = mvuJailbreak.value;
    if (mvuJailbreak.value === '使用其他预设' && mvuPresetName) {
      em.预设名称 = mvuPresetName.value;
    } else {
      delete em.预设名称;
    }
    em.应答格式 = mvuRespFormat.value;
    em.兼容假流式 = /假流/i.test(mvuModelName.value);
    em.请求方式 = mvuRequestMode.value;
    em.请求次数 = parseInt(mvuRequestCount.value) || 1;
    em.启用自动请求 = mvuAutoRequest.checked;
    em.api地址 = mvuApiUrl.value;
    em.密钥 = mvuApiKey.value;
    em.模型名称 = mvuModelName.value;
    em.最大回复token数 = parseInt(mvuMaxTokens.value) || 65535;
    em.温度 = parseFloat(mvuTemperature.value) || 1;
    em.频率惩罚 = parseFloat(mvuFreqPenalty.value) || 0;
    em.存在惩罚 = parseFloat(mvuPresPenalty.value) || 0;
    em.top_p = parseFloat(mvuTopP.value) || 1;
    em.top_k = parseInt(mvuTopK.value) || 0;
    adaptExtraModelConfig(em);

    cfg.自动清理变量 = cfg.自动清理变量 || {};
    const ac = cfg.自动清理变量;
    ac.启用 = mvuAutoCleanEnable.checked;
    ac.快照保留间隔 = parseInt(mvuCleanInterval.value) || 50;
    ac.要保留变量的最近楼层数 = parseInt(mvuCleanRecent.value) || 20;
    ac.触发恢复变量的最近楼层数 = parseInt(mvuCleanTrigger.value) || 10;

    cfg.兼容性 = cfg.兼容性 || {};
    const checks = mvuCompatChecks.querySelectorAll('.jmzq-mvu-compat-check');
    checks.forEach(cb => { cfg.兼容性[cb.dataset.key] = cb.checked; });
    clearTimeout(_mvuSaveTimer);
    ewcBackupToEwcYH();

    await saveSettings();

    await ewcSyncMvuDom().catch(() => {});
    if (em.破限方案 === '使用其他预设' && em.预设名称) {
      await syncMvuNativePreset(em.预设名称);
    }

    syncMvuToForm(cfg);
    const live = await mvuLiveApply(cfg).catch(() => ({ ok: false }));
    if (live && live.ok) {
      mvuStatus.textContent = '配置已保存，无感生效';
      showToast('配置已无感应用（未刷新页面）');
      checkConfig();
    } else {
      mvuStatus.textContent = '配置已保存，即将刷新…';
      showToast('配置已应用，1秒后刷新页面…');
      setTimeout(() => { window.parent.location.reload(); }, 1000);
    }
  } catch (e) {
    showToast('MVU配置失败: ' + e.message);
  }
}

mvuApplyBtn.addEventListener('click', async () => {
  const modelName = (mvuModelName.value || '').toLowerCase();
  const isFlash = /flash/.test(modelName) && !/3\.5/.test(modelName);

  if (isFlash) {
    jmzqConfirmMsg.textContent = '检测到Flash系列模型，除3.5 Flash外Flash模型智商不足，建议更换。是否确认应用？';
    jmzqConfirmOk.onclick = async () => {
      jmzqConfirmOverlay.style.display = 'none';
      await applyMvuConfigFromForm();
    };
    jmzqConfirmOverlay.style.display = 'flex';
    return;
  }

  await applyMvuConfigFromForm();
});

jmzqConfirmCancel.addEventListener('click', (e) => {
  e.stopPropagation();
  jmzqConfirmOverlay.style.display = 'none';
  jmzqConfirmBody.style.display = 'none';
  jmzqConfirmOk.textContent = '确认';
});

// 弹窗移动端拖拽（电脑端固定居中）
const jmzqConfirmDragHandle = p.document.getElementById('jmzq-confirm-drag');
var jmzqConfirmDialog = p.document.getElementById('jmzq-confirm-dialog');
let _jmzqDlgTouchReady = false;
function _jmzqDlgInitTouch() {
  if (_jmzqDlgTouchReady) return; _jmzqDlgTouchReady = true;
  if (jmzqConfirmDragHandle) jmzqConfirmDragHandle.style.display = '';
  if (jmzqConfirmDialog) {
    const rect = jmzqConfirmDialog.getBoundingClientRect();
    jmzqConfirmDialog.style.position = 'absolute';
    jmzqConfirmDialog.style.transform = 'none';
    jmzqConfirmDialog.style.left = rect.left + 'px';
    jmzqConfirmDialog.style.top = rect.top + 'px';
    jmzqConfirmDialog.style.maxWidth = '380px';
  }
}
if (jmzqConfirmDragHandle && jmzqConfirmDialog) {
  let dlgDrag = false, dlgSX, dlgSY, dlgLeft, dlgTop;
  // 覆盖层点击关闭
  jmzqConfirmOverlay.addEventListener('click', (e) => {
    if (e.target === jmzqConfirmOverlay) {
      jmzqConfirmOverlay.style.display = 'none';
      jmzqConfirmBody.style.display = 'none';
      jmzqConfirmOk.textContent = '确认';
    }
  });
  jmzqConfirmDragHandle.addEventListener('touchstart', (e) => {
    if (!jmzqConfirmDialog || !e.touches.length) return;
    _jmzqDlgInitTouch();
    dlgDrag = true; dlgSX = e.touches[0].clientX; dlgSY = e.touches[0].clientY;
    dlgLeft = jmzqConfirmDialog.offsetLeft; dlgTop = jmzqConfirmDialog.offsetTop;
  }, { passive: false });
  p.document.addEventListener('touchmove', (e) => {
    if (!dlgDrag || !jmzqConfirmDialog || !e.touches.length) return;
    jmzqConfirmDialog.style.left = (dlgLeft + e.touches[0].clientX - dlgSX) + 'px';
    jmzqConfirmDialog.style.top = (dlgTop + e.touches[0].clientY - dlgSY) + 'px';
  }, { passive: false });
  p.document.addEventListener('touchend', () => { dlgDrag = false; });
}

// --- 初始化 ---
// 1. 注入fetch劫持（拦截黑名单模型的聊天补全请求）
ewcInjectFetchHook();

// 2. 从 _ewcYH 恢复被MVU初始化抹掉的值
ewcRestoreFromEwcYH();

// 3. 触发MVU DOM事件，同步内部缓存
ewcSyncMvuDom().catch(() => {});

// 4. 恢复预设名称并同步到MVU原生「目标预设」
(function restorePreset() {
  const bu = ewcGetEwcYH();
  const cfg = getMvuCfg();
  const em = cfg && cfg.额外模型解析配置;
  if (bu.预设名称 && em && em.破限方案 === '使用其他预设') {
    em.预设名称 = bu.预设名称;
    syncMvuNativePreset(bu.预设名称);
  }
})();

_jmzqPopulateWbSelect();
syncOutputFormatFlag().then(() => checkConfig());
// 每5秒自动检测一次配置（模型切换后呼吸灯自动跟上，无需打开面板）
const configPollTimer = setInterval(() => { syncOutputFormatFlag().then(() => checkConfig()); updateBackendCode(); }, 5000);

// 定时轮询 MVU/ZOD 状态，变化时自动切换世界书
let _lastStatKey = '';
const statPollTimer = setInterval(() => {
  try {
    if (typeof p.Mvu === 'undefined') return;
    const sd = readStatData();
    if (!sd) return;
    const physiologyStages = Object.entries(sd.生理追踪 || {}).map(([name, value]) => `${name}:${value?.阶段 || ''}`).sort().join(',');
    const activeActivities = Array.isArray(sd.当前活动) ? [...sd.当前活动].sort().join(',') : '';
    const pendingRecipeKey = Object.entries(sd.可制造?.预审配方 || {})
      .filter(([, value]) => value && typeof value === 'object')
      .map(([name, value]) => `${name}:${value.产出类型 || value.产出类别 || ''}:${value.描述 || ''}`)
      .sort()
      .join(',');
    const superEventKey = `${sd.扩展内容?.超事件 === true}|${sd.超事件?.事件ID || ''}|${sd.超事件?.进展 ?? 0}|${sd.超事件?.已解决 === true}`;
    const factionKey = Object.entries(sd.势力发展 || {}).map(([name, value]) => `${name}:${value?.阶段 || ''}:${value?.进展 ?? 0}:${value?.已覆灭 === true}`).sort().join(',');
    const key = `${sd.世界阶段}|${sd.环境?.时间 || ''}|${factionKey}|${sd.叙事模式}|${readNationality(sd)}|${sd.感染者行为模式}|${sd.NPC行为模式}|${sd.环境?.天气}|${sd.扩展内容?.业火归途 === true}|${sd.扩展内容?.瑟瑟加强 === true}|${sd.扩展内容?.暗线主角 === true}|${superEventKey}|${activeActivities}|${physiologyStages}|${pendingRecipeKey}`;
    if (key !== _lastStatKey) {
      _lastStatKey = key;
      autoSwitch();
    }
  } catch (e) {}
}, 5000);

refreshMvuConfigStatus();
checkEjsTemplate();
ensureContestRegexes();
contestScheduleScan(500);

// 注册世界书状态刷新事件
const onJmzqDone = () => { refreshUI(); checkWorldbookCount(); };
p.document.addEventListener('jmzq-done', onJmzqDone);

// JS-Slash-Runner 销毁/重建脚本 iframe 时，父页面上的监听器不会自动随 DOM 一起消失。
// 显式回收所有跨 iframe 监听器，防止旧版拖拽代码成为幽灵监听器。
const cleanupMvuEvents = p._jmzqCleanup;
p._jmzqCleanup = function() {
  try { if (typeof cleanupMvuEvents === 'function') cleanupMvuEvents(); } catch (_) {}
  clearTimeout(jmzqEdgeTimer);
  clearTimeout(_debounceTimer);
  clearTimeout(_postUpdateTimer);
  clearInterval(configPollTimer);
  clearInterval(statPollTimer);
  p.document.removeEventListener('mousedown', onOutsidePanelPress);
  p.document.removeEventListener('touchstart', onOutsidePanelPress);
  p.document.removeEventListener('pointermove', onBubbleMove);
  p.document.removeEventListener('pointerup', onBubbleEnd);
  p.document.removeEventListener('pointercancel', onBubbleEnd);
  p.document.removeEventListener('jmzq-done', onJmzqDone);
  p.removeEventListener('resize', onJmzqResize);
  bubble?.removeEventListener('pointerdown', onBubbleStart);
  bubble?.removeEventListener('mouseenter', revealJmzqBubble);
  bubble?.removeEventListener('mouseleave', onBubbleLeave);
  dragHandle?.removeEventListener('pointerdown', onPanelStart);
  dragHandle?.removeEventListener('pointermove', onPanelMove);
  dragHandle?.removeEventListener('pointerup', onPanelEnd);
  dragHandle?.removeEventListener('pointercancel', onPanelEnd);
};

// 5. 启动时执行一次世界书切换（监听器必须先注册，避免快速完成时漏掉结果）
if (activeCount) activeCount.textContent = '读取中…';
if (activeEntries) activeEntries.innerHTML = '<span style="font-size:9px;color:#a08070;">正在读取 MVU 与世界书…</span>';
autoSwitch();

p._jmzqAutoSwitch = autoSwitch;

// 资源回收：iframe卸载时清理注入的DOM和事件
window._jmzqCleanupAll = function() {
  try {
    p.document.removeEventListener('jmzq-done', onJmzqDone);
    var ids = ['jmzq-bubble','jmzq-panel','jmzq-confirm-overlay','jmzq-super-event-modal'];
    ids.forEach(function(id) { var el = p.document.getElementById(id); if (el) el.remove(); });
    var styles = p.document.head.querySelectorAll('style');
    styles.forEach(function(s) { if (s.textContent && s.textContent.indexOf('jmzq-bubble') !== -1) s.remove(); });
    if (typeof p._jmzqCleanup === 'function') try { p._jmzqCleanup(); } catch(e) {}
    delete p._jmzqLoaded;
  } catch(e) {}
};
window.addEventListener('pagehide', window._jmzqCleanupAll);
window.addEventListener('beforeunload', window._jmzqCleanupAll);

} // end if (!p._jmzqLoaded)

export {}
