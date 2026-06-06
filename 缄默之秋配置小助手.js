// ═══════════════ 缄默之秋小助手 ═══════════════
// 酒馆助手中粘贴以下一行即可：
//   import 'https://testingcf.jsdelivr.net/gh/NLKASHEI/233456@v1.1.1/缄默之秋配置小助手.min.js'
// ═══════════════════════════════════════════════════════════

const JMZQ_VERSION = '1.1.1';
const WORLDBOOK_NAME = '缄默之秋2.2';
const p = window.parent || window;

// 防重复加载
if (!p._jmzqLoaded) { p._jmzqLoaded = true;

// 清理旧实例
{
  const old = ['jmzq-bubble', 'jmzq-panel', 'jmzq-style'];
  for (const id of old) { const el = p.document.getElementById(id); if (el) el.remove(); }
  if (typeof p._jmzqCleanup === 'function') try { p._jmzqCleanup(); } catch(e) {}
  delete p._jmzqCleanup;
  delete p._jmzqLastResult;
}

// ═══════════════ 核心：在父页面上下文执行代码 ═══════════════
// iframe 中的异步 API（getWorldbook/updateWorldbookWith）调用会因
// 请求上下文问题失败。解决办法：往父页面注入 <script> 标签，
// 在父页面原生上下文中执行操作，结果通过 CustomEvent 回传。
function runInParent(fnString) {
  return new Promise((resolve, reject) => {
    const token = 'jmzq_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const handler = (e) => {
      if (!e.detail || e.detail.token !== token) return;
      p.document.removeEventListener('jmzq-result', handler);
      if (e.detail.error) reject(new Error(e.detail.error));
      else resolve(e.detail.result);
    };
    p.document.addEventListener('jmzq-result', handler);

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
    p.document.body.appendChild(script);
    script.remove();
  });
}

// ═══════════════ 世界书名称解析 ═══════════════
// TavernHelper 已挂载在 iframe window 上，读取操作直接调用即可，无需 runInParent 注入父页面

