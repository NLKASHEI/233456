(async function () {
    'use strict';

    const TARGET_API = '/api/backends/chat-completions/generate';
    const STORAGE_KEY = 'stc-monitor-config'; 
    const DB_NAME = 'StCacheMonitorDB';
    const DB_VERSION = 1;
    
    let compareSourceId = null;

    // ==================== 计费配置 ====================
    const PRICING_MODELS = {
        flash: { name: 'Flash', hit: 0.02, miss: 1.00 },
        pro: { name: 'Pro', hit: 0.025, miss: 3.00 }
    };

    // ==================== 主题配置 ====================
    const THEMES = {
        dark: {
            name: '深色', icon: '🌙',
            "--stc-bg": "rgba(29, 29, 32, 0.95)",
            "--stc-bg-sec": "rgba(45, 45, 48, 0.95)",
            "--stc-accent": "rgba(154, 214, 207, 1)",
            "--stc-text": "rgba(219, 219, 214, 1)",
            "--stc-text-sec": "rgba(157, 157, 157, 1)",
            "--stc-danger": "rgba(255, 100, 100, 0.9)",
            "--stc-border": "rgba(255, 255, 255, 0.1)",
            "--stc-hit": "#4ec9b0", "--stc-miss": "#ce9178"
        },
        light: {
            name: '浅色', icon: '☀️',
            "--stc-bg": "rgba(255, 255, 255, 0.95)",
            "--stc-bg-sec": "rgba(240, 240, 240, 0.95)",
            "--stc-accent": "rgba(244, 144, 102, 1)",
            "--stc-text": "rgba(45, 45, 45, 1)",
            "--stc-text-sec": "rgba(100, 100, 100, 1)",
            "--stc-danger": "rgba(180, 50, 50, 0.9)",
            "--stc-border": "rgba(0, 0, 0, 0.1)",
            "--stc-hit": "#2e7d32", "--stc-miss": "#a52a2a"
        }
    };

    let savedConfig = {
        panelLeft: '70px', panelTop: '20px',
        panelWidth: '280px', panelHeight: '400px',
        compareLeft: '10px', compareTop: '10px',
        compareWidth: '320px', compareHeight: '450px',
        bubbleTop: '20vh', bubbleSide: 'left',
        isMinimized: true, theme: 'dark', fontSize: 13,
        pricingMode: 'flash',
        showAll: false // 默认不显示没有usage的数据
    };

    // ==================== DB Utils ====================
    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('cacheData')) db.createObjectStore('cacheData', { keyPath: 'requestId' });
            };
        });
    }

    async function getFromDB(storeName, key) {
        const db = await openDB();
        return new Promise(r => {
            const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
            req.onsuccess = () => { db.close(); r(req.result); };
        });
    }

    async function saveToDB(storeName, data) {
        const db = await openDB();
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(data);
        return new Promise(r => tx.oncomplete = () => { db.close(); r(); });
    }

    async function getAllFromDB(storeName) {
        const db = await openDB();
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        return new Promise(r => req.onsuccess = () => { db.close(); r(req.result); });
    }

    async function clearStore(storeName) {
        const db = await openDB();
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        return new Promise(r => tx.oncomplete = () => { db.close(); r(); });
    }

    async function initConfig() {
        try { 
            const cfg = await getFromDB('config', STORAGE_KEY); 
            if (cfg) savedConfig = { ...savedConfig, ...cfg.value }; 
        } catch(e) {}
    }

    async function saveConfig(overrides = {}) {
        savedConfig = { ...savedConfig, ...overrides };
        await saveToDB('config', { key: STORAGE_KEY, value: savedConfig });
    }

    // ==================== 逻辑函数 ====================
    function calculateCost(hit, miss) {
        const model = PRICING_MODELS[savedConfig.pricingMode];
        const cost = (hit / 1000000 * model.hit) + (miss / 1000000 * model.miss);
        return cost.toFixed(4);
    }

    const CSS = `
    <style>
        .stc-main-panel {
            position: fixed; background: var(--stc-bg); backdrop-filter: blur(10px);
            border: 1px solid var(--stc-border); box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            z-index: 999999; font-family: Consolas, Monaco, monospace;
            display: flex; flex-direction: column; border-radius: 12px;
            color: var(--stc-text); font-size: var(--stc-font-size, 13px); overflow: hidden;
            max-width: 95vw; max-height: 90vh; -webkit-tap-highlight-color: transparent;
            box-sizing: border-box;
        }
        #st-cache-bubble {
            position: fixed; width: 50px; height: 50px; background: var(--stc-bg);
            border: 2px solid var(--stc-accent); border-radius: 50%;
            z-index: 1000000; cursor: pointer; display: flex; align-items: center; justify-content: center;
            color: var(--stc-accent); font-weight: bold; transition: left 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            touch-action: none; -webkit-tap-highlight-color: transparent;
        }
        .stc-header { padding: 0 12px; height: 45px; background: var(--stc-bg-sec); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--stc-border); cursor: move; user-select: none; flex-shrink:0; }
        .stc-body { flex: 1; overflow-y: auto; overflow-x: hidden; }
        .stc-footer { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: var(--stc-bg-sec); border-top: 1px solid var(--stc-border); gap: 6px; position: relative; flex-shrink:0; }
        .stc-resizer { position: absolute; right: 0; bottom: 0; width: 24px; height: 24px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, var(--stc-accent) 50%); border-bottom-right-radius: 12px; }
        .stc-btn { padding: 2px 8px; border-radius: 6px; cursor: pointer; border: 1px solid var(--stc-border); background: var(--stc-bg); color: var(--stc-text); font-size: 0.9em; font-weight: 600; -webkit-tap-highlight-color: transparent; }
        .stc-btn-compare.active { background: var(--stc-accent); color: #000; border-color: var(--stc-accent); }
        .stc-entry { border-bottom: 1px solid var(--stc-border); }
        .stc-summary { padding: 10px 12px; cursor: pointer; border-left: 4px solid transparent; display: flex; justify-content: space-between; align-items: center; }
        .stc-summary:hover { background: rgba(128,128,128,0.1); }
        .stc-meta { display: flex; flex-direction: column; flex: 1; min-width: 0; overflow-x: auto; white-space: nowrap; scrollbar-width: thin; font-size: 0.9em; -webkit-overflow-scrolling: touch; }
        .stc-meta::-webkit-scrollbar { height: 3px; }
        .stc-meta::-webkit-scrollbar-thumb { background: var(--stc-border); }
        .stc-detail { display: none; background: rgba(0,0,0,0.1); padding: 10px; border-top: 1px dashed var(--stc-border); max-height: 300px; overflow-y: auto; }
        .stc-detail.open { display: block; }
        .stc-json { white-space: pre-wrap; word-break: break-all; color: var(--stc-text-sec); font-size: 0.85em; }
        .diff-added { color: #4ec9b0; background: rgba(78, 201, 176, 0.1); }
        .diff-removed { color: #ff6464; background: rgba(255, 100, 100, 0.1); }
        .stc-progress { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--stc-accent); border-top-color: transparent; border-radius: 50%; animation: stc-spin 1s linear infinite; }
        @keyframes stc-spin { to { transform: rotate(360deg); } }
        .diff-full-text { display: none; margin-top: 8px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 0.85em; border: 1px solid var(--stc-border); white-space: pre-wrap; }
        .diff-full-text.open { display: block; }
        .stc-btn-mini { font-size: 10px; padding: 1px 4px; margin-left: 8px; vertical-align: middle; }
    </style>`;

    function applyFontSize(size) {
        const p = window.parent || window;
        const sizePx = size + 'px';
        ['st-cache-panel', 'st-compare-panel', 'st-cache-bubble'].forEach(id => {
            const el = p.document.getElementById(id);
            if (el) el.style.setProperty('--stc-font-size', sizePx);
        });
        const display = p.document.getElementById('stc-font-size-display');
        if (display) display.textContent = sizePx;
    }

    function generateDiff(obj1, obj2) {
        const msg1 = obj1?.messages || [];
        const msg2 = obj2?.messages || [];
        if (msg1.length === 0 && msg2.length === 0) return "未发现消息内容 (Messages Empty)";
        let output = `<div style="margin-bottom:8px;font-weight:bold;color:var(--stc-accent);">消息条数: ${msg1.length} vs ${msg2.length}</div>`;
        const maxLen = Math.max(msg1.length, msg2.length);
        for (let i = 0; i < maxLen; i++) {
            const m1 = msg1[i]; const m2 = msg2[i];
            if (!m1 || !m2 || m1.role !== m2.role || m1.content !== m2.content) {
                output += `<div style="margin-top:10px;padding:8px;border:1px solid var(--stc-border);border-radius:4px;">
                <div style="display:flex;justify-content:space-between;align-items:center;"><b style="color:var(--stc-accent)">Index [${i}]</b>
                <button class="stc-btn stc-btn-mini" onclick="this.parentElement.parentElement.querySelector('.diff-full-text').classList.toggle('open')">🔍 展开</button></div>`;
                if (!m1) output += `<div class="diff-added">+ 新增: [${m2?.role}] ${m2?.content?.substring(0,60)}...</div>`;
                else if (!m2) output += `<div class="diff-removed">- 缺失: [${m1?.role}] ${m1?.content?.substring(0,60)}...</div>`;
                else {
                    if (m1.role !== m2.role) output += `<div>角色: <span class="diff-removed">${m1.role}</span> -> <span class="diff-added">${m2.role}</span></div>`;
                    if (m1.content !== m2.content) {
                        let idx = 0; while(idx < m1.content.length && idx < m2.content.length && m1.content[idx] === m2.content[idx]) idx++;
                        output += `<div class="diff-removed">- 旧: ...${m1.content.substring(Math.max(0,idx-30),idx+30)}...</div>`;
                        output += `<div class="diff-added">+ 新: ...${m2.content.substring(Math.max(0,idx-30),idx+30)}...</div>`;
                    }
                }
                output += `<div class="diff-full-text"><div style="color:var(--stc-danger);">[OLD]:</div><div>${m1?.content||''}</div><hr style="border:0;border-top:1px dashed var(--stc-border);margin:8px 0;"><div style="color:var(--stc-hit);">[NEW]:</div><div>${m2?.content||''}</div></div></div>`;
            }
        }
        return output || "消息内容完全一致";
    }

    async function handleCompare(e, rid) {
        e.stopPropagation();
        const p = window.parent || window;
        const compPanel = p.document.getElementById('st-compare-panel');
        
        if (compareSourceId === rid) { compareSourceId = null; e.target.classList.remove('active'); return; }
        if (!compareSourceId) { compareSourceId = rid; e.target.classList.add('active'); }
        else {
            const d1 = await getFromDB('cacheData', compareSourceId);
            const d2 = await getFromDB('cacheData', rid);
            p.document.getElementById('stc-compare-body').innerHTML = generateDiff(d1?.fullData, d2?.fullData);
            
            compPanel.style.display = 'flex';
            const rect = compPanel.getBoundingClientRect();
            if (rect.right > p.innerWidth || rect.left < 0) {
                compPanel.style.left = '10px';
                compPanel.style.width = Math.min(parseInt(savedConfig.compareWidth), p.innerWidth - 20) + 'px';
            }

            p.document.querySelectorAll('.stc-btn-compare').forEach(b => b.classList.remove('active'));
            compareSourceId = null;
        }
    }

    function createEntry(body, record, isGenerating = false) {
        const entry = document.createElement('div');
        entry.className = 'stc-entry';
        entry.setAttribute('data-request-id', record.requestId);
        const { requestId, hit, miss, total, hitRate, timestamp, fullData } = record;
        const time = new Date(timestamp);
        const timeStr = `${time.getHours().toString().padStart(2,'0')}:${time.getMinutes().toString().padStart(2,'0')}:${time.getSeconds().toString().padStart(2,'0')}`;
        const pColor = isGenerating ? 'var(--stc-accent)' : (hitRate >= 60 ? '#4ec9b0' : (hitRate >= 30 ? '#f1c40f' : '#ff6464'));
        
        const costStr = isGenerating ? '' : ` | <span style="color:var(--stc-accent);">￥${calculateCost(hit, miss)}</span>`;

        entry.innerHTML = `<div class="stc-summary ${isGenerating?'generating':'completed'}" style="border-left-color: ${pColor};"><div class="stc-meta">${isGenerating ? `<div><span class="stc-progress"></span> 正在请求...</div>` : `<div><span style="color:var(--stc-hit);">中: ${hit?.toLocaleString()}</span> | <span style="color:var(--stc-miss);">孬: ${miss?.toLocaleString()}</span></div><div style="color:var(--stc-text-sec);">总: ${total?.toLocaleString()}${costStr}</div>`}</div><div style="display:flex;align-items:center;gap:6px;flex-shrink:0;"><button class="stc-btn stc-btn-compare">⚖️</button><span style="color:${pColor};font-weight:bold;font-size:0.9em;">${hitRate||0}%</span><span style="color:var(--stc-text-sec);font-size:0.8em;">${timeStr}</span></div></div><div class="stc-detail"></div>`;
        const detail = entry.querySelector('.stc-detail');
        entry.querySelector('.stc-summary').onclick = () => {
            if (!detail.innerHTML && fullData) { const fd = { ...fullData }; delete fd.messages; detail.innerHTML = `<div class="stc-json">${JSON.stringify(fd, null, 2)}</div>`; }
            detail.classList.toggle('open');
        };
        entry.querySelector('.stc-btn-compare').onclick = (e) => handleCompare(e, requestId);
        body.insertBefore(entry, body.firstChild);
    }

    async function init() {
        await initConfig();
        const p = window.parent || window;
        if (p.document.getElementById('st-cache-panel')) return;

        const HTML = `
        <div id="st-cache-panel" class="stc-main-panel" style="display:${savedConfig.isMinimized?'none':'flex'}; top:${savedConfig.panelTop}; left:${savedConfig.panelLeft}; width:${savedConfig.panelWidth}; height:${savedConfig.panelHeight};">
            <div class="stc-header" id="stc-drag-handle">
                <div style="color:var(--stc-accent);font-weight:600;pointer-events:none;">缓存监控</div>
                <button class="stc-btn" id="stc-pricing-toggle" style="min-width:60px;">${PRICING_MODELS[savedConfig.pricingMode].name}</button>
            </div>
            <div class="stc-body" id="stc-cache-body"></div>
            <div class="stc-footer">
                <button class="stc-btn" id="stc-clear" style="background:var(--stc-danger);color:#fff;border:none;">清空</button>
                <div style="display:flex;align-items:center;gap:4px;">
                    <button class="stc-btn" id="stc-filter-usage" title="切换显示全部/仅有数据">筛选</button>
                    <button class="stc-btn" id="stc-font-minus">−</button>
                    <span id="stc-font-size-display" style="font-size:0.9em;min-width:30px;text-align:center;">13px</span>
                    <button class="stc-btn" id="stc-font-plus">+</button>
                </div>
                <button class="stc-btn" id="stc-theme-toggle">🌙</button>
                <div class="stc-resizer" id="stc-main-resizer"></div>
            </div>
        </div>
        <div id="st-compare-panel" class="stc-main-panel" style="display:none; top:${savedConfig.compareTop}; left:${savedConfig.compareLeft}; width:${savedConfig.compareWidth}; height:${savedConfig.compareHeight}; z-index:1000001;">
            <div class="stc-header" id="stc-compare-drag-handle"><div style="color:var(--stc-accent);font-weight:600;pointer-events:none;">⚖️ 差异对比</div><button class="stc-btn" id="stc-compare-close">关闭</button></div>
            <div class="stc-body" id="stc-compare-body" style="padding:12px; font-size:0.9em;"></div>
            <div class="stc-footer"><div style="font-size:0.8em; color:var(--stc-text-sec);">Payload 差异分析</div><div class="stc-resizer" id="stc-compare-resizer"></div></div>
        </div>
        <div id="st-cache-bubble" style="top:${savedConfig.bubbleTop}; ${savedConfig.bubbleSide==='right'?'right:10px;':'left:10px;'}">📊</div>`;

        p.document.body.insertAdjacentHTML('beforeend', CSS + HTML);

        const panel = p.document.getElementById('st-cache-panel');
        const compPanel = p.document.getElementById('st-compare-panel');
        const bubble = p.document.getElementById('st-cache-bubble');
        const body = p.document.getElementById('stc-cache-body');
        const filterBtn = p.document.getElementById('stc-filter-usage');

        const refreshAll = async () => {
            body.innerHTML = '';
            let history = await getAllFromDB('cacheData');
            if (history) {
                if (!savedConfig.showAll) {
                    history = history.filter(r => (r.total > 0 || r.hit > 0 || r.miss > 0));
                }
                history.sort((a,b)=>a.timestamp-b.timestamp).forEach(r => createEntry(body, r));
            }
        };

        const applyTheme = (tn) => {
            const theme = THEMES[tn];
            [panel, compPanel, bubble].forEach(el => Object.entries(theme).forEach(([k, v]) => k.startsWith('--') && el.style.setProperty(k, v)));
            p.document.getElementById('stc-theme-toggle').innerText = theme.icon;
            saveConfig({ theme: tn });
        };

        p.document.getElementById('stc-pricing-toggle').onclick = () => {
            savedConfig.pricingMode = savedConfig.pricingMode === 'flash' ? 'pro' : 'flash';
            p.document.getElementById('stc-pricing-toggle').innerText = PRICING_MODELS[savedConfig.pricingMode].name;
            saveConfig({ pricingMode: savedConfig.pricingMode });
            refreshAll();
        };

        applyTheme(savedConfig.theme);
        applyFontSize(savedConfig.fontSize);
        refreshAll();

        filterBtn.onclick = () => {
            savedConfig.showAll = !savedConfig.showAll;
            saveConfig({ showAll: savedConfig.showAll });
            refreshAll();
        };

        p.document.getElementById('stc-font-minus').onclick = () => { savedConfig.fontSize = Math.max(10, savedConfig.fontSize-1); applyFontSize(savedConfig.fontSize); saveConfig(); };
        p.document.getElementById('stc-font-plus').onclick = () => { savedConfig.fontSize = Math.min(24, savedConfig.fontSize+1); applyFontSize(savedConfig.fontSize); saveConfig(); };
        p.document.getElementById('stc-clear').onclick = async () => { if(confirm('清空？')){ body.innerHTML=''; await clearStore('cacheData'); } };
        p.document.getElementById('stc-compare-close').onclick = () => compPanel.style.display='none';
        p.document.getElementById('stc-theme-toggle').onclick = () => applyTheme(savedConfig.theme==='dark'?'light':'dark');

        // Drag & Resize
        let activeEl = null, mode = null, sX, sY, sW, sH, bMoved = false;
        
        const onStart = (e) => {
            const el = e.currentTarget._el; const m = e.currentTarget._mode;
            activeEl = el; mode = m; bMoved = false;
            const cx = e.touches ? e.touches[0].clientX : e.clientX;
            const cy = e.touches ? e.touches[0].clientY : e.clientY;
            sX = cx - (m === 'drag' ? el.offsetLeft : 0);
            sY = cy - (m === 'drag' ? el.offsetTop : 0);
            sW = el.offsetWidth; sH = el.offsetHeight;
            if (el === bubble) bubble.style.transition = 'none';
        };

        const onMove = (e) => {
            if (!activeEl) return;
            const cx = e.touches ? e.touches[0].clientX : e.clientX;
            const cy = e.touches ? e.touches[0].clientY : e.clientY;
            if (activeEl === bubble && (Math.abs(cx - (sX + activeEl.offsetLeft)) > 5)) bMoved = true;
            if (mode === 'drag') {
                activeEl.style.left = Math.max(0, cx - sX) + 'px';
                activeEl.style.top = Math.max(0, cy - sY) + 'px';
            } else {
                activeEl.style.width = (sW + cx - sX) + 'px';
                activeEl.style.height = (sH + cy - sY) + 'px';
            }
        };

        const onEnd = () => {
            if (!activeEl) return;
            if (activeEl === bubble) {
                const side = (bubble.offsetLeft + 25) < p.innerWidth / 2 ? 'left' : 'right';
                bubble.style.left = side === 'left' ? '10px' : 'auto';
                if (side === 'right') bubble.style.right = '10px';
                saveConfig({ bubbleTop: bubble.style.top, bubbleSide: side });
            } else {
                saveConfig({ 
                    panelLeft:panel.style.left, panelTop:panel.style.top, panelWidth:panel.style.width, panelHeight:panel.style.height, 
                    compareLeft:compPanel.style.left, compareTop:compPanel.style.top, compareWidth:compPanel.style.width, compareHeight:compPanel.style.height 
                });
            }
            activeEl = mode = null; bubble.style.transition = 'left 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
        };

        const reg = (el, handle, m) => {
            handle._el = el; handle._mode = m;
            handle.addEventListener('mousedown', onStart);
            handle.addEventListener('touchstart', onStart, { passive: false });
        };

        reg(panel, p.document.getElementById('stc-drag-handle'), 'drag');
        reg(panel, p.document.getElementById('stc-main-resizer'), 'resize');
        reg(compPanel, p.document.getElementById('stc-compare-drag-handle'), 'drag');
        reg(compPanel, p.document.getElementById('stc-compare-resizer'), 'resize');
        reg(bubble, bubble, 'drag');

        p.document.addEventListener('mousemove', onMove);
        p.document.addEventListener('touchmove', onMove, { passive: false });
        p.document.addEventListener('mouseup', onEnd);
        p.document.addEventListener('touchend', onEnd);

        bubble.onclick = () => { if (!bMoved) { panel.style.display = panel.style.display === 'none' ? 'flex' : 'none'; saveConfig({ isMinimized: panel.style.display === 'none' }); } };

        // Fetch Patch
        if (!p._st_cache_monitor_patched) {
            const raw = p.fetch;
            p.fetch = async (...args) => {
                if (typeof args[0] === 'string' && args[0].includes(TARGET_API)) {
                    let payload = null; try { payload = JSON.parse(args[1].body); } catch(e){}
                    const rid = 'req_'+Date.now();
                    const record = { requestId: rid, timestamp: Date.now(), fullData: payload, hit:0, miss:0, total:0, hitRate:0 };
                    createEntry(body, record, true);
                    try {
                        const res = await raw(...args);
                        const clone = res.clone();
                        clone.text().then(text => {
                            let last = null;
                            const trimmed = text.trim();
                            if (trimmed.startsWith('{')) { try { last = JSON.parse(trimmed); } catch (e) { } }
                            if (!last?.usage) {
                                text.split('\n').forEach(l => {
                                    if (l.startsWith('data: ') && l !== 'data: [DONE]') try { const p = JSON.parse(l.substring(6)); if (p.usage) last = p; } catch (e) { }
                                });
                            }
                            const hit = last?.usage?.prompt_cache_hit_tokens || last?.usage?.prompt_tokens_details?.cached_tokens || 0;
                            const miss = last?.usage?.prompt_cache_miss_tokens || last?.usage?.prompt_tokens_details?.uncached_tokens || 0;
                            const total = hit + miss;
                            const finalRecord = { ...record, hit, miss, total, hitRate: total>0?(hit/total*100).toFixed(1):0 };
                            
                            // 移除正在请求的占位符
                            const old = body.querySelector(`[data-request-id="${rid}"]`); 
                            if(old) body.removeChild(old);
                            
                            saveToDB('cacheData', finalRecord);
                            
                            // 实时判断是否需要显示
                            if (savedConfig.showAll || total > 0) {
                                createEntry(body, finalRecord);
                            }
                        }).catch(() => {
                            const old = body.querySelector(`[data-request-id="${rid}"]`); if(old) body.removeChild(old);
                            if (savedConfig.showAll) createEntry(body, record);
                            saveToDB('cacheData', record);
                        });
                        return res;
                    } catch(e) { 
                        const old = body.querySelector(`[data-request-id="${rid}"]`); if(old) body.removeChild(old);
                        if (savedConfig.showAll) createEntry(body, record);
                        saveToDB('cacheData', record);
                        return raw(...args); 
                    }
                }
                return raw(...args);
            };
            p._st_cache_monitor_patched = true;
        }
    }
    init().catch(console.error);
})();
