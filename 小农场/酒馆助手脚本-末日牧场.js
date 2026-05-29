(async function () {
    'use strict';

    const DB_NAME = 'RanchDB';
    const DB_VERSION = 1;
    const CONFIG_KEY = 'ranch_config';
    const PEN_COUNT = 6;
    const TEMP_BAG_MAX = 9999;

    function stateKey(shelterName) { return 'ranch_state_' + shelterName; }

    const ANIMALS = {
        '鸡': { icon: '🐔', youngMin: 1, adultMin: 1.7, product: { icon: '🥚', name: '鸡蛋', min: 1, max: 2 }, meat: { icon: '🍗', name: '鸡肉', young: 1, adult: 2, mature: 3 }, resist: 0.55, desc: '最常见的家禽，好养活' },
        '鸭': { icon: '🦆', youngMin: 1, adultMin: 1.7, product: { icon: '🥚', name: '鸭蛋', min: 1, max: 2 }, meat: { icon: '🍗', name: '鸭肉', young: 1, adult: 2, mature: 3 }, resist: 0.50, desc: '比鸡安静一点' },
        '兔': { icon: '🐰', youngMin: 0.67, adultMin: 1.3, product: { icon: '🧶', name: '兔毛', min: 1, max: 2 }, meat: { icon: '🍖', name: '兔肉', young: 1, adult: 2, mature: 3 }, resist: 0.45, desc: '繁殖快，毛茸茸' },
        '羊': { icon: '🐑', youngMin: 1.3, adultMin: 2, product: { icon: '🧶', name: '羊毛', min: 1, max: 2 }, meat: { icon: '🍖', name: '羊肉', young: 2, adult: 3, mature: 5 }, resist: 0.60, desc: '毛肉两用' },
        '牛': { icon: '🐄', youngMin: 1.7, adultMin: 2.3, product: { icon: '🥛', name: '牛奶', min: 1, max: 2 }, meat: { icon: '🥩', name: '牛肉', young: 3, adult: 5, mature: 8 }, resist: 0.65, desc: '产奶大户' },
        '猪': { icon: '🐖', youngMin: 1.3, adultMin: 2, product: null, meat: { icon: '🥩', name: '猪肉', young: 3, adult: 5, mature: 7 }, resist: 0.55, desc: '只产肉，别无他用' },
        '马': { icon: '🐴', youngMin: 1.7, adultMin: 3, product: { icon: '🐎', name: '马奶', min: 1, max: 2 }, meat: { icon: '🥩', name: '马肉', young: 3, adult: 5, mature: 7 }, resist: 0.70, desc: '高大健壮' },
    };

    const EVENT_TYPES = {
        disease: { icon: '🤒', name: '疾病', desc: '动物生病了！生长停滞', color: '#ef4444', actionName: '治疗' },
        escape:  { icon: '🏃', name: '逃逸', desc: '动物逃出围栏！需追回', color: '#f97316', actionName: '追回' },
        hunger:  { icon: '🍂', name: '饥饿', desc: '饲料不足，生长减缓', color: '#a16207', actionName: '喂食' },
        beast:   { icon: '🐺', name: '野兽袭击', desc: '野兽试图攻击牲畜！', color: '#a855f7', actionName: '驱赶' },
    };

    const ITEMS = {
        medicine:   { icon: '💉', name: '兽药', resolves: 'disease', desc: '治疗疾病，健康+35', attrKey: 'health', attrAdd: 35 },
        lasso:      { icon: '🪢', name: '套索', resolves: 'escape', desc: '追回逃逸动物，健康+20', attrKey: 'health', attrAdd: 20 },
        feed:       { icon: '🌿', name: '饲料', resolves: 'hunger', desc: '喂养动物，饱食+35', attrKey: 'hunger', attrAdd: 35 },
        repellent:  { icon: '🛡️', name: '驱兽器', resolves: 'beast', desc: '驱赶野兽，健康+25', attrKey: 'health', attrAdd: 25 },
    };
    const MAX_ITEM_COUNT = 10;
    const ITEM_REGEN_INTERVAL = 120000;
    const DEFAULT_ITEMS = { medicine: 2, lasso: 2, feed: 2, repellent: 2 };

    let ranchState = {
        pens: new Array(PEN_COUNT).fill(null),
        log: [],
        events: {},
        items: { ...DEFAULT_ITEMS },
        lastItemRegen: Date.now(),
        tempBag: [],
    };

    let ranchConfig = {
        panelLeft: '50%', panelTop: '50%',
        panelWidth: '380px', panelHeight: '500px',
        bubbleTop: '40vh', bubbleLeft: '60px',
        isMinimized: true,
        theme: 'dark',
        selectedShelter: '',
    };

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('state')) {
                    db.createObjectStore('state', { keyPath: 'key' });
                }
            };
        });
    }

    async function dbGet(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction('state', 'readonly').objectStore('state').get(key);
            req.onsuccess = () => { db.close(); resolve(req.result?.value); };
            req.onerror = () => { db.close(); reject(req.error); };
        });
    }

    async function dbPut(key, value) {
        const db = await openDB();
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put({ key, value });
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    }

    function resetRanchState() {
        ranchState.pens = new Array(PEN_COUNT).fill(null);
        ranchState.log = [];
        ranchState.events = {};
        ranchState.items = { ...DEFAULT_ITEMS };
        ranchState.lastItemRegen = Date.now();
        ranchState.tempBag = [];
    }

    async function loadState(shelterName) {
        try {
            const key = stateKey(shelterName);
            const s = await dbGet(key);
            if (s) {
                ranchState.pens = s.pens || new Array(PEN_COUNT).fill(null);
                ranchState.log = s.log || [];
                ranchState.events = s.events || {};
                ranchState.items = { ...DEFAULT_ITEMS, ...(s.items || {}) };
                ranchState.lastItemRegen = s.lastItemRegen || Date.now();
                ranchState.tempBag = s.tempBag || [];
            } else {
                resetRanchState();
            }
        } catch (e) { console.warn('[牧场] 加载状态失败:', e); }
    }

    async function loadConfig() {
        try {
            const c = await dbGet(CONFIG_KEY);
            if (c) ranchConfig = { ...ranchConfig, ...c };
        } catch (e) { console.warn('[牧场] 加载配置失败:', e); }
    }

    async function saveState(shelterName) {
        const name = shelterName || selectedShelter;
        const key = stateKey(name);
        await dbPut(key, {
            pens: ranchState.pens, log: ranchState.log, events: ranchState.events,
            items: ranchState.items, lastItemRegen: ranchState.lastItemRegen, tempBag: ranchState.tempBag,
        });
        await saveRanchToMvu(name);
    }

    async function saveConfig(overrides = {}) {
        ranchConfig = { ...ranchConfig, ...overrides };
        await dbPut(CONFIG_KEY, ranchConfig);
    }

    let mvuReady = false;
    let cachedTargetMsgId = null;

    async function initMvu() {
        try {
            if (typeof waitGlobalInitialized === 'function') await waitGlobalInitialized('Mvu');
            if (typeof Mvu !== 'undefined') { mvuReady = true; }
        } catch (e) { console.warn('[牧场] MVU初始化失败:', e); }
    }

    function coldReadLatestStatData() {
        if (!mvuReady) return null;
        try {
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return null;
            const messages = typeof getChatMessages === 'function' ? getChatMessages('1-' + lastMsgId, { role: 'assistant' }) : null;
            if (!messages || messages.length === 0) return null;
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 15); i--) {
                const targetMsgId = messages[i].message_id;
                if (targetMsgId <= 0) continue;
                const data = Mvu.getMvuData({ type: 'message', message_id: targetMsgId });
                const sd = data?.stat_data;
                if (sd && Object.keys(sd).length > 0) { cachedTargetMsgId = targetMsgId; return { statData: sd, targetMsgId }; }
            }
            return null;
        } catch (e) { return null; }
    }

    function quickReadStatData() {
        if (!mvuReady || cachedTargetMsgId === null) return null;
        try {
            const data = Mvu.getMvuData({ type: 'message', message_id: cachedTargetMsgId });
            const sd = data?.stat_data;
            if (sd && Object.keys(sd).length > 0) return sd;
            cachedTargetMsgId = null; return null;
        } catch (e) { cachedTargetMsgId = null; return null; }
    }

    function getLatestFullData() {
        if (!mvuReady) return null;
        try {
            if (cachedTargetMsgId !== null && cachedTargetMsgId > 0) {
                const data = Mvu.getMvuData({ type: 'message', message_id: cachedTargetMsgId });
                if (data?.stat_data && Object.keys(data.stat_data).length > 0) return { data, targetMsgId: cachedTargetMsgId };
            }
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return null;
            const messages = typeof getChatMessages === 'function' ? getChatMessages('1-' + lastMsgId, { role: 'assistant' }) : null;
            if (!messages || messages.length === 0) return null;
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 15); i--) {
                const targetMsgId = messages[i].message_id;
                if (targetMsgId <= 0) continue;
                const data = Mvu.getMvuData({ type: 'message', message_id: targetMsgId });
                if (data?.stat_data && Object.keys(data.stat_data).length > 0) { cachedTargetMsgId = targetMsgId; return { data, targetMsgId }; }
            }
            return null;
        } catch (e) { return null; }
    }

    async function getShelters(useQuickRead = false) {
        let sd;
        if (useQuickRead) { sd = quickReadStatData(); if (!sd) { const r = coldReadLatestStatData(); sd = r?.statData || null; } }
        else { const r = coldReadLatestStatData(); sd = r?.statData || null; }
        if (!sd || !sd.建筑 || typeof sd.建筑 !== 'object') return {};
        return sd.建筑;
    }

    async function storeToShelter(itemName, itemIcon, count, shelterName) {
        if (!mvuReady) return false;
        try {
            const result = getLatestFullData();
            if (!result) return false;
            const { data, targetMsgId } = result;
            const sd = data.stat_data;
            if (!sd.建筑 || !sd.建筑[shelterName]) return false;
            if (!sd.建筑[shelterName].storage || typeof sd.建筑[shelterName].storage !== 'object') sd.建筑[shelterName].storage = {};
            const existing = sd.建筑[shelterName].storage[itemName];
            const existingCount = existing ? parseCount(existing.detail || '') : 0;
            const newCount = existingCount + count;
            sd.建筑[shelterName].storage[itemName] = { detail: `${itemIcon} ${itemName}${newCount > 1 ? ' ×' + newCount : ''}`, weight: +(0.5 * newCount).toFixed(1) };
            await Mvu.replaceMvuData(data, { type: 'message', message_id: targetMsgId });
            cachedTargetMsgId = null;
            try { if (typeof eventEmit === 'function' && Mvu?.events?.VARIABLE_UPDATE_ENDED) eventEmit(Mvu.events.VARIABLE_UPDATE_ENDED); } catch (e) {}
            return true;
        } catch (e) { console.error('[牧场] 存入失败:', e); return false; }
    }

    function parseCount(detail) {
        if (!detail) return 1;
        const m = detail.match(/[×xX]\s*(\d+)/);
        return m ? parseInt(m[1]) : 1;
    }

    function findAnyMessageId() {
        if (!mvuReady) return null;
        try {
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return null;
            const messages = typeof getChatMessages === 'function' ? getChatMessages('1-' + lastMsgId, { role: 'assistant' }) : null;
            if (!messages || messages.length === 0) return null;
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 15); i--) {
                const mid = messages[i].message_id;
                if (mid <= 0) continue;
                const d = Mvu.getMvuData({ type: 'message', message_id: mid });
                if (d?.stat_data && Object.keys(d.stat_data).length > 0) return mid;
            }
            for (let i = messages.length - 1; i >= 0; i--) { if (messages[i].message_id > 0) return messages[i].message_id; }
            return null;
        } catch (e) { return null; }
    }

    async function saveRanchToMvu(shelterName) {
        if (!mvuReady) return;
        try {
            const targetMsgId = findAnyMessageId();
            if (!targetMsgId) return;
            const data = Mvu.getMvuData({ type: 'message', message_id: targetMsgId }) || {};
            if (!data.ranch) data.ranch = { shelters: {} };
            const name = shelterName || selectedShelter || ranchConfig.selectedShelter;
            if (name) {
                data.ranch.shelters[name] = { pens: ranchState.pens, log: ranchState.log, events: ranchState.events, items: ranchState.items, lastItemRegen: ranchState.lastItemRegen, tempBag: ranchState.tempBag };
                data.ranch.selectedShelter = selectedShelter || ranchConfig.selectedShelter || name;
            }
            await Mvu.replaceMvuData(data, { type: 'message', message_id: targetMsgId });
            cachedTargetMsgId = null;
        } catch (e) { console.warn('[牧场] MVU同步写入失败:', e); }
    }

    async function syncFromMvu() {
        if (!mvuReady) return false;
        try {
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return false;
            const messages = typeof getChatMessages === 'function' ? getChatMessages('1-' + lastMsgId, { role: 'assistant' }) : null;
            if (!messages || messages.length === 0) return false;
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 30); i--) {
                const mid = messages[i].message_id;
                if (mid <= 0) continue;
                const data = Mvu.getMvuData({ type: 'message', message_id: mid });
                if (data?.ranch?.shelters && Object.keys(data.ranch.shelters).length > 0) {
                    for (const [n, s] of Object.entries(data.ranch.shelters)) await dbPut(stateKey(n), s);
                    if (data.ranch.selectedShelter) ranchConfig.selectedShelter = data.ranch.selectedShelter;
                    return true;
                }
            }
            return false;
        } catch (e) { return false; }
    }

    function getAnimalStage(animal) {
        if (!animal) return null;
        const aData = ANIMALS[animal.animal];
        if (!aData) return null;
        const elapsed = (Date.now() - animal.placedAt) / 60000;
        const evt = ranchState.events[animal.penIdx];
        if (evt && !evt.resolved) {
            const frozenElapsed = Math.max(0, (evt.startedAt - animal.placedAt) / 60000);
            if (frozenElapsed < aData.youngMin) return { stage: 'young', stageIdx: 0, name: '幼小期', progress: frozenElapsed / aData.youngMin, elapsed: frozenElapsed };
            return { stage: 'adult', stageIdx: 1, name: '发育期', progress: 0.5, elapsed: frozenElapsed };
        }
        let youngMin = aData.youngMin, adultMin = aData.adultMin;
        if (cheatMetabolismEnabled) { youngMin /= 3; adultMin /= 3; }
        if (elapsed < youngMin) return { stage: 'young', stageIdx: 0, name: '幼小期', progress: elapsed / youngMin, elapsed, totalMin: youngMin };
        else if (elapsed < youngMin + adultMin) { const ae = elapsed - youngMin; return { stage: 'adult', stageIdx: 1, name: '发育期', progress: ae / adultMin, elapsed, totalMin: youngMin + adultMin }; }
        else return { stage: 'mature', stageIdx: 2, name: '成熟期', progress: 1, elapsed, totalMin: youngMin + adultMin };
    }

    function getMeatAmount(animal) {
        const aData = ANIMALS[animal.animal];
        const stage = getAnimalStage(animal);
        if (!stage) return 0;
        if (stage.stage === 'young') return aData.meat.young;
        if (stage.stage === 'adult') return aData.meat.adult;
        return aData.meat.mature;
    }

    function getProductInterval(animal) {
        const aData = ANIMALS[animal.animal];
        if (!aData.product) return Infinity;
        const stage = getAnimalStage(animal);
        if (!stage || stage.stage === 'young') return Infinity;
        let interval;
        if (cheatMetabolismEnabled && stage.stage === 'mature') interval = 10;
        else if (cheatMetabolismEnabled && stage.stage === 'adult') interval = 20;
        else interval = aData.adultMin * 60 * 0.5;
        return interval * 1000;
    }

    let eventCheckInterval = null;

    function checkRandomEvents() {
        let changed = false;
        for (let i = 0; i < ranchState.pens.length; i++) {
            const animal = ranchState.pens[i];
            if (!animal || ranchState.events[i]) continue;
            const stage = getAnimalStage(animal);
            if (!stage || stage.stage === 'mature') continue;
            if (Math.random() < 0.04) {
                const aData = ANIMALS[animal.animal];
                if (Math.random() < (aData?.resist || 0.5)) continue;
                const types = Object.keys(EVENT_TYPES);
                const weights = [2, 1, 2, 1];
                const totalW = weights.reduce((a, b) => a + b, 0);
                let r = Math.random() * totalW;
                let chosenType = types[0];
                for (let j = 0; j < weights.length; j++) { r -= weights[j]; if (r <= 0) { chosenType = types[j]; break; } }
                ranchState.events[i] = { type: chosenType, startedAt: Date.now(), resolved: false };
                showToast(`${EVENT_TYPES[chosenType].icon} 栏位${i + 1}的${animal.animal}出现${EVENT_TYPES[chosenType].name}！`, true);
                changed = true;
            }
        }
        for (const [idx, evt] of Object.entries(ranchState.events)) {
            if (evt.resolved) continue;
            const elapsed = (Date.now() - evt.startedAt) / 60000;
            if (evt.type === 'disease' && elapsed > 7 && !evt._warned) { evt._warned = true; const a = ranchState.pens[parseInt(idx)]; if (a) showToast(`🤒⚠️ 栏位${parseInt(idx) + 1}的${a.animal}病情加重！`, true); }
            if (evt.type === 'disease' && elapsed > 10) {
                const a = ranchState.pens[parseInt(idx)];
                ranchState.pens[parseInt(idx)] = null; delete ranchState.events[parseInt(idx)];
                ranchState.log.push({ time: Date.now(), text: `💀 ${ANIMALS[a?.animal]?.icon || '🐾'}动物因病死亡` });
                showToast(`💀 栏位${parseInt(idx) + 1}的动物因病死亡！`, true);
                changed = true;
            }
        }
        if (changed) { saveState(); renderPanel(); }
    }

    function startEventCheck() {
        if (eventCheckInterval) clearInterval(eventCheckInterval);
        eventCheckInterval = setInterval(checkRandomEvents, 30000);
    }

    function useItemOnPen(itemKey, penIdx) {
        const animal = ranchState.pens[penIdx];
        if (!animal) { showToast('该栏位没有动物'); return false; }
        const item = ITEMS[itemKey];
        if (!item) return false;
        if ((ranchState.items[itemKey] || 0) <= 0) { showToast(`❌ ${item.name}已用完！`, true); return false; }
        const evt = ranchState.events[penIdx];
        const hasEvent = evt && !evt.resolved;
        if (hasEvent && item.resolves !== evt.type) {
            const et = EVENT_TYPES[evt.type];
            const neededItem = Object.values(ITEMS).find(i => i.resolves === evt.type);
            showToast(`❌ ${item.name}无法解除${et.name}！需要${neededItem?.icon || ''}${neededItem?.name || ''}`, true);
            return false;
        }
        ranchState.items[itemKey]--;
        let eventMsg = '';
        if (hasEvent && item.resolves === evt.type) { delete ranchState.events[penIdx]; eventMsg = `，${EVENT_TYPES[evt.type].name}已解除`; }
        if (item.attrKey && animal[item.attrKey] != null) animal[item.attrKey] = Math.min(100, animal[item.attrKey] + item.attrAdd);
        saveState(); renderPanel();
        const attrName = { health: '健康', hunger: '饱食' }[item.attrKey] || '';
        showToast(`${item.icon} ${item.name}使用成功！${attrName}+${item.attrAdd}${eventMsg}`);
        return true;
    }

    function regenItems() {
        const shelterNames = Object.keys(currentShelters);
        if (shelterNames.length === 0) return;
        const now = Date.now();
        const elapsed = now - (ranchState.lastItemRegen || now);
        const regenCount = Math.floor(elapsed / ITEM_REGEN_INTERVAL);
        if (regenCount <= 0) return;
        let changed = false;
        for (const key of Object.keys(ITEMS)) {
            if (ranchState.items[key] < MAX_ITEM_COUNT) { ranchState.items[key] = Math.min(MAX_ITEM_COUNT, ranchState.items[key] + regenCount); changed = true; }
        }
        if (changed) { ranchState.lastItemRegen = now; saveState(); renderPanel(); }
    }

    function decayAnimalAttrs() {
        let changed = false;
        for (let i = 0; i < ranchState.pens.length; i++) {
            const animal = ranchState.pens[i];
            if (!animal) continue;
            const stage = getAnimalStage(animal);
            if (!stage || stage.stage === 'mature') continue;
            if (animal.health == null) animal.health = 100;
            if (animal.hunger == null) animal.hunger = 100;
            const evt = ranchState.events[i];
            const hasEvent = evt && !evt.resolved;
            animal.health = Math.max(0, animal.health - 0.3);
            animal.hunger = Math.max(0, animal.hunger - 0.5);
            if (hasEvent) {
                if (evt.type === 'disease') animal.health = Math.max(0, animal.health - 1.2);
                if (evt.type === 'hunger') animal.hunger = Math.max(0, animal.hunger - 1.0);
                if (evt.type === 'beast') animal.health = Math.max(0, animal.health - 0.8);
            }
            if (animal.hunger < 20) animal.health = Math.max(0, animal.health - 0.4);
            if (!hasEvent) {
                if (animal.hunger < 20 && Math.random() < 0.10) { ranchState.events[i] = { type: 'hunger', startedAt: Date.now(), resolved: false }; changed = true; }
                else if (animal.health < 25 && Math.random() < 0.08) { ranchState.events[i] = { type: 'disease', startedAt: Date.now(), resolved: false }; changed = true; }
            }
            if (animal.health <= 0) {
                const aData = ANIMALS[animal.animal];
                ranchState.pens[i] = null; delete ranchState.events[i];
                ranchState.log.push({ time: Date.now(), text: `💀 ${aData?.icon || '🐾'}动物因健康恶化死亡` });
                showToast(`💀 栏位${i + 1}的动物死亡！`, true);
                changed = true;
            }
        }
        if (changed) { saveState(); renderPanel(); }
    }

    function checkProductGeneration() {
        let changed = false;
        for (let i = 0; i < ranchState.pens.length; i++) {
            const animal = ranchState.pens[i];
            if (!animal) continue;
            const aData = ANIMALS[animal.animal];
            if (!aData.product) continue;
            const stage = getAnimalStage(animal);
            if (!stage || stage.stage === 'young') continue;
            const interval = getProductInterval(animal);
            const now = Date.now();
            if (!animal.lastProductTime) animal.lastProductTime = animal.placedAt;
            if (now - animal.lastProductTime >= interval) {
                const count = aData.product.min + Math.floor(Math.random() * (aData.product.max - aData.product.min + 1));
                const bonusCount = stage.stage === 'mature' ? 1 : 0;
                const totalCount = count + bonusCount;
                if (ranchState.tempBag.length < TEMP_BAG_MAX) {
                    ranchState.tempBag.push({ icon: aData.product.icon, name: aData.product.name, count: totalCount, time: now });
                    animal.lastProductTime = now;
                    ranchState.log.push({ time: now, text: `🥛 ${aData.icon}${animal.animal}产出 ${aData.product.icon}${aData.product.name} ×${totalCount}` });
                    changed = true;
                }
            }
        }
        if (changed) { saveState(); if (!ranchConfig.isMinimized) renderPanel(); }
    }

    function slaughterAnimal(penIdx) {
        const animal = ranchState.pens[penIdx];
        if (!animal) return;
        const meatAmount = getMeatAmount(animal);
        const aData = ANIMALS[animal.animal];
        if (ranchState.tempBag.length < TEMP_BAG_MAX) {
            ranchState.tempBag.push({ icon: aData.meat.icon, name: aData.meat.name, count: meatAmount, time: Date.now() });
            ranchState.log.push({ time: Date.now(), text: `🔪 宰杀 ${aData.icon}${animal.animal} 获得 ${aData.meat.icon}${aData.meat.name} ×${meatAmount}` });
            ranchState.pens[penIdx] = null; delete ranchState.events[penIdx];
            saveState(); renderPanel();
            showToast(`🔪 宰杀获得 ${aData.meat.icon}${aData.meat.name} ×${meatAmount}`);
        } else { showToast('❌ 临时背包已满！', true); }
    }

    function mergeTempBag() {
        const merged = [];
        for (const item of ranchState.tempBag) {
            const existing = merged.find(m => m.icon === item.icon && m.name === item.name);
            if (existing) existing.count += item.count;
            else merged.push({ ...item });
        }
        ranchState.tempBag = merged;
    }

    async function storeBagItem(index, shelterName) {
        const item = ranchState.tempBag[index];
        if (!item) return;
        const ok = await storeToShelter(item.name, item.icon, item.count, shelterName);
        if (ok) { ranchState.tempBag.splice(index, 1); saveState(); renderPanel(); showToast(`📦 已存入 ${shelterName}`); refreshShelters(false); }
        else showToast('❌ 存入失败');
    }

    async function storeAllBag(shelterName) {
        if (ranchState.tempBag.length === 0) { showToast('🎒 临时背包为空'); return; }
        mergeTempBag();
        let stored = 0;
        for (const item of [...ranchState.tempBag]) {
            const ok = await storeToShelter(item.name, item.icon, item.count, shelterName);
            if (ok) { const idx = ranchState.tempBag.indexOf(item); if (idx >= 0) ranchState.tempBag.splice(idx, 1); stored += item.count; }
        }
        if (stored > 0) { saveState(); renderPanel(); showToast(`📦 已存入 ${shelterName}，共 ${stored} 件`); refreshShelters(false); }
        else showToast('❌ 存入失败');
    }

    function discardBagItem(index) { ranchState.tempBag.splice(index, 1); saveState(); renderPanel(); showToast('🗑️ 已丢弃'); }
    function clearBag() { if (ranchState.tempBag.length === 0) return; ranchState.tempBag = []; saveState(); renderPanel(); showToast('🗑️ 临时背包已清空'); }

    const CSS = document.createElement('style');
    CSS.textContent = `.ranch-main-panel{position:fixed;background:rgba(14,20,12,0.97);backdrop-filter:blur(16px);border:1px solid rgba(139,92,56,0.35);box-shadow:0 12px 48px rgba(0,0,0,0.7);z-index:999998;font-family:'Inter','Microsoft YaHei',sans-serif;display:flex;flex-direction:column;border-radius:14px;color:#e4e4e7;font-size:15px;overflow:hidden;max-width:95vw;max-height:90vh;box-sizing:border-box}.ranch-main-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#8b5e38,#c4956a,#d4a574,#c4956a,#8b5e38);border-radius:12px 12px 0 0}#ranch-bubble{position:fixed;width:50px;height:50px;background:rgba(14,20,12,0.96);border:2px solid #c4956a;border-radius:50%;z-index:1000000;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;transition:left 0.3s cubic-bezier(0.18,0.89,0.32,1.28);touch-action:none;box-shadow:0 0 16px rgba(196,149,106,0.35)}#ranch-bubble:hover{box-shadow:0 0 22px rgba(196,149,106,0.55)}#ranch-bubble.has-event{border-color:#f97316;animation:ranch-event-bubble 1.5s ease-in-out infinite}@keyframes ranch-event-bubble{0%,100%{box-shadow:0 0 15px rgba(249,115,22,0.3)}50%{box-shadow:0 0 25px rgba(249,115,22,0.6)}}.ranch-header{padding:0 14px;height:46px;background:rgba(139,92,56,0.1);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(139,92,56,0.25);cursor:move;user-select:none;flex-shrink:0}.ranch-header-title{color:#d4a574;font-weight:700;font-size:17px;letter-spacing:1px;display:flex;align-items:center;gap:8px}.ranch-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:14px}.ranch-body::-webkit-scrollbar{width:5px}.ranch-body::-webkit-scrollbar-track{background:rgba(0,0,0,0.2)}.ranch-body::-webkit-scrollbar-thumb{background:rgba(196,149,106,0.3);border-radius:3px}.ranch-footer{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;background:rgba(139,92,56,0.05);border-top:1px solid rgba(139,92,56,0.15);flex-shrink:0;position:relative;cursor:move}.ranch-resizer{position:absolute;right:0;bottom:0;width:20px;height:20px;cursor:nwse-resize;opacity:0.4;background:linear-gradient(135deg,transparent 50%,rgba(196,149,106,0.4) 50%);border-bottom-right-radius:12px}.ranch-btn{padding:5px 13px;border-radius:6px;cursor:pointer;border:1px solid rgba(196,149,106,0.35);background:rgba(196,149,106,0.1);color:#d4a574;font-size:13px;font-weight:600;transition:all 0.2s}.ranch-btn:hover{background:rgba(196,149,106,0.2);border-color:rgba(196,149,106,0.5)}.ranch-btn.danger{border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#f87171}.ranch-btn.warn{border-color:rgba(249,115,22,0.3);background:rgba(249,115,22,0.08);color:#fb923c}.ranch-shelter-bar{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(0,0,0,0.25);border-radius:8px;border:1px solid rgba(196,149,106,0.15)}.ranch-shelter-select{flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(196,149,106,0.25);border-radius:6px;padding:6px 8px;color:#d4a574;font-size:14px;outline:none;cursor:pointer}.ranch-shelter-select option{background:#18181f;color:#d4d4d8}.ranch-stats{display:flex;gap:10px;margin-bottom:12px}.ranch-stat{flex:1;text-align:center;padding:7px 8px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid rgba(196,149,106,0.08)}.ranch-stat-val{font-size:22px;font-weight:700;color:#d4a574;font-family:'Consolas',monospace}.ranch-stat-label{font-size:11px;color:#52525b;letter-spacing:0.5px;margin-top:2px}.ranch-event-bar{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 12px;background:rgba(249,115,22,0.1);border-radius:8px;border:1px solid rgba(249,115,22,0.3);animation:ranch-event-flash 3s ease-in-out infinite}@keyframes ranch-event-flash{0%,100%{border-color:rgba(249,115,22,0.3)}50%{border-color:rgba(249,115,22,0.6)}}.ranch-item-bar{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(196,149,106,0.12)}.ranch-item-bar-title{width:100%;font-size:12px;color:#71717a;margin-bottom:4px}.ranch-item{display:flex;align-items:center;gap:5px;padding:6px 10px;background:rgba(196,149,106,0.06);border:1.5px solid rgba(196,149,106,0.2);border-radius:8px;cursor:grab;transition:all 0.2s;user-select:none;position:relative}.ranch-item:hover{background:rgba(196,149,106,0.15)}.ranch-item.selected{border-color:#d4a574;background:rgba(196,149,106,0.2);box-shadow:0 0 12px rgba(196,149,106,0.3)}.ranch-item.empty{opacity:0.35;cursor:not-allowed}.ranch-item-icon{font-size:20px}.ranch-item-name{font-size:12px;color:#a1a1aa}.ranch-item-count{font-size:11px;color:#d4a574;font-weight:700;font-family:'Consolas',monospace;background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:4px;min-width:18px;text-align:center}.ranch-item-tip{display:none;position:absolute;bottom:110%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:#d4d4d8;font-size:11px;padding:4px 8px;border-radius:4px;white-space:nowrap;pointer-events:none;z-index:10}.ranch-item:hover .ranch-item-tip{display:block}.ranch-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.ranch-pen{border-radius:10px;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;padding:10px 6px;transition:all 0.25s;overflow:hidden;border:1.5px solid rgba(196,149,106,0.18);background:linear-gradient(160deg,rgba(196,149,106,0.05),rgba(0,0,0,0.3));min-height:110px}.ranch-pen:hover{border-color:rgba(196,149,106,0.45);box-shadow:0 0 14px rgba(196,149,106,0.12);transform:translateY(-2px)}.ranch-pen.empty{border-style:dashed;background:rgba(0,0,0,0.15)}.ranch-pen.mature{border-color:rgba(250,204,21,0.35);animation:ranch-mature-pulse 3s ease-in-out infinite}@keyframes ranch-mature-pulse{0%,100%{box-shadow:0 0 8px rgba(250,204,21,0.1)}50%{box-shadow:0 0 16px rgba(250,204,21,0.2)}}.ranch-pen.has-event{border-color:rgba(249,115,22,0.6);animation:ranch-pen-event 2s ease-in-out infinite}@keyframes ranch-pen-event{0%,100%{box-shadow:0 0 8px rgba(249,115,22,0.15)}50%{box-shadow:0 0 16px rgba(249,115,22,0.4)}}.pen-icon{font-size:36px;line-height:1;margin-bottom:4px}.pen-name{font-size:13px;color:#a1a1aa;font-weight:600}.pen-stage{font-size:11px;color:#d4a574;margin-top:2px}.pen-progress{width:100%;height:5px;margin-top:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden}.pen-progress-fill{height:100%;background:linear-gradient(90deg,#8b5e38,#d4a574);transition:width 0.8s ease;border-radius:3px}.ranch-pen.mature .pen-progress-fill{background:linear-gradient(90deg,#a16207,#facc15)}.ranch-pen.has-event .pen-progress-fill{background:linear-gradient(90deg,#9a3412,#f97316)}.pen-event-badge{position:absolute;top:3px;right:3px;font-size:14px;background:rgba(0,0,0,0.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;animation:ranch-badge-bounce 1s ease-in-out infinite}@keyframes ranch-badge-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}.pen-empty-icon{font-size:32px;opacity:0.25}.pen-empty-text{font-size:11px;color:#52525b;margin-top:3px}.pen-attrs{display:flex;gap:4px;width:100%;margin:5px 0 2px;padding:0 2px}.pen-attr-row{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px}.pen-attr-bar{width:100%;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden}.pen-attr-fill{height:100%;border-radius:3px;transition:width 0.5s}.pen-attr-fill.health{background:linear-gradient(90deg,#15803d,#22c55e)}.pen-attr-fill.hunger{background:linear-gradient(90deg,#a16207,#facc15)}.pen-attr-fill.low{background:linear-gradient(90deg,#991b1b,#ef4444)!important}.pen-attr-val{font-size:11px;color:#d4d4d8;font-family:'Consolas',monospace;font-weight:600}.pen-attr-val.low{color:#ef4444}.ranch-log{margin-top:8px;max-height:120px;overflow-y:auto;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px 10px;border:1px solid rgba(196,149,106,0.08)}.ranch-log-title{font-size:12px;color:#71717a;letter-spacing:1px;margin-bottom:6px}.ranch-log-entry{font-size:13px;color:#a1a1aa;padding:2px 0;display:flex;gap:6px}.ranch-log-entry .log-time{color:#8b5e38;font-family:'Consolas',monospace;font-size:11px;white-space:nowrap}.ranch-temp-bag{margin-top:8px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(196,149,106,0.12);padding:10px}.ranch-temp-bag-title{font-size:12px;color:#71717a;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}.ranch-temp-bag-item{display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:6px;margin-bottom:4px;border:1px solid rgba(196,149,106,0.08)}.ranch-temp-bag-icon{font-size:20px}.ranch-temp-bag-name{flex:1;font-size:13px;color:#d4d4d8}.ranch-temp-bag-count{font-size:13px;font-weight:700;color:#d4a574;font-family:'Consolas',monospace;margin-right:8px}.ranch-temp-bag-actions{display:flex;gap:4px}.ranch-bag-btn{padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(196,149,106,0.3);background:rgba(196,149,106,0.1);color:#d4a574;font-size:11px}.ranch-bag-btn.danger{border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#f87171}.ranch-bag-footer{display:flex;gap:6px;margin-top:8px}.ranch-bag-footer .ranch-btn{flex:1;font-size:12px;padding:6px 0;text-align:center}.ranch-popup{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000002;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.ranch-popup.mobile-inside{position:absolute;border-radius:12px}.ranch-popup-card{background:rgba(18,22,16,0.98);border:1px solid rgba(196,149,106,0.3);border-radius:14px;padding:20px;min-width:260px;max-width:340px;box-shadow:0 12px 48px rgba(0,0,0,0.6)}.ranch-toast{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(18,22,16,0.95);border:1px solid rgba(196,149,106,0.3);border-radius:8px;padding:10px 20px;color:#d4a574;font-size:15px;font-weight:600;z-index:1000003;box-shadow:0 4px 16px rgba(0,0,0,0.4);animation:ranch-toast-in 0.3s ease,ranch-toast-out 0.3s ease 2s forwards}.ranch-toast.event-toast{border-color:rgba(249,115,22,0.4);color:#fb923c}@keyframes ranch-toast-in{from{opacity:0;transform:translateX(-50%) translateY(-10px)}}@keyframes ranch-toast-out{to{opacity:0;transform:translateX(-50%) translateY(-10px)}}.ranch-store-popup{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000004;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}.ranch-store-popup.mobile-inside{position:absolute;border-radius:12px}.ranch-store-card{background:rgba(14,20,12,0.97);border:1px solid rgba(196,149,106,0.3);border-radius:14px;padding:16px;box-shadow:0 12px 48px rgba(0,0,0,0.6);max-width:300px;width:90%}.ranch-store-list{display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto}.ranch-store-option{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(196,149,106,0.1);cursor:pointer}.ranch-store-option:hover{background:rgba(196,149,106,0.15)}.ranch-animal-picker{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)}.ranch-animal-picker.mobile-inside{position:absolute;border-radius:12px}.ranch-animal-picker-card{background:rgba(18,22,16,0.98);border:1px solid rgba(196,149,106,0.35);border-radius:12px;padding:10px;z-index:1000002;box-shadow:0 8px 24px rgba(0,0,0,0.5);width:min(340px,90vw);max-height:70vh;display:flex;flex-direction:column;margin:auto 10px}.ranch-animal-picker-title{font-size:13px;color:#71717a;padding:4px 6px 8px;border-bottom:1px solid rgba(196,149,106,0.12);margin-bottom:4px;flex-shrink:0}.ranch-animal-picker-list{overflow-y:auto;flex:1;min-height:0}.ranch-animal-option{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:6px;cursor:pointer}.ranch-animal-option:hover{background:rgba(196,149,106,0.12)}.ranch-animal-option-icon{font-size:24px}.ranch-animal-option-info{flex:1;min-width:0}.ranch-animal-option-name{font-size:14px;color:#d4d4d8;font-weight:600}.ranch-animal-option-meta{font-size:11px;color:#71717a;margin-top:1px}.ranch-animal-option-time{font-size:12px;color:#d4a574;opacity:0.7;white-space:nowrap}@media(max-width:768px){.ranch-main-panel{width:clamp(300px,92vw,420px)!important;height:clamp(360px,72vh,600px)!important;max-width:95vw!important;max-height:88vh!important;font-size:14px;resize:none!important}.ranch-grid{grid-template-columns:repeat(2,1fr);gap:6px}.ranch-pen{min-height:90px;padding:8px 4px}.ranch-header{height:42px;padding:0 10px;cursor:default}.ranch-header-title{font-size:15px}.ranch-body{padding:10px}.pen-icon{font-size:28px}.ranch-btn{padding:5px 10px;font-size:12px}#ranch-bubble{width:46px;height:46px;font-size:22px}}@media(max-width:360px){.ranch-main-panel{width:94vw!important;height:clamp(320px,75vh,520px)!important}.ranch-grid{grid-template-columns:repeat(2,1fr);gap:5px}.ranch-pen{min-height:78px;padding:6px 3px}.pen-icon{font-size:24px}}.ranch-main-panel.ranch-force-light{background:rgba(250,247,242,0.97);border-color:rgba(139,92,56,0.2);box-shadow:0 10px 40px rgba(0,0,0,0.12);color:#3d2b1a}.ranch-main-panel.ranch-force-light::before{background:linear-gradient(90deg,#8b5e38,#d4a574,#e8c9a0,#d4a574,#8b5e38)}.ranch-main-panel.ranch-force-light .ranch-header{background:rgba(139,92,56,0.06);border-bottom-color:rgba(139,92,56,0.12)}.ranch-main-panel.ranch-force-light .ranch-header-title{color:#8b5e38}.ranch-main-panel.ranch-force-light .ranch-btn{color:#8b5e38;background:rgba(139,92,56,0.06);border-color:rgba(139,92,56,0.2)}.ranch-main-panel.ranch-force-light .ranch-stat-val{color:#8b5e38}.ranch-main-panel.ranch-force-light .ranch-item{background:rgba(139,92,56,0.04);border-color:rgba(139,92,56,0.12)}.ranch-main-panel.ranch-force-light .ranch-item-name{color:#6b5e52}.ranch-main-panel.ranch-force-light .ranch-item-count{color:#8b5e38}.ranch-main-panel.ranch-force-light .ranch-pen{border-color:rgba(139,92,56,0.1);background:linear-gradient(160deg,rgba(196,149,106,0.03),rgba(255,255,255,0.5))}.ranch-main-panel.ranch-force-light .pen-name{color:#6b5e52}.ranch-main-panel.ranch-force-light .pen-stage{color:#8b5e38}.ranch-main-panel.ranch-force-light .pen-empty-text{color:#9ca3af}.ranch-main-panel.ranch-force-light .ranch-log-title,.ranch-main-panel.ranch-force-light .ranch-temp-bag-title{color:#6b7280}.ranch-main-panel.ranch-force-light .ranch-log-entry .log-text{color:#4b5563}.ranch-main-panel.ranch-force-light .ranch-log-entry .log-time{color:#8b5e38}.ranch-main-panel.ranch-force-light .ranch-temp-bag{background:rgba(0,0,0,0.03);border-color:rgba(139,92,56,0.08)}.ranch-main-panel.ranch-force-light .ranch-temp-bag-name{color:#3d2b1a}.ranch-main-panel.ranch-force-light .ranch-temp-bag-count{color:#8b5e38}.ranch-main-panel.ranch-force-light .ranch-bag-btn{color:#8b5e38;border-color:rgba(139,92,56,0.25);background:rgba(139,92,56,0.08)}.ranch-main-panel.ranch-force-light .ranch-shelter-select{color:#8b5e38}.ranch-main-panel.ranch-force-light .ranch-shelter-select option{background:#fff;color:#3d2b1a}.ranch-toast-light{background:rgba(250,247,242,0.96)!important;border-color:rgba(139,92,56,0.25)!important;color:#8b5e38!important}.ranch-toast-light.event-toast{border-color:rgba(154,52,18,0.25)!important;color:#9a3412!important}.ranch-popup-card.ranch-popup-light{background:rgba(250,247,242,0.98);border-color:rgba(139,92,56,0.2)}`;

    function timeAgo(ts) {
        const sec = Math.floor((Date.now() - ts) / 1000);
        if (sec < 60) return sec + '秒前';
        const min = Math.floor(sec / 60);
        if (min < 60) return min + '分钟前';
        return Math.floor(min / 60) + '小时前';
    }
    function formatMin(m) {
        if (m < 1) return Math.round(m * 60) + '秒';
        if (m < 60) return m.toFixed(1) + '分钟';
        return (m / 60).toFixed(1) + '小时';
    }

    function appendOverlay(overlay) {
        if (window.innerWidth <= 768) { overlay.classList.add('mobile-inside'); panel.appendChild(overlay); }
        else p.document.body.appendChild(overlay);
    }
    function showToast(msg, isEvent = false) {
        const t = p.document.createElement('div');
        t.className = 'ranch-toast' + (isEvent ? ' event-toast' : '');
        if (panel.classList.contains('ranch-force-light')) t.classList.add('ranch-toast-light');
        t.textContent = msg;
        p.document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

    await loadConfig();
    await loadState(ranchConfig.selectedShelter || '');
    const p = window.parent || window;
    const existingPanel = p.document.getElementById('ranch-panel');
    const existingBubble = p.document.getElementById('ranch-bubble');
    if (existingPanel) existingPanel.remove();
    if (existingBubble) existingBubble.remove();

    p.document.head.appendChild(CSS);

    const HTML = `<div id="ranch-panel" class="ranch-main-panel" style="display:${ranchConfig.isMinimized ? 'none' : 'flex'};left:50%;top:50%;width:${ranchConfig.panelWidth};height:${ranchConfig.panelHeight};transform:translate(-50%,-50%);"><div class="ranch-header" id="ranch-drag-handle"><div class="ranch-header-title"><span class="ranch-title-icon">🐄</span> 末世牧场</div><div style="display:flex;gap:4px;"><button class="ranch-btn" id="ranch-theme-toggle">🌑</button><button class="ranch-btn" id="ranch-refresh">🔄</button></div></div><div class="ranch-body" id="ranch-body"></div><div class="ranch-footer" id="ranch-footer"><span style="font-size:11px;color:#52525b;">🐄 末世牧场</span><div style="display:flex;gap:6px;"><button class="ranch-btn danger" id="ranch-clear-pens">清空牧场</button><button class="ranch-btn warn" id="ranch-disable">🛑 停用</button></div><div class="ranch-resizer" id="ranch-resizer"></div></div></div><div id="ranch-bubble" style="top:${ranchConfig.bubbleTop};left:${ranchConfig.bubbleLeft || '60px'};">🐄</div>`;
    p.document.body.insertAdjacentHTML('beforeend', HTML);

    const panel = p.document.getElementById('ranch-panel');
    const bubble = p.document.getElementById('ranch-bubble');
    const body = p.document.getElementById('ranch-body');

    let currentShelters = {};
    let selectedShelter = ranchConfig.selectedShelter || '';
    let tickInterval = null;
    let selectedItemKey = null;
    let productCheckInterval = null;

    async function refreshShelters(forceCold = true) {
        currentShelters = await getShelters(!forceCold);
        const names = Object.keys(currentShelters);
        if (!selectedShelter || !names.includes(selectedShelter)) {
            const old = selectedShelter;
            selectedShelter = names[0] || '';
            if (old && old !== selectedShelter) { await saveState(old); await loadState(selectedShelter); }
        }
        renderPanel();
    }

    function renderPanel() {
        const names = Object.keys(currentShelters);
        const activeEvents = Object.entries(ranchState.events).filter(([,e]) => !e.resolved);
        bubble.classList.toggle('has-event', activeEvents.length > 0);

        if (names.length === 0) {
            body.innerHTML = `<div class="ranch-no-shelter"><div class="no-shelter-icon">🏚️</div><div class="no-shelter-text">没有庇护所<br><span style="font-size:12px;color:#3f3f46;">获得庇护所后点击 🔄 刷新</span></div></div>`;
            return;
        }
        if (!selectedShelter || !names.includes(selectedShelter)) selectedShelter = names[0];

        mergeTempBag();
        const occupied = ranchState.pens.filter(p => p !== null).length;
        const mature = ranchState.pens.filter(p => p && getAnimalStage(p)?.stage === 'mature').length;
        const bagCount = ranchState.tempBag.reduce((s, i) => s + i.count, 0);
        const eventCount = activeEvents.length;

        let html = `<div class="ranch-shelter-bar"><span class="shelter-label">🏠 庇护所</span><select class="ranch-shelter-select" id="ranch-shelter-sel">${names.map(n => `<option value="${n}" ${n===selectedShelter?'selected':''}>${n}</option>`).join('')}</select></div><div class="ranch-stats"><div class="ranch-stat"><div class="ranch-stat-val">${occupied}</div><div class="ranch-stat-label">饲养中</div></div><div class="ranch-stat"><div class="ranch-stat-val" style="color:#facc15">${mature}</div><div class="ranch-stat-label">已成熟</div></div><div class="ranch-stat"><div class="ranch-stat-val">${bagCount}</div><div class="ranch-stat-label">背包物品</div></div>${eventCount>0?`<div class="ranch-stat"><div class="ranch-stat-val" style="color:#f97316">${eventCount}</div><div class="ranch-stat-label">⚠ 警报</div></div>`:''}</div>`;

        if (activeEvents.length > 0) {
            const [evtIdx, evt] = activeEvents[activeEvents.length-1];
            const et = EVENT_TYPES[evt.type];
            const neededItem = Object.entries(ITEMS).find(([,i]) => i.resolves === evt.type);
            html += `<div class="ranch-event-bar"><span class="event-icon">${et.icon}</span><div class="event-info"><div class="event-title">${et.name}！栏位${parseInt(evtIdx)+1}需要${et.actionName}</div><div class="event-desc">${et.desc} · 拖拽${neededItem?neededItem[1].icon+neededItem[1].name:''}到栏位</div></div></div>`;
        }

        html += `<div class="ranch-item-bar"><div class="ranch-item-bar-title">🧰 道具</div>`;
        for (const [key, item] of Object.entries(ITEMS)) {
            const count = ranchState.items[key] || 0;
            html += `<div class="ranch-item${count<=0?' empty':''}${selectedItemKey===key?' selected':''}" draggable="${count>0}" data-item="${key}"><span class="ranch-item-icon">${item.icon}</span><span class="ranch-item-name">${item.name}</span><span class="ranch-item-count">${count}</span></div>`;
        }
        html += `</div><div class="ranch-grid" id="ranch-grid">`;

        for (let i = 0; i < PEN_COUNT; i++) {
            const animal = ranchState.pens[i];
            if (!animal) {
                html += `<div class="ranch-pen empty" data-idx="${i}"><div class="pen-empty-icon">➕</div><div class="pen-empty-text">购买动物</div></div>`;
            } else {
                const aData = ANIMALS[animal.animal];
                const stage = getAnimalStage(animal);
                const evt = ranchState.events[i];
                const hasEvent = evt && !evt.resolved;
                const isMature = stage?.stage === 'mature';
                const cls = [hasEvent?'has-event':'', isMature?'mature':'', !isMature&&stage?.stage==='adult'?'adult':'', !isMature&&stage?.stage==='young'?'young':''].filter(Boolean).join(' ');
                const pct = Math.round(stage.progress * 100);
                const health = animal.health ?? 100;
                const hunger = animal.hunger ?? 100;
                html += `<div class="ranch-pen ${cls}" data-idx="${i}">${hasEvent?`<div class="pen-event-badge">${EVENT_TYPES[evt.type].icon}</div>`:''}<div class="pen-icon">${aData.icon}</div><div class="pen-name">${animal.animal}</div><div class="pen-stage">${hasEvent?EVENT_TYPES[evt.type].name:stage.name}</div>${!isMature?`<div class="pen-attrs"><div class="pen-attr-row"><span class="pen-attr-icon">❤️</span><div class="pen-attr-bar"><div class="pen-attr-fill health${health<30?' low':''}" style="width:${health}%"></div></div><span class="pen-attr-val${health<30?' low':''}">${Math.round(health)}</span></div><div class="pen-attr-row"><span class="pen-attr-icon">🍖</span><div class="pen-attr-bar"><div class="pen-attr-fill hunger${hunger<30?' low':''}" style="width:${hunger}%"></div></div><span class="pen-attr-val${hunger<30?' low':''}">${Math.round(hunger)}</span></div></div>`:`<div style="font-size:11px;color:#facc15;margin-top:4px;">🔪 点击宰杀 (${aData.meat.icon}×${getMeatAmount(animal)})</div>`}<div class="pen-progress"><div class="pen-progress-fill" style="width:${pct}%"></div></div></div>`;
            }
        }
        html += `</div>`;

        html += `<div class="ranch-temp-bag"><div class="ranch-temp-bag-title"><span>🎒 临时背包 (${ranchState.tempBag.length}种/上限${TEMP_BAG_MAX})</span></div>`;
        if (ranchState.tempBag.length === 0) html += `<div style="text-align:center;color:#52525b;padding:12px;">背包空空如也</div>`;
        else {
            ranchState.tempBag.forEach((item, idx) => { html += `<div class="ranch-temp-bag-item"><span class="ranch-temp-bag-icon">${item.icon}</span><span class="ranch-temp-bag-name">${item.name}</span><span class="ranch-temp-bag-count">×${item.count}</span><div class="ranch-temp-bag-actions"><button class="ranch-bag-btn" data-bag-store="${idx}">📦</button><button class="ranch-bag-btn danger" data-bag-discard="${idx}">🗑️</button></div></div>`; });
        }
        html += `<div class="ranch-bag-footer"><button class="ranch-btn" id="ranch-bag-store-all">📦 全部存入</button><button class="ranch-btn danger" id="ranch-bag-clear">🗑️ 清空</button></div></div>`;

        const sortedLog = [...ranchState.log].sort((a,b) => b.time - a.time).slice(0,50);
        if (sortedLog.length > 0) {
            html += `<div class="ranch-log"><div class="ranch-log-title" style="display:flex;justify-content:space-between;"><span>📋 牧场记录</span><button class="ranch-btn danger" id="ranch-clear-log" style="padding:2px 8px;font-size:11px;">清空</button></div>`;
            sortedLog.forEach(l => { html += `<div class="ranch-log-entry"><span class="log-time">${timeAgo(l.time)}</span><span class="log-text">${l.text}</span></div>`; });
            html += `</div>`;
        }

        body.innerHTML = html;

        const sel = p.document.getElementById('ranch-shelter-sel');
        if (sel) sel.addEventListener('change', async (e) => {
            const os = selectedShelter, ns = e.target.value;
            if (os === ns) return;
            await saveState(os); selectedShelter = ns;
            saveConfig({ selectedShelter }); await loadState(ns); renderPanel();
        });
        p.document.getElementById('ranch-clear-log')?.addEventListener('click', async () => { ranchState.log = []; await saveState(); renderPanel(); });
        bindItemDragDrop();
        bindPenClicks();
        bindBagButtons();
    }

    function bindItemDragDrop() {
        body.addEventListener('dragstart', (e) => { const el = e.target.closest('.ranch-item:not(.empty)'); if(!el)return; e.dataTransfer.setData('text/plain',el.dataset.item); el.style.opacity='0.5'; el._isDragging=true; });
        body.addEventListener('dragend', (e) => { const el = e.target.closest('.ranch-item'); if(!el)return; el.style.opacity='1'; el._isDragging=false; });
        body.addEventListener('click', (e) => { const el = e.target.closest('.ranch-item:not(.empty)'); if(!el||el._isDragging)return; e.stopPropagation(); const k=el.dataset.item; selectedItemKey = selectedItemKey===k?null:k; renderPanel(); });
        body.addEventListener('dragover', (e) => { const el = e.target.closest('.ranch-pen:not(.empty)'); if(el){e.preventDefault();el.classList.add('drag-over');} });
        body.addEventListener('dragleave', (e) => { const el = e.target.closest('.ranch-pen'); if(el&&!el.contains(e.relatedTarget))el.classList.remove('drag-over'); });
        body.addEventListener('drop', (e) => { const el = e.target.closest('.ranch-pen'); if(!el)return; e.preventDefault(); el.classList.remove('drag-over'); const k=e.dataTransfer.getData('text/plain'); const idx=parseInt(el.dataset.idx); if(k&&!isNaN(idx))useItemOnPen(k,idx); });
    }

    function bindPenClicks() {
        body.addEventListener('click', async (e) => {
            const el = e.target.closest('.ranch-pen');
            if (!el) return;
            const idx = parseInt(el.dataset.idx);
            if (isNaN(idx)) return;
            if (selectedItemKey) { useItemOnPen(selectedItemKey, idx); selectedItemKey = null; renderPanel(); return; }
            const animal = ranchState.pens[idx];
            if (!animal) { showAnimalPicker(idx); return; }
            const stage = getAnimalStage(animal);
            const evt = ranchState.events[idx];
            if (evt && !evt.resolved) { showEventPopup(idx, animal, evt, EVENT_TYPES[evt.type], Object.entries(ITEMS).find(([,i])=>i.resolves===evt.type), stage?.stage==='mature'); return; }
            if (stage?.stage === 'mature') { showSlaughterConfirm(idx, animal); return; }
            showAnimalDetail(idx, animal, stage);
        });
    }

    function bindBagButtons() {
        p.document.querySelectorAll('[data-bag-store]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); showStoreShelterPicker(parseInt(b.dataset.bagStore)); }));
        p.document.querySelectorAll('[data-bag-discard]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); discardBagItem(parseInt(b.dataset.bagDiscard)); }));
        p.document.getElementById('ranch-bag-store-all')?.addEventListener('click', showStoreAllShelterPicker);
        p.document.getElementById('ranch-bag-clear')?.addEventListener('click', () => { if(ranchState.tempBag.length) clearBag(); });
    }

    function showAnimalPicker(penIdx) {
        p.document.querySelectorAll('.ranch-animal-picker').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-animal-picker';
        let opts = '<div class="ranch-animal-picker-title">🐾 选择动物（免费）</div><div class="ranch-animal-picker-list">';
        Object.entries(ANIMALS).forEach(([n,a]) => { opts += `<div class="ranch-animal-option" data-animal="${n}"><span class="ranch-animal-option-icon">${a.icon}</span><div class="ranch-animal-option-info"><div class="ranch-animal-option-name">${n}</div><div class="ranch-animal-option-meta">${a.desc} · ${a.product?a.product.icon+a.product.name:'无副产物'} · 宰肉${a.meat.icon}×${a.meat.young}~${a.meat.mature}</div></div><span class="ranch-animal-option-time">幼${formatMin(a.youngMin)}+发${formatMin(a.adultMin)}</span></div>`; });
        opts += '</div>';
        overlay.innerHTML = `<div class="ranch-animal-picker-card">${opts}</div>`;
        appendOverlay(overlay);
        overlay.querySelectorAll('.ranch-animal-option').forEach(opt => opt.addEventListener('click', async () => {
            ranchState.pens[penIdx] = { animal: opt.dataset.animal, placedAt: Date.now(), health: 100, hunger: 100 };
            await saveState(); overlay.remove(); renderPanel(); showToast(`🐾 购入了${opt.dataset.animal}`);
        }));
        overlay.addEventListener('click', (e) => { if(!e.target.closest('.ranch-animal-picker-card')) overlay.remove(); });
    }

    function showEventPopup(idx, animal, evt, et, neededItem, isMature) {
        p.document.querySelectorAll('.ranch-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-popup';
        const aData = ANIMALS[animal.animal];
        let slaughterSection = '';
        if (isMature) { const ma = getMeatAmount(animal); slaughterSection = `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);"><div style="font-size:14px;color:#facc15;">同时宰杀 ${aData.icon}${animal.animal}</div><div style="font-size:13px;color:#f87171;">⚠ 因${et.name}，产肉可能受影响</div></div>`; }
        overlay.innerHTML = `<div class="ranch-popup-card"><div style="text-align:center;font-size:40px;">${et.icon}</div><div style="text-align:center;font-size:16px;font-weight:700;color:${et.color};margin:8px 0;">${et.name}！</div><div style="text-align:center;font-size:13px;color:#a1a1aa;">${et.desc}<br>栏位${idx+1}的${animal.animal}需要${et.actionName}</div><div style="text-align:center;font-size:13px;color:#a1a1aa;margin-top:6px;">💡 拖拽 ${neededItem?neededItem[1].icon+neededItem[1].name:''} 到栏位解除</div>${slaughterSection}<div style="display:flex;gap:8px;margin-top:16px;justify-content:center;">${isMature?`<button class="ranch-btn warn" id="evt-slaughter">🔪 宰杀 (${aData.meat.icon}×${getMeatAmount(animal)})</button>`:''}<button class="ranch-btn" id="evt-close">关闭</button></div></div>`;
        appendOverlay(overlay);
        if (isMature) overlay.querySelector('#evt-slaughter').addEventListener('click', () => { slaughterAnimal(idx); overlay.remove(); });
        overlay.querySelector('#evt-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if(!e.target.closest('.ranch-popup-card')) overlay.remove(); });
    }

    function showSlaughterConfirm(idx, animal) {
        p.document.querySelectorAll('.ranch-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-popup';
        const aData = ANIMALS[animal.animal];
        const ma = getMeatAmount(animal);
        overlay.innerHTML = `<div class="ranch-popup-card"><div style="text-align:center;font-size:48px;">${aData.icon}</div><div style="text-align:center;font-size:16px;font-weight:700;color:#d4a574;">宰杀 ${animal.animal}？</div><div style="text-align:center;font-size:14px;color:#facc15;">预计获得 ${aData.meat.icon}${aData.meat.name} ×${ma}</div><div style="text-align:center;font-size:12px;color:#71717a;">肉将存入临时背包</div><div style="display:flex;gap:8px;margin-top:16px;justify-content:center;"><button class="ranch-btn warn" id="sl-yes">🔪 确认宰杀</button><button class="ranch-btn" id="sl-no">取消</button></div></div>`;
        appendOverlay(overlay);
        overlay.querySelector('#sl-yes').addEventListener('click', () => { slaughterAnimal(idx); overlay.remove(); });
        overlay.querySelector('#sl-no').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if(!e.target.closest('.ranch-popup-card')) overlay.remove(); });
    }

    function showAnimalDetail(idx, animal, stage) {
        p.document.querySelectorAll('.ranch-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-popup';
        const aData = ANIMALS[animal.animal];
        const health = animal.health??100, hunger = animal.hunger??100;
        const remaining = Math.max(0, (stage.totalMin||0) - stage.elapsed);
        const ma = getMeatAmount(animal);
        overlay.innerHTML = `<div class="ranch-popup-card"><div style="text-align:center;font-size:48px;">${aData.icon}</div><div style="text-align:center;font-size:18px;font-weight:700;color:#d4a574;">${animal.animal}</div><div style="text-align:center;font-size:13px;color:#a1a1aa;">${stage.name} · ${Math.round(stage.progress*100)}%</div><div style="margin-top:12px;display:flex;flex-direction:column;gap:6px;"><div style="display:flex;align-items:center;gap:8px;"><span>❤️</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;"><div style="height:100%;width:${health}%;${health<30?'background:#ef4444':'background:#22c55e'};border-radius:4px;"></div></div><span>${Math.round(health)}</span></div><div style="display:flex;align-items:center;gap:8px;"><span>🍖</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;"><div style="height:100%;width:${hunger}%;${hunger<30?'background:#ef4444':'background:#facc15'};border-radius:4px;"></div></div><span>${Math.round(hunger)}</span></div></div><div style="margin-top:12px;font-size:13px;color:#71717a;">🥛 副产物: ${aData.product?aData.product.icon+aData.product.name+' ×'+aData.product.min+'~'+aData.product.max:'无'}<br>🔪 当前宰杀: ${aData.meat.icon}${aData.meat.name} ×${ma}<br>⏱️ 预计成熟: ${stage.stage==='mature'?'已成熟':formatMin(remaining)}<br>🛡️ 抗性: ${Math.round(aData.resist*100)}%</div><div style="display:flex;gap:8px;margin-top:14px;justify-content:center;">${stage.stage==='mature'?`<button class="ranch-btn warn" id="det-slaughter">🔪 宰杀</button>`:''}<button class="ranch-btn" id="det-close">关闭</button></div></div>`;
        appendOverlay(overlay);
        if (stage.stage==='mature') overlay.querySelector('#det-slaughter').addEventListener('click', () => { slaughterAnimal(idx); overlay.remove(); });
        overlay.querySelector('#det-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if(!e.target.closest('.ranch-popup-card')) overlay.remove(); });
    }

    function showStoreShelterPicker(bagIdx) {
        const shelters = Object.keys(currentShelters);
        if (!shelters.length) { showToast('❌ 没有可用的庇护所', true); return; }
        p.document.querySelectorAll('.ranch-store-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-store-popup';
        overlay.innerHTML = `<div class="ranch-store-card"><div style="font-size:14px;font-weight:700;color:#d4a574;margin-bottom:10px;text-align:center;">📦 选择存入的庇护所</div><div class="ranch-store-list">${shelters.map(n=>`<div class="ranch-store-option" data-shelter="${n}">🏠 ${n}</div>`).join('')}</div><button class="ranch-btn" id="store-close" style="width:100%;margin-top:8px;">取消</button></div>`;
        appendOverlay(overlay);
        overlay.querySelector('#store-close').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.ranch-store-option').forEach(opt => opt.addEventListener('click', async () => { await storeBagItem(bagIdx, opt.dataset.shelter); overlay.remove(); }));
    }

    function showStoreAllShelterPicker() {
        if (!ranchState.tempBag.length) { showToast('🎒 临时背包为空'); return; }
        const shelters = Object.keys(currentShelters);
        if (!shelters.length) { showToast('❌ 没有可用的庇护所', true); return; }
        p.document.querySelectorAll('.ranch-store-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-store-popup';
        const total = ranchState.tempBag.reduce((s,i)=>s+i.count,0);
        overlay.innerHTML = `<div class="ranch-store-card"><div style="font-size:14px;font-weight:700;color:#d4a574;margin-bottom:10px;text-align:center;">📦 全部存入 (${total}件)</div><div class="ranch-store-list">${shelters.map(n=>`<div class="ranch-store-option" data-shelter="${n}">🏠 ${n}</div>`).join('')}</div><button class="ranch-btn" id="store-close" style="width:100%;margin-top:8px;">取消</button></div>`;
        appendOverlay(overlay);
        overlay.querySelector('#store-close').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.ranch-store-option').forEach(opt => opt.addEventListener('click', async () => { overlay.remove(); await storeAllBag(opt.dataset.shelter); }));
    }

    function startTick() {
        if (tickInterval) clearInterval(tickInterval);
        tickInterval = setInterval(() => { regenItems(); decayAnimalAttrs(); checkRandomEvents(); if (ranchState.pens.some(p=>p)&&!ranchConfig.isMinimized) renderPanel(); }, 5000);
        if (productCheckInterval) clearInterval(productCheckInterval);
        productCheckInterval = setInterval(checkProductGeneration, 5000);
    }

    let activeEl=null, dmode=null, startX=0, startY=0, startLeft=0, startTop=0, startWidth=0, startHeight=0, isDragging=false;
    const onPointerDown = (e) => {
        const el=e.currentTarget._el, m=e.currentTarget._mode;
        activeEl=el; dmode=m; isDragging=false;
        if(el===panel&&panel.style.transform){const r=panel.getBoundingClientRect();panel.style.transform='none';panel.style.left=r.left+'px';panel.style.top=r.top+'px';}
        startX=e.clientX; startY=e.clientY; startLeft=el.offsetLeft; startTop=el.offsetTop; startWidth=el.offsetWidth; startHeight=el.offsetHeight;
        if(el===bubble)bubble.style.transition='none';
        e.preventDefault();
    };
    const onPointerMove = (e) => {
        if(!activeEl)return; const dx=e.clientX-startX, dy=e.clientY-startY;
        if(!isDragging&&Math.hypot(dx,dy)>5)isDragging=true;
        if(!isDragging)return;
        if(dmode==='drag'){activeEl.style.left=Math.max(0,startLeft+dx)+'px';activeEl.style.top=Math.max(0,startTop+dy)+'px';}
        else if(dmode==='resize'){activeEl.style.width=Math.max(300,startWidth+dx)+'px';activeEl.style.height=Math.max(400,startHeight+dy)+'px';}
    };
    const onPointerUp = () => {
        if(!activeEl)return;
        if(activeEl===bubble){saveConfig({bubbleTop:bubble.style.top,bubbleLeft:bubble.style.left});bubble.style.transition='transform 0.2s ease';}
        else if(activeEl===panel)saveConfig({panelLeft:panel.style.left,panelTop:panel.style.top,panelWidth:panel.style.width,panelHeight:panel.style.height});
        if(activeEl===bubble&&!isDragging)togglePanel();
        activeEl=null;dmode=null;isDragging=false;
    };

    function togglePanel() {
        const showing = panel.style.display !== 'none';
        panel.style.display = showing ? 'none' : 'flex';
        ranchConfig.isMinimized = showing;
        saveConfig();
        if (showing) { if(cheatAutoRanchInterval){clearInterval(cheatAutoRanchInterval);cheatAutoRanchInterval=null;} if(cheatAutoSlaughterInterval){clearInterval(cheatAutoSlaughterInterval);cheatAutoSlaughterInterval=null;} }
        else { refreshShelters(true); startTick(); startEventCheck(); }
    }

    const registerDragHandle = (el, handle, m) => { handle._el=el; handle._mode=m; handle.addEventListener('pointerdown', onPointerDown); };
    registerDragHandle(panel, p.document.getElementById('ranch-drag-handle'), 'drag');
    registerDragHandle(panel, p.document.getElementById('ranch-footer'), 'drag');
    registerDragHandle(panel, p.document.getElementById('ranch-resizer'), 'resize');
    registerDragHandle(bubble, bubble, 'drag');
    p.document.addEventListener('pointermove', onPointerMove);
    p.document.addEventListener('pointerup', onPointerUp);
    p.document.addEventListener('pointercancel', onPointerUp);

    p.document.getElementById('ranch-refresh').addEventListener('click', () => refreshShelters(true));
    const themeBtn = p.document.getElementById('ranch-theme-toggle');
    let currentTheme = ranchConfig.theme || 'dark';
    function applyTheme(m) { currentTheme=m; panel.classList.toggle('ranch-force-light', m==='light'); bubble.classList.toggle('ranch-force-light', m==='light'); themeBtn.textContent = m==='dark'?'🌑':'☀️'; saveConfig({theme:m}); }
    applyTheme(currentTheme);
    themeBtn.addEventListener('click', () => applyTheme(currentTheme==='dark'?'light':'dark'));
    p.document.getElementById('ranch-clear-pens').addEventListener('click', async () => { if(!ranchState.pens.some(p=>p))return; ranchState.pens=new Array(PEN_COUNT).fill(null); ranchState.events={}; await saveState(); renderPanel(); showToast('🧹 牧场已清空'); });
    p.document.getElementById('ranch-disable').addEventListener('click', async () => { if(confirm('确定停用牧场吗？\n\n数据会保留。')){await saveState();await saveConfig();window._ranchCleanup();} });

    let mvuEventHandler = null;
    try { if(typeof eventOn==='function'&&Mvu?.events){ mvuEventHandler = async () => { if(!ranchConfig.isMinimized) await refreshShelters(false); }; eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, mvuEventHandler); } } catch(e){}

    await initMvu();
    if (mvuReady) { if (await syncFromMvu()) { selectedShelter = ranchConfig.selectedShelter || selectedShelter; await loadState(selectedShelter); } }
    if (!ranchConfig.isMinimized) { startTick(); startEventCheck(); }

    let cheatAutoRanchEnabled = false, cheatAutoSlaughterEnabled = false, cheatMetabolismEnabled = false;
    let cheatAutoRanchInterval = null, cheatAutoSlaughterInterval = null;

    function cheatAutoRanchTick() { if(!cheatAutoRanchEnabled)return; let changed=false; for(let i=0;i<ranchState.pens.length;i++){const a=ranchState.pens[i];if(!a)continue;if((a.health??100)<85){a.health=100;changed=true;}if((a.hunger??100)<85){a.hunger=100;changed=true;}if(ranchState.events[i]&&!ranchState.events[i].resolved){delete ranchState.events[i];changed=true;}} if(changed){saveState();if(!ranchConfig.isMinimized)renderPanel();} }
    function cheatAutoSlaughterTick() { if(!cheatAutoSlaughterEnabled)return; for(let i=0;i<ranchState.pens.length;i++){const a=ranchState.pens[i];if(!a)continue;if(getAnimalStage(a)?.stage==='mature'){const ad=ANIMALS[a.animal],ma=getMeatAmount(a);if(ranchState.tempBag.length<TEMP_BAG_MAX){ranchState.tempBag.push({icon:ad.meat.icon,name:ad.meat.name,count:ma,time:Date.now()});ranchState.log.push({time:Date.now(),text:`🤖 自动宰杀 ${ad.icon}${a.animal} 获得 ${ad.meat.icon}${ad.meat.name} ×${ma}`});ranchState.pens[i]={animal:a.animal,placedAt:Date.now(),health:100,hunger:100};delete ranchState.events[i];saveState();if(!ranchConfig.isMinimized)renderPanel();}}} }

    function toggleCheatAutoRanch() { cheatAutoRanchEnabled=!cheatAutoRanchEnabled; if(cheatAutoRanchEnabled){cheatAutoRanchInterval=setInterval(cheatAutoRanchTick,2000);showToast('🤖 自律型畜牧矩阵 已开启');}else{if(cheatAutoRanchInterval){clearInterval(cheatAutoRanchInterval);cheatAutoRanchInterval=null;}showToast('🤖 自律型畜牧矩阵 已关闭');} renderCheatPanel(); }
    function toggleCheatAutoSlaughter() { cheatAutoSlaughterEnabled=!cheatAutoSlaughterEnabled; if(cheatAutoSlaughterEnabled){if(cheatAutoRanchEnabled){clearInterval(cheatAutoRanchInterval);cheatAutoRanchInterval=null;cheatAutoRanchEnabled=false;}cheatAutoSlaughterInterval=setInterval(cheatAutoSlaughterTick,2000);showToast('🔪 精准屠宰协议 已开启');}else{if(cheatAutoSlaughterInterval){clearInterval(cheatAutoSlaughterInterval);cheatAutoSlaughterInterval=null;}showToast('🔪 精准屠宰协议 已关闭');} renderCheatPanel(); }
    function toggleCheatMetabolism() { cheatMetabolismEnabled=!cheatMetabolismEnabled; showToast(`♾️ 代谢加速力场 ${cheatMetabolismEnabled?'已开启':'已关闭'}`); renderCheatPanel(); }

    function renderCheatPanel() {
        const cb = p.document.getElementById('ranch-cheat-body');
        if (!cb || cb.style.display === 'none') return;
        const tag = (on) => `<span style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${on?'rgba(196,149,106,0.22)':'rgba(239,68,68,0.18)'};color:${on?'#d4a574':'#f87171'};margin-left:auto;">${on?'ON':'OFF'}</span>`;
        const btn = (on) => `display:flex;align-items:center;gap:10px;padding:12px 14px;background:${on?'rgba(196,149,106,0.18)':'rgba(196,149,106,0.07)'};border:1.5px solid ${on?'rgba(196,149,106,0.55)':'rgba(196,149,106,0.22)'};border-radius:10px;cursor:pointer;width:100%;box-sizing:border-box;font-size:13px;color:#d4a574;text-align:left;${on?'box-shadow:0 0 14px rgba(196,149,106,0.2);':''}`;
        cb.innerHTML = `<div style="font-size:11px;color:#52525b;letter-spacing:1px;">👽 泽塔星系畜牧科技终端</div><div style="font-size:11px;color:#71717a;padding:4px 0;">🐄 畜牧生产协议</div><button style="${btn(cheatAutoRanchEnabled)}" id="cheat-autoranch-btn"><span style="font-size:20px;">🤖</span><div style="flex:1;"><div style="font-weight:600;display:flex;align-items:center;">自律型畜牧矩阵 ${tag(cheatAutoRanchEnabled)}</div><div style="font-size:11px;color:#71717a;">自动治疗/喂食/驱兽 + 收取副产物</div></div></button><button style="${btn(cheatAutoSlaughterEnabled)}" id="cheat-autoslaughter-btn"><span style="font-size:20px;">🔪</span><div style="flex:1;"><div style="font-weight:600;display:flex;align-items:center;">精准屠宰协议 ${tag(cheatAutoSlaughterEnabled)}</div><div style="font-size:11px;color:#71717a;">宰杀成熟+免费补栏同种</div></div></button><button style="${btn(cheatMetabolismEnabled)}" id="cheat-metabolism-btn"><span style="font-size:20px;">♾️</span><div style="flex:1;"><div style="font-weight:600;display:flex;align-items:center;">代谢加速力场 ${tag(cheatMetabolismEnabled)}</div><div style="font-size:11px;color:#71717a;">副产物间隔10s，发育加速</div></div></button>`;
        p.document.getElementById('cheat-autoranch-btn')?.addEventListener('click', toggleCheatAutoRanch);
        p.document.getElementById('cheat-autoslaughter-btn')?.addEventListener('click', toggleCheatAutoSlaughter);
        p.document.getElementById('cheat-metabolism-btn')?.addEventListener('click', toggleCheatMetabolism);
    }

    const footerEl = p.document.getElementById('ranch-footer');
    if (footerEl) {
        const cheatToggle = p.document.createElement('button');
        cheatToggle.className = 'ranch-btn';
        cheatToggle.textContent = '👽';
        cheatToggle.style.cssText = 'padding:4px 8px;font-size:16px;';
        cheatToggle.addEventListener('click', () => {
            const cheatBody = p.document.getElementById('ranch-cheat-body');
            const mainBody = p.document.getElementById('ranch-body');
            if (cheatBody && mainBody) {
                const showing = cheatBody.style.display !== 'none';
                cheatBody.style.display = showing ? 'none' : 'block';
                mainBody.style.display = showing ? 'block' : 'none';
                cheatToggle.textContent = showing ? '👽' : '🐄';
                if (!showing) renderCheatPanel();
            }
        });
        const btnContainer = footerEl.querySelector('div');
        if (btnContainer) btnContainer.insertBefore(cheatToggle, btnContainer.firstChild);
    }

    const cheatBodyEl = p.document.createElement('div');
    cheatBodyEl.id = 'ranch-cheat-body';
    cheatBodyEl.style.cssText = 'display:none;flex-direction:column;gap:10px;padding:14px;overflow-y:auto;flex:1;box-sizing:border-box;';
    panel.insertBefore(cheatBodyEl, body.nextSibling);

    window._ranchCleanup = () => {
        try { saveState(); saveConfig(); } catch(e){}
        if(tickInterval)clearInterval(tickInterval);
        if(eventCheckInterval)clearInterval(eventCheckInterval);
        if(productCheckInterval)clearInterval(productCheckInterval);
        if(cheatAutoRanchInterval)clearInterval(cheatAutoRanchInterval);
        if(cheatAutoSlaughterInterval)clearInterval(cheatAutoSlaughterInterval);
        if(mvuEventHandler&&typeof eventRemoveListener==='function'&&Mvu?.events)try{eventRemoveListener(Mvu.events.VARIABLE_UPDATE_ENDED,mvuEventHandler);}catch(e){}
        p.document.removeEventListener('pointermove',onPointerMove);
        p.document.removeEventListener('pointerup',onPointerUp);
        p.document.removeEventListener('pointercancel',onPointerUp);
        const bp=p.document.getElementById('ranch-bubble'),pp=p.document.getElementById('ranch-panel');
        if(bp)bp.remove(); if(pp)pp.remove();
        console.log('[牧场] 已完全清理');
    };
    window.addEventListener('pagehide', window._ranchCleanup);
    window.addEventListener('beforeunload', window._ranchCleanup);
    console.log('[牧场] 插件已加载 🐄');
})();