let _jmzqManualWbName = null;  // 用户手动选择的世界书名（自动检测失败后的兜底）

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
    if (raw && (raw.primary === WORLDBOOK_NAME || (raw.additional && raw.additional.includes(WORLDBOOK_NAME)))) {
      _jmzqOnWbResolved(WORLDBOOK_NAME);
      return WORLDBOOK_NAME;
    }
  } catch(e) {
    // 静默处理
  }

  // 2. 从全部世界书列表中精确搜索（兜底）
  try {
    const all = TavernHelper.getWorldbookNames();  // 返回 string[]
    if (Array.isArray(all) && all.includes(WORLDBOOK_NAME)) {
      _jmzqOnWbResolved(WORLDBOOK_NAME);
      return WORLDBOOK_NAME;
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
  return runInParent(`TavernHelper.getWorldbook(${JSON.stringify(name)})`);
}

// 直接在父页面：获取条目 → 修改 → replaceWorldbook 保存 → 返回刷新后的条目
async function api_replaceWorldbook(name, entriesModifier) {
  return runInParent(
    `(async () => {` +
    `  var _entries = await TavernHelper.getWorldbook(${JSON.stringify(name)});` +
    `  (${entriesModifier})(_entries);` +
    `  await TavernHelper.replaceWorldbook(${JSON.stringify(name)}, _entries);` +
    `  return await TavernHelper.getWorldbook(${JSON.stringify(name)});` +
    `})()`
  );
}

// 正则操作（角色级别）
async function api_getTavernRegexes() {
  return runInParent('TavernHelper.getTavernRegexes({ type: "character" })');
}
async function api_updateTavernRegexes(modifier) {
  return runInParent(
    `TavernHelper.updateTavernRegexesWith(${modifier}, { type: "character" })`
  );
}

// 角色脚本树操作
async function api_getScriptTrees() {
  return runInParent('TavernHelper.getScriptTrees({ type: "character" })');
}
async function api_updateScriptTrees(modifier) {
  return runInParent(
    `TavernHelper.updateScriptTreesWith(${modifier}, { type: "character" })`
  );
}

// --- CSS（注入到父页面，缄默之秋配色） ---
const CSS = p.document.createElement('style');
CSS.textContent = `
	  #jmzq-bubble {
	    position: fixed; top: 12vh; left: 14px;
	    width: 44px; height: 44px;
	    background: linear-gradient(145deg, #1a1410, #12100c);
	    border: 1px solid rgba(212,175,55,0.35);
	    border-radius: 14px; z-index: 1000000; cursor: pointer;
	    display: flex; align-items: center; justify-content: center;
	    box-shadow: 0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
	    transition: box-shadow .25s, border-color .25s, transform .15s;
	    user-select: none; touch-action: none;
	    -webkit-tap-highlight-color: transparent;
	  }
	  #jmzq-bubble span {
	    font-size: 28px; font-weight: 400; line-height: 1;
	    font-family: 'Ma Shan Zheng', cursive;
	    background: linear-gradient(180deg, #f0d060 0%, #d4773b 50%, #b85a20 100%);
	    -webkit-background-clip: text; background-clip: text;
	    -webkit-text-fill-color: transparent;
	    filter: drop-shadow(0 0 6px rgba(212,175,55,0.3));
	  }
	  #jmzq-bubble:hover {
	    border-color: rgba(212,175,55,0.7);
	    box-shadow: 0 0 20px rgba(212,175,55,0.2), 0 6px 24px rgba(0,0,0,0.7);
	    transform: translateY(-1px);
	  }
	  #jmzq-bubble:hover span {
	    filter: drop-shadow(0 0 12px rgba(212,175,55,0.5));
	  }
	  #jmzq-bubble.running { animation: jmzq-spin 1.2s linear infinite; }
	  @keyframes jmzq-spin { 100% { transform: rotate(360deg); } }

	  @keyframes jmzq-pulse-warn {
	    0%, 100% { border-color: rgba(231,76,60,0.35) !important; }
	    50% { border-color: rgba(231,76,60,0.7) !important; }
	  }

	  #jmzq-bubble.warn {
	    border-color: rgba(234,179,8,0.7);
	    box-shadow: 0 0 20px 6px rgba(234,179,8,0.5), 0 6px 24px rgba(0,0,0,0.7);
	    animation: jmzq-bubble-warn 1.8s ease-in-out infinite;
	  }
	  @keyframes jmzq-bubble-warn {
	    0%, 100% { border-color: rgba(234,179,8,0.5); box-shadow: 0 0 20px 6px rgba(234,179,8,0.4), 0 6px 24px rgba(0,0,0,0.7); }
	    50% { border-color: rgba(255,200,30,0.9); box-shadow: 0 0 24px 8px rgba(255,200,30,0.7), 0 6px 24px rgba(0,0,0,0.7); }
	  }
  .jmzq select {
    width: 100%; max-width: 100%; box-sizing: border-box;
    padding: 9px 32px 9px 12px; border-radius: 6px; font-size: 13px;
    font-family: inherit; background: #1a1410 !important;
    border: 1px solid #4a3525 !important; color: #d5c0a0 !important; cursor: pointer;
    -webkit-appearance: none; appearance: none; transition: border-color 0.2s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23D4AF37' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center;
    box-shadow: none !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .jmzq select:hover { border-color: #d4773b !important; }
  .jmzq select:focus { border-color: #D4AF37 !important; outline: none; box-shadow: 0 0 0 2px rgba(212,175,55,0.1) !important; }
  .jmzq select option { background: #1a1410 !important; color: #d5c0a0 !important; }
  .jmzq-btn {
    padding: 7px 14px !important; border-radius: 6px !important; cursor: pointer;
    border: 1px solid #4a3525 !important; background: rgba(200,115,60,0.06) !important;
    color: #e0a060 !important; font-size: 12px; font-weight: 500; font-family: inherit !important;
    transition: all 0.2s; letter-spacing: 0.3px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important; min-height: auto !important;
  }
  .jmzq-btn:hover {
    background: rgba(200,115,60,0.15) !important; border-color: #d4773b !important; color: #fff !important;
  }
  .jmzq-btn.primary {
    width: 100% !important; display: block !important;
    background: linear-gradient(160deg, #D4AF37, #b8941f) !important;
    border: 1px solid #D4AF37 !important; color: #080c14 !important;
    margin-top: 6px; padding: 10px !important; font-size: 13px; font-weight: 700 !important;
    letter-spacing: 0.5px; text-shadow: none !important;
    box-shadow: 0 2px 10px rgba(212,175,55,0.15) !important;
    line-height: 1.4 !important; min-height: auto !important;
    text-align: center !important;
  }
  .jmzq-btn.primary:hover {
    background: linear-gradient(160deg, #e0bc50, #c9a52a) !important;
    border-color: #f0d060 !important; box-shadow: 0 4px 16px rgba(212,175,55,0.3) !important;
    color: #080c14 !important;
  }
  .jmzq-btn.primary:disabled {
    opacity: 0.35; cursor: not-allowed; filter: grayscale(30%);
  }
  .jmzq-btn.xs {
    padding: 4px 10px !important; font-size: 11px; width: auto; border-radius: 5px !important;
    background: transparent !important; border-color: rgba(80,50,25,0.3) !important;
    color: #d4773b !important; font-weight: 500 !important;
    display: inline-block !important; box-shadow: none !important;
  }
  .jmzq-btn.xs:hover {
    border-color: #d4773b !important; color: #e0a060 !important;
    background: rgba(200,115,60,0.08) !important;
  }
  .jmzq-birth-btns {
    display: flex; gap: 10px; margin-bottom: 10px;
  }
  .jmzq-birth-btn {
    flex: 1; padding: 10px 0 !important; border-radius: 6px !important; cursor: pointer;
    border: 1px solid #4a3525 !important;
    background: #1a1410 !important; color: #d5c0a0 !important;
    font-size: 13px; font-weight: 500; font-family: inherit !important;
    transition: all 0.25s; text-align: center !important;
    letter-spacing: 0.5px;
    text-shadow: none !important; box-shadow: none !important;
    line-height: 1.4 !important;
  }
  .jmzq-birth-btn:hover {
    background: rgba(200,115,60,0.12) !important; border-color: #d4773b !important;
    color: #fff !important;
  }
  .jmzq-birth-btn.active {
    background: #d4773b !important; border-color: #e0a060 !important;
    color: #fff !important;
    box-shadow: 0 0 12px rgba(200,115,60,0.4) !important;
  }
  .jmzq-panel {
    position: fixed; z-index: 1000001;
    width: 320px; max-height: 62vh;
    background: linear-gradient(170deg, #1a1410, #12100c);
    border: 1px solid rgba(212,175,55,0.25);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 16px rgba(212,175,55,0.06);
    display: flex; flex-direction: column;
    font-size: 13px; color: #d5c0a0;
    font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif;
    overflow: hidden; user-select: none;
  }
  .jmzq-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px 10px; border-bottom: 1px solid rgba(80,50,25,0.2);
    cursor: move;
  }
  .jmzq-header-title {
    font-size: 18px; font-weight: 700;
    background: linear-gradient(180deg, #f0d060, #d4773b);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: 2px;
  }
  .jmzq-body {
    padding: 12px 14px; overflow-y: auto; flex: 1;
    scrollbar-width: thin; scrollbar-color: rgba(200,115,60,0.15) transparent;
  }
  .jmzq-body::-webkit-scrollbar { width: 4px; }
  .jmzq-body::-webkit-scrollbar-thumb { background: rgba(200,115,60,0.15); border-radius: 2px; }
  .jmzq-section {
    background: rgba(200,115,60,0.03); border: 1px solid rgba(80,50,25,0.15);
    border-radius: 8px; padding: 12px; margin-bottom: 10px;
  }
  .jmzq-section-title {
    font-size: 11px; font-weight: 600; letter-spacing: 1px;
    color: #D4AF37; margin-bottom: 10px;
  }
  .jmzq-config-status {
    text-align: center; padding: 8px 12px; margin-bottom: 10px;
    border-radius: 6px; font-size: 12px; font-weight: 600;
    background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15);
    color: #4ade80;
  }
  .jmzq-config-status.warn {
    background: rgba(234,179,8,0.06); border-color: rgba(234,179,8,0.2);
    color: #eab308;
  }
  .jmzq-panel .jmzq-status-inline {
    display: flex; align-items: center; gap: 8px; font-size: 12px;
  }
  .jmzq-panel .status-dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }
  .jmzq-panel .status-dot.on {
    background: #4ade80;
    box-shadow: 0 0 10px #4ade80, 0 0 20px rgba(74,222,128,0.4);
  }
  .jmzq-panel .status-dot.off {
    background: #e74c3c;
    box-shadow: 0 0 10px #e74c3c, 0 0 20px rgba(231,76,60,0.4);
  }
  .jmzq-panel .status-dot.missing { background: #3a4a5a; box-shadow: none; }
  .jmzq-panel .status-label { color: #c0a880 !important; }
  .jmzq .toast {
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    background: rgba(20,16,10,0.97) !important; border: 1px solid rgba(212,175,55,0.35) !important;
    border-radius: 8px !important; padding: 10px 24px !important; color: #D4AF37 !important;
    font-size: 13px; font-weight: 600; z-index: 1000002;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 10px rgba(212,175,55,0.06) !important;
    animation: jmzq-toast-in 0.3s ease, jmzq-toast-out 0.3s ease 2.2s forwards;
    letter-spacing: 0.3px; font-family: 'Noto Serif SC','Inter','Microsoft YaHei',serif !important;
    margin: 0 !important;
  }
  @keyframes jmzq-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } }
  @keyframes jmzq-toast-out { to { opacity: 0; transform: translateX(-50%) translateY(-12px); } }
  @media (max-width: 768px) {
    .jmzq-panel { width: clamp(260px, 88vw, 340px) !important; font-size: 12px; }
    #jmzq-bubble { width: 36px; height: 36px; } #jmzq-bubble span { font-size: 22px; }
    .jmzq-header { padding: 10px 12px 8px !important; }
    .jmzq-header-title { font-size: 16px; letter-spacing: 1px; }
    .jmzq-body { padding: 10px 10px !important; }
    .jmzq-section { padding: 10px !important; margin-bottom: 8px; }
    .jmzq-section-title { font-size: 10px; margin-bottom: 8px; }
    .jmzq-birth-btn { padding: 8px 0 !important; font-size: 12px; }
    .jmzq-birth-btns { gap: 8px; }
    .jmzq-btn.xs { padding: 6px 12px !important; font-size: 12px; }
    .jmzq-panel .jmzq-status-inline { font-size: 11px; gap: 6px; }
    .jmzq-panel .status-dot { width: 8px; height: 8px; }
    .jmzq-panel select { padding: 7px 28px 7px 10px; font-size: 12px; }
    .jmzq-config-status { padding: 8px 10px !important; font-size: 12px; margin-bottom: 8px; }
    #jmzq-manual-wb select { font-size: 11px; padding: 6px 24px 6px 8px; }
    #jmzq-manual-wb .jmzq-btn.xs { padding: 5px 10px !important; font-size: 11px; white-space: nowrap; }
  }
  .jmzq-row { display: flex; align-items: center; gap: 8px; font-size: 11px; }
  .jmzq-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .jmzq-dot.ok  { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.5); }
  .jmzq-dot.err { background: #e74c3c; box-shadow: 0 0 8px rgba(231,76,60,0.5); }
  .jmzq-dot.idle{ background: #3a4a5a; }
  .jmzq-kv { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .jmzq-tag {
    background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.2);
    border-radius: 5px; padding: 2px 7px; font-size: 10px; color: rgba(212,175,55,0.75);
  }
  .jmzq-tag.err { background: rgba(231,76,60,0.08); border-color: rgba(231,76,60,0.25); color: #e74c3c; }
  #jmzq-status-text { color: #4ade80; font-size: 11px; }
`;
p.document.head.appendChild(CSS);

// 追加 MVU 配置表单 CSS
const MVU_CSS = p.document.createElement('style');
MVU_CSS.textContent = `
  .jmzq-mvu-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
  .jmzq-mvu-row.col { flex-direction: column; align-items: stretch; gap: 2px; }
  .jmzq-mvu-label { font-size: 13px; color: #c0a880; white-space: nowrap; flex-shrink: 0; min-width: 56px; letter-spacing: 0.3px; }
  .jmzq-mvu-label.wide { min-width: 64px; }
  .jmzq-mvu-input { flex: 1; padding: 5px 9px; border-radius: 5px; font-size: 13px; font-family: inherit; background: #1a1410 !important; border: 1px solid #4a3525 !important; color: #d5c0a0 !important; transition: border-color 0.2s; min-width: 0; box-shadow: none !important; outline: none !important; }
  .jmzq-mvu-input:focus { border-color: #d4773b !important; }
  .jmzq-mvu-input.num { width: 58px; flex: 0 0 auto; text-align: center; padding: 5px 2px; }
  .jmzq-mvu-select { flex: 1; padding: 5px 26px 5px 9px; border-radius: 5px; font-size: 13px; font-family: inherit; background: #1a1410 !important; border: 1px solid #4a3525 !important; color: #d5c0a0 !important; cursor: pointer; -webkit-appearance: none; appearance: none; transition: border-color 0.2s; min-width: 0; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%23D4AF37' d='M5 7L1 3h8z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 7px center; box-shadow: none !important; outline: none !important; }
  .jmzq-mvu-select:focus { border-color: #d4773b !important; }
  .jmzq-mvu-check-row { display: flex; align-items: center; gap: 4px; margin-bottom: 1px; font-size: 13px; color: #c8b898; cursor: pointer; line-height: 1.4; }
  .jmzq-mvu-check-row input[type="checkbox"] { display: none !important; }
  .jmzq-mvu-check-box { width: 14px; height: 14px; flex-shrink: 0; border: 1.5px solid #4a3a28; border-radius: 3px; background: #1a1410; transition: all 0.15s; display: inline-block; box-sizing: border-box; }
  .jmzq-mvu-check-row input:checked ~ .jmzq-mvu-check-box { background: #d4773b; border-color: #d4773b; }
  .jmzq-mvu-check-row:hover .jmzq-mvu-check-box { border-color: #d4773b; }
  .jmzq-mvu-hint { font-size: 11px; color: #d5c0a0; line-height: 1.4; margin-top: 1px; }
  .jmzq-mvu-subtitle { font-size: 10px; color: #D4AF37; letter-spacing: 0.8px; margin: 5px 0 2px; padding-top: 4px; border-top: 1px solid rgba(80,50,25,0.2); }
  .jmzq-mvu-collapse-header { display: flex; align-items: center; gap: 3px; cursor: pointer; font-size: 11px; color: #d4773b; padding: 3px 0; user-select: none; }
  .jmzq-mvu-collapse-header:hover { color: #e0a060; }
  .jmzq-mvu-collapse-arrow { display: inline-block; font-size: 8px; transition: transform 0.2s; }
  .jmzq-mvu-collapse-arrow.open { transform: rotate(90deg); }
  .jmzq-mvu-collapse-body { padding-left: 4px; }
  .jmzq-mvu-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 6px; }
  #jmzq-mvu-section { padding: 10px 12px !important; }
  #jmzq-mvu-section .jmzq-mvu-subtitle:first-of-type { margin-top: 2px; }
  #jmzq-mvu-section::-webkit-scrollbar { width: 3px; }
  #jmzq-mvu-section::-webkit-scrollbar-thumb { background: rgba(200,115,60,0.15); border-radius: 2px; }
  #jmzq-confirm-dialog { overflow: hidden !important; }
  #jmzq-confirm-body { overflow: hidden; }
  #jmzq-confirm-body .jmzq-mvu-select { max-width: 100%; width: 0; }
  #jmzq-confirm-body .jmzq-mvu-input { max-width: 100%; }
  #jmzq-confirm-body .jmzq-mvu-row { overflow: hidden; }
`;
p.document.head.appendChild(MVU_CSS);


// --- HTML（注入到父页面） ---
p.document.body.insertAdjacentHTML('beforeend', `
  <div id="jmzq-bubble" style="top: 40vh; left: 60px;" title="缄默之秋配置小助手"><span>秋</span></div>
  <div id="jmzq-panel" class="jmzq-panel" style="display:none; left: 110px; top: 35vh;">
    <div class="jmzq-header" id="jmzq-drag">
      <span class="jmzq-header-title">缄默之秋配置小助手</span>
      <div style="display:flex;align-items:center;gap:4px;">
        <button class="jmzq-btn xs" id="jmzq-refresh" title="刷新">刷新</button>
        <button class="jmzq-btn xs" id="jmzq-close" title="关闭" style="font-size:14px;padding:4px 8px !important;">✕</button>
      </div>
    </div>
    <div class="jmzq-body">
      <div class="jmzq-config-status" id="jmzq-config-status">配置运行正常</div>
      <div id="jmzq-backend-code" style="text-align:center;margin-bottom:10px;font-size:10px;color:#6a5a42;line-height:1.6;word-break:break-all;"></div>
      <div class="jmzq-section">
        <div class="jmzq-section-title">世界书状态</div>
        <div class="jmzq-row">
          <div class="jmzq-dot idle" id="jmzq-status-dot"></div>
          <span id="jmzq-status-text">已就绪，等待消息触发…</span>
        </div>
        <div id="jmzq-stat-tags" class="jmzq-kv"></div>
        <div id="jmzq-manual-wb" style="margin-top:8px;">
          <div style="font-size:11px;color:#c0a880;margin-bottom:4px;" id="jmzq-manual-wb-label">切换世界书</div>
          <div style="display:flex;gap:6px;">
            <select class="jmzq-mvu-select" id="jmzq-manual-wb-select" style="flex:1;font-size:12px;"></select>
            <button class="jmzq-btn xs" id="jmzq-manual-wb-apply">切换</button>
          </div>
        </div>
      </div>
      <div class="jmzq-section">
        <div class="jmzq-section-title">提示词模板</div>
        <button class="jmzq-btn primary" id="jmzq-ejs-optimize" style="margin-bottom:4px;">一键最优配置</button>
        <div id="jmzq-ejs-status" style="font-size:11px;color:#c0a880;margin-top:6px;text-align:center;line-height:1.5;"></div>
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
        <button class="jmzq-btn primary" id="jmzq-mvu-apply" style="background:linear-gradient(160deg, #d4773b, #a0522d) !important;border-color:#d4773b !important;">应用配置（刷新页面）</button>
        </div><!-- end jmzq-mvu-manual-panel -->
        <div id="jmzq-mvu-status" style="font-size:11px;color:#c0a880;margin-top:6px;text-align:center;line-height:1.6;"></div>
      </div>
      <!-- 自定义确认弹窗 -->
      <div id="jmzq-confirm-overlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:1000003;align-items:center;justify-content:center;">
        <div id="jmzq-confirm-dialog" style="background:#1a1410;border:1px solid #D4AF37;border-radius:10px;padding:20px 24px;max-width:380px;width:90vw;text-align:left;color:#d5c0a0;font-size:13px;line-height:1.6;box-shadow:0 8px 32px rgba(0,0,0,0.7);">
          <div id="jmzq-confirm-msg" style="margin-bottom:12px;text-align:center;"></div>
          <div id="jmzq-confirm-body" style="display:none;margin-bottom:12px;"></div>
          <div style="display:flex;gap:10px;justify-content:center;">
            <button class="jmzq-btn xs" id="jmzq-confirm-cancel" style="min-width:64px;">取消</button>
            <button class="jmzq-btn primary" id="jmzq-confirm-ok" style="min-width:64px;margin-top:0;">确认</button>
          </div>
        </div>
      </div>
      <div style="text-align:center;padding:12px 16px 14px;border-top:1px solid rgba(80,50,25,0.2);margin-top:4px;">
        <div style="font-size:14px;color:#d4773b;letter-spacing:0.5px;margin-bottom:4px;">DISCORD · 类脑社区 · NLKASHEI</div>
        <div style="font-size:12px;color:#6a5a42;">完全免费，谨防上当</div>
        <div style="font-size:12px;color:#7a5030;">v${JMZQ_VERSION}</div>
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
const manualWbDiv = p.document.getElementById('jmzq-manual-wb');
const manualWbLabel = p.document.getElementById('jmzq-manual-wb-label');
const manualWbSelect = p.document.getElementById('jmzq-manual-wb-select');
const manualWbApply = p.document.getElementById('jmzq-manual-wb-apply');
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
const CONFIG_BLACKLIST = ['次','血','特','惠','福','利','鹿','量','plus','Plus','PLUS','转','官','0','auto','AUTO','Auto','+'];
const CONFIG_URL_WHITELIST = ['siliconflow', 'openrouter', 'ark.cn', 'edgefn', 'qnaigc', 'nvidia', 'baidubce', 'ananbdhdh', 'ai21', 'aimlapi', 'anthropic', 'bigmodel', 'chutes', 'cohere', 'cometapi', 'dashscope', 'deepseek', 'electronhub', 'fireworks', 'googleapis', 'groq', 'lingyiwanwu', 'minimax', 'mistral', 'moonshot', 'nanogpt', 'novita', 'openai', 'perplexity', 'pollinations', 'stepfun', 'together', 'x.ai', 'z.ai'];
const CONFIG_URL_BLACKLIST = ['gemai','sta1n','chr1','iisbo','xqiqix','chatnewai','qingjiu','lemonapi','novaiapi','vectorengine','api.gpt.ge','sllt','beijixingxing','qinyan','jiemomo','meow61','aiopus'];

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
      if (cfg.更新方式 !== '额外模型解析') issues.push('MVU更新方式非最优');
      const n = cfg.通知 || {};
      if (!(n['MVU框架加载成功'] && n['变量初始化成功'] && n['变量更新出错'] && n['额外模型解析中'])) {
        issues.push('MVU四项通知未全开');
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
    // 1. chatCompletionSettings 的 URL 键（主模型设置，不会混入额外模型）
    const cs = SillyTavern.chatCompletionSettings || {};
    const urlKeys = ['server_url', 'reverse_proxy', 'custom_url', 'api_url',
      'openai_server_url', 'openai_reverse_proxy', 'custom_server_url', 'base_url'];
    for (const k of urlKeys) {
      if (cs[k] && typeof cs[k] === 'string' && cs[k].startsWith('http')) return cs[k];
    }
    // 2. connectionManager profiles（排除 MVU 额外模型的 API 地址）
    const cm = SillyTavern.extensionSettings.connectionManager;
    if (cm) {
      const profiles = cm.profiles || [];
      // 读取 MVU 额外模型的 API 地址，用于排除
      let extraUrl = '';
      try {
        const mvuCfg = SillyTavern.extensionSettings.mvu_settings;
        if (mvuCfg && mvuCfg.额外模型解析配置 && mvuCfg.额外模型解析配置.api地址) {
          extraUrl = mvuCfg.额外模型解析配置.api地址.replace(/\/+$/, '').toLowerCase();
        }
      } catch(e) {}
      // 优先返回不等于额外模型 URL 的 profile
      for (const prof of profiles) {
        const profUrl = (prof['api-url'] || '').replace(/\/+$/, '').toLowerCase();
        if (profUrl && profUrl !== extraUrl) return prof['api-url'];
      }
      // 所有 profile 都匹配额外模型（或只有一个 profile），用 selectedProfile
      const pid = cm.selectedProfile;
      if (pid) {
        const prof = profiles.find(p => p.id === pid);
        if (prof && prof['api-url']) return prof['api-url'];
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
    backendCode.innerHTML = '<span style="font-size:10px;color:#6a5a42;">后台配置码</span> <code style="font-size:10px;font-family:Consolas,Monaco,monospace;background:#080c14;color:#c0a880;padding:2px 6px;border-radius:3px;border:1px solid #1c3d5e;white-space:nowrap;max-width:200px;display:inline-block;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;cursor:pointer;" title="点击复制" onclick="navigator.clipboard.writeText(this.textContent);var b=this.nextElementSibling;b.textContent=\'已复制\';setTimeout(()=>b.textContent=\'复制\',1500);">' + encrypted + '</code> <button class="jmzq-btn xs" style="vertical-align:middle;" onclick="navigator.clipboard.writeText(\'' + encrypted + '\');this.textContent=\'已复制\';setTimeout(()=>this.textContent=\'复制\',1500);">复制</button>';
  } catch (e) {
    backendCode.innerHTML = '';
  }
}

// 读取MVU配置 — 直接用iframe代理（探路脚本已验证 SillyTavern.extensionSettings.mvu_settings 可正常读取）
// 注意：勿用 runInParent 读父页面 window.SillyTavern.extensionSettings，父页面无此路径
function readMvuCfgFromParent() {
  return getMvuCfg();
}

// 构建兼容性复选框（动态读取键名）
function buildCompatChecks() {
  const cfg = getMvuCfg();
  const compat = cfg && cfg.兼容性 ? cfg.兼容性 : {};
  const keys = Object.keys(compat);
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
function applyOptimalEjs() {
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
    showToast('提示词模板已设为最优配置，2秒后刷新页面...');
    setTimeout(() => { window.parent.location.reload(); }, 2000);
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
      (mode === '额外模型解析' ? '🟢' : '🔴') + ' 更新方式: ' + (mode || '未知') + '<br>' +
      (notifOk ? '🟢' : '🔴') + ' 四项通知: ' + (notifOk ? '全部开启' : '未全部开启');
  } catch (e) {
    mvuStatus.textContent = '读取MVU配置出错';
  }
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

    cfg.自动清理变量 = cfg.自动清理变量 || {};
    const ac = cfg.自动清理变量;
    ac.启用 = true;
    ac.快照保留间隔 = 50;
    ac.要保留变量的最近楼层数 = 20;
    ac.触发恢复变量的最近楼层数 = 10;

    cfg.兼容性 = cfg.兼容性 || {};
    cfg.兼容性['更新到聊天变量'] = true;
    cfg.兼容性['显示老旧功能'] = false;
    cfg.兼容性['sandas不视为user消息'] = false;

    cfg.额外模型解析配置 = cfg.额外模型解析配置 || {};
    cfg.额外模型解析配置.模型来源 = '自定义';
    cfg.更新方式 = '额外模型解析';

    ewcBackupToEwcYH();
    await saveSettings();

    syncMvuToForm(cfg);
    mvuStatus.innerHTML = '🟢 更新方式: 额外模型解析<br>🟢 四项通知: 全部开启';

    showToast('MVU最优配置已应用，2秒后刷新页面...');
    setTimeout(() => { window.parent.location.reload(); }, 2000);
  } catch (e) {
    showToast('MVU配置失败: ' + e.message);
  }
}

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

// --- 气泡显示/隐藏 ---
bubble.addEventListener('click', () => {
  const showing = panel.style.display !== 'none';
  if (showing) {
    panel.style.display = 'none';
  } else {
    const pw = p.innerWidth || window.innerWidth;
    const ph = p.innerHeight || window.innerHeight;
    const rect = bubble.getBoundingClientRect();
    const panelW = 320;
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
    _jmzqPopulateWbSelect(); checkConfig(); refreshMvuSectionVisibility(); refreshMvuConfigStatus(); autoSwitch(); checkEjsTemplate();
  }
});

// 关闭按钮
const closeBtn = p.document.getElementById('jmzq-close');
closeBtn.addEventListener('click', (e) => { e.stopPropagation(); panel.style.display = 'none'; });

// 点击面板外部关闭（用 mousedown 避免与 bubble click 冲突）
p.document.addEventListener('mousedown', (e) => {
  if (panel.style.display === 'none') return;
  if (panel.contains(e.target) || bubble.contains(e.target)) return;
  panel.style.display = 'none';
});
p.document.addEventListener('touchstart', (e) => {
  if (panel.style.display === 'none') return;
  if (panel.contains(e.target) || bubble.contains(e.target)) return;
  panel.style.display = 'none';
});

// 面板获得鼠标时自动刷新（用户可能中途手动改了设置）
panel.addEventListener('mouseenter', () => { _jmzqPopulateWbSelect(); checkConfig(); refreshMvuConfigStatus(); refreshUI(); updateBackendCode(); checkWorldbookCount(); checkEjsTemplate(); });

// --- 工具：获取触摸/鼠标坐标 ---
function getXY(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

// --- 气泡拖拽（支持触摸） ---
let dragBubble = false, bSX, bSY, bOL, bOT;
function onBubbleStart(e) {
  if (dragBubble) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.type === 'mousedown') e.preventDefault();
  const p = getXY(e);
  dragBubble = true; bSX = p.x; bSY = p.y;
  bOL = bubble.offsetLeft; bOT = bubble.offsetTop;
  bubble.style.transition = 'none';
}
function onBubbleMove(e) {
  if (!dragBubble) return;
  e.preventDefault();
  const p = getXY(e);
  const newLeft = (bOL + p.x - bSX);
  const newTop = (bOT + p.y - bSY);
  bubble.style.left = newLeft + 'px';
  bubble.style.top = newTop + 'px';
}
function onBubbleEnd() {
  if (dragBubble) { bubble.style.transition = ''; dragBubble = false; }
}
bubble.addEventListener('mousedown', onBubbleStart);
bubble.addEventListener('touchstart', onBubbleStart, { passive: false });
p.document.addEventListener('mousemove', onBubbleMove);
p.document.addEventListener('touchmove', onBubbleMove, { passive: false });
p.document.addEventListener('mouseup', onBubbleEnd);
p.document.addEventListener('touchend', onBubbleEnd);

// --- 面板拖拽（支持触摸） ---
const dragHandle = p.document.getElementById('jmzq-drag');
let dragPanel = false, pSX, pSY, pOL, pOT;
function onPanelStart(e) {
  if (dragPanel) return;
  if (e.type === 'mousedown' && e.button !== 0) return;
  if (e.target.tagName === 'BUTTON') return;
  const p = getXY(e);
  dragPanel = true; pSX = p.x; pSY = p.y;
  pOL = panel.offsetLeft; pOT = panel.offsetTop;
}
function onPanelMove(e) {
  if (!dragPanel) return;
  e.preventDefault();
  const p = getXY(e);
  panel.style.left = (pOL + p.x - pSX) + 'px';
  panel.style.top = (pOT + p.y - pSY) + 'px';
}
function onPanelEnd() { dragPanel = false; }
dragHandle.addEventListener('mousedown', onPanelStart);
dragHandle.addEventListener('touchstart', onPanelStart, { passive: false });
p.document.addEventListener('mousemove', onPanelMove);
p.document.addEventListener('touchmove', onPanelMove, { passive: false });
p.document.addEventListener('mouseup', onPanelEnd);
p.document.addEventListener('touchend', onPanelEnd);

// ═══════════════ 世界书自动切换 ═══════════════
function readStatData() {
  if (typeof p.Mvu === 'undefined') return null;

  for (let i = -1; i >= -30; i--) {
    try {
      const d = p.Mvu.getMvuData({ type: 'message', message_id: i });
      if (d?.stat_data?.衍生状态?.nationality && d?.stat_data?.世界阶段) return d.stat_data;
    } catch (e) {}
  }

  let best = null;
  for (let i = 0; i < 200; i++) {
    try {
      const d = p.Mvu.getMvuData({ type: 'message', message_id: i });
      if (d?.stat_data?.衍生状态?.nationality && d?.stat_data?.世界阶段) best = d.stat_data;
    } catch (e) {}
  }
  return best;
}

function buildEnableSet(sd) {
  const enable = new Set();
  const nat           = sd?.衍生状态?.nationality ?? null;
  const phase         = sd?.世界阶段 ?? '秩序期';
  const infMode       = sd?.感染者行为模式 ?? '狂病型';
  const npcMode       = sd?.NPC行为模式 ?? '正常型';

  if (phase === '秩序期') {
    for (const e of [
      '世界观-各国政府情况',
      '大爆发前/大爆发前夕', '大爆发前/规则-异常事件应对', '大爆发前/规则-约束',
      '大爆发前/规则-物资获取', '大爆发前/规则-医疗与健康',
      '大爆发前/规则-社会秩序', '大爆发前/规则-冲突与应对',
    ]) enable.add(e);
  } else if (phase === '爆发期' || phase === '末世期') {
    for (const e of [
      '世界观-官方安全区', '世界观-半感染者', '世界观-ZCOM生化特种部队(彩蛋)',
      '世界观-流浪者', '世界观-无序者', '杂项-无序者行为强化',
      '杂项-幸存者据点动态生成', '机制-建造庇护所', '物品-灭杀疫苗', '物品-药物',
      '机制-COVID-30感染', '机制-找事儿', '机制-制造', '机制-完整度',
      '机制-战斗', '机制-恐慌', '机制-伤病与医疗',
      '杂项-搜刮结果动态生成', '杂项-幸存者NPC关系推进',
      '世界观-宇航员们（彩蛋）', '世界观-外星人(彩蛋)',
      '机制-搜刮物资', '机制-半感染者生存机制', '机制-沉浸式体验', '机制-种田！我要种田！',
    ]) enable.add(e);
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
    for (const e of ['世界观-COVID-30感染者行为总纲', '[mvu_plot]杂项-合理性审查', '杂项-场景强化(可选)']) enable.add(e);
    if (phase === '爆发期') enable.add('世界观-爆发期');
    if (phase === '爆发期' || phase === '末世期') enable.add('机制-动态威胁与安逸惩罚');
    if (phase === '末世期') enable.add('杂项-感染者遭遇动态生成');
  } else if (infMode === '普通型') {
    for (const e of ['普通丧尸COVID-30感染者', '[mvu_plot]普通审查', '普通场景强化(可选)']) enable.add(e);
    if (phase === '爆发期') enable.add('普通爆发期');
    if (phase === '爆发期' || phase === '末世期') {
      for (const e of ['普通感染者多样性', '普通-机制-丧尸尸潮', '普通的动态威胁与安逸惩罚']) enable.add(e);
    }
    if (phase === '末世期') enable.add('普通感染者遭遇');
  }

  if (npcMode === '正常型') {
    enable.add('杂项-NPC动态生成');
    enable.add('杂项-末世社交互动法则');
  } else if (npcMode === '全员恶人型') {
    enable.add('恶意的NPC生成');
    enable.add('恶意社交法则');
  }

  const summaryMap = {
    '华国':'华国已定义NPC摘要', '美利坚国':'美利坚国已定义NPC摘要',
    '日本国':'日本国已定义NPC摘要', '大毛国':'大毛国已定义NPC摘要',
    '法国':'法国已定义NPC摘要', '巴西国':'巴西已定义NPC摘要', '北非':'北非已定义NPC摘要',
  };
  if (summaryMap[nat]) enable.add(summaryMap[nat]);

  if (nat === '华国' && (phase === '爆发期' || phase === '末世期')) {
    enable.add('世界观-无序者-华国血煞团体'); enable.add('世界观-无序者-华国月影团体');
    enable.add('华国-华国人民解放军行为');
  }
  if (nat === '日本国') {
    enable.add('世界观-日本国暗线');
    if (phase === '爆发期' || phase === '末世期') {
      for (const e of [
        '世界观-无序者-日本国狩人之牙', '世界观-无序者-日本国绝望残党',
        '世界观-幸存者-樱丘女子高中', '世界观-幸存者-藤美学园',
        '世界观-幸存者-弗兰秀秀', '世界观-安全区-警视厅',
      ]) enable.add(e);
    }
  }
  if (nat === '美利坚国') {
    if (phase === '秩序期') {
      enable.add('世界观-美利坚爆发前');
    } else if (phase === '爆发期' || phase === '末世期') {
      for (const e of [
        '世界观-美利坚爆发后势力格局', '世界观-美利坚特色流浪者行为',
        '世界观-美利坚特色无序者总体设定', '世界观-安布雷拉(彩蛋)',
        '世界观-无序者-美利坚国铁冠帮', '世界观-无序者-美利坚国净世神殿',
      ]) enable.add(e);
      if (phase === '末世期') enable.add('世界观-安布雷拉生物');
    }
  }
  if (nat === '大毛国') {
    enable.add('世界观-大毛生活图景');
    if (phase === '秩序期') {
      enable.add('世界观-大毛国爆发前'); enable.add('世界观-势力爆发前');
    } else if (phase === '爆发期' || phase === '末世期') {
      for (const e of [
        '世界观-统一党爆发后', '世界观-新布尔什维克党爆发后', '世界观-工人钢铁会爆发后',
        '世界观-黑雪势力', '世界观-零度教势力',
        '世界观-电动实验BMPT(彩蛋)', '世界观-空中飞艇',
      ]) enable.add(e);
      if (phase === '末世期') enable.add('世界观-核爆区域');
    }
  }
  if (nat === '法国') {
    if (phase === '秩序期') {
      enable.add('世界观-法国爆发前');
    } else if (phase === '爆发期' || phase === '末世期') {
      for (const e of [
        '世界观-爆发期的法国', '世界观-白鹿堡', '世界观-鸢尾堡',
        '世界观-铁王冠领', '世界观-圣公教会', '世界观-混乱骑士团',
        '世界观-自由联合民', '世界观-戴高乐号流亡政府',
      ]) enable.add(e);
      if (phase === '末世期') enable.add('世界观-末世期的法国');
    }
  }
  if (nat === '巴西国') {
    enable.add(phase === '秩序期' ? '世界观-秩序期的巴西' : '世界观-爆发后的巴西');
  }
  if (nat === '北非') {
    enable.add(phase === '秩序期' ? '世界观-秩序期的北非' : '世界观-爆发后的北非');
  }

  return enable;
}

const MANAGED_ENTRIES = new Set([
  '世界观-各国政府情况',
  '大爆发前/大爆发前夕','大爆发前/规则-异常事件应对','大爆发前/规则-约束',
  '大爆发前/规则-物资获取','大爆发前/规则-医疗与健康',
  '大爆发前/规则-社会秩序','大爆发前/规则-冲突与应对',
  '世界观-官方安全区','世界观-半感染者','世界观-ZCOM生化特种部队(彩蛋)',
  '世界观-流浪者','世界观-无序者','杂项-无序者行为强化',
  '杂项-幸存者据点动态生成','机制-建造庇护所','物品-灭杀疫苗','物品-药物',
  '机制-COVID-30感染','机制-找事儿','机制-制造','机制-完整度',
  '机制-战斗','机制-恐慌','机制-伤病与医疗',
  '杂项-搜刮结果动态生成','杂项-幸存者NPC关系推进',
  '世界观-宇航员们（彩蛋）','世界观-外星人(彩蛋)',
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
  '大毛国已定义NPC摘要','法国已定义NPC摘要','巴西已定义NPC摘要','北非已定义NPC摘要',
  '世界观-无序者-华国血煞团体','世界观-无序者-华国月影团体',
  '华国-华国人民解放军行为',
  '世界观-日本国暗线','世界观-无序者-日本国狩人之牙','世界观-无序者-日本国绝望残党',
  '世界观-幸存者-樱丘女子高中','世界观-幸存者-藤美学园','世界观-幸存者-弗兰秀秀',
  '世界观-安全区-警视厅','世界观-美利坚爆发前','世界观-美利坚爆发后势力格局',
  '世界观-美利坚特色流浪者行为','世界观-美利坚特色无序者总体设定',
  '世界观-安布雷拉(彩蛋)','世界观-无序者-美利坚国铁冠帮',
  '世界观-无序者-美利坚国净世神殿','世界观-安布雷拉生物',
  '世界观-大毛生活图景','世界观-大毛国爆发前','世界观-势力爆发前',
  '世界观-统一党爆发后','世界观-新布尔什维克党爆发后','世界观-工人钢铁会爆发后',
  '世界观-黑雪势力','世界观-零度教势力','世界观-核爆区域',
  '世界观-电动实验BMPT(彩蛋)','世界观-空中飞艇',
  '世界观-法国爆发前','世界观-爆发期的法国','世界观-末世期的法国',
  '世界观-白鹿堡','世界观-鸢尾堡','世界观-铁王冠领','世界观-圣公教会',
  '世界观-混乱骑士团','世界观-自由联合民','世界观-戴高乐号流亡政府',
  '世界观-秩序期的巴西','世界观-爆发后的巴西',
  '世界观-秩序期的北非','世界观-爆发后的北非',
]);

async function applyToWorldbook(enableSet, wbName, nat) {
  const enableSetJSON    = JSON.stringify([...enableSet]);
  const managedSetJSON   = JSON.stringify([...MANAGED_ENTRIES]);
  const natStr           = nat ? JSON.stringify(nat) : 'null';

  return runInParent(`(async () => {
    var enableSet       = new Set(${enableSetJSON});
    var MANAGED_ENTRIES = new Set(${managedSetJSON});
    var nat             = ${natStr};

    if (typeof TavernHelper === 'undefined')
      throw new Error('TavernHelper is not defined — 请确认 TavernHelper 扩展已安装并启用');

    var wbName = ${JSON.stringify(wbName)};
    var entries;
    try { entries = await TavernHelper.getWorldbook(wbName); } catch(e) {
      throw new Error('无法获取世界书 "' + wbName + '": ' + (e.message || String(e)));
    }
    if (!Array.isArray(entries))
      throw new Error('世界书 "' + wbName + '" 返回数据格式异常');

    var totalChanged = 0;
    var log = [];
    var changed = false;
    var enabled_list = [], disabled_list = [];

    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var entryName = e.name || '';
      if (!MANAGED_ENTRIES.has(entryName)) continue;

      var should = enableSet.has(entryName);
      var dirty  = false;

      if (e.enabled !== should) { e.enabled = should; dirty = true; }

      if (dirty) {
        changed = true;
        (should ? enabled_list : disabled_list).push(entryName);
      }
    }

    // 基础信息自动开关：匹配所有 */角色/*/基础信息，当前国籍开、其余关
    if (nat) {
      var prefix = nat + '/角色/';
      for (var j = 0; j < entries.length; j++) {
        var entry = entries[j];
        var name = entry.name || '';
        var idx = name.indexOf('/角色/');
        if (idx === -1) continue;
        if (!name.endsWith('/基础信息')) continue;
        var shouldEnable = name.startsWith(prefix);
        if (entry.enabled !== shouldEnable) {
          entry.enabled = shouldEnable;
          changed = true;
          (shouldEnable ? enabled_list : disabled_list).push(name);
        }
      }
    }

    if (changed) {
      try { await TavernHelper.replaceWorldbook(wbName, entries); } catch(e) {
        throw new Error('无法保存世界书 "' + wbName + '": ' + (e.message || String(e)));
      }
      totalChanged += enabled_list.length + disabled_list.length;
      log.push({ wbName: wbName, enabled: enabled_list, disabled: disabled_list });
    }

    return { totalChanged: totalChanged, log: log, wbNames: [wbName] };
  })()`);
}

let _runningPromise = null;
let _pendingSwitch  = false;
let _debounceTimer  = null;

async function autoSwitch() {
  if (_runningPromise) {
    _pendingSwitch = true;
    return _runningPromise;
  }

  _runningPromise = (async () => {
    bubble && bubble.classList.add('running');
    try {
      if (typeof p.Mvu === 'undefined') throw new Error('Mvu 不可用');

      const sd = readStatData();
      if (!sd) {
        p._jmzqLastResult = { time: Date.now(), ok: true, stat: {}, want: [], totalChanged: 0, log: [] };
        return;
      }

      const enableSet = buildEnableSet(sd);
      const wbName = await api_resolveWorldbookName();
      const result = await applyToWorldbook(enableSet, wbName, sd.衍生状态?.nationality);
      const logSummary = result.log.map(l =>
        l.wbName + ' ▲' + l.enabled.length + ' ▼' + l.disabled.length
      ).join(' | ');
      p._jmzqLastResult = {
        time: Date.now(), ok: true,
        stat: {
          phase:  sd.世界阶段,
          nat:    sd.衍生状态?.nationality,
          感染者: sd.感染者行为模式,
          NPC模式:sd.NPC行为模式,
        },
        want: [...enableSet],
        totalChanged: result.totalChanged,
        log: result.log,
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
}

const CRITICAL_EVENTS = [
  'message_sent',               'MESSAGE_SENT',
  'generate_before_combine_prompts', 'GENERATE_BEFORE_COMBINE_PROMPTS',
];

const SECONDARY_EVENTS = [
  'character_message_rendered', 'CHARACTER_MESSAGE_RENDERED',
  'message_received',           'MESSAGE_RECEIVED',
  'user_message_rendered',      'USER_MESSAGE_RENDERED',
];

const ALL_EVENTS = [...CRITICAL_EVENTS, ...SECONDARY_EVENTS];

if (typeof eventOn === 'function') {
  for (const evt of CRITICAL_EVENTS) {
    try { eventOn(evt, onCriticalEvent); } catch(e) {}
  }
  for (const evt of SECONDARY_EVENTS) {
    try { eventOn(evt, onSecondaryEvent); } catch(e) {}
  }
  p._jmzqCleanup = function() {
    if (typeof eventOff === 'function') {
      for (const evt of ALL_EVENTS) { try { eventOff(evt, onCriticalEvent); } catch(e) {} }
      for (const evt of ALL_EVENTS) { try { eventOff(evt, onSecondaryEvent); } catch(e) {} }
    }
  };
} else {
}

function refreshUI() {
  const r = p._jmzqLastResult;
  if (!r) return;
  if (r.ok) {
    statusDot.className = 'jmzq-dot ok';
    statTags.innerHTML = [
      r.stat.phase   && `<span class="jmzq-tag">${r.stat.phase}</span>`,
      r.stat.nat     && `<span class="jmzq-tag">${r.stat.nat}</span>`,
      r.stat.感染者  && `<span class="jmzq-tag">${r.stat.感染者}</span>`,
      r.stat.NPC模式 && `<span class="jmzq-tag">${r.stat.NPC模式}</span>`,
    ].filter(Boolean).join('');
  } else {
    statusDot.className = 'jmzq-dot err';
    statTags.innerHTML = `<span class="jmzq-tag err">ERROR</span>`;
  }
}

async function checkWorldbookCount() {
  try {
    const wbName = await api_resolveWorldbookName();
    const entries = await api_getWorldbook(wbName);
    if (!Array.isArray(entries)) return;
    const EXPECTED = 326;
    let color, text;
    if (entries.length === EXPECTED) {
      color = '#4ade80'; text = `共 ${entries.length} 条`;
    } else if (entries.length < EXPECTED) {
      color = '#e74c3c'; text = `仅 ${entries.length} 条，不足！`;
    } else {
      color = '#eab308'; text = `共 ${entries.length} 条，超出`;
    }
    statusText.textContent = text;
    statusText.style.color = color;
  } catch (e) {}
}

// --- 事件绑定 ---
refreshBtn.addEventListener('click', async () => { checkConfig(); refreshMvuConfigStatus(); autoSwitch(); checkEjsTemplate(); showToast('已刷新'); });

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

mvuOptimizeBtn.addEventListener('click', () => {
  const apiUrlEmpty = !mvuApiUrl.value.trim();
  const apiKeyEmpty = !mvuApiKey.value.trim();
  if (apiUrlEmpty || apiKeyEmpty) {
    jmzqConfirmMsg.textContent = '请配置API连接并选择模型';
    jmzqConfirmBody.style.display = '';
    jmzqConfirmBody.innerHTML = `
      <div class="jmzq-mvu-row">
        <label class="jmzq-mvu-label wide">API地址</label>
        <input class="jmzq-mvu-input" id="jmzq-dlg-api-url" placeholder="https://...">
      </div>
      <div class="jmzq-mvu-row">
        <label class="jmzq-mvu-label wide">API密钥</label>
        <input class="jmzq-mvu-input" id="jmzq-dlg-api-key" type="password" placeholder="sk-...">
      </div>
      <div class="jmzq-mvu-row" style="justify-content:flex-end;">
        <button class="jmzq-btn xs" id="jmzq-dlg-fetch-models">获取模型</button>
      </div>
      <div class="jmzq-mvu-row">
        <label class="jmzq-mvu-label wide">模型名称</label>
        <select class="jmzq-mvu-select" id="jmzq-dlg-model-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <option value="">-- 请先获取模型 --</option>
        </select>
      </div>
    `;
    // 同步当前面板值到弹窗
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
      // Flash检测
      const modelName = (dlgModel.value || '').toLowerCase();
      const isFlash = /flash/.test(modelName) && !/3\.5/.test(modelName);
      if (isFlash && jmzqConfirmOk.textContent !== '确认使用Flash') {
        jmzqConfirmMsg.textContent = '检测到Flash系列模型，除3.5 Flash外Flash模型智商不足，建议更换为 gemini-2.5-pro / gemini-3.1-pro / gemini-3.5-flash。是否确认使用？';
        jmzqConfirmOk.textContent = '确认使用Flash';
        return;
      }
      // 同步回面板（applyOptimalMvuConfig会从表单读取API字段并保存）
      mvuApiUrl.value = dlgUrl.value;
      mvuApiKey.value = dlgKey ? dlgKey.value : '';
      if (dlgModel.options.length > 1) {
        mvuModelName.innerHTML = [...dlgModel.options].map(o => '<option value="' + o.value + '">' + o.textContent + '</option>').join('');
      }
      mvuModelName.value = dlgModel.value;
      jmzqConfirmOverlay.style.display = 'none';
      jmzqConfirmBody.style.display = 'none';
      jmzqConfirmOk.textContent = '确认';
      applyOptimalMvuConfig();
    };
    jmzqConfirmOverlay.style.display = 'flex';
  } else {
    applyOptimalMvuConfig();
  }
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
    mvuStatus.textContent = '配置已保存，即将刷新…';

    showToast('配置已应用，1秒后刷新页面…');
    setTimeout(() => { window.parent.location.reload(); }, 1000);
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

jmzqConfirmCancel.addEventListener('click', () => {
  jmzqConfirmOverlay.style.display = 'none';
  jmzqConfirmBody.style.display = 'none';
  jmzqConfirmOk.textContent = '确认';
});

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
checkConfig();
// 每5秒自动检测一次配置（模型切换后呼吸灯自动跟上，无需打开面板）
setInterval(() => { checkConfig(); updateBackendCode(); }, 5000);

// 定时轮询 MVU 状态，变化时自动切换世界书
let _lastStatKey = '';
setInterval(() => {
  try {
    if (typeof p.Mvu === 'undefined') return;
    const sd = readStatData();
    if (!sd) return;
    const key = `${sd.世界阶段}|${sd.衍生状态?.nationality}|${sd.感染者行为模式}|${sd.NPC行为模式}`;
    if (key !== _lastStatKey) {
      _lastStatKey = key;
      autoSwitch();
    }
  } catch (e) {}
}, 5000);

refreshMvuConfigStatus();
checkEjsTemplate();

// 5. 启动时执行一次世界书切换
autoSwitch();

// 注册世界书状态刷新事件
p.document.addEventListener('jmzq-done', () => { refreshUI(); checkWorldbookCount(); });

} // end if (!p._jmzqLoaded)

export {}
