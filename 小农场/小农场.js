(async function () {
    'use strict';

    const DB_NAME = 'ZodFarmDB';
    const DB_VERSION = 1;
    const CONFIG_KEY = 'farm_config';
    const FISH_STATE_KEY = 'fish_state';
    const PLOT_COUNT = 12; // 4列×3行
    /* 每个庇护所独立存储，key = farm_state_{shelterName} */
    function stateKey(shelterName) { return 'farm_state_' + shelterName; }
    function ranchStateKey(shelterName) { return 'ranch_state_' + shelterName; }

    // ==================== 作物定义 ====================
    const CROPS = {
        '土豆':   { icon: '🥔', growMin: 3,  yield: 3, weight: 0.3, desc: '耐寒高产作物', resist: 0.7, seedPrice: 18, sellPrice: 7 },
        '白菜':   { icon: '🥬', growMin: 4,  yield: 2, weight: 0.5, desc: '易于种植', resist: 0.6, seedPrice: 22, sellPrice: 12 },
        '胡萝卜': { icon: '🥕', growMin: 5,  yield: 2, weight: 0.2, desc: '富含维生素', resist: 0.5, seedPrice: 25, sellPrice: 14 },
        '辣椒':   { icon: '🌶️', growMin: 5, yield: 2, weight: 0.1, desc: '调味作物', resist: 0.4, seedPrice: 28, sellPrice: 16 },
        '番茄':   { icon: '🍅', growMin: 6,  yield: 3, weight: 0.2, desc: '需精心照料', resist: 0.3, seedPrice: 35, sellPrice: 15 },
        '玉米':   { icon: '🌽', growMin: 8,  yield: 2, weight: 0.4, desc: '高热量作物', resist: 0.6, seedPrice: 38, sellPrice: 20 },
        '小麦':   { icon: '🌾', growMin: 10, yield: 5, weight: 0.1, desc: '基础粮食', resist: 0.8, seedPrice: 30, sellPrice: 8 },
        '南瓜':   { icon: '🎃', growMin: 12, yield: 1, weight: 2.0, desc: '高产大块头', resist: 0.5, seedPrice: 45, sellPrice: 50 },
    };

    const STAGES = [
        { name: '种子',  icon: '🌰', pct: 0 },
        { name: '发芽',  icon: '🌱', pct: 25 },
        { name: '生长',  icon: '🌿', pct: 55 },
        { name: '成熟',  icon: null, pct: 85 },   // null = 显示作物自身图标
        { name: '可收获', icon: null, pct: 100 },  // null = 显示作物自身图标
    ];

    // ==================== 农场升级定义 ====================
    const FARM_UPGRADES = {
        growthSpeed: { name: '生长加速', icon: '⏱️', desc: '作物生长时间缩短', effect: '每级 -3%', max: 10, baseCost: 50, costInc: 40 },
        yieldBonus:  { name: '丰收专精', icon: '🌾', desc: '收获产量提升', effect: '每级 +5%', max: 10, baseCost: 60, costInc: 50 },
        eventResist: { name: '灾害抗性', icon: '🛡️', desc: '降低负面事件概率', effect: '每级 -5%', max: 10, baseCost: 45, costInc: 35 },
        soilCare:    { name: '土壤改良', icon: '🧪', desc: '降低水量/肥力自然衰减', effect: '每级 -5%', max: 10, baseCost: 40, costInc: 30 },
    };
    const RANCH_UPGRADES = {
        growthSpeed: { name: '饲养效率', icon: '⏱️', desc: '动物成长时间缩短', effect: '每级 -3%', max: 10, baseCost: 55, costInc: 45 },
        productBonus:{ name: '繁殖专精', icon: '🥚', desc: '动物产物数量提升', effect: '每级 +5%', max: 10, baseCost: 65, costInc: 55 },
        meatBonus:   { name: '屠宰专精', icon: '🔪', desc: '宰杀肉量提升', effect: '每级 +5%', max: 10, baseCost: 70, costInc: 60 },
        eventResist: { name: '驯养技术', icon: '🛡️', desc: '降低牧场负面事件概率', effect: '每级 -5%', max: 10, baseCost: 50, costInc: 40 },
    };
    function getUpgradeLevel(upgrades, key) { return Math.min((upgrades?.[key] || 0), (FARM_UPGRADES[key] || RANCH_UPGRADES[key])?.max || 10); }
    function getUpgradeCost(cfg, level) {
        if (!cfg) return Infinity;
        return cfg.baseCost + cfg.costInc * level;
    }

    // ==================== 牧场动物定义 ====================
    const ANIMALS = {
        '兔': { icon: '🐰', youngMin: 0.67, adultMin: 1.3, product: { icon: '🧶', name: '兔毛', min: 1, max: 2, sellPrice: 7 }, meat: { icon: '🍖', name: '兔肉', young: 1, adult: 2, mature: 3, sellPrice: 6 }, resist: 0.45, desc: '繁殖快，毛茸茸', price: 50 },
        '鸡': { icon: '🐔', youngMin: 1, adultMin: 1.7, product: { icon: '🥚', name: '鸡蛋', min: 1, max: 2, sellPrice: 5 }, meat: { icon: '🍗', name: '鸡肉', young: 1, adult: 2, mature: 3, sellPrice: 7 }, resist: 0.55, desc: '最常见的家禽，好养活', price: 65 },
        '鸭': { icon: '🦆', youngMin: 1, adultMin: 1.7, product: { icon: '🥚', name: '鸭蛋', min: 1, max: 2, sellPrice: 5 }, meat: { icon: '🍗', name: '鸭肉', young: 1, adult: 2, mature: 3, sellPrice: 7 }, resist: 0.50, desc: '比鸡安静一点', price: 75 },
        '羊': { icon: '🐑', youngMin: 1.3, adultMin: 2, product: { icon: '🧶', name: '羊毛', min: 1, max: 2, sellPrice: 10 }, meat: { icon: '🍖', name: '羊肉', young: 2, adult: 3, mature: 5, sellPrice: 10 }, resist: 0.60, desc: '毛肉两用', price: 150 },
        '猪': { icon: '🐖', youngMin: 1.3, adultMin: 2, product: null, meat: { icon: '🥩', name: '猪肉', young: 3, adult: 5, mature: 7, sellPrice: 14 }, resist: 0.55, desc: '只产肉，别无他用', price: 200 },
        '马': { icon: '🐴', youngMin: 1.7, adultMin: 3, product: { icon: '🐎', name: '马奶', min: 1, max: 2, sellPrice: 8 }, meat: { icon: '🥩', name: '马肉', young: 3, adult: 5, mature: 7, sellPrice: 12 }, resist: 0.70, desc: '高大健壮', price: 250 },
        '牛': { icon: '🐄', youngMin: 1.7, adultMin: 2.3, product: { icon: '🥛', name: '牛奶', min: 1, max: 2, sellPrice: 8 }, meat: { icon: '🥩', name: '牛肉', young: 3, adult: 5, mature: 8, sellPrice: 18 }, resist: 0.65, desc: '产奶大户', price: 300 },
    };
    const PEN_COUNT = 6;
    const TEMP_BAG_MAX = 9999;

    // ==================== 牧场事件定义 ====================
    const RANCH_EVENT_TYPES = {
        disease: { icon: '🤒', name: '疾病', desc: '动物生病了！生长停滞', color: '#ef4444', actionName: '治疗' },
        escape:  { icon: '🏃', name: '逃逸', desc: '动物逃出围栏！需追回', color: '#f97316', actionName: '追回' },
        hunger:  { icon: '🍂', name: '饥饿', desc: '饲料不足，生长减缓', color: '#a16207', actionName: '喂食' },
        beast:   { icon: '🐺', name: '野兽袭击', desc: '野兽试图攻击牲畜！', color: '#a855f7', actionName: '驱赶' },
    };

    // ==================== 牧场道具定义 ====================
    const RANCH_ITEMS = {
        medicine:   { icon: '💉', name: '兽药', resolves: 'disease', desc: '治疗疾病，健康+35', attrKey: 'health', attrAdd: 35 },
        lasso:      { icon: '🪢', name: '套索', resolves: 'escape', desc: '追回逃逸动物，健康+20', attrKey: 'health', attrAdd: 20 },
        feed:       { icon: '🌿', name: '饲料', resolves: 'hunger', desc: '喂养动物，饱食+35', attrKey: 'hunger', attrAdd: 35 },
        repellent:  { icon: '🛡️', name: '驱兽器', resolves: 'beast', desc: '驱赶野兽，健康+25', attrKey: 'health', attrAdd: 25 },
    };
    const RANCH_MAX_ITEM_COUNT = 10;
    const RANCH_ITEM_REGEN_INTERVAL = 120000;
    const RANCH_DEFAULT_ITEMS = { medicine: 2, lasso: 2, feed: 2, repellent: 2 };

    function getRanchItemCategory(itemName) {
        const foodItems = ['鸡蛋', '鸭蛋', '牛奶', '马奶', '鸡肉', '鸭肉', '兔肉', '羊肉', '牛肉', '猪肉', '马肉'];
        if (foodItems.includes(itemName)) return '食物与水';
        if (itemName === '羊毛' || itemName === '兔毛') return '其他杂物';
        return '其他杂物';
    }

    // ==================== 鱼类定义 ====================
    const FISHES = [
        { name: '鲫鱼',   icon: '🐟', rarity: '普通',   difficulty: 1, minW: 0.15, maxW: 0.45, basePrice: 8,  desc: '最常见的淡水鱼', color: '#a1a1aa' },
        { name: '鲤鱼',   icon: '🐠', rarity: '普通',   difficulty: 2, minW: 0.35, maxW: 0.85, basePrice: 12, desc: '有力气的家伙', color: '#a1a1aa' },
        { name: '鲈鱼',   icon: '🐡', rarity: '稀有',   difficulty: 3, minW: 0.50, maxW: 1.10, basePrice: 25, desc: '警惕性很高', color: '#3b82f6' },
        { name: '鲑鱼',   icon: '🦈', rarity: '稀有',   difficulty: 4, minW: 0.80, maxW: 1.60, basePrice: 38, desc: '逆流而上的勇士', color: '#3b82f6' },
        { name: '金枪鱼', icon: '🐋', rarity: '史诗',   difficulty: 5, minW: 1.20, maxW: 2.80, basePrice: 70, desc: '深海巨物', color: '#a855f7' },
        { name: '锦鲤',   icon: '🎏', rarity: '传说',   difficulty: 6, minW: 0.80, maxW: 2.20, basePrice: 100, desc: '带来好运的鱼', color: '#facc15' },
        { name: '河豚',   icon: '🐡', rarity: '史诗',   difficulty: 5, minW: 0.30, maxW: 0.70, basePrice: 55, desc: '有毒但美味', color: '#a855f7' },
        { name: '金龙鱼', icon: '🐉', rarity: '传说',   difficulty: 7, minW: 1.50, maxW: 4.00, basePrice: 150, desc: '传说中的存在', color: '#f97316' },
    ];

    function getFishLenRange(rarity) {
        if (rarity === '普通') return { min: 34, max: 46 };
        if (rarity === '稀有') return { min: 24, max: 32 };
        if (rarity === '史诗') return { min: 16, max: 22 };
        return { min: 10, max: 15 }; // 传说
    }

    // ==================== 垃圾定义 ====================
    const TRASHES = [
        { name: '破靴子', icon: '👢', desc: '一只沾满泥浆的旧靴子' },
        { name: '易拉罐', icon: '🥤', desc: '被人丢弃的饮料罐' },
        { name: '塑料袋', icon: '🛍️', desc: '随波逐流的塑料袋' },
        { name: '烂木头', icon: '🪵', desc: '一块泡烂的旧木板' },
        { name: '碎瓷片', icon: '🥣', desc: '某只碗的残骸' },
        { name: '生锈钥匙', icon: '🗝️', desc: '不知能打开什么的钥匙' },
        { name: '破渔网', icon: '🕸️', desc: '已经没法用的旧渔网' },
        { name: '玻璃瓶', icon: '🍾', desc: '一个空瓶子' },
    ];

    // ==================== 钓竿定义 ====================
    const RODS = [
        { key: 'bamboo',   name: '竹制钓竿', icon: '🎋', price: 0,     bobberLen: 14, desc: '新手标配' },
        { key: 'wood',     name: '木制钓竿', icon: '🪵', price: 120,   bobberLen: 18, desc: '稍微好用一点' },
        { key: 'carbon',   name: '碳素钓竿', icon: '⚫', price: 350,   bobberLen: 22, desc: '轻便灵敏' },
        { key: 'titanium', name: '钛合金钓竿', icon: '🔩', price: 900,   bobberLen: 27, desc: '专业级装备' },
        { key: 'legend',   name: '传说钓竿', icon: '👑', price: 2200,  bobberLen: 34, desc: '传说中的神器' },
    ];

    // ==================== 鱼饵定义 ====================
    const BAITS = [
        { key: 'worm',    name: '蚯蚓',     icon: '🪱', price: 0,    biteRate: 1.0,  rarityBonus: 0,   lenBonus: 0,   weightBonus: 0,   desc: '最基础的鱼饵' },
        { key: 'dough',   name: '面团饵',   icon: '🥟', price: 25,   biteRate: 1.25, rarityBonus: 0.1, lenBonus: 0.05, weightBonus: 0.05, desc: '稍微吸引鱼' },
        { key: 'shrimp',  name: '虾肉饵',   icon: '🦐', price: 60,   biteRate: 1.6,  rarityBonus: 0.25, lenBonus: 0.10, weightBonus: 0.10, desc: '鱼类最爱' },
        { key: 'artificial', name: '仿生饵', icon: '🐛', price: 150,  biteRate: 2.0,  rarityBonus: 0.5,  lenBonus: 0.15, weightBonus: 0.15, desc: '高效诱鱼' },
        { key: 'magic',   name: '魔法鱼饵', icon: '✨', price: 380,  biteRate: 2.8,  rarityBonus: 1.0,  lenBonus: 0.25, weightBonus: 0.25, desc: '传说中的鱼饵' },
    ];

    // ==================== 钓鱼状态 ====================
    let fishState = {
        isPlaying: false,
        hasBitten: false,
        biteTime: 0,
        biteStartTime: 0,
        currentFish: null,   // 当前上钩的鱼实例（含随机化的len/weight）
        catchProgress: 0,
        fishPos: 50,
        fishVel: 0,
        fishLen: 20,
        fishMode: 'idle',
        fishModeTimer: 0,
        bobberPos: 50,
        bobberVel: 0,
        bobberLen: 14,
        log: [],
        totalCaught: 0,
        bestFish: null,
        records: { longest: null, heaviest: null, bestQuality: null },
        money: 20,
        currentRod: 'bamboo',
        currentBait: 'worm',
        inventory: [], // [{type:'fish'|'trash', name, icon, rarity, weight, length, price, time}]
    };
    let fishAnimId = null;
    let fishWaitTimeoutId = null;
    let _fishElCache = { target: null, bobber: null, progress: null, barFill: null };
    let _fishLast = { targetTop: -1, targetH: -1, bobberTop: -1, bobberH: -1, progress: -1, barFill: -1 };
    let _renderPanelRaf = null;
    let _renderFishRaf = null;

    // ==================== 随机事件定义 ====================
    const EVENT_TYPES = {
        drought:  { icon: '🏜️', name: '干旱',   desc: '作物缺水了！生长停滞', color: '#f97316', actionName: '浇水' },
        weeds:    { icon: '🌿', name: '杂草',   desc: '杂草疯长，争夺养分', color: '#65a30d', actionName: '除草' },
        pests:    { icon: '🐛', name: '虫害',   desc: '害虫正在啃食作物！可能降低产量', color: '#ef4444', actionName: '除虫' },
        barren:   { icon: '🪨', name: '土地贫瘠', desc: '土壤养分不足，产量下降', color: '#78716c', actionName: '施肥' },
        thief:    { icon: '🦝', name: '小偷',   desc: '有小偷来偷庄稼了！', color: '#a855f7', actionName: '驱赶' },
    };

    // ==================== 道具定义 ====================
    const ITEMS = {
        waterCan:   { icon: '💧', name: '水壶',   resolves: 'drought', desc: '浇水+35，解除干旱', attrKey: 'water', attrAdd: 35 },
        weedKiller: { icon: '✂️', name: '除草剂', resolves: 'weeds',   desc: '除草+20健康，清除杂草', attrKey: 'health', attrAdd: 20 },
        bugSpray:   { icon: '🧴', name: '除虫剂', resolves: 'pests',   desc: '除虫+25健康，消灭害虫', attrKey: 'health', attrAdd: 25 },
        fertilizer: { icon: '🧪', name: '肥料',   resolves: 'barren',  desc: '施肥+35，恢复肥力', attrKey: 'fertilizer', attrAdd: 35 },
    };
    const MAX_ITEM_COUNT = 10;
    const ITEM_REGEN_INTERVAL = 120000; // 每2分钟恢复1个道具（120000ms = 2min）

    // ==================== 默认状态 ====================
    const DEFAULT_ITEMS = { waterCan: 2, weedKiller: 2, bugSpray: 2, fertilizer: 2 };
    let farmState = {
        plots: new Array(PLOT_COUNT).fill(null),
        harvestLog: [],
        events: {},
        stolenLog: [],
        items: { ...DEFAULT_ITEMS },
        lastItemRegen: Date.now(),
        upgrades: {},
    };
    let farmConfig = {
        panelLeft: '50%', panelTop: '50%',
        panelWidth: '380px', panelHeight: '500px',
        bubbleTop: '35vh', bubbleLeft: '10px',
        isMinimized: true,
    };

    // ==================== 牧场状态 ====================
    let ranchState = {
        pens: new Array(PEN_COUNT).fill(null),
        log: [],
        events: {},
        items: { ...RANCH_DEFAULT_ITEMS },
        lastItemRegen: Date.now(),
        tempBag: [],
        selectedItemKey: null,
        upgrades: {},
    };
    let ranchCheat = {
        autoRanchEnabled: false,
        autoSlaughterEnabled: false,
        metabolismEnabled: false,
        autoRanchInterval: null,
        autoSlaughterInterval: null,
    };

    // ==================== IndexedDB ====================
    /**
     * 打开 IndexedDB 数据库连接
     * @returns {Promise<IDBDatabase>} 数据库实例
     */
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

    /**
     * 从 IndexedDB 读取数据
     * @param {string} key - 存储键名
     * @returns {Promise<any>} 存储的值，不存在时返回 undefined
     */
    async function dbGet(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const req = db.transaction('state', 'readonly').objectStore('state').get(key);
            req.onsuccess = () => { db.close(); resolve(req.result?.value); };
            req.onerror = () => { db.close(); reject(req.error); };
        });
    }
    /**
     * 向 IndexedDB 写入数据
     * @param {string} key - 存储键名
     * @param {any} value - 要存储的值
     * @returns {Promise<void>}
     */
    async function dbPut(key, value) {
        const db = await openDB();
        const tx = db.transaction('state', 'readwrite');
        tx.objectStore('state').put({ key, value });
        return new Promise((resolve, reject) => {
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    }
    /**
     * 重置农场状态到初始值
     */
    function resetFarmState() {
        farmState.plots = new Array(PLOT_COUNT).fill(null);
        farmState.harvestLog = [];
        farmState.events = {};
        farmState.stolenLog = [];
        farmState.items = { ...DEFAULT_ITEMS };
        farmState.lastItemRegen = Date.now();
        farmState.upgrades = {};
    }

    /**
     * 从 IndexedDB 加载指定庇护所的农场状态
     * @param {string} shelterName - 庇护所名称
     */
    async function loadState(shelterName) {
        try {
            const key = stateKey(shelterName);
            const s = await dbGet(key);
            if (s) {
                farmState.plots = s.plots || new Array(PLOT_COUNT).fill(null);
                farmState.harvestLog = s.harvestLog || [];
                farmState.events = s.events || {};
                farmState.stolenLog = s.stolenLog || [];
                farmState.items = { ...DEFAULT_ITEMS, ...(s.items || {}) };
                farmState.lastItemRegen = s.lastItemRegen || Date.now();
                farmState.upgrades = s.upgrades || {};
            } else {
                resetFarmState();
            }
        } catch (e) { console.warn('[小农场] 加载状态失败:', e); }
    }

    async function loadConfig() {
        try {
            const c = await dbGet(CONFIG_KEY);
            if (c) farmConfig = { ...farmConfig, ...c };
        } catch (e) { console.warn('[小农场] 加载配置失败:', e); }
    }

    /**
     * 保存当前农场状态到 IndexedDB
     * @param {string} [shelterName] - 庇护所名称，不传则使用当前选中的庇护所
     */
    let _saveStateTimer = null, _saveStatePromise = null, _saveStateResolve = null;
    async function saveState(shelterName) {
        const name = shelterName || selectedShelter;
        if (_saveStateTimer) clearTimeout(_saveStateTimer);
        if (!_saveStatePromise) _saveStatePromise = new Promise(r => _saveStateResolve = r);
        _saveStateTimer = setTimeout(async () => {
            _saveStateTimer = null;
            const key = stateKey(name);
            await dbPut(key, {
                plots: farmState.plots,
                harvestLog: farmState.harvestLog,
                events: farmState.events,
                stolenLog: farmState.stolenLog,
                items: farmState.items,
                lastItemRegen: farmState.lastItemRegen,
                upgrades: farmState.upgrades,
            });
            await saveFarmToMvu(name);
            const r = _saveStateResolve; _saveStatePromise = null; _saveStateResolve = null;
            if (r) r();
        }, 300);
        return _saveStatePromise;
    }

    async function loadRanchState(shelterName) {
        try {
            const key = ranchStateKey(shelterName);
            const s = await dbGet(key);
            if (s) {
                ranchState.pens = s.pens || new Array(PEN_COUNT).fill(null);
                ranchState.log = s.log || [];
                ranchState.events = s.events || {};
                ranchState.items = { ...RANCH_DEFAULT_ITEMS, ...(s.items || {}) };
                ranchState.lastItemRegen = s.lastItemRegen || Date.now();
                ranchState.tempBag = s.tempBag || [];
                ranchState.upgrades = s.upgrades || {};
            } else {
                resetRanchState();
            }
        } catch (e) { console.warn('[小农场] 加载牧场状态失败:', e); }
    }

    function resetRanchState() {
        ranchState.pens = new Array(PEN_COUNT).fill(null);
        ranchState.log = [];
        ranchState.events = {};
        ranchState.items = { ...RANCH_DEFAULT_ITEMS };
        ranchState.lastItemRegen = Date.now();
        ranchState.tempBag = [];
        ranchState.upgrades = {};
    }

    let _saveRanchStateTimer = null, _saveRanchStatePromise = null, _saveRanchStateResolve = null;
    async function saveRanchState(shelterName) {
        const name = shelterName || selectedShelter;
        if (_saveRanchStateTimer) clearTimeout(_saveRanchStateTimer);
        if (!_saveRanchStatePromise) _saveRanchStatePromise = new Promise(r => _saveRanchStateResolve = r);
        _saveRanchStateTimer = setTimeout(async () => {
            _saveRanchStateTimer = null;
            const key = ranchStateKey(name);
            await dbPut(key, {
                pens: ranchState.pens, log: ranchState.log, events: ranchState.events,
                items: ranchState.items, lastItemRegen: ranchState.lastItemRegen, tempBag: ranchState.tempBag,
                upgrades: ranchState.upgrades,
            });
            await saveFarmToMvu(name);
            const r = _saveRanchStateResolve; _saveRanchStatePromise = null; _saveRanchStateResolve = null;
            if (r) r();
        }, 300);
        return _saveRanchStatePromise;
    }

    /**
     * 保存 UI 配置到 IndexedDB
     * @param {Object} [overrides={}] - 要覆盖的配置项
     */
    async function saveConfig(overrides = {}) {
        farmConfig = { ...farmConfig, ...overrides };
        await dbPut(CONFIG_KEY, farmConfig);
    }

    async function saveFishState() {
        try {
            await dbPut(FISH_STATE_KEY, {
                log: fishState.log,
                records: fishState.records,
                totalCaught: fishState.totalCaught,
                bestFish: fishState.bestFish,
                money: fishState.money,
                currentRod: fishState.currentRod,
                currentBait: fishState.currentBait,
                inventory: fishState.inventory,
            });
        } catch (e) { console.warn('[小农场] 保存钓鱼状态失败:', e); }
    }

    async function loadFishState() {
        try {
            const s = await dbGet(FISH_STATE_KEY);
            if (s) {
                if (s.log) fishState.log = s.log;
                if (s.records) fishState.records = s.records;
                if (s.totalCaught != null) fishState.totalCaught = s.totalCaught;
                if (s.bestFish) fishState.bestFish = s.bestFish;
                if (s.money != null) fishState.money = s.money;
                if (s.currentRod) fishState.currentRod = s.currentRod;
                if (s.currentBait) fishState.currentBait = s.currentBait;
                if (s.inventory) fishState.inventory = s.inventory;
            }
        } catch (e) { console.warn('[小农场] 加载钓鱼状态失败:', e); }
    }

    // ==================== MVU / SillyTavern API ====================
    let mvuReady = false;
    let cachedTargetMsgId = null;

    async function initMvu() {
        try {
            if (typeof waitGlobalInitialized === 'function') {
                await waitGlobalInitialized('Mvu');
            }
            if (typeof Mvu !== 'undefined') {
                mvuReady = true;
                console.log('[小农场] MVU连接成功（冷读取模式）');
            } else {
                console.warn('[小农场] Mvu 不可用');
            }
        } catch (e) {
            console.warn('[小农场] MVU初始化失败:', e);
        }
    }

    function coldReadLatestStatData() {
        if (!mvuReady) return null;
        try {
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return null;
            const messages = typeof getChatMessages === 'function'
                ? getChatMessages('1-' + lastMsgId, { role: 'assistant' })
                : null;
            if (!messages || messages.length === 0) return null;
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 15); i--) {
                const targetMsgId = messages[i].message_id;
                if (targetMsgId <= 0) continue; // 跳过第0层，避免触发StatusPlaceHolder注入
                const data = Mvu.getMvuData({ type: 'message', message_id: targetMsgId });
                const sd = data?.stat_data;
                if (sd && Object.keys(sd).length > 0) {
                    cachedTargetMsgId = targetMsgId;
                    return { statData: sd, targetMsgId };
                }
            }
            return null;
        } catch (e) {
            console.warn('[小农场] 冷读取MVU数据失败:', e);
            return null;
        }
    }

    function quickReadStatData() {
        if (!mvuReady || cachedTargetMsgId === null) return null;
        try {
            const data = Mvu.getMvuData({ type: 'message', message_id: cachedTargetMsgId });
            const sd = data?.stat_data;
            if (sd && Object.keys(sd).length > 0) return sd;
            cachedTargetMsgId = null;
            return null;
        } catch (e) {
            cachedTargetMsgId = null;
            return null;
        }
    }

    function getLatestFullData() {
        if (!mvuReady) return null;
        try {
            if (cachedTargetMsgId !== null && cachedTargetMsgId > 0) {
                const data = Mvu.getMvuData({ type: 'message', message_id: cachedTargetMsgId });
                if (data?.stat_data && Object.keys(data.stat_data).length > 0) {
                    return { data, targetMsgId: cachedTargetMsgId };
                }
            }
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return null;
            const messages = typeof getChatMessages === 'function'
                ? getChatMessages('1-' + lastMsgId, { role: 'assistant' })
                : null;
            if (!messages || messages.length === 0) return null;
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 15); i--) {
                const targetMsgId = messages[i].message_id;
                if (targetMsgId <= 0) continue; // 跳过第0层
                const data = Mvu.getMvuData({ type: 'message', message_id: targetMsgId });
                if (data?.stat_data && Object.keys(data.stat_data).length > 0) {
                    cachedTargetMsgId = targetMsgId;
                    return { data, targetMsgId };
                }
            }
            return null;
        } catch (e) {
            console.warn('[小农场] getLatestFullData 失败:', e);
            return null;
        }
    }

    async function getShelters(useQuickRead = false) {
        let sd;
        if (useQuickRead) {
            sd = quickReadStatData();
            if (!sd) {
                const result = coldReadLatestStatData();
                sd = result?.statData || null;
            }
        } else {
            const result = coldReadLatestStatData();
            sd = result?.statData || null;
        }
        if (!sd || !sd.建筑 || typeof sd.建筑 !== 'object') return {};
        return sd.建筑;
    }

    function getStorageTargets() {
        const targets = [];
        const shelters = Object.keys(currentShelters);
        shelters.forEach(name => targets.push({ type: 'shelter', name, icon: '🏠', label: name }));
        targets.push({ type: 'bag', name: '背包', icon: '🎒', label: '主角背包' });
        try {
            const result = getLatestFullData();
            const campName = result?.data?.stat_data?.营地?.名称;
            if (campName) {
                targets.push({ type: 'camp', name: campName, icon: '🏕️', label: '营地仓库' });
            }
        } catch (e) {}
        targets.push({ type: 'sell', name: '卖出', icon: '💰', label: '卖出换钱' });
        return targets;
    }

    async function storeCrop(cropName, count, target) {
        if (target.type === 'sell') {
            const crop = CROPS[cropName];
            if (!crop) return false;
            const price = crop.sellPrice * count;
            fishState.money += price;
            await saveFishState();
            showToast(`💰 卖出 ${crop.icon}${cropName}×${count}，获得 ¥${price}`);
            return true;
        }
        if (!mvuReady) return false;
        try {
            const result = getLatestFullData();
            if (!result) return false;
            const { data, targetMsgId } = result;
            const sd = data.stat_data;
            const crop = CROPS[cropName];
            let storage;
            if (target.type === 'shelter') {
                if (!sd.建筑 || !sd.建筑[target.name]) return false;
                if (!sd.建筑[target.name].storage || typeof sd.建筑[target.name].storage !== 'object') {
                    sd.建筑[target.name].storage = {};
                }
                storage = sd.建筑[target.name].storage;
            } else if (target.type === 'bag') {
                if (!sd.物品 || typeof sd.物品 !== 'object') sd.物品 = {};
                storage = sd.物品;
            } else if (target.type === 'camp') {
                if (!sd.营地) return false;
                if (!sd.营地.物资 || typeof sd.营地.物资 !== 'object') sd.营地.物资 = {};
                storage = sd.营地.物资;
            } else {
                return false;
            }
            const existing = storage[cropName];
            const existingCount = existing ? parseCount(existing.detail || '') : 0;
            const newCount = existingCount + count;
            storage[cropName] = {
                detail: `${crop.icon} ${cropName}${newCount > 1 ? ' ×' + newCount : ''}`,
                weight: +(crop.weight * newCount).toFixed(1),
                category: '食物与水',
            };
            await Mvu.replaceMvuData(data, { type: 'message', message_id: targetMsgId });
            cachedTargetMsgId = null;
            try {
                if (typeof eventEmit === 'function' && Mvu?.events?.VARIABLE_UPDATE_ENDED) {
                    eventEmit(Mvu.events.VARIABLE_UPDATE_ENDED);
                }
            } catch (e) { console.warn('[小农场] 状态栏刷新事件触发失败:', e); }
            return true;
        } catch (e) {
            console.error('[小农场] 存入失败:', e);
            return false;
        }
    }

    function parseCount(detail) {
        if (!detail) return 1;
        const m = detail.match(/[×xX]\s*(\d+)/);
        if (m) return parseInt(m[1]);
        return 1;
    }

    // ==================== MVU 跨设备同步 ====================

    /**
     * 查找任意可用消息 ID（不要求含 stat_data），用于存储农场数据
     * 优先使用含 stat_data 的消息（与庇护所数据同源），找不到则用最新的助手消息
     */
    function findAnyMessageId() {
        if (!mvuReady) return null;
        try {
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return null;
            const messages = typeof getChatMessages === 'function'
                ? getChatMessages('1-' + lastMsgId, { role: 'assistant' })
                : null;
            if (!messages || messages.length === 0) return null;
            // 优先找含 stat_data 的消息
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 15); i--) {
                const mid = messages[i].message_id;
                if (mid <= 0) continue;
                const d = Mvu.getMvuData({ type: 'message', message_id: mid });
                if (d?.stat_data && Object.keys(d.stat_data).length > 0) return mid;
            }
            // 没有 stat_data 的消息，退而用最新的助手消息
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].message_id > 0) return messages[i].message_id;
            }
            return null;
        } catch (e) { return null; }
    }

    /**
     * 将当前农场状态同步写入 MVU（服务端存储），实现手机/电脑数据统一
     */
    async function saveFarmToMvu(shelterName) {
        if (!mvuReady) return;
        try {
            const targetMsgId = findAnyMessageId();
            if (!targetMsgId) return;
            const data = Mvu.getMvuData({ type: 'message', message_id: targetMsgId }) || {};
            if (!data.farm) data.farm = { shelters: {} };
            const name = shelterName || selectedShelter || farmConfig.selectedShelter;
            if (name) {
                data.farm.shelters[name] = {
                    plots: farmState.plots,
                    harvestLog: farmState.harvestLog,
                    events: farmState.events,
                    stolenLog: farmState.stolenLog,
                    items: farmState.items,
                    lastItemRegen: farmState.lastItemRegen,
                    upgrades: farmState.upgrades,
                    ranch: {
                        pens: ranchState.pens, log: ranchState.log, events: ranchState.events,
                        items: ranchState.items, lastItemRegen: ranchState.lastItemRegen, tempBag: ranchState.tempBag,
                        upgrades: ranchState.upgrades,
                    },
                };
                data.farm.selectedShelter = selectedShelter || farmConfig.selectedShelter || name;
            }
            await Mvu.replaceMvuData(data, { type: 'message', message_id: targetMsgId });
            cachedTargetMsgId = null;
        } catch (e) {
            console.warn('[小农场] MVU 同步写入失败:', e);
        }
    }

    /**
     * 从 MVU 拉取所有庇护所的农场数据，写入本地 IndexedDB
     */
    async function syncFromMvu() {
        if (!mvuReady) return false;
        try {
            const lastMsgId = typeof getLastMessageId === 'function' ? getLastMessageId() : null;
            if (lastMsgId === null || lastMsgId < 1) return false;
            const messages = typeof getChatMessages === 'function'
                ? getChatMessages('1-' + lastMsgId, { role: 'assistant' })
                : null;
            if (!messages || messages.length === 0) return false;
            // 扫描所有近期消息，找到含 farm 数据的那条
            for (let i = messages.length - 1; i >= Math.max(0, messages.length - 30); i--) {
                const mid = messages[i].message_id;
                if (mid <= 0) continue;
                const data = Mvu.getMvuData({ type: 'message', message_id: mid });
                if (data?.farm?.shelters && Object.keys(data.farm.shelters).length > 0) {
                    for (const [name, state] of Object.entries(data.farm.shelters)) {
                        await dbPut(stateKey(name), {
                            plots: state.plots, harvestLog: state.harvestLog, events: state.events,
                            stolenLog: state.stolenLog, items: state.items, lastItemRegen: state.lastItemRegen,
                            upgrades: state.upgrades,
                        });
                        if (state.ranch) {
                            await dbPut(ranchStateKey(name), { ...state.ranch, upgrades: state.ranch?.upgrades });
                        }
                    }
                    if (data.farm.selectedShelter) {
                        farmConfig.selectedShelter = data.farm.selectedShelter;
                    }
                    console.log('[小农场] 从 MVU 同步成功，消息ID:', mid);
                    return true;
                }
            }
            return false;
        } catch (e) {
            console.warn('[小农场] MVU 同步拉取失败:', e);
            return false;
        }
    }

    // ==================== 生长计算（考虑事件影响） ====================
    function getPlotStage(plot, plotIdx) {
        if (!plot) return null;
        const crop = CROPS[plot.crop];
        if (!crop) return null;
        let elapsed = (Date.now() - plot.plantedAt) / 60000;
        const speedMult = 1 + getUpgradeLevel(farmState.upgrades, 'growthSpeed') * 0.03;
        const adjustedGrowMin = crop.growMin / speedMult;

        const evt = farmState.events[plotIdx];
        if (evt && !evt.resolved) {
            // 出现负面状态时停止生长，冻结在事件发生时的进度
            const eventElapsed = (evt.startedAt - plot.plantedAt) / 60000;
            elapsed = Math.min(elapsed, Math.max(0, eventElapsed));
        }

        const progress = Math.min(1, elapsed / adjustedGrowMin);
        const stageIdx = progress >= 1 ? 4 : progress >= 0.85 ? 3 : progress >= 0.55 ? 2 : progress >= 0.25 ? 1 : 0;
        return { progress, stageIdx, stage: STAGES[stageIdx], elapsed, totalMin: adjustedGrowMin };
    }

    function calcYield(plot, plotIdx) {
        const crop = CROPS[plot.crop];
        if (!crop) return 0;
        let y = crop.yield;
        const lvl = getUpgradeLevel(farmState.upgrades, 'yieldBonus');
        y = Math.floor(y * (1 + lvl * 0.05));
        const evt = farmState.events[plotIdx];
        if (evt && !evt.resolved) {
            if (evt.type === 'pests') y = Math.max(1, Math.floor(y * 0.4));
            if (evt.type === 'barren') y = Math.max(1, Math.floor(y * 0.6));
            if (evt.type === 'weeds') y = Math.max(1, Math.floor(y * 0.8)); // 杂草减产20%
        }
        return y;
    }

    // ==================== 随机事件系统 ====================
    let eventCheckInterval = null;

    /**
     * 随机事件检查：触发干旱、虫害、小偷等事件
     * 每30秒执行一次，对生长中的作物进行概率判定
     */
    function checkRandomEvents() {
        let changed = false;
        const eventMult = Math.max(0.2, 1 - getUpgradeLevel(farmState.upgrades, 'eventResist') * 0.05);
        const growingPlots = farmState.plots
            .map((p, i) => ({ plot: p, idx: i }))
            .filter(({ plot, idx }) => plot && !farmState.events[idx] && getPlotStage(plot, idx)?.stageIdx < 4);

        for (const { plot, idx } of growingPlots) {
            if (Math.random() < 0.04 * eventMult) {
                const crop = CROPS[plot.crop];
                if (Math.random() < (crop?.resist || 0.5)) continue;

                const plotInfo = getPlotStage(plot, idx);
                const isMature = plotInfo?.stageIdx >= 3;
                const types = Object.keys(EVENT_TYPES);
                // 成熟期小偷权重翻倍
                const weights = isMature ? [2, 1, 2, 1, 4] : [3, 2, 2, 2, 1];
                const totalW = weights.reduce((a, b) => a + b, 0);
                let r = Math.random() * totalW;
                let chosenType = types[0];
                for (let i = 0; i < weights.length; i++) {
                    r -= weights[i];
                    if (r <= 0) { chosenType = types[i]; break; }
                }

                if (chosenType === 'thief') {
                    const stolenAmount = Math.max(1, Math.floor((crop?.yield || 2) * 0.5));
                    farmState.stolenLog.push({ time: Date.now(), text: `🦝 小偷偷走了 ${crop.icon}${plot.crop} ×${stolenAmount}`, crop: plot.crop, amount: stolenAmount });
                    showToast(`🦝 小偷偷走了 ${crop.icon}${plot.crop} ×${stolenAmount}！`, true);
                } else {
                    farmState.events[idx] = { type: chosenType, startedAt: Date.now(), resolved: false };
                    const et = EVENT_TYPES[chosenType];
                    showToast(`${et.icon} 田地${idx + 1}的${plot.crop}出现${et.name}！`, true);
                }
                changed = true;
            }
        }

        // 虫害超时10分钟→作物枯死（7分钟时预警）
        for (const [idx, evt] of Object.entries(farmState.events)) {
            if (evt.resolved) continue;
            const elapsed = (Date.now() - evt.startedAt) / 60000;
            if (evt.type === 'pests' && elapsed > 7 && !evt._warned) {
                evt._warned = true;
                const plot = farmState.plots[parseInt(idx)];
                if (plot) showToast(`🐛⚠️ 田地${parseInt(idx) + 1}的${plot.crop}虫害严重！即将枯死！`, true);
            }
            if (evt.type === 'pests' && elapsed > 10) {
                const cropInfo = CROPS[farmState.plots[parseInt(idx)]?.crop];
                farmState.plots[parseInt(idx)] = null;
                delete farmState.events[parseInt(idx)];
                farmState.harvestLog.push({ time: Date.now(), text: `💀 ${cropInfo?.icon || '🌾'}作物因虫害枯死` });
                showToast(`💀 田地${parseInt(idx) + 1}的作物因虫害枯死了！`, true);
                changed = true;
            }
        }

        // 可收获超过15分钟→腐烂
        for (let i = 0; i < farmState.plots.length; i++) {
            const plot = farmState.plots[i];
            if (!plot) continue;
            const info = getPlotStage(plot, i);
            if (info && info.stageIdx === 4) {
                const ripeMinutes = (Date.now() - plot.plantedAt) / 60000 - (info.totalMin || 0);
                if (ripeMinutes > 15) {
                    const cropInfo = CROPS[plot.crop];
                    farmState.plots[i] = null;
                    delete farmState.events[i];
                    farmState.harvestLog.push({ time: Date.now(), text: `🦠 ${cropInfo?.icon || '🌾'}${plot.crop}因过熟腐烂了` });
                    showToast(`🦠 田地${i + 1}的${plot.crop}腐烂了！`, true);
                    changed = true;
                }
            }
        }

        if (changed) {
            saveState();
            renderPanel();
        }
    }

    /**
     * 启动随机事件检查定时器
     * 每30秒检查一次，面板打开时才执行实际检查
     */
    function startEventCheck() {
        if (eventCheckInterval) clearInterval(eventCheckInterval);
        eventCheckInterval = setInterval(() => {
            checkRandomEvents();
        }, 30000);
    }

    /**
     * 使用道具（每次只使用1个，不会一次性用完）
     * @param {string} itemKey - 道具键名
     * @param {number} plotIdx - 田地索引
     * @returns {boolean} 是否使用成功
     */
    function useItemOnPlot(itemKey, plotIdx) {
        const plot = farmState.plots[plotIdx];
        if (!plot) {
            showToast('该田地没有作物');
            return false;
        }
        const info = getPlotStage(plot, plotIdx);
        if (info.stageIdx >= 4) {
            showToast('作物已可收获，直接收获吧');
            return false;
        }
        const item = ITEMS[itemKey];
        if (!item) return false;

        if ((farmState.items[itemKey] || 0) <= 0) {
            showToast(`❌ ${item.name}已用完！等待自动补充`, true);
            return false;
        }

        const evt = farmState.events[plotIdx];
        const hasEvent = evt && !evt.resolved;

        // 有事件但道具不匹配
        if (hasEvent && item.resolves !== evt.type) {
            const et = EVENT_TYPES[evt.type];
            const neededItem = Object.values(ITEMS).find(i => i.resolves === evt.type);
            showToast(`❌ ${item.name}无法解除${et.name}！需要${neededItem?.icon || ''}${neededItem?.name || ''}`, true);
            return false;
        }

        // 每次只使用1个道具
        farmState.items[itemKey]--;

        // 解除事件
        let eventMsg = '';
        if (hasEvent && item.resolves === evt.type) {
            const et = EVENT_TYPES[evt.type];
            delete farmState.events[plotIdx];
            eventMsg = `，${et.name}已解除`;
        }

        // 恢复属性
        const attrKey = item.attrKey;
        if (attrKey && plot[attrKey] != null) {
            plot[attrKey] = Math.min(100, plot[attrKey] + item.attrAdd);
        }

        saveState();
        renderPanel();
        const attrName = { water: '水量', fertilizer: '肥力', health: '健康' }[attrKey] || '';
        showToast(`${item.icon} ${item.name}使用成功！${attrName}+${item.attrAdd}${eventMsg}`);
        return true;
    }

    /**
     * 道具自动恢复系统
     * 每2分钟恢复1个道具（最多10个），无庇护所时不恢复
     */
    function regenItems() {
        const now = Date.now();
        const elapsed = now - (farmState.lastItemRegen || now);
        const regenCount = Math.floor(elapsed / ITEM_REGEN_INTERVAL);
        if (regenCount <= 0) return;
        let changed = false;
        for (const key of Object.keys(ITEMS)) {
            if (farmState.items[key] < MAX_ITEM_COUNT) {
                farmState.items[key] = Math.min(MAX_ITEM_COUNT, farmState.items[key] + regenCount);
                changed = true;
            }
        }
        if (changed) {
            farmState.lastItemRegen = now;
            saveState();
            renderPanel();
        }
    }

    /**
     * 作物属性衰减系统
     * 每5秒执行一次：水量、肥力自然衰减，事件加速衰减，健康归零导致枯死
     */
    function decayPlotAttrs() {
        let changed = false;
        const careMult = Math.max(0.3, 1 - getUpgradeLevel(farmState.upgrades, 'soilCare') * 0.05);
        for (let i = 0; i < farmState.plots.length; i++) {
            const plot = farmState.plots[i];
            if (!plot) continue;
            // 可收获不衰减
            const info = getPlotStage(plot, i);
            if (info.stageIdx >= 4) continue;
            if (plot.water == null) plot.water = 80;
            if (plot.fertilizer == null) plot.fertilizer = 75;
            if (plot.health == null) plot.health = 100;

            const evt = farmState.events[i];
            const hasEvent = evt && !evt.resolved;

            // 自然衰减（每5秒tick一次：水-0.8≈6分钟从100到5，肥-0.5≈10分钟从100到5）
            plot.water = Math.max(0, plot.water - 0.8 * careMult);
            plot.fertilizer = Math.max(0, plot.fertilizer - 0.5 * careMult);

            // 事件加速衰减（约2-3分钟内恶化到危险线）
            if (hasEvent) {
                if (evt.type === 'drought') plot.water = Math.max(0, plot.water - 1.5);
                if (evt.type === 'barren') plot.fertilizer = Math.max(0, plot.fertilizer - 1.0);
                if (evt.type === 'pests') plot.health = Math.max(0, plot.health - 1.2);
                if (evt.type === 'weeds') plot.health = Math.max(0, plot.health - 0.6);
            }

            // 水量低时健康下降（模拟缺水伤害）
            if (plot.water < 20) plot.health = Math.max(0, plot.health - 0.5);

            // 属性过低自动触发事件（作为属性系统的正反馈）
            if (!hasEvent) {
                if (plot.water < 20 && Math.random() < 0.12) {
                    farmState.events[i] = { type: 'drought', startedAt: Date.now(), resolved: false };
                    changed = true;
                } else if (plot.fertilizer < 20 && Math.random() < 0.12) {
                    farmState.events[i] = { type: 'barren', startedAt: Date.now(), resolved: false };
                    changed = true;
                }
            }

            // 健康归零→枯死
            if (plot.health <= 0) {
                const cropInfo = CROPS[plot.crop];
                farmState.plots[i] = null;
                delete farmState.events[i];
                farmState.harvestLog.push({ time: Date.now(), text: `💀 ${cropInfo?.icon || '🌾'}作物因健康状况恶化枯死` });
                showToast(`💀 田地${i + 1}的作物枯死了！`, true);
                changed = true;
            }
        }
        if (changed) {
            saveState();
            renderPanel();
        }
    }

    // ==================== 牧场核心函数 ====================
    function getAnimalStage(animal) {
        if (!animal) return null;
        const aData = ANIMALS[animal.animal];
        if (!aData) return null;
        const elapsed = (Date.now() - animal.placedAt) / 60000;
        const evt = ranchState.events[animal.penIdx != null ? animal.penIdx : ranchState.pens.indexOf(animal)];
        if (evt && !evt.resolved) {
            const frozenElapsed = Math.max(0, (evt.startedAt - animal.placedAt) / 60000);
            if (frozenElapsed < aData.youngMin) return { stage: 'young', stageIdx: 0, name: '幼小期', progress: frozenElapsed / aData.youngMin, elapsed: frozenElapsed };
            return { stage: 'adult', stageIdx: 1, name: '发育期', progress: 0.5, elapsed: frozenElapsed };
        }
        let youngMin = aData.youngMin, adultMin = aData.adultMin;
        const speedMult = 1 + getUpgradeLevel(ranchState.upgrades, 'growthSpeed') * 0.03;
        youngMin /= speedMult; adultMin /= speedMult;
        if (ranchCheat.metabolismEnabled) { youngMin /= 3; adultMin /= 3; }
        if (elapsed < youngMin) return { stage: 'young', stageIdx: 0, name: '幼小期', progress: elapsed / youngMin, elapsed, totalMin: youngMin };
        else if (elapsed < youngMin + adultMin) { const ae = elapsed - youngMin; return { stage: 'adult', stageIdx: 1, name: '发育期', progress: ae / adultMin, elapsed, totalMin: youngMin + adultMin }; }
        else return { stage: 'mature', stageIdx: 2, name: '成熟期', progress: 1, elapsed, totalMin: youngMin + adultMin };
    }

    function getMeatAmount(animal) {
        const aData = ANIMALS[animal.animal];
        const stage = getAnimalStage(animal);
        if (!stage) return 0;
        const bonusMult = 1 + getUpgradeLevel(ranchState.upgrades, 'meatBonus') * 0.05;
        if (stage.stage === 'young') return Math.round(aData.meat.young * bonusMult);
        if (stage.stage === 'adult') return Math.round(aData.meat.adult * bonusMult);
        return Math.round(aData.meat.mature * bonusMult);
    }

    function getProductInterval(animal) {
        const aData = ANIMALS[animal.animal];
        if (!aData.product) return Infinity;
        const stage = getAnimalStage(animal);
        if (!stage || stage.stage === 'young') return Infinity;
        let interval;
        const speedMult = 1 + getUpgradeLevel(ranchState.upgrades, 'growthSpeed') * 0.03;
        if (ranchCheat.metabolismEnabled && stage.stage === 'mature') interval = 10;
        else if (ranchCheat.metabolismEnabled && stage.stage === 'adult') interval = 20;
        else interval = aData.adultMin * 60 * 0.5 / speedMult;
        return interval * 1000;
    }

    function checkRanchEvents() {
        let changed = false;
        const eventMult = Math.max(0.2, 1 - getUpgradeLevel(ranchState.upgrades, 'eventResist') * 0.05);
        for (let i = 0; i < ranchState.pens.length; i++) {
            const animal = ranchState.pens[i];
            if (!animal || ranchState.events[i]) continue;
            const stage = getAnimalStage(animal);
            if (!stage || stage.stage === 'mature') continue;
            if (Math.random() < 0.04 * eventMult) {
                const aData = ANIMALS[animal.animal];
                if (Math.random() < (aData?.resist || 0.5)) continue;
                const types = Object.keys(RANCH_EVENT_TYPES);
                const weights = [2, 1, 2, 1];
                const totalW = weights.reduce((a, b) => a + b, 0);
                let r = Math.random() * totalW;
                let chosenType = types[0];
                for (let j = 0; j < weights.length; j++) { r -= weights[j]; if (r <= 0) { chosenType = types[j]; break; } }
                ranchState.events[i] = { type: chosenType, startedAt: Date.now(), resolved: false };
                showToast(`${RANCH_EVENT_TYPES[chosenType].icon} 栏位${i + 1}的${animal.animal}出现${RANCH_EVENT_TYPES[chosenType].name}！`, true);
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
        if (changed) { saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); }
    }

    function useRanchItemOnPen(itemKey, penIdx) {
        const animal = ranchState.pens[penIdx];
        if (!animal) { showToast('该栏位没有动物'); return false; }
        const item = RANCH_ITEMS[itemKey];
        if (!item) return false;
        if ((ranchState.items[itemKey] || 0) <= 0) { showToast(`❌ ${item.name}已用完！`, true); return false; }
        const evt = ranchState.events[penIdx];
        const hasEvent = evt && !evt.resolved;
        if (hasEvent && item.resolves !== evt.type) {
            const et = RANCH_EVENT_TYPES[evt.type];
            const neededItem = Object.values(RANCH_ITEMS).find(i => i.resolves === evt.type);
            showToast(`❌ ${item.name}无法解除${et.name}！需要${neededItem?.icon || ''}${neededItem?.name || ''}`, true);
            return false;
        }
        ranchState.items[itemKey]--;
        let eventMsg = '';
        if (hasEvent && item.resolves === evt.type) { delete ranchState.events[penIdx]; eventMsg = `，${RANCH_EVENT_TYPES[evt.type].name}已解除`; }
        if (item.attrKey && animal[item.attrKey] != null) animal[item.attrKey] = Math.min(100, animal[item.attrKey] + item.attrAdd);
        saveRanchState(); if (currentTab === 'ranch') renderRanchPanel();
        const attrName = { health: '健康', hunger: '饱食' }[item.attrKey] || '';
        showToast(`${item.icon} ${item.name}使用成功！${attrName}+${item.attrAdd}${eventMsg}`);
        return true;
    }

    function regenRanchItems() {
        const now = Date.now();
        const elapsed = now - (ranchState.lastItemRegen || now);
        const regenCount = Math.floor(elapsed / RANCH_ITEM_REGEN_INTERVAL);
        if (regenCount <= 0) return;
        let changed = false;
        for (const key of Object.keys(RANCH_ITEMS)) {
            if (ranchState.items[key] < RANCH_MAX_ITEM_COUNT) { ranchState.items[key] = Math.min(RANCH_MAX_ITEM_COUNT, ranchState.items[key] + regenCount); changed = true; }
        }
        if (changed) { ranchState.lastItemRegen = now; saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); }
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
        if (changed) { saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); }
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
                const bonusMult = 1 + getUpgradeLevel(ranchState.upgrades, 'productBonus') * 0.05;
                const totalCount = Math.round(count * bonusMult) + (stage.stage === 'mature' ? 1 : 0);
                if (ranchState.tempBag.length < TEMP_BAG_MAX) {
                    ranchState.tempBag.push({ icon: aData.product.icon, name: aData.product.name, count: totalCount, time: now });
                    animal.lastProductTime = now;
                    ranchState.log.push({ time: now, text: `🥛 ${aData.icon}${animal.animal}产出 ${aData.product.icon}${aData.product.name} ×${totalCount}` });
                    changed = true;
                }
            }
        }
        if (changed) { saveRanchState(); if (!farmConfig.isMinimized && currentTab === 'ranch') renderRanchPanel(); }
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
            saveRanchState(); if (currentTab === 'ranch') renderRanchPanel();
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

    function getRanchSellPrice(itemName) {
        for (const a of Object.values(ANIMALS)) {
            if (a.product && a.product.name === itemName) return a.product.sellPrice || 0;
            if (a.meat && a.meat.name === itemName) return a.meat.sellPrice || 0;
        }
        return 0;
    }
    async function storeRanchItem(itemName, itemIcon, count, target) {
        if (target.type === 'sell') {
            const price = getRanchSellPrice(itemName) * count;
            if (price <= 0) return false;
            fishState.money += price;
            await saveFishState();
            showToast(`💰 卖出 ${itemIcon}${itemName}×${count}，获得 ¥${price}`);
            return true;
        }
        if (!mvuReady) return false;
        try {
            const result = getLatestFullData();
            if (!result) return false;
            const { data, targetMsgId } = result;
            const sd = data.stat_data;
            let storage;
            if (target.type === 'shelter') {
                if (!sd.建筑 || !sd.建筑[target.name]) return false;
                if (!sd.建筑[target.name].storage || typeof sd.建筑[target.name].storage !== 'object') {
                    sd.建筑[target.name].storage = {};
                }
                storage = sd.建筑[target.name].storage;
            } else if (target.type === 'bag') {
                if (!sd.物品 || typeof sd.物品 !== 'object') sd.物品 = {};
                storage = sd.物品;
            } else if (target.type === 'camp') {
                if (!sd.营地) return false;
                if (!sd.营地.物资 || typeof sd.营地.物资 !== 'object') sd.营地.物资 = {};
                storage = sd.营地.物资;
            } else {
                return false;
            }
            const existing = storage[itemName];
            const existingCount = existing ? parseCount(existing.detail || '') : 0;
            const newCount = existingCount + count;
            storage[itemName] = {
                detail: `${itemIcon} ${itemName}${newCount > 1 ? ' ×' + newCount : ''}`,
                weight: +(0.5 * newCount).toFixed(1),
                category: getRanchItemCategory(itemName),
            };
            await Mvu.replaceMvuData(data, { type: 'message', message_id: targetMsgId });
            cachedTargetMsgId = null;
            try { if (typeof eventEmit === 'function' && Mvu?.events?.VARIABLE_UPDATE_ENDED) eventEmit(Mvu.events.VARIABLE_UPDATE_ENDED); } catch (e) {}
            return true;
        } catch (e) {
            console.error('[小农场] 牧场存入失败:', e);
            return false;
        }
    }

    async function storeBagItem(index, target) {
        const item = ranchState.tempBag[index];
        if (!item) return;
        const ok = await storeRanchItem(item.name, item.icon, item.count, target);
        if (ok) { ranchState.tempBag.splice(index, 1); saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); const label = target.type === 'shelter' ? target.name : target.label; showToast(`📦 已存入 ${label}`); refreshShelters(false); }
        else showToast('❌ 存入失败');
    }

    async function storeAllBag(target) {
        if (ranchState.tempBag.length === 0) { showToast('🎒 临时背包为空'); return; }
        mergeTempBag();
        let stored = 0;
        for (const item of [...ranchState.tempBag]) {
            const ok = await storeRanchItem(item.name, item.icon, item.count, target);
            if (ok) { const idx = ranchState.tempBag.indexOf(item); if (idx >= 0) ranchState.tempBag.splice(idx, 1); stored += item.count; }
        }
        if (stored > 0) { saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); const label = target.type === 'shelter' ? target.name : target.label; showToast(`📦 已存入 ${label}，共 ${stored} 件`); refreshShelters(false); }
        else showToast('❌ 存入失败');
    }

    function discardBagItem(index) { ranchState.tempBag.splice(index, 1); saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); showToast('🗑️ 已丢弃'); }
    function clearBag() { if (ranchState.tempBag.length === 0) return; ranchState.tempBag = []; saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); showToast('🗑️ 临时背包已清空'); }

    // 一键收获
    async function harvestAll() {
        const readyPlots = [];
        for (let i = 0; i < farmState.plots.length; i++) {
            const plot = farmState.plots[i];
            if (!plot) continue;
            const info = getPlotStage(plot, i);
            if (info && info.stageIdx === 4) {
                readyPlots.push({ idx: i, plot, y: calcYield(plot, i) });
            }
        }
        if (readyPlots.length === 0) {
            showToast('没有可收获的作物');
            return;
        }
        const targets = getStorageTargets();
        if (targets.length === 0) {
            showToast('❌ 没有可用的存储位置', true);
            return;
        }
        let summary = {};
        for (const { idx, plot, y } of readyPlots) {
            farmState.plots[idx] = null;
            delete farmState.events[idx];
            if (!summary[plot.crop]) summary[plot.crop] = 0;
            summary[plot.crop] += y;
        }
        await saveState();
        renderPanel();
        const msg = Object.entries(summary).map(([name, count]) => `${CROPS[name].icon}${name}×${count}`).join(' ');
        showToast(`📦 一键收获: ${msg}`);
        if (targets.length === 1) {
            for (const [cropName, count] of Object.entries(summary)) {
                farmState.harvestLog.push({ time: Date.now(), text: `收获 ${CROPS[cropName].icon}${cropName} ×${count} → ${targets[0].label}` });
                storeCrop(cropName, count, targets[0]);
            }
            refreshShelters(false);
        } else {
            showHarvestTargetPicker(summary);
        }
    }

    function showHarvestTargetPicker(summary) {
        const targets = getStorageTargets();
        p.document.querySelectorAll('.ranch-store-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-store-popup';
        const msg = Object.entries(summary).map(([name, count]) => `${CROPS[name].icon}${name}×${count}`).join(' ');
        overlay.innerHTML = `<div class="ranch-store-card${panel.classList.contains('farm-force-light') ? ' ranch-store-light' : ''}"><div style="font-size:14px;font-weight:700;color:#d4a574;margin-bottom:6px;text-align:center;">📦 选择收获存储位置</div><div style="font-size:12px;color:#a1a1aa;text-align:center;margin-bottom:10px;">${msg}</div><div class="ranch-store-list">${targets.map(t => `<div class="ranch-store-option" data-type="${t.type}" data-name="${t.name}" data-label="${t.label}">${t.icon} ${t.label}</div>`).join('')}</div><button class="ranch-btn" id="store-close" style="width:100%;margin-top:8px;">取消</button></div>`;
        appendOverlay(overlay);
        overlay.querySelector('#store-close').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.ranch-store-option').forEach(opt => opt.addEventListener('click', async () => {
            const target = { type: opt.dataset.type, name: opt.dataset.name, label: opt.dataset.label };
            for (const [cropName, count] of Object.entries(summary)) {
                farmState.harvestLog.push({ time: Date.now(), text: `收获 ${CROPS[cropName].icon}${cropName} ×${count} → ${target.label}` });
                storeCrop(cropName, count, target);
            }
            overlay.remove();
            refreshShelters(false);
        }));
    }

    // 显示作物详情
    function showCropDetail(plot, idx, info) {
        // 移除已有的详情弹窗（防止重复打开）
        p.document.querySelectorAll('.crop-detail-popup').forEach(el => el.remove());

        const crop = CROPS[plot.crop];
        const water = plot.water ?? 80;
        const fertilizer = plot.fertilizer ?? 75;
        const health = plot.health ?? 100;
        const waterLow = water < 30 ? ' low' : '';
        const fertLow = fertilizer < 30 ? ' low' : '';
        const healthLow = health < 30 ? ' low' : '';
        const remaining = Math.max(0, info.totalMin - info.elapsed);
        const evt = farmState.events[idx];
        const hasEvent = evt && !evt.resolved;

        const overlay = p.document.createElement('div');
        overlay.className = 'crop-detail-popup';
        if (panel.classList.contains('farm-force-light')) overlay.classList.add('farm-detail-light');

        let eventHtml = '';
        if (hasEvent) {
            const et = EVENT_TYPES[evt.type];
            eventHtml = `<div style="margin-top:10px;padding:8px;background:rgba(249,115,22,0.1);border-radius:6px;border:1px solid rgba(249,115,22,0.25);"><span style="color:#fb923c;font-weight:600;">${et.icon} ${et.name}</span><div style="font-size:12px;color:#a1a1aa;margin-top:2px;">${et.desc}</div></div>`;
        }

        overlay.innerHTML = `
            <div class="crop-detail-card">
                <div class="crop-detail-header">
                    <div class="crop-detail-icon">${crop.icon}</div>
                    <div>
                        <div class="crop-detail-name">${plot.crop}</div>
                        <div class="crop-detail-stage">${info.stage.name} · ${Math.round(info.progress * 100)}%</div>
                    </div>
                </div>
                <div class="crop-detail-attrs">
                    <div class="crop-detail-attr">
                        <span class="crop-detail-attr-icon">💧</span>
                        <div class="crop-detail-attr-bar"><div class="crop-detail-attr-fill water${waterLow}" style="width:${water}%"></div></div>
                        <span class="crop-detail-attr-val">${Math.round(water)}</span>
                    </div>
                    <div class="crop-detail-attr">
                        <span class="crop-detail-attr-icon">🧪</span>
                        <div class="crop-detail-attr-bar"><div class="crop-detail-attr-fill fert${fertLow}" style="width:${fertilizer}%"></div></div>
                        <span class="crop-detail-attr-val">${Math.round(fertilizer)}</span>
                    </div>
                    <div class="crop-detail-attr">
                        <span class="crop-detail-attr-icon">❤️</span>
                        <div class="crop-detail-attr-bar"><div class="crop-detail-attr-fill health${healthLow}" style="width:${health}%"></div></div>
                        <span class="crop-detail-attr-val">${Math.round(health)}</span>
                    </div>
                </div>
                ${eventHtml}
                <div class="crop-detail-info">
                    📊 产量: ×${calcYield(plot, idx)} (基础×${crop.yield})<br>
                    ⏱️ 预计剩余: ${formatMin(remaining)}<br>
                    🛡️ 抗性: ${Math.round(crop.resist * 100)}%
                </div>
                <div class="crop-detail-close">
                    <button class="harvest-btn cancel" id="cd-close">关闭</button>
                </div>
            </div>`;

        appendOverlay(overlay);
        overlay.querySelector('#cd-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.crop-detail-card')) overlay.remove(); });
    }

    // ==================== 牧场渲染 ====================
    function renderRanchPanel() {
        const rb = p.document.getElementById('ranch-body');
        if (!rb || rb.style.display === 'none') return;
        const savedScrollTop = rb.scrollTop;

        const names = Object.keys(currentShelters);
        const activeEvents = Object.entries(ranchState.events).filter(([, e]) => !e.resolved);
        bubble.classList.toggle('has-event', activeEvents.length > 0);

        if (!selectedShelter || !names.includes(selectedShelter)) selectedShelter = names[0] || '';

        mergeTempBag();
        const occupied = ranchState.pens.filter(p => p !== null).length;
        const mature = ranchState.pens.filter(p => p && getAnimalStage(p)?.stage === 'mature').length;
        const bagCount = ranchState.tempBag.reduce((s, i) => s + i.count, 0);
        const eventCount = activeEvents.length;

        let html = '';
        if (names.length > 0) {
            html += `<div class="ranch-shelter-bar"><span>🏠 庇护所</span><select class="ranch-shelter-select" id="ranch-shelter-sel">${names.map(n => `<option value="${n}" ${n === selectedShelter ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`;
        } else {
            html += `<div class="ranch-shelter-bar"><span>🏕️ 流浪营地</span><span style="font-size:12px;color:#3f3f46;">产出暂存背包/卖出</span></div>`;
        }
        html += `<div class="ranch-stats">
                <div class="ranch-stat"><div class="ranch-stat-val">${occupied}</div><div class="ranch-stat-label">饲养中</div></div>
                <div class="ranch-stat"><div class="ranch-stat-val" style="color:#facc15">${mature}</div><div class="ranch-stat-label">已成熟</div></div>
                <div class="ranch-stat"><div class="ranch-stat-val">${bagCount}</div><div class="ranch-stat-label">背包物品</div></div>
                <div class="ranch-stat"><div class="ranch-stat-val" style="color:#facc15">¥${fishState.money}</div><div class="ranch-stat-label">资金</div></div>
                ${eventCount > 0 ? `<div class="ranch-stat"><div class="ranch-stat-val" style="color:#f97316">${eventCount}</div><div class="ranch-stat-label">⚠ 警报</div></div>` : ''}
            </div>
            <button class="ranch-btn" id="ranch-upgrade-btn" style="width:100%;margin-bottom:10px;font-size:13px;padding:6px 0;background:rgba(251,146,60,0.08);color:#fb923c;border-color:rgba(251,146,60,0.25);">📈 牧场升级</button>`;

        if (activeEvents.length > 0) {
            const [evtIdx, evt] = activeEvents[activeEvents.length - 1];
            const et = RANCH_EVENT_TYPES[evt.type];
            const neededItem = Object.entries(RANCH_ITEMS).find(([, i]) => i.resolves === evt.type);
            html += `<div class="ranch-event-bar"><span class="event-icon">${et.icon}</span><div class="event-info"><div class="event-title">${et.name}！栏位${parseInt(evtIdx) + 1}需要${et.actionName}</div><div class="event-desc">${et.desc} · 拖拽${neededItem ? neededItem[1].icon + neededItem[1].name : ''}到栏位</div></div></div>`;
        }

        html += `<div class="ranch-item-bar"><div class="farm-item-bar-title">🧰 道具</div>`;
        for (const [key, item] of Object.entries(RANCH_ITEMS)) {
            const count = ranchState.items[key] || 0;
            html += `<div class="ranch-item${count <= 0 ? ' empty' : ''}${ranchState.selectedItemKey === key ? ' selected' : ''}" draggable="${count > 0}" data-item="${key}"><span class="ranch-item-icon">${item.icon}</span><span class="ranch-item-name">${item.name}</span><span class="ranch-item-count">${count}</span></div>`;
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
                const cls = [hasEvent ? 'has-event' : '', isMature ? 'mature' : ''].filter(Boolean).join(' ');
                const pct = Math.round((stage?.progress || 0) * 100);
                const health = animal.health ?? 100;
                const hunger = animal.hunger ?? 100;
                html += `<div class="ranch-pen ${cls}" data-idx="${i}">${hasEvent ? `<div class="pen-event-badge">${RANCH_EVENT_TYPES[evt.type].icon}</div>` : ''}<div class="pen-icon">${aData.icon}</div><div class="pen-name">${animal.animal}</div><div class="pen-stage">${hasEvent ? RANCH_EVENT_TYPES[evt.type].name : (stage?.name || '')}</div>${!isMature ? `<div class="pen-attrs"><div class="pen-attr-row"><span>❤️</span><div class="pen-attr-bar"><div class="pen-attr-fill health${health < 30 ? ' low' : ''}" style="width:${health}%"></div></div><span class="pen-attr-val${health < 30 ? ' low' : ''}">${Math.round(health)}</span></div><div class="pen-attr-row"><span>🍖</span><div class="pen-attr-bar"><div class="pen-attr-fill hunger${hunger < 30 ? ' low' : ''}" style="width:${hunger}%"></div></div><span class="pen-attr-val${hunger < 30 ? ' low' : ''}">${Math.round(hunger)}</span></div></div>` : `<div style="font-size:11px;color:#facc15;margin-top:4px;">🔪 点击宰杀 (${aData.meat.icon}×${getMeatAmount(animal)})</div>`}<div class="pen-progress"><div class="pen-progress-fill" style="width:${pct}%"></div></div></div>`;
            }
        }
        html += `</div>`;

        html += `<div class="ranch-temp-bag"><div class="ranch-temp-bag-title"><span>🎒 临时背包 (${ranchState.tempBag.length}种/上限${TEMP_BAG_MAX})</span><span style="font-size:12px;color:#facc15;">💰 ¥${fishState.money}</span></div>`;
        if (ranchState.tempBag.length === 0) html += `<div style="text-align:center;color:#52525b;padding:12px;">背包空空如也</div>`;
        else {
            ranchState.tempBag.forEach((item, idx) => {
                const sellPrice = getRanchSellPrice(item.name);
                html += `<div class="ranch-temp-bag-item"><span class="ranch-temp-bag-icon">${item.icon}</span><span class="ranch-temp-bag-name">${item.name}</span><span class="ranch-temp-bag-count">×${item.count}</span><div class="ranch-temp-bag-actions"><button class="ranch-bag-btn" data-bag-store="${idx}">📦</button>${sellPrice > 0 ? `<button class="ranch-bag-btn" data-bag-sell="${idx}" style="color:#facc15;border-color:rgba(250,204,21,0.3);background:rgba(250,204,21,0.08);">💰</button>` : ''}<button class="ranch-bag-btn danger" data-bag-discard="${idx}">🗑️</button></div></div>`;
            });
        }
        html += `<div class="ranch-bag-footer"><button class="ranch-btn" id="ranch-bag-store-all">📦 全部存入</button><button class="ranch-btn" id="ranch-bag-sell-all" style="color:#facc15;border-color:rgba(250,204,21,0.3);background:rgba(250,204,21,0.08);">💰 全部卖出</button><button class="ranch-btn danger" id="ranch-bag-clear">🗑️ 清空</button></div></div>`;

        const sortedLog = [...ranchState.log].sort((a, b) => b.time - a.time).slice(0, 50);
        if (sortedLog.length > 0) {
            html += `<div class="ranch-log"><div class="ranch-log-title" style="display:flex;justify-content:space-between;"><span>📋 牧场记录</span><button class="ranch-btn danger" id="ranch-clear-log" style="padding:2px 8px;font-size:11px;">清空</button></div>`;
            sortedLog.forEach(l => { html += `<div class="ranch-log-entry"><span class="log-time">${timeAgo(l.time)}</span><span class="log-text">${l.text}</span></div>`; });
            html += `</div>`;
        }

        rb.innerHTML = html;
        requestAnimationFrame(() => { rb.scrollTop = Math.min(savedScrollTop, rb.scrollHeight - rb.clientHeight); });

        const sel = p.document.getElementById('ranch-shelter-sel');
        if (sel) sel.addEventListener('change', async (e) => {
            const os = selectedShelter, ns = e.target.value;
            if (os === ns) return;
            await saveState(os); await saveRanchState(os);
            selectedShelter = ns;
            saveConfig({ selectedShelter }); await loadState(ns); await loadRanchState(ns);
            renderPanel(); renderRanchPanel();
        });
        p.document.getElementById('ranch-clear-log')?.addEventListener('click', async () => { ranchState.log = []; await saveRanchState(); renderRanchPanel(); });
        p.document.getElementById('ranch-upgrade-btn')?.addEventListener('click', () => showRanchUpgradePanel());
        bindRanchItemDragDrop();
        bindPenClicks();
        bindBagButtons();
    }

    function bindRanchItemDragDrop() {
        const rb = p.document.getElementById('ranch-body');
        if (!rb || rb._ranchDragBound) return;
        rb._ranchDragBound = true;
        rb.addEventListener('dragstart', (e) => {
            const el = e.target.closest('.ranch-item:not(.empty)');
            if (!el) return;
            e.dataTransfer.setData('text/plain', el.dataset.item);
            el.style.opacity = '0.5';
            el._isDragging = true;
        });
        rb.addEventListener('dragend', (e) => {
            const el = e.target.closest('.ranch-item');
            if (!el) return;
            el.style.opacity = '1';
            el._isDragging = false;
        });
        rb.addEventListener('click', (e) => {
            const el = e.target.closest('.ranch-item:not(.empty)');
            if (!el || el._isDragging) return;
            e.stopPropagation();
            const k = el.dataset.item;
            ranchState.selectedItemKey = ranchState.selectedItemKey === k ? null : k;
            renderRanchPanel();
        });
        rb.addEventListener('dragover', (e) => {
            const el = e.target.closest('.ranch-pen:not(.empty)');
            if (el) { e.preventDefault(); el.classList.add('drag-over'); }
        });
        rb.addEventListener('dragleave', (e) => {
            const el = e.target.closest('.ranch-pen');
            if (el && !el.contains(e.relatedTarget)) el.classList.remove('drag-over');
        });
        rb.addEventListener('drop', (e) => {
            const el = e.target.closest('.ranch-pen');
            if (!el) return;
            e.preventDefault();
            el.classList.remove('drag-over');
            const k = e.dataTransfer.getData('text/plain');
            const idx = parseInt(el.dataset.idx);
            if (k && !isNaN(idx)) useRanchItemOnPen(k, idx);
        });
    }

    const penClickTimers = {};
    function bindPenClicks() {
        const rb = p.document.getElementById('ranch-body');
        if (!rb || rb._ranchPenClickBound) return;
        rb._ranchPenClickBound = true;
        rb.addEventListener('click', async (e) => {
            const el = e.target.closest('.ranch-pen');
            if (!el) return;
            const idx = parseInt(el.dataset.idx);
            if (isNaN(idx)) return;
            if (ranchState.selectedItemKey) { useRanchItemOnPen(ranchState.selectedItemKey, idx); ranchState.selectedItemKey = null; renderRanchPanel(); return; }
            const animal = ranchState.pens[idx];
            if (!animal) { showAnimalPicker(idx); return; }
            // 双击检测：350ms内第二次点击→直接弹出放逐确认
            if (penClickTimers[idx]) {
                clearTimeout(penClickTimers[idx]);
                delete penClickTimers[idx];
                const evt = ranchState.events[idx];
                if (!evt || evt.resolved) { showReleaseConfirm(idx, animal); }
                return;
            }
            penClickTimers[idx] = setTimeout(() => {
                delete penClickTimers[idx];
                const stage = getAnimalStage(animal);
                const evt = ranchState.events[idx];
                if (evt && !evt.resolved) {
                    const et = RANCH_EVENT_TYPES[evt.type];
                    const neededItem = Object.entries(RANCH_ITEMS).find(([, i]) => i.resolves === evt.type);
                    showRanchEventPopup(idx, animal, evt, et, neededItem, stage?.stage === 'mature');
                    return;
                }
                if (stage?.stage === 'mature') { showSlaughterConfirm(idx, animal); return; }
                showAnimalDetail(idx, animal, stage);
            }, 350);
        });
    }

    function bindBagButtons() {
        p.document.querySelectorAll('[data-bag-store]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); showStoreTargetPicker(parseInt(b.dataset.bagStore)); }));
        p.document.querySelectorAll('[data-bag-sell]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); sellBagItem(parseInt(b.dataset.bagSell)); }));
        p.document.querySelectorAll('[data-bag-discard]').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); discardBagItem(parseInt(b.dataset.bagDiscard)); }));
        p.document.getElementById('ranch-bag-store-all')?.addEventListener('click', showStoreAllTargetPicker);
        p.document.getElementById('ranch-bag-sell-all')?.addEventListener('click', sellAllBag);
        p.document.getElementById('ranch-bag-clear')?.addEventListener('click', () => { if (ranchState.tempBag.length) clearBag(); });
    }

    function sellBagItem(index) {
        const item = ranchState.tempBag[index];
        if (!item) return;
        const price = getRanchSellPrice(item.name) * item.count;
        if (price <= 0) { showToast('❌ 此物品无法出售'); return; }
        fishState.money += price;
        ranchState.tempBag.splice(index, 1);
        saveFishState(); saveRanchState(); if (currentTab === 'ranch') renderRanchPanel();
        showToast(`💰 卖出 ${item.icon}${item.name}×${item.count}，获得 ¥${price}`);
    }
    function sellAllBag() {
        if (ranchState.tempBag.length === 0) { showToast('🎒 临时背包为空'); return; }
        mergeTempBag();
        let total = 0;
        for (const item of [...ranchState.tempBag]) {
            const price = getRanchSellPrice(item.name) * item.count;
            if (price > 0) { total += price; const idx = ranchState.tempBag.indexOf(item); if (idx >= 0) ranchState.tempBag.splice(idx, 1); }
        }
        if (total > 0) { fishState.money += total; saveFishState(); saveRanchState(); if (currentTab === 'ranch') renderRanchPanel(); showToast(`💰 全部卖出，共获得 ¥${total}`); }
        else showToast('❌ 没有可出售的物品');
    }

    function showAnimalPicker(penIdx) {
        p.document.querySelectorAll('.ranch-animal-picker').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-animal-picker';
        let opts = `<div class="ranch-animal-picker-title"><span>🐾 选择动物 <span style="font-size:12px;color:#facc15;margin-left:8px;">💰 ¥${fishState.money}</span></span><button class="ranch-popup-close" id="animal-picker-close" title="关闭">✕</button></div><div class="ranch-animal-picker-list">`;
        Object.entries(ANIMALS).forEach(([n, a]) => {
            const canBuy = fishState.money >= a.price;
            opts += `<div class="ranch-animal-option" data-animal="${n}" style="${!canBuy ? 'opacity:0.45;pointer-events:none;' : ''}"><span class="ranch-animal-option-icon">${a.icon}</span><div class="ranch-animal-option-info"><div class="ranch-animal-option-name">${n} <span style="font-size:11px;color:#facc15;">¥${a.price}</span></div><div class="ranch-animal-option-meta">${a.desc} · ${a.product ? a.product.icon + a.product.name : '无副产物'} · 宰肉${a.meat.icon}×${a.meat.young}~${a.meat.mature}</div></div><span class="ranch-animal-option-time">幼${formatMin(a.youngMin)}+发${formatMin(a.adultMin)}</span></div>`;
        });
        opts += '</div>';
        overlay.innerHTML = `<div class="ranch-animal-picker-card${panel.classList.contains('farm-force-light') ? ' ranch-picker-light' : ''}">${opts}</div>`;
        appendOverlay(overlay);
        overlay.querySelectorAll('.ranch-animal-option').forEach(opt => opt.addEventListener('click', async () => {
            const animalName = opt.dataset.animal;
            const aData = ANIMALS[animalName];
            if (!aData) return;
            if (fishState.money < aData.price) { showToast(`❌ 资金不足，需要 ¥${aData.price}`); return; }
            fishState.money -= aData.price;
            await saveFishState();
            ranchState.pens[penIdx] = { animal: animalName, placedAt: Date.now(), health: 100, hunger: 100 };
            await saveRanchState(); overlay.remove(); renderRanchPanel();
            showToast(`🐾 购入了${animalName}，花费 ¥${aData.price}`);
        }));
        overlay.querySelector('#animal-picker-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.ranch-animal-picker-card')) overlay.remove(); });
    }

    function showRanchEventPopup(idx, animal, evt, et, neededItem, isMature) {
        p.document.querySelectorAll('.ranch-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-popup';
        const aData = ANIMALS[animal.animal];
        let slaughterSection = '';
        if (isMature) {
            const ma = getMeatAmount(animal);
            slaughterSection = `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);"><div style="font-size:14px;color:#facc15;">同时宰杀 ${aData.icon}${animal.animal}</div><div style="font-size:13px;color:#f87171;">⚠ 因${et.name}，产肉可能受影响</div></div>`;
        }
        overlay.innerHTML = `<div class="ranch-popup-card${panel.classList.contains('farm-force-light') ? ' ranch-popup-light' : ''}"><div style="text-align:center;font-size:40px;">${et.icon}</div><div style="text-align:center;font-size:16px;font-weight:700;color:${et.color};margin:8px 0;">${et.name}！</div><div style="text-align:center;font-size:13px;color:#a1a1aa;">${et.desc}<br>栏位${idx + 1}的${animal.animal}需要${et.actionName}</div><div style="text-align:center;font-size:13px;color:#a1a1aa;margin-top:6px;">💡 拖拽 ${neededItem ? neededItem[1].icon + neededItem[1].name : ''} 到栏位解除</div>${slaughterSection}<div style="display:flex;gap:8px;margin-top:16px;justify-content:center;">${isMature ? `<button class="ranch-btn warn" id="evt-slaughter">🔪 宰杀 (${aData.meat.icon}×${getMeatAmount(animal)})</button>` : ''}<button class="ranch-btn" id="evt-close">关闭</button></div></div>`;
        appendOverlay(overlay);
        if (isMature) overlay.querySelector('#evt-slaughter')?.addEventListener('click', () => { slaughterAnimal(idx); overlay.remove(); });
        overlay.querySelector('#evt-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.ranch-popup-card')) overlay.remove(); });
    }

    function showSlaughterConfirm(idx, animal) {
        p.document.querySelectorAll('.ranch-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-popup';
        const aData = ANIMALS[animal.animal];
        const ma = getMeatAmount(animal);
        overlay.innerHTML = `<div class="ranch-popup-card${panel.classList.contains('farm-force-light') ? ' ranch-popup-light' : ''}"><div style="text-align:center;font-size:48px;">${aData.icon}</div><div style="text-align:center;font-size:16px;font-weight:700;color:#d4a574;">宰杀 ${animal.animal}？</div><div style="text-align:center;font-size:14px;color:#facc15;">预计获得 ${aData.meat.icon}${aData.meat.name} ×${ma}</div><div style="text-align:center;font-size:12px;color:#71717a;">肉将存入临时背包</div><div style="display:flex;gap:8px;margin-top:16px;justify-content:center;"><button class="ranch-btn warn" id="sl-yes">🔪 确认宰杀</button><button class="ranch-btn" id="sl-no">取消</button></div></div>`;
        appendOverlay(overlay);
        overlay.querySelector('#sl-yes').addEventListener('click', () => { slaughterAnimal(idx); overlay.remove(); });
        overlay.querySelector('#sl-no').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.ranch-popup-card')) overlay.remove(); });
    }

    function showAnimalDetail(idx, animal, stage) {
        p.document.querySelectorAll('.ranch-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-popup';
        const aData = ANIMALS[animal.animal];
        const health = animal.health ?? 100, hungerv = animal.hunger ?? 100;
        const remaining = Math.max(0, (stage?.totalMin || 0) - (stage?.elapsed || 0));
        const ma = getMeatAmount(animal);
        overlay.innerHTML = `<div class="ranch-popup-card${panel.classList.contains('farm-force-light') ? ' ranch-popup-light' : ''}"><div style="text-align:center;font-size:48px;">${aData.icon}</div><div style="text-align:center;font-size:18px;font-weight:700;color:#d4a574;">${animal.animal}</div><div style="text-align:center;font-size:13px;color:#a1a1aa;">${stage?.name || ''} · ${Math.round((stage?.progress || 0) * 100)}%</div><div style="margin-top:12px;display:flex;flex-direction:column;gap:6px;"><div style="display:flex;align-items:center;gap:8px;"><span>❤️</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;"><div style="height:100%;width:${health}%;${health < 30 ? 'background:#ef4444' : 'background:#22c55e'};border-radius:4px;"></div></div><span>${Math.round(health)}</span></div><div style="display:flex;align-items:center;gap:8px;"><span>🍖</span><div style="flex:1;height:8px;background:rgba(255,255,255,0.08);border-radius:4px;"><div style="height:100%;width:${hungerv}%;${hungerv < 30 ? 'background:#ef4444' : 'background:#facc15'};border-radius:4px;"></div></div><span>${Math.round(hungerv)}</span></div></div><div style="margin-top:12px;font-size:13px;color:#71717a;">🥛 副产物: ${aData.product ? aData.product.icon + aData.product.name + ' ×' + aData.product.min + '~' + aData.product.max : '无'}<br>🔪 当前宰杀: ${aData.meat.icon}${aData.meat.name} ×${ma}<br>⏱️ 预计成熟: ${stage?.stage === 'mature' ? '已成熟' : formatMin(remaining)}<br>🛡️ 抗性: ${Math.round(aData.resist * 100)}%</div><div style="display:flex;gap:8px;margin-top:14px;justify-content:center;">${stage?.stage === 'mature' ? `<button class="ranch-btn warn" id="det-slaughter">🔪 宰杀</button>` : ''}<button class="ranch-btn danger" id="det-release">🚫 放逐</button><button class="ranch-btn" id="det-close">关闭</button></div></div>`;
        appendOverlay(overlay);
        if (stage?.stage === 'mature') overlay.querySelector('#det-slaughter')?.addEventListener('click', () => { slaughterAnimal(idx); overlay.remove(); });
        overlay.querySelector('#det-release').addEventListener('click', () => {
            overlay.remove();
            showReleaseConfirm(idx, animal);
        });
        overlay.querySelector('#det-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.ranch-popup-card')) overlay.remove(); });
    }

    function showReleaseConfirm(idx, animal) {
        p.document.querySelectorAll('.ranch-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-popup';
        const aData = ANIMALS[animal.animal];
        let confirmed = false;
        const renderCard = () => {
            overlay.innerHTML = `<div class="ranch-popup-card${panel.classList.contains('farm-force-light') ? ' ranch-popup-light' : ''}"><div style="text-align:center;font-size:48px;">${aData.icon}</div><div style="text-align:center;font-size:16px;font-weight:700;color:#ef4444;">放逐 ${animal.animal}？</div><div style="text-align:center;font-size:13px;color:#a1a1aa;margin-top:8px;">动物将被永久移除，不会获得任何产物</div><div style="display:flex;gap:8px;margin-top:16px;justify-content:center;"><button class="ranch-btn${confirmed ? ' danger' : ''}" id="rel-confirm" style="${confirmed ? 'background:#dc2626;animation:pulse 0.6s infinite;' : ''}">${confirmed ? '⚠️ 再次确认放逐' : '🚫 确认放逐'}</button><button class="ranch-btn" id="rel-cancel">取消</button></div></div>`;
        };
        const doRelease = async () => {
            ranchState.pens[idx] = null;
            delete ranchState.events[idx];
            await saveRanchState();
            overlay.remove();
            renderRanchPanel();
            showToast(`🚫 ${aData.icon}${animal.animal} 已被放逐`);
        };
        renderCard();
        appendOverlay(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target.id === 'rel-confirm') {
                if (!confirmed) { confirmed = true; renderCard(); }
                else { doRelease(); }
            } else if (e.target.id === 'rel-cancel' || !e.target.closest('.ranch-popup-card')) {
                overlay.remove();
            }
        });
    }

    function showStoreTargetPicker(bagIdx) {
        const targets = getStorageTargets();
        if (targets.length === 0) { showToast('❌ 没有可用的存储位置', true); return; }
        if (targets.length === 1) { storeBagItem(bagIdx, targets[0]); return; }
        p.document.querySelectorAll('.ranch-store-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-store-popup';
        overlay.innerHTML = `<div class="ranch-store-card${panel.classList.contains('farm-force-light') ? ' ranch-store-light' : ''}"><div style="font-size:14px;font-weight:700;color:#d4a574;margin-bottom:10px;text-align:center;">📦 选择存入位置</div><div class="ranch-store-list">${targets.map(t => `<div class="ranch-store-option" data-type="${t.type}" data-name="${t.name}" data-label="${t.label}">${t.icon} ${t.label}</div>`).join('')}</div><button class="ranch-btn" id="store-close" style="width:100%;margin-top:8px;">取消</button></div>`;
        appendOverlay(overlay);
        overlay.querySelector('#store-close').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.ranch-store-option').forEach(opt => opt.addEventListener('click', async () => { await storeBagItem(bagIdx, { type: opt.dataset.type, name: opt.dataset.name, label: opt.dataset.label }); overlay.remove(); }));
    }

    function showStoreAllTargetPicker() {
        if (!ranchState.tempBag.length) { showToast('🎒 临时背包为空'); return; }
        const targets = getStorageTargets();
        if (targets.length === 0) { showToast('❌ 没有可用的存储位置', true); return; }
        if (targets.length === 1) { storeAllBag(targets[0]); return; }
        p.document.querySelectorAll('.ranch-store-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'ranch-store-popup';
        const total = ranchState.tempBag.reduce((s, i) => s + i.count, 0);
        overlay.innerHTML = `<div class="ranch-store-card${panel.classList.contains('farm-force-light') ? ' ranch-store-light' : ''}"><div style="font-size:14px;font-weight:700;color:#d4a574;margin-bottom:10px;text-align:center;">📦 全部存入 (${total}件)</div><div class="ranch-store-list">${targets.map(t => `<div class="ranch-store-option" data-type="${t.type}" data-name="${t.name}" data-label="${t.label}">${t.icon} ${t.label}</div>`).join('')}</div><button class="ranch-btn" id="store-close" style="width:100%;margin-top:8px;">取消</button></div>`;
        appendOverlay(overlay);
        overlay.querySelector('#store-close').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.ranch-store-option').forEach(opt => opt.addEventListener('click', async () => { overlay.remove(); await storeAllBag({ type: opt.dataset.type, name: opt.dataset.name, label: opt.dataset.label }); }));
    }

    function showFarmUpgradePanel() {
        p.document.querySelectorAll('.upgrade-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'upgrade-popup';
        const isLight = panel.classList.contains('farm-force-light');
        let html = `<div class="upgrade-card${isLight ? ' upgrade-light' : ''}"><div style="font-size:15px;font-weight:700;color:#d4a574;margin-bottom:4px;text-align:center;">📈 农场专精</div><div style="font-size:12px;color:#a1a1aa;text-align:center;margin-bottom:10px;">💰 ¥${fishState.money}</div><div class="upgrade-list">`;
        for (const [key, cfg] of Object.entries(FARM_UPGRADES)) {
            const lvl = getUpgradeLevel(farmState.upgrades, key);
            const cost = getUpgradeCost(cfg, lvl);
            const maxed = lvl >= cfg.max;
            const canBuy = fishState.money >= cost && !maxed;
            html += `<div class="upgrade-item${maxed ? ' maxed' : ''}${!canBuy && !maxed ? ' disabled' : ''}"><div class="upgrade-info"><div class="upgrade-name">${cfg.icon} ${cfg.name} <span class="upgrade-lvl">Lv.${lvl}/${cfg.max}</span></div><div class="upgrade-desc">${cfg.desc} · ${cfg.effect}</div></div><button class="upgrade-btn${canBuy ? '' : ' disabled'}" data-key="${key}">${maxed ? '已满级' : `¥${cost} 升级`}</button></div>`;
        }
        html += `</div><button class="ranch-btn" id="upgrade-close" style="width:100%;margin-top:8px;">关闭</button></div>`;
        overlay.innerHTML = html;
        appendOverlay(overlay);
        overlay.querySelector('#upgrade-close').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.upgrade-btn:not(.disabled)').forEach(btn => btn.addEventListener('click', async () => {
            const key = btn.dataset.key;
            const cfg = FARM_UPGRADES[key];
            const lvl = getUpgradeLevel(farmState.upgrades, key);
            const cost = getUpgradeCost(cfg, lvl);
            if (fishState.money < cost) { showToast('❌ 资金不足'); return; }
            fishState.money -= cost;
            farmState.upgrades[key] = (farmState.upgrades[key] || 0) + 1;
            await saveFishState(); await saveState();
            showToast(`📈 ${FARM_UPGRADES[key].icon}${FARM_UPGRADES[key].name} 升级到 Lv.${farmState.upgrades[key]}`);
            overlay.remove(); showFarmUpgradePanel(); if (currentTab === 'farm') renderPanel();
        }));
    }

    function showRanchUpgradePanel() {
        p.document.querySelectorAll('.upgrade-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'upgrade-popup';
        const isLight = panel.classList.contains('farm-force-light');
        let html = `<div class="upgrade-card${isLight ? ' upgrade-light' : ''}"><div style="font-size:15px;font-weight:700;color:#d4a574;margin-bottom:4px;text-align:center;">📈 牧场专精</div><div style="font-size:12px;color:#a1a1aa;text-align:center;margin-bottom:10px;">💰 ¥${fishState.money}</div><div class="upgrade-list">`;
        for (const [key, cfg] of Object.entries(RANCH_UPGRADES)) {
            const lvl = getUpgradeLevel(ranchState.upgrades, key);
            const cost = getUpgradeCost(cfg, lvl);
            const maxed = lvl >= cfg.max;
            const canBuy = fishState.money >= cost && !maxed;
            html += `<div class="upgrade-item${maxed ? ' maxed' : ''}${!canBuy && !maxed ? ' disabled' : ''}"><div class="upgrade-info"><div class="upgrade-name">${cfg.icon} ${cfg.name} <span class="upgrade-lvl">Lv.${lvl}/${cfg.max}</span></div><div class="upgrade-desc">${cfg.desc} · ${cfg.effect}</div></div><button class="upgrade-btn${canBuy ? '' : ' disabled'}" data-key="${key}">${maxed ? '已满级' : `¥${cost} 升级`}</button></div>`;
        }
        html += `</div><button class="ranch-btn" id="upgrade-close" style="width:100%;margin-top:8px;">关闭</button></div>`;
        overlay.innerHTML = html;
        appendOverlay(overlay);
        overlay.querySelector('#upgrade-close').addEventListener('click', () => overlay.remove());
        overlay.querySelectorAll('.upgrade-btn:not(.disabled)').forEach(btn => btn.addEventListener('click', async () => {
            const key = btn.dataset.key;
            const cfg = RANCH_UPGRADES[key];
            const lvl = getUpgradeLevel(ranchState.upgrades, key);
            const cost = getUpgradeCost(cfg, lvl);
            if (fishState.money < cost) { showToast('❌ 资金不足'); return; }
            fishState.money -= cost;
            ranchState.upgrades[key] = (ranchState.upgrades[key] || 0) + 1;
            await saveFishState(); await saveRanchState();
            showToast(`📈 ${RANCH_UPGRADES[key].icon}${RANCH_UPGRADES[key].name} 升级到 Lv.${ranchState.upgrades[key]}`);
            overlay.remove(); showRanchUpgradePanel(); if (currentTab === 'ranch') renderRanchPanel();
        }));
    }

    // ==================== CSS ====================
    const CSS = `
    <style>
        .farm-main-panel {
            position: fixed; background: rgba(14, 20, 12, 0.97); backdrop-filter: blur(16px);
            border: 1px solid rgba(34, 197, 94, 0.3); box-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 24px rgba(34,197,94,0.1);
            z-index: 999999; font-family: 'Inter', 'Microsoft YaHei', sans-serif;
            display: flex; flex-direction: column; border-radius: 14px;
            color: #e4e4e7; font-size: 15px; overflow: hidden;
            max-width: 95vw; max-height: 90vh; -webkit-tap-highlight-color: transparent;
            box-sizing: border-box;
        }
        .farm-main-panel::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
            background: linear-gradient(90deg, #166534, #22c55e, #4ade80, #22c55e, #166534);
            border-radius: 12px 12px 0 0;
        }

        #farm-bubble {
            position: fixed; width: 50px; height: 50px; background: rgba(14, 20, 12, 0.96);
            border: 2px solid #22c55e; border-radius: 50%;
            z-index: 1000000; cursor: pointer; display: flex; align-items: center; justify-content: center;
            font-size: 24px; transition: left 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);
            touch-action: none; -webkit-tap-highlight-color: transparent;
            box-shadow: 0 0 16px rgba(34,197,94,0.35);
        }
        #farm-bubble:hover { box-shadow: 0 0 22px rgba(34,197,94,0.55); }
        #farm-bubble.has-event { border-color: #f97316; animation: farm-event-bubble 1.5s ease-in-out infinite; }
        @keyframes farm-event-bubble {
            0%, 100% { box-shadow: 0 0 15px rgba(249,115,22,0.3); }
            50% { box-shadow: 0 0 25px rgba(249,115,22,0.6); }
        }

        .farm-header {
            padding: 0 14px; height: 46px; background: rgba(34, 197, 94, 0.1);
            display: flex; align-items: center; justify-content: space-between;
            border-bottom: 1px solid rgba(34,197,94,0.25); cursor: move; user-select: none; flex-shrink: 0;
            touch-action: none;
        }
        .farm-header-title {
            color: #4ade80; font-weight: 700; font-size: 17px; letter-spacing: 1px;
            display: flex; align-items: center; gap: 8px; text-shadow: 0 0 8px rgba(34,197,94,0.3);
        }
        .farm-header-title .farm-title-icon { font-size: 20px; }

        .farm-body {
            flex: 1; overflow-y: auto; overflow-x: hidden; padding: 14px; min-height: 0;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            scroll-behavior: smooth;
        }
        .farm-body::-webkit-scrollbar { width: 5px; }
        .farm-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        .farm-body::-webkit-scrollbar-thumb { background: rgba(34,197,94,0.3); border-radius: 3px; }

        .farm-footer {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 14px; background: rgba(34, 197, 94, 0.05);
            border-top: 1px solid rgba(34,197,94,0.15); flex-shrink: 0; position: relative;
            cursor: move; user-select: none; touch-action: none;
        }
        .farm-resizer {
            position: absolute; right: 0; bottom: 0; width: 20px; height: 20px;
            cursor: nwse-resize; opacity: 0.4; touch-action: none;
            background: linear-gradient(135deg, transparent 50%, rgba(34,197,94,0.4) 50%);
            border-bottom-right-radius: 12px;
        }

        .farm-btn {
            padding: 5px 13px; border-radius: 6px; cursor: pointer;
            border: 1px solid rgba(34,197,94,0.35); background: rgba(34,197,94,0.1);
            color: #4ade80; font-size: 13px; font-weight: 600; transition: all 0.2s;
        }
        .farm-btn:hover { background: rgba(34,197,94,0.2); border-color: rgba(34,197,94,0.5); }
        .farm-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .farm-btn.danger { border-color: rgba(239,68,68,0.3); background: rgba(239,68,68,0.08); color: #f87171; }
        .farm-btn.danger:hover { background: rgba(239,68,68,0.2); }
        .farm-btn.warn { border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.08); color: #fb923c; }
        .farm-btn.warn:hover { background: rgba(249,115,22,0.2); }

        /* ===== 庇护所选择 ===== */
        .farm-shelter-bar {
            display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
            padding: 8px 12px; background: rgba(0,0,0,0.25); border-radius: 8px;
            border: 1px solid rgba(34,197,94,0.15);
        }
        .farm-shelter-bar .shelter-label { color: #71717a; font-size: 13px; white-space: nowrap; }
        .farm-shelter-select {
            flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(34,197,94,0.25);
            border-radius: 6px; padding: 6px 8px; color: #4ade80; font-size: 14px;
            font-family: inherit; outline: none; cursor: pointer;
        }
        .farm-shelter-select:focus { border-color: rgba(34,197,94,0.5); }
        .farm-shelter-select option { background: #18181f; color: #d4d4d8; }

        .farm-no-shelter {
            text-align: center; padding: 40px 20px; color: #71717a;
        }
        .farm-no-shelter .no-shelter-icon { font-size: 48px; opacity: 0.3; margin-bottom: 12px; }
        .farm-no-shelter .no-shelter-text { font-size: 15px; line-height: 1.8; }

        /* ===== 事件警报条 ===== */
        .farm-event-bar {
            display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
            padding: 10px 12px; background: rgba(249,115,22,0.1); border-radius: 8px;
            border: 1px solid rgba(249,115,22,0.3); animation: farm-event-flash 3s ease-in-out infinite;
        }
        @keyframes farm-event-flash {
            0%, 100% { border-color: rgba(249,115,22,0.3); }
            50% { border-color: rgba(249,115,22,0.6); }
        }
        .farm-event-bar .event-icon { font-size: 20px; }
        .farm-event-bar .event-info { flex: 1; }
        .farm-event-bar .event-title { font-size: 14px; font-weight: 600; color: #fb923c; }
        .farm-event-bar .event-desc { font-size: 12px; color: #a1a1aa; margin-top: 2px; }

        /* ===== 道具工具栏 ===== */
        .farm-item-bar {
            display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap;
            padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 8px;
            border: 1px solid rgba(34,197,94,0.12);
        }
        .farm-item-bar-title { width: 100%; font-size: 12px; color: #71717a; margin-bottom: 4px; letter-spacing: 1px; }
        .farm-item {
            display: flex; align-items: center; gap: 5px; padding: 6px 10px;
            background: rgba(34,197,94,0.06); border: 1.5px solid rgba(34,197,94,0.2);
            border-radius: 8px; cursor: grab; transition: all 0.2s; user-select: none;
            position: relative;
        }
        .farm-item:hover { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.4); }
        .farm-item:active { cursor: grabbing; }
        .farm-item.selected {
            border-color: #4ade80; background: rgba(34,197,94,0.2);
            box-shadow: 0 0 12px rgba(34,197,94,0.3);
        }
        .farm-item.empty { opacity: 0.35; cursor: not-allowed; }
        .farm-item-icon { font-size: 20px; }
        .farm-item-name { font-size: 12px; color: #a1a1aa; }
        .farm-item-count {
            font-size: 11px; color: #4ade80; font-weight: 700; font-family: 'Consolas', monospace;
            background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 4px; min-width: 18px; text-align: center;
        }
        .farm-item-tip {
            display: none; position: absolute; bottom: 110%; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.9); color: #d4d4d8; font-size: 11px; padding: 4px 8px;
            border-radius: 4px; white-space: nowrap; pointer-events: none; z-index: 10;
        }
        .farm-item:hover .farm-item-tip { display: block; }

        /* ===== 农田网格 ===== */
        .farm-grid {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px;
        }
        .farm-plot {
            border-radius: 10px; cursor: pointer; position: relative;
            display: flex; flex-direction: column; align-items: center;
            padding: 8px 6px 10px;
            transition: all 0.25s; overflow: hidden; border: 1.5px solid rgba(34,197,94,0.18);
            background: linear-gradient(160deg, rgba(34,197,94,0.05), rgba(0,0,0,0.3));
            min-height: 110px;
        }
        .farm-plot:hover {
            border-color: rgba(34,197,94,0.45);
            box-shadow: 0 0 14px rgba(34,197,94,0.12);
            transform: translateY(-2px);
        }
        .farm-plot.empty {
            border-style: dashed; background: rgba(0,0,0,0.15);
        }
        .farm-plot.empty:hover { background: rgba(34,197,94,0.06); }
        .farm-plot.growing { border-color: rgba(34,197,94,0.25); }
        .farm-plot.mature {
            border-color: rgba(250,204,21,0.35);
            background: linear-gradient(160deg, rgba(250,204,21,0.03), rgba(0,0,0,0.2));
        }
        .farm-plot.mature .plot-name { color: #fbbf24; }
        .farm-plot.mature .plot-stage { color: #fbbf24; opacity: 1; }
        .farm-plot.ready {
            border-color: rgba(250,204,21,0.5);
            background: linear-gradient(160deg, rgba(250,204,21,0.06), rgba(0,0,0,0.2));
            animation: farm-ready-pulse 2s ease-in-out infinite;
        }
        .farm-plot.ready .plot-name { color: #facc15; font-weight: 700; }
        .farm-plot.ready .plot-stage { color: #facc15; font-weight: 700; opacity: 1; }
        @keyframes farm-ready-pulse {
            0%, 100% { box-shadow: 0 0 8px rgba(250,204,21,0.1); }
            50% { box-shadow: 0 0 16px rgba(250,204,21,0.25); }
        }
        .farm-plot.has-event {
            border-color: rgba(249,115,22,0.6);
            animation: farm-plot-event 2s ease-in-out infinite;
        }
        @keyframes farm-plot-event {
            0%, 100% { box-shadow: 0 0 8px rgba(249,115,22,0.15); }
            50% { box-shadow: 0 0 16px rgba(249,115,22,0.4); }
        }
        .farm-plot.has-event.ready {
            border-color: rgba(249,115,22,0.6);
            animation: farm-plot-event 2s ease-in-out infinite;
        }
        /* 拖拽悬停高亮 */
        .farm-plot.drag-over {
            border-color: #4ade80 !important;
            box-shadow: 0 0 20px rgba(34,197,94,0.4) !important;
        }

        .plot-icon { font-size: 28px; line-height: 1; margin-bottom: 2px; }
        .plot-name { font-size: 12px; color: #a1a1aa; letter-spacing: 0.3px; font-weight: 600; }
        .plot-stage { font-size: 11px; color: #4ade80; opacity: 0.9; margin-top: 1px; }
        .plot-progress {
            width: 100%; height: 4px; margin-top: 3px;
            background: rgba(0,0,0,0.3); border-radius: 2px; overflow: hidden;
        }
        .plot-progress-fill {
            height: 100%; background: linear-gradient(90deg, #166534, #22c55e);
            transition: width 0.8s ease; border-radius: 2px;
        }
        .farm-plot.ready .plot-progress-fill { background: linear-gradient(90deg, #a16207, #facc15); }
        .farm-plot.has-event .plot-progress-fill { background: linear-gradient(90deg, #9a3412, #f97316); }

        .plot-event-badge {
            position: absolute; top: 3px; right: 3px; font-size: 14px;
            background: rgba(0,0,0,0.6); border-radius: 50%; width: 22px; height: 22px;
            display: flex; align-items: center; justify-content: center;
            animation: farm-badge-bounce 1s ease-in-out infinite;
        }
        @keyframes farm-badge-bounce {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.2); }
        }

        .plot-empty-icon { font-size: 28px; opacity: 0.25; }
        .plot-empty-text { font-size: 11px; color: #52525b; margin-top: 3px; }

        /* ===== 作物选择浮层 ===== */
        .crop-picker-overlay {
            position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1000001;
            display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px);
            overflow-y: auto;
        }
        .crop-picker-overlay.mobile-inside {
            position: absolute;
            border-radius: 12px;
        }
        .crop-picker {
            background: rgba(18, 22, 16, 0.98); border: 1px solid rgba(34,197,94,0.35);
            border-radius: 12px; padding: 10px; z-index: 1000002;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5); backdrop-filter: blur(10px);
            width: min(340px, 90vw); max-height: 70vh; display: flex; flex-direction: column;
            margin: auto 10px;
        }
        .crop-picker-title {
            font-size: 13px; color: #71717a; padding: 4px 6px 8px;
            border-bottom: 1px solid rgba(34,197,94,0.12); margin-bottom: 4px; letter-spacing: 1px; flex-shrink: 0;
            display: flex; align-items: center; justify-content: space-between; gap: 8px;
        }
        .crop-picker-list {
            overflow-y: auto; flex: 1; min-height: 0;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            scroll-behavior: smooth;
            padding-bottom: 8px;
        }
        .crop-picker-list::-webkit-scrollbar { width: 4px; }
        .crop-picker-list::-webkit-scrollbar-thumb { background: rgba(34,197,94,0.3); border-radius: 2px; }
        .crop-option {
            display: flex; align-items: center; gap: 10px; padding: 7px 6px;
            border-radius: 6px; cursor: pointer; transition: background 0.15s;
        }
        .crop-option:hover { background: rgba(34,197,94,0.12); }
        .crop-option-icon { font-size: 20px; }
        .crop-option-info { flex: 1; min-width: 0; }
        .crop-option-name { font-size: 14px; color: #d4d4d8; font-weight: 600; }
        .crop-option-meta { font-size: 11px; color: #71717a; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .crop-option-time { font-size: 12px; color: #4ade80; opacity: 0.7; white-space: nowrap; }

        /* ===== 作物属性条 ===== */
        .plot-attrs {
            display: flex; gap: 4px;
            width: 100%; margin: 5px 0 2px; padding: 0 2px;
        }
        .plot-attr-row {
            flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .plot-attr-icon {
            font-size: 11px; line-height: 1;
        }
        .plot-attr-bar {
            width: 100%; height: 6px; border-radius: 3px; background: rgba(255,255,255,0.08); overflow: hidden;
        }
        .plot-attr-fill {
            height: 100%; border-radius: 3px; transition: width 0.5s;
        }
        .plot-attr-fill.water { background: linear-gradient(90deg, #1d4ed8, #3b82f6); }
        .plot-attr-fill.fert { background: linear-gradient(90deg, #7c3aed, #a855f7); }
        .plot-attr-fill.health { background: linear-gradient(90deg, #15803d, #22c55e); }
        .plot-attr-fill.water.low { background: linear-gradient(90deg, #991b1b, #ef4444); }
        .plot-attr-fill.fert.low { background: linear-gradient(90deg, #991b1b, #ef4444); }
        .plot-attr-fill.health.low { background: linear-gradient(90deg, #991b1b, #ef4444); }
        .plot-attr-val {
            font-size: 11px; color: #d4d4d8; font-family: 'Consolas', monospace; font-weight: 600; line-height: 1;
        }
        .plot-attr-val.low { color: #ef4444; }

        /* ===== 作物详情浮层 ===== */
        .crop-detail-popup {
            position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000002;
            display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);
            touch-action: auto; -webkit-tap-highlight-color: transparent;
        }
        .crop-detail-popup.mobile-inside { position: absolute; border-radius: 12px; }
        .crop-detail-card {
            background: rgba(18, 22, 16, 0.98); border: 1px solid rgba(34,197,94,0.3);
            border-radius: 14px; padding: 20px; min-width: 280px; max-width: 340px;
            box-shadow: 0 0 24px rgba(34,197,94,0.1);
        }
        .crop-detail-header {
            display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
            padding-bottom: 12px; border-bottom: 1px solid rgba(34,197,94,0.12);
        }
        .crop-detail-icon { font-size: 36px; }
        .crop-detail-name { font-size: 18px; font-weight: 700; color: #4ade80; }
        .crop-detail-stage { font-size: 13px; color: #a1a1aa; margin-top: 2px; }
        .crop-detail-attrs { display: flex; flex-direction: column; gap: 8px; }
        .crop-detail-attr {
            display: flex; align-items: center; gap: 8px;
        }
        .crop-detail-attr-icon { font-size: 14px; width: 20px; text-align: center; }
        .crop-detail-attr-bar {
            flex: 1; height: 8px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden;
        }
        .crop-detail-attr-fill {
            height: 100%; border-radius: 4px; transition: width 0.5s;
        }
        .crop-detail-attr-fill.water { background: linear-gradient(90deg, #1d4ed8, #3b82f6); }
        .crop-detail-attr-fill.fert { background: linear-gradient(90deg, #7c3aed, #a855f7); }
        .crop-detail-attr-fill.health { background: linear-gradient(90deg, #15803d, #22c55e); }
        .crop-detail-attr-fill.low { background: linear-gradient(90deg, #991b1b, #ef4444) !important; }
        .crop-detail-attr-val {
            font-size: 12px; color: #a1a1aa; font-family: 'Consolas', monospace; min-width: 30px; text-align: right;
        }
        .crop-detail-info {
            margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(34,197,94,0.08);
            font-size: 13px; color: #71717a; line-height: 1.8;
        }
        .crop-detail-close {
            margin-top: 14px; display: flex; justify-content: center;
        }

        /* ===== 收获浮层 ===== */
        .harvest-popup {
            position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000002;
            display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px);
        }
        .harvest-popup.mobile-inside { position: absolute; border-radius: 12px; }
        .harvest-card {
            background: rgba(18, 22, 16, 0.98); border: 1px solid rgba(250,204,21,0.35);
            border-radius: 14px; padding: 24px; min-width: 280px; text-align: center;
            box-shadow: 0 0 30px rgba(250,204,21,0.15);
        }
        .harvest-icon { font-size: 48px; margin-bottom: 8px; }
        .harvest-title { font-size: 18px; font-weight: 700; color: #facc15; margin-bottom: 4px; }
        .harvest-desc { font-size: 14px; color: #71717a; margin-bottom: 16px; }
        .harvest-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
        .harvest-btn {
            padding: 8px 20px; border-radius: 8px; cursor: pointer; font-size: 14px;
            font-weight: 600; border: none; transition: all 0.2s;
        }
        .harvest-btn.store {
            background: linear-gradient(135deg, #166534, #22c55e); color: #fff;
        }
        .harvest-btn.store:hover { box-shadow: 0 0 12px rgba(34,197,94,0.4); }
        .harvest-btn.cancel {
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #71717a;
        }
        .harvest-btn.resolve {
            background: linear-gradient(135deg, #9a3412, #f97316); color: #fff;
        }
        .harvest-btn.resolve:hover { box-shadow: 0 0 12px rgba(249,115,22,0.4); }

        .harvest-yield-penalty { font-size: 13px; color: #f87171; margin-top: 6px; }
        .harvest-item-hint { font-size: 13px; color: #a1a1aa; margin-top: 6px; }

        /* ===== 日志 ===== */
        .farm-log {
            margin-top: 8px; max-height: 120px; overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px 10px;
            border: 1px solid rgba(34,197,94,0.08);
        }
        .farm-log-title { font-size: 12px; color: #71717a; letter-spacing: 1px; margin-bottom: 6px; }
        .farm-log-entry { font-size: 13px; color: #52525b; padding: 2px 0; display: flex; gap: 6px; }
        .farm-log-entry .log-time { color: #3f6212; font-family: 'Consolas', monospace; font-size: 11px; white-space: nowrap; }
        .farm-log-entry .log-text { color: #a1a1aa; }
        .farm-log-entry .log-text.stolen { color: #a855f7; }

        /* ===== 统计栏 ===== */
        .farm-stats { display: flex; gap: 10px; margin-bottom: 12px; }
        .farm-stat {
            flex: 1; text-align: center; padding: 7px 8px;
            background: rgba(0,0,0,0.2); border-radius: 6px;
            border: 1px solid rgba(34,197,94,0.08);
        }
        .farm-stat-val { font-size: 22px; font-weight: 700; color: #4ade80; font-family: 'Consolas', monospace; text-shadow: 0 0 6px rgba(34,197,94,0.25); }
        .farm-stat-label { font-size: 11px; color: #52525b; letter-spacing: 0.5px; margin-top: 2px; }

        /* ===== Toast ===== */
        .farm-toast {
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(18, 22, 16, 0.95); border: 1px solid rgba(34,197,94,0.3);
            border-radius: 8px; padding: 10px 20px; color: #4ade80;
            font-size: 15px; font-weight: 600; z-index: 1000003;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4); backdrop-filter: blur(8px);
            animation: farm-toast-in 0.3s ease, farm-toast-out 0.3s ease 2s forwards;
        }
        .farm-toast.event-toast { border-color: rgba(249,115,22,0.4); color: #fb923c; }
        @keyframes farm-toast-in { from { opacity: 0; transform: translateX(-50%) translateY(-10px); } }
        @keyframes farm-toast-out { to { opacity: 0; transform: translateX(-50%) translateY(-10px); } }

        /* ===== 移动端适配 ===== */
        @media (max-width: 768px) {
            .farm-main-panel {
                width: clamp(300px, 92vw, 420px) !important;
                height: clamp(360px, 72vh, 600px) !important;
                max-width: 95vw !important; max-height: 88vh !important;
                font-size: 14px; resize: none !important;
            }
            .farm-grid { grid-template-columns: repeat(3, 1fr); gap: 6px; }
            .farm-plot { min-height: 90px; padding: 6px 4px 8px; }
            .farm-header { height: 42px; padding: 0 10px; cursor: default; }
            .farm-header-title { font-size: 15px; }
            .farm-body { padding: 10px; }
            .plot-icon { font-size: 26px; }
            .plot-name { font-size: 11px; }
            .plot-stage { font-size: 10px; }
            .farm-btn { padding: 5px 10px; font-size: 12px; }
            #farm-bubble { width: 46px; height: 46px; font-size: 22px; }
            .harvest-card { min-width: 240px; padding: 18px; }
            .farm-stats { gap: 6px; }
            .farm-stat-val { font-size: 18px; }
            .farm-stat-label { font-size: 10px; }
            .farm-item { padding: 5px 8px; }
            .farm-item-icon { font-size: 18px; }
            .farm-item-name { font-size: 11px; }
            .farm-item-count { font-size: 10px; }
            .farm-shelter-select { font-size: 13px; }
            .farm-event-bar .event-title { font-size: 13px; }
            .farm-event-bar .event-desc { font-size: 11px; }
            .crop-picker-overlay { align-items: flex-start; padding-top: 10px; padding-bottom: 10px; }
            .crop-picker { width: min(300px, 88vw); max-height: calc(100vh - 40px); margin: 0 10px; }
            .crop-picker-list { -webkit-overflow-scrolling: touch; }
        }
        @media (max-width: 360px) {
            .farm-main-panel {
                width: 94vw !important; height: clamp(320px, 75vh, 520px) !important;
                font-size: 13px;
            }
            .farm-grid { grid-template-columns: repeat(2, 1fr); gap: 5px; }
            .farm-plot { min-height: 78px; padding: 5px 3px 6px; }
            .plot-icon { font-size: 22px; }
            .plot-name { font-size: 10px; }
            .plot-attr-val { font-size: 10px; }
            .crop-picker-overlay { align-items: flex-start; padding-top: 8px; padding-bottom: 8px; }
            .crop-picker { width: 92vw; max-height: calc(100vh - 30px); margin: 0 8px; }
            .crop-picker-list { -webkit-overflow-scrolling: touch; }
        }

        /* ===== 手动亮色模式 ===== */
        .farm-main-panel.farm-force-light {
            background: rgba(245, 248, 242, 0.97); border-color: rgba(22, 101, 52, 0.2);
            box-shadow: 0 10px 40px rgba(0,0,0,0.12), 0 0 20px rgba(34,197,94,0.06); color: #1a2e12;
        }
        .farm-main-panel.farm-force-light::before {
            background: linear-gradient(90deg, #166534, #4ade80, #86efac, #4ade80, #166534);
        }
        .farm-main-panel.farm-force-light .farm-header {
            background: rgba(34, 197, 94, 0.08); border-bottom-color: rgba(22, 101, 52, 0.15);
        }
        .farm-main-panel.farm-force-light .farm-header-title { color: #15803d; }
        .farm-main-panel.farm-force-light .farm-body::-webkit-scrollbar-track { background: rgba(0,0,0,0.06); }
        .farm-main-panel.farm-force-light .farm-body::-webkit-scrollbar-thumb { background: rgba(34,197,94,0.25); }
        .farm-main-panel.farm-force-light .farm-footer {
            background: rgba(34, 197, 94, 0.04); border-top-color: rgba(22, 101, 52, 0.12);
        }
        .farm-main-panel.farm-force-light .farm-btn {
            border-color: rgba(22,101,52,0.25); background: rgba(34,197,94,0.06); color: #15803d;
        }
        .farm-main-panel.farm-force-light .farm-btn:hover { background: rgba(34,197,94,0.12); border-color: rgba(22,101,52,0.4); }
        .farm-main-panel.farm-force-light .farm-btn.danger { border-color: rgba(185,28,28,0.25); background: rgba(239,68,68,0.06); color: #b91c1c; }
        .farm-main-panel.farm-force-light .farm-btn.warn { border-color: rgba(154,52,18,0.25); background: rgba(249,115,22,0.06); color: #9a3412; }
        .farm-main-panel.farm-force-light .farm-shelter-bar {
            background: rgba(0,0,0,0.04); border-color: rgba(22,101,52,0.12);
        }
        .farm-main-panel.farm-force-light .farm-shelter-bar .shelter-label { color: #6b7280; }
        .farm-main-panel.farm-force-light .farm-shelter-select {
            background: rgba(255,255,255,0.8); border-color: rgba(22,101,52,0.2); color: #15803d;
        }
        .farm-main-panel.farm-force-light .farm-shelter-select option { background: #fff; color: #1a2e12; }
        .farm-main-panel.farm-force-light .farm-no-shelter { color: #6b7280; }
        .farm-main-panel.farm-force-light .farm-plot {
            border-color: rgba(22,101,52,0.12);
            background: linear-gradient(160deg, rgba(34,197,94,0.03), rgba(255,255,255,0.5));
        }
        .farm-main-panel.farm-force-light .farm-plot:hover { border-color: rgba(34,197,94,0.35); }
        .farm-main-panel.farm-force-light .farm-plot.empty { background: rgba(0,0,0,0.03); }
        .farm-main-panel.farm-force-light .farm-plot.ready {
            border-color: rgba(202,138,4,0.4);
            background: linear-gradient(160deg, rgba(250,204,21,0.05), rgba(255,255,255,0.5));
        }
        .farm-main-panel.farm-force-light .farm-plot.mature .plot-name,
        .farm-main-panel.farm-force-light .farm-plot.ready .plot-name { color: #a16207; }
        .farm-main-panel.farm-force-light .farm-plot.mature .plot-stage,
        .farm-main-panel.farm-force-light .farm-plot.ready .plot-stage { color: #a16207; font-weight: 700; }
        .farm-main-panel.farm-force-light .farm-plot.has-event { border-color: rgba(154,52,18,0.5); }
        .farm-main-panel.farm-force-light .farm-plot.drag-over {
            border-color: #15803d !important; background: rgba(34,197,94,0.1) !important;
        }
        .farm-main-panel.farm-force-light .plot-name { color: #6b7280; }
        .farm-main-panel.farm-force-light .plot-stage { color: #15803d; }
        .farm-main-panel.farm-force-light .plot-empty-text { color: #9ca3af; }
        .farm-main-panel.farm-force-light .farm-stat { background: rgba(0,0,0,0.04); border-color: rgba(22,101,52,0.08); }
        .farm-main-panel.farm-force-light .farm-stat-val { color: #15803d; }
        .farm-main-panel.farm-force-light .farm-stat-label { color: #6b7280; }
        .farm-main-panel.farm-force-light .farm-log { background: rgba(0,0,0,0.04); border-color: rgba(22,101,52,0.08); }
        .farm-main-panel.farm-force-light .farm-log-title { color: #6b7280; }
        .farm-main-panel.farm-force-light .farm-log-entry .log-time { color: #15803d; }
        .farm-main-panel.farm-force-light .farm-log-entry .log-text { color: #374151; }
        .farm-main-panel.farm-force-light .farm-event-bar { background: rgba(249,115,22,0.06); border-color: rgba(154,52,18,0.25); }
        .farm-main-panel.farm-force-light .farm-event-bar .event-title { color: #9a3412; }
        .farm-main-panel.farm-force-light .farm-event-bar .event-desc { color: #6b7280; }
        .farm-main-panel.farm-force-light .farm-item-bar { background: rgba(0,0,0,0.04); border-color: rgba(22,101,52,0.1); }
        .farm-main-panel.farm-force-light .farm-item { background: rgba(34,197,94,0.04); border-color: rgba(22,101,52,0.15); }
        .farm-main-panel.farm-force-light .farm-item:hover { background: rgba(34,197,94,0.1); }
        .farm-main-panel.farm-force-light .farm-item.selected { background: rgba(34,197,94,0.15); border-color: #15803d; }
        .farm-main-panel.farm-force-light .farm-item-name { color: #6b7280; }
        .farm-main-panel.farm-force-light .farm-item-count { color: #15803d; background: rgba(0,0,0,0.06); }
        .farm-main-panel.farm-force-light .farm-resizer {
            background: linear-gradient(135deg, transparent 50%, rgba(34,197,94,0.3) 50%);
        }

        .farm-toast-light {
            background: rgba(245, 248, 242, 0.96) !important;
            border-color: rgba(22,101,52,0.25) !important;
            color: #15803d !important; box-shadow: 0 4px 16px rgba(0,0,0,0.12) !important;
        }
        .farm-toast-light.event-toast { border-color: rgba(154,52,18,0.25) !important; color: #9a3412 !important; }

        .farm-main-panel.farm-force-light .plot-attr-bar { background: rgba(0,0,0,0.08); }
        .farm-main-panel.farm-force-light .plot-attr-val { color: #374151; }
        .farm-main-panel.farm-force-light .plot-attr-val.low { color: #dc2626; }
        .farm-main-panel.farm-force-light .crop-detail-attr-val { color: #374151; }

        .crop-detail-popup.farm-detail-light .crop-detail-card {
            background: rgba(245, 248, 242, 0.98); border-color: rgba(22,101,52,0.2);
        }
        .crop-detail-popup.farm-detail-light .crop-detail-name { color: #15803d; }
        .crop-detail-popup.farm-detail-light .crop-detail-stage { color: #6b7280; }
        .crop-detail-popup.farm-detail-light .crop-detail-attr-bar { background: rgba(0,0,0,0.08); }
        .crop-detail-popup.farm-detail-light .crop-detail-attr-val { color: #374151; }
        .crop-detail-popup.farm-detail-light .crop-detail-info { color: #6b7280; }
        .crop-detail-popup.farm-detail-light .harvest-btn.cancel {
            background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: #6b7280;
        }

        .harvest-popup.farm-harvest-light .harvest-card {
            background: rgba(245, 248, 242, 0.98); border-color: rgba(202,138,4,0.3);
        }
        .harvest-popup.farm-harvest-light .harvest-title { color: #a16207; }
        .harvest-popup.farm-harvest-light .harvest-desc { color: #6b7280; }
        .harvest-popup.farm-harvest-light .harvest-btn.store { background: linear-gradient(135deg, #166534, #22c55e); color: #fff; }
        .harvest-popup.farm-harvest-light .harvest-btn.cancel { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); color: #6b7280; }
        .harvest-popup.farm-harvest-light .harvest-btn.resolve { background: linear-gradient(135deg, #9a3412, #f97316); color: #fff; }

        .farm-picker-light {
            background: rgba(245, 248, 242, 0.98) !important;
            border-color: rgba(22,101,52,0.2) !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
        }
        .farm-picker-light .crop-picker-title { color: #6b7280; }
        .farm-picker-light .crop-option-name { color: #1a2e12; }
        .farm-picker-light .crop-option-meta { color: #6b7280; }
        .farm-picker-light .crop-option-time { color: #15803d; }

        /* ===== Tab 切换栏 ===== */
        .farm-tabs {
            display: flex; gap: 0; flex-shrink: 0;
            border-bottom: 1px solid rgba(34,197,94,0.2);
            background: rgba(0,0,0,0.15);
        }
        .farm-tab {
            flex: 1; text-align: center; padding: 8px 0;
            font-size: 13px; font-weight: 600; color: #71717a; cursor: pointer;
            transition: all 0.2s; border-bottom: 2px solid transparent;
            user-select: none; -webkit-tap-highlight-color: transparent;
        }
        .farm-tab:hover { color: #a1a1aa; background: rgba(34,197,94,0.04); }
        .farm-tab.active { color: #4ade80; border-bottom-color: #4ade80; background: rgba(34,197,94,0.08); }
        .farm-main-panel.farm-force-light .farm-tabs { border-bottom-color: rgba(22,101,52,0.15); background: rgba(0,0,0,0.04); }
        .farm-main-panel.farm-force-light .farm-tab { color: #6b7280; }
        .farm-main-panel.farm-force-light .farm-tab.active { color: #15803d; border-bottom-color: #15803d; background: rgba(34,197,94,0.06); }

        /* ===== 钓鱼页面 ===== */
        .fish-body {
            flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px; min-height: 0;
            display: none; flex-direction: column; gap: 10px;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            scroll-behavior: smooth;
        }
        .fish-header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 8px;
            border: 1px solid rgba(34,197,94,0.12);
        }
        .fish-money { font-size: 14px; font-weight: 700; color: #facc15; font-family: 'Consolas', monospace; }
        .fish-header-right { display: flex; gap: 8px; }
        .fish-gear {
            font-size: 11px; color: #a1a1aa; background: rgba(0,0,0,0.25);
            padding: 3px 8px; border-radius: 12px; border: 1px solid rgba(34,197,94,0.1);
        }
        .fish-action-bar {
            display: flex; gap: 6px;
        }
        .fish-btn {
            padding: 7px 12px; border-radius: 8px; cursor: pointer;
            border: 1px solid rgba(34,197,94,0.35); background: rgba(34,197,94,0.08);
            color: #4ade80; font-size: 12px; font-weight: 600; transition: all 0.2s;
            user-select: none; -webkit-tap-highlight-color: transparent;
            flex: 1; text-align: center;
        }
        .fish-btn:hover { background: rgba(34,197,94,0.18); }
        .fish-btn:active { transform: scale(0.96); }
        .fish-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .fish-btn.primary { background: rgba(34,197,94,0.2); border-color: rgba(34,197,94,0.5); }
        .fish-btn.warn { border-color: rgba(249,115,22,0.3); background: rgba(249,115,22,0.08); color: #fb923c; }

        .fish-game-wrap {
            display: flex; flex-direction: column; align-items: center; gap: 10px;
            padding: 12px; background: rgba(0,0,0,0.15); border-radius: 12px;
            border: 1px solid rgba(34,197,94,0.15);
        }
        /* PC端上钩时横向布局：左竖条 + 右操作区，充分利用宽度避免截断 */
        .fish-game-wrap.pc-bitten {
            flex-direction: row; align-items: stretch; gap: 16px;
        }
        .fish-game-wrap.pc-bitten .fish-bar-container {
            height: 320px; flex-shrink: 0;
        }
        .fish-game-wrap.pc-bitten .fish-right-panel {
            flex: 1; display: flex; flex-direction: column; gap: 10px; justify-content: center;
        }
        .fish-right-panel { display: none; }
        .fish-pond-name { font-size: 14px; color: #4ade80; font-weight: 600; }
        .fish-wait-indicator {
            position: relative; width: 60px; height: 60px;
            display: flex; align-items: center; justify-content: center;
        }
        .fish-wait-ripple {
            position: absolute; width: 100%; height: 100%;
            border-radius: 50%; border: 2px solid rgba(34,197,94,0.4);
            animation: fish-ripple 1.5s ease-out infinite;
        }
        @keyframes fish-ripple {
            0% { transform: scale(0.4); opacity: 1; }
            100% { transform: scale(1.2); opacity: 0; }
        }
        .fish-bar-container {
            position: relative; width: 52px; height: 260px;
            background: linear-gradient(180deg, rgba(34,197,94,0.08), rgba(0,0,0,0.35));
            border-radius: 26px;
            border: 2px solid rgba(34,197,94,0.25); overflow: hidden;
            box-shadow: inset 0 0 16px rgba(0,0,0,0.3);
        }
        .fish-bar-fill {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: linear-gradient(0deg, rgba(34,197,94,0.2), rgba(59,130,246,0.12));
            height: 0; z-index: 0; will-change: height;
        }
        .fish-target {
            position: absolute; left: 3px; right: 3px;
            background: rgba(250,204,21,0.45); border-radius: 10px;
            border: 2px solid rgba(250,204,21,0.75);
            min-height: 20px; top: 40%; height: 20%;
            z-index: 1; will-change: top, height;
        }
        .fish-target::after {
            content: '🐟'; position: absolute; left: 50%; top: 50%;
            transform: translate(-50%, -50%); font-size: 13px;
        }
        .fish-bobber {
            position: absolute; left: 5px; right: 5px;
            background: linear-gradient(180deg, rgba(74,222,128,0.95), rgba(34,197,94,0.85));
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.5);
            box-shadow: 0 0 10px rgba(34,197,94,0.5), inset 0 1px 2px rgba(255,255,255,0.3);
            min-height: 14px; top: 43%; height: 14%;
            z-index: 2; will-change: top, height;
        }
        .fish-progress-outer {
            width: 100%; height: 10px; background: rgba(0,0,0,0.3);
            border-radius: 5px; overflow: hidden; border: 1px solid rgba(34,197,94,0.2);
        }
        .fish-progress-inner {
            height: 100%; width: 0%;
            background: linear-gradient(90deg, #166534, #22c55e, #4ade80);
            transition: width 0.08s linear; border-radius: 4px;
        }
        .fish-progress-inner.fail { background: linear-gradient(90deg, #991b1b, #ef4444); }
        .fish-hint { font-size: 11px; color: #71717a; text-align: center; }
        .fish-controls { display: flex; gap: 8px; width: 100%; }
        .fish-controls .fish-btn { flex: 1; }

        /* 库存 */
        .fish-inv-box {
            background: rgba(0,0,0,0.15); border-radius: 10px;
            border: 1px solid rgba(34,197,94,0.12); padding: 10px;
        }
        .fish-inv-title { font-size: 12px; color: #71717a; margin-bottom: 8px; letter-spacing: 0.5px; }
        .fish-inv-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .fish-inv-item {
            display: flex; flex-direction: column; align-items: center;
            padding: 6px 4px; background: rgba(0,0,0,0.2);
            border-radius: 8px; border: 1px solid rgba(34,197,94,0.1);
            cursor: pointer; transition: all 0.2s;
        }
        .fish-inv-item:hover { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); transform: translateY(-1px); }
        .fish-inv-icon { font-size: 20px; }
        .fish-inv-name { font-size: 10px; color: #a1a1aa; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .fish-inv-price { font-size: 10px; color: #facc15; font-weight: 600; }

        /* 选择弹窗 */
        .fish-choice-popup {
            position: fixed; inset: 0; background: rgba(0,0,0,0.6);
            z-index: 1000004; display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        }
        .fish-choice-popup.mobile-inside { position: absolute; border-radius: 12px; }
        .fish-choice-card {
            background: rgba(14,20,12,0.97); border: 1px solid rgba(34,197,94,0.3);
            border-radius: 14px; padding: 22px; text-align: center;
            box-shadow: 0 12px 48px rgba(0,0,0,0.6);
            max-width: 280px; width: 90%;
        }
        .fish-choice-icon { font-size: 48px; margin-bottom: 8px; animation: fish-pop-in 0.4s ease; }
        @keyframes fish-pop-in { 0% { transform: scale(0.3); opacity: 0; } 80% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        .fish-choice-name { font-size: 16px; font-weight: 700; color: #4ade80; }
        .fish-choice-price { font-size: 18px; font-weight: 700; color: #facc15; margin: 10px 0; }
        .fish-choice-actions { display: flex; gap: 8px; margin-top: 14px; }
        .fish-choice-btn {
            flex: 1; padding: 10px 0; border-radius: 8px; cursor: pointer;
            font-size: 13px; font-weight: 600; transition: all 0.2s; border: none;
        }
        .fish-choice-btn.sell { background: linear-gradient(135deg, #166534, #22c55e); color: #fff; }
        .fish-choice-btn.store { background: rgba(0,0,0,0.3); color: #a1a1aa; border: 1px solid rgba(255,255,255,0.1); }
        .fish-choice-btn:hover { filter: brightness(1.15); }

        /* 商店弹窗 */
        .fish-shop-popup {
            position: fixed; inset: 0; background: rgba(0,0,0,0.6);
            z-index: 1000004; display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        }
        .fish-shop-popup.mobile-inside { position: absolute; border-radius: 12px; }
        .fish-shop-popup.mobile-inside .fish-shop-card { max-height: calc(100% - 20px); }
        .fish-shop-card {
            background: rgba(14,20,12,0.97); border: 1px solid rgba(34,197,94,0.3);
            border-radius: 14px; padding: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,0.6);
            max-width: 340px; width: 92%; max-height: 80vh; overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
        }
        .fish-shop-header {
            display: flex; justify-content: space-between; align-items: center;
            font-size: 15px; font-weight: 700; color: #4ade80; margin-bottom: 12px;
        }
        .fish-shop-money { font-size: 14px; color: #facc15; font-family: 'Consolas', monospace; }
        .fish-shop-section { margin-bottom: 14px; }
        .fish-shop-section-title { font-size: 12px; color: #71717a; margin-bottom: 8px; letter-spacing: 1px; }
        .fish-shop-item {
            display: flex; align-items: center; gap: 8px;
            padding: 8px; background: rgba(0,0,0,0.2); border-radius: 8px;
            border: 1px solid rgba(34,197,94,0.08); margin-bottom: 6px;
        }
        .fish-shop-item.owned { border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.06); }
        .fish-shop-item-icon { font-size: 22px; width: 28px; text-align: center; }
        .fish-shop-item-info { flex: 1; }
        .fish-shop-item-name { font-size: 13px; font-weight: 600; color: #d4d4d8; }
        .fish-shop-item-desc { font-size: 11px; color: #71717a; margin-top: 1px; }
        .fish-shop-buy-btn {
            padding: 5px 10px; border-radius: 6px; cursor: pointer;
            border: 1px solid rgba(34,197,94,0.4); background: rgba(34,197,94,0.12);
            color: #4ade80; font-size: 11px; font-weight: 600;
        }
        .fish-shop-buy-btn:hover { background: rgba(34,197,94,0.25); }
        .fish-shop-buy-btn:disabled { opacity: 0.35; cursor: not-allowed; }
        .fish-shop-buy-btn.owned { border-color: rgba(34,197,94,0.2); background: transparent; color: #52525b; }
        .fish-shop-close {
            width: 100%; padding: 8px; border-radius: 8px; cursor: pointer;
            border: 1px solid rgba(255,255,255,0.1); background: rgba(0,0,0,0.2);
            color: #a1a1aa; font-size: 13px; margin-top: 4px;
        }

        /* 背包存入按钮 */
        .fish-inv-store {
            position: absolute; top: 2px; right: 2px;
            width: 20px; height: 20px; border-radius: 50%;
            background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.4);
            color: #4ade80; font-size: 10px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            padding: 0; line-height: 1; opacity: 0.7; transition: all 0.2s;
        }
        .fish-inv-item:hover .fish-inv-store { opacity: 1; background: rgba(34,197,94,0.4); }
        .fish-inv-item { position: relative; }

        /* 钓鱼记录 */
        .fish-record-box {
            background: rgba(0,0,0,0.15); border-radius: 10px;
            border: 1px solid rgba(34,197,94,0.12); padding: 10px;
        }
        .fish-record-title {
            font-size: 12px; color: #71717a; margin-bottom: 8px; letter-spacing: 0.5px;
        }
        .fish-record-stats {
            display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 10px;
        }
        .fish-record-stat {
            text-align: center; padding: 6px 4px;
            background: rgba(0,0,0,0.2); border-radius: 8px;
            border: 1px solid rgba(34,197,94,0.1);
            font-size: 11px; color: #71717a;
        }
        .fish-record-val {
            font-size: 12px; color: #4ade80; font-weight: 600; margin-top: 2px; line-height: 1.4;
        }
        .fish-record-time {
            font-size: 10px; color: #52525b; margin-top: 2px;
        }
        .fish-log-list {
            max-height: 120px; overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            background: rgba(0,0,0,0.2); border-radius: 6px; padding: 6px 8px;
        }
        .fish-log-entry {
            font-size: 12px; color: #a1a1aa; padding: 2px 0; display: flex; gap: 6px;
        }
        .fish-log-time { color: #3f6212; font-family: 'Consolas', monospace; font-size: 10px; white-space: nowrap; }
        .fish-log-text { color: #a1a1aa; }

        /* 存入庇护所弹窗 */
        .fish-store-popup {
            position: fixed; inset: 0; background: rgba(0,0,0,0.6);
            z-index: 1000004; display: flex; align-items: center; justify-content: center;
            backdrop-filter: blur(4px);
        }
        .fish-store-popup.mobile-inside { position: absolute; border-radius: 12px; }
        .fish-store-card {
            background: rgba(14,20,12,0.97); border: 1px solid rgba(34,197,94,0.3);
            border-radius: 14px; padding: 16px;
            box-shadow: 0 12px 48px rgba(0,0,0,0.6);
            max-width: 300px; width: 90%;
        }
        .fish-store-list { display: flex; flex-direction: column; gap: 6px; }
        .fish-store-option {
            display: flex; align-items: center; gap: 8px;
            padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 8px;
            border: 1px solid rgba(34,197,94,0.1); cursor: pointer; transition: all 0.2s;
        }
        .fish-store-option:hover { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.3); }

        @media (max-width: 768px) {
            .fish-bar-container { height: 220px; }
            .fish-body { padding: 10px; }
            .fish-inv-grid { grid-template-columns: repeat(4, 1fr); }
        }
        @media (max-width: 360px) {
            .fish-bar-container { height: 180px; }
            .fish-inv-grid { grid-template-columns: repeat(3, 1fr); }
        }

        /* ===== 钓鱼系统亮色模式 ===== */
        .farm-main-panel.farm-force-light .fish-header { background: rgba(0,0,0,0.06); border-color: rgba(22,101,52,0.15); }
        .farm-main-panel.farm-force-light .fish-money { color: #a16207; }
        .farm-main-panel.farm-force-light .fish-gear { color: #4b5563; background: rgba(0,0,0,0.06); border-color: rgba(22,101,52,0.12); }
        .farm-main-panel.farm-force-light .fish-btn { color: #15803d; background: rgba(34,197,94,0.08); border-color: rgba(22,101,52,0.25); }
        .farm-main-panel.farm-force-light .fish-btn.primary { background: rgba(34,197,94,0.15); border-color: rgba(22,101,52,0.4); }
        .farm-main-panel.farm-force-light .fish-btn.warn { color: #c2410c; background: rgba(249,115,22,0.08); border-color: rgba(194,65,12,0.25); }
        .farm-main-panel.farm-force-light .fish-btn:disabled { opacity: 0.4; }
        .farm-main-panel.farm-force-light .fish-game-wrap { background: rgba(0,0,0,0.04); border-color: rgba(22,101,52,0.15); }
        .farm-main-panel.farm-force-light .fish-pond-name { color: #15803d; }
        .farm-main-panel.farm-force-light .fish-hint { color: #6b7280; }
        .farm-main-panel.farm-force-light .fish-bar-container { background: linear-gradient(180deg, rgba(34,197,94,0.12), rgba(0,0,0,0.15)); border-color: rgba(22,101,52,0.3); box-shadow: inset 0 0 12px rgba(0,0,0,0.12); }
        .farm-main-panel.farm-force-light .fish-target { background: rgba(234,179,8,0.65); border-color: rgba(202,138,4,1); }
        .farm-main-panel.farm-force-light .fish-bobber { background: linear-gradient(180deg, rgba(34,197,94,1), rgba(22,163,74,0.95)); border-color: rgba(22,101,52,0.7); box-shadow: 0 0 10px rgba(34,197,94,0.4), inset 0 1px 2px rgba(255,255,255,0.4); }
        .farm-main-panel.farm-force-light .fish-bar-fill { background: linear-gradient(0deg, rgba(34,197,94,0.55), rgba(59,130,246,0.35)); }
        .farm-main-panel.farm-force-light .fish-progress-outer { background: rgba(0,0,0,0.1); border-color: rgba(22,101,52,0.15); }
        .farm-main-panel.farm-force-light .fish-inv-box { background: rgba(0,0,0,0.04); border-color: rgba(22,101,52,0.12); }
        .farm-main-panel.farm-force-light .fish-inv-title { color: #6b7280; }
        .farm-main-panel.farm-force-light .fish-inv-item { background: rgba(255,255,255,0.7); border-color: rgba(22,101,52,0.15); }
        .farm-main-panel.farm-force-light .fish-inv-item:hover { background: rgba(34,197,94,0.08); border-color: rgba(22,101,52,0.3); }
        .farm-main-panel.farm-force-light .fish-inv-name { color: #374151; }
        .farm-main-panel.farm-force-light .fish-inv-price { color: #a16207; }

        .fish-choice-popup.fish-choice-light .fish-choice-card { background: rgba(245,248,242,0.98); border-color: rgba(22,101,52,0.2); }
        .fish-choice-popup.fish-choice-light .fish-choice-name { color: #15803d; }
        .fish-choice-popup.fish-choice-light .fish-choice-btn.store { background: rgba(0,0,0,0.06); color: #4b5563; border-color: rgba(0,0,0,0.1); }
        .fish-shop-popup.fish-shop-light .fish-shop-card { background: rgba(245,248,242,0.98); border-color: rgba(22,101,52,0.2); }
        .fish-shop-popup.fish-shop-light .fish-shop-header { color: #15803d; }
        .fish-shop-popup.fish-shop-light .fish-shop-section-title { color: #6b7280; }
        .fish-shop-popup.fish-shop-light .fish-shop-item { background: rgba(255,255,255,0.7); border-color: rgba(22,101,52,0.12); }
        .fish-shop-popup.fish-shop-light .fish-shop-item.owned { background: rgba(34,197,94,0.06); border-color: rgba(22,101,52,0.2); }
        .fish-shop-popup.fish-shop-light .fish-shop-item-name { color: #1f2937; }
        .fish-shop-popup.fish-shop-light .fish-shop-item-desc { color: #6b7280; }
        .fish-shop-popup.fish-shop-light .fish-shop-buy-btn { color: #15803d; background: rgba(34,197,94,0.1); border-color: rgba(22,101,52,0.3); }
        .fish-shop-popup.fish-shop-light .fish-shop-buy-btn.owned { color: #9ca3af; background: transparent; border-color: rgba(0,0,0,0.1); }
        .fish-shop-popup.fish-shop-light .fish-shop-close { background: rgba(0,0,0,0.04); color: #4b5563; border-color: rgba(0,0,0,0.1); }

        .farm-main-panel.farm-force-light .fish-inv-store { background: rgba(34,197,94,0.15); border-color: rgba(22,101,52,0.35); color: #15803d; }
        .farm-main-panel.farm-force-light .fish-inv-item:hover .fish-inv-store { background: rgba(34,197,94,0.3); }
        .farm-main-panel.farm-force-light .fish-record-box { background: rgba(0,0,0,0.04); border-color: rgba(22,101,52,0.12); }
        .farm-main-panel.farm-force-light .fish-record-title { color: #6b7280; }
        .farm-main-panel.farm-force-light .fish-record-stat { background: rgba(255,255,255,0.7); border-color: rgba(22,101,52,0.12); color: #6b7280; }
        .farm-main-panel.farm-force-light .fish-record-val { color: #15803d; }
        .farm-main-panel.farm-force-light .fish-record-time { color: #9ca3af; }
        .farm-main-panel.farm-force-light .fish-log-list { background: rgba(0,0,0,0.04); }
        .farm-main-panel.farm-force-light .fish-log-entry { color: #4b5563; }
        .farm-main-panel.farm-force-light .fish-log-time { color: #15803d; }
        .farm-main-panel.farm-force-light .fish-log-text { color: #4b5563; }
        .fish-store-popup.fish-store-light .fish-store-card { background: rgba(245,248,242,0.98); border-color: rgba(22,101,52,0.2); }
        .fish-store-popup.fish-store-light .fish-store-option { background: rgba(255,255,255,0.7); border-color: rgba(22,101,52,0.12); }
        .fish-store-popup.fish-store-light .fish-store-option:hover { background: rgba(34,197,94,0.1); border-color: rgba(22,101,52,0.25); }

        /* ===== 移动端适配优化 ===== */
        @media (max-width: 480px) {
            .fish-bar-container { width: 44px; height: 200px; }
            .fish-btn { padding: 10px 8px; font-size: 13px; min-height: 40px; }
            .fish-action-bar { gap: 8px; }
            .fish-header { flex-wrap: wrap; gap: 6px; }
            .fish-gear { font-size: 10px; padding: 4px 6px; }
            .fish-inv-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }
            .fish-inv-item { padding: 8px 4px; }
            .fish-inv-icon { font-size: 22px; }
            .fish-inv-name { font-size: 11px; }
            .fish-shop-card { max-width: 92vw; padding: 14px; }
            .fish-choice-card { max-width: 90vw; padding: 18px; }
            .fish-game-wrap { padding: 14px 10px; }
            .fish-record-stats { grid-template-columns: repeat(3, 1fr); }
            .fish-record-stat { font-size: 10px; padding: 5px 2px; }
            .fish-record-val { font-size: 11px; }
            .fish-store-card { max-width: 92vw; }
        }
        @media (max-width: 360px) {
            .fish-bar-container { height: 180px; }
            .fish-inv-grid { grid-template-columns: repeat(3, 1fr); }
            .fish-btn { font-size: 12px; padding: 9px 6px; }
            .fish-record-stats { grid-template-columns: 1fr; }
        }
        /* ==================== 牧场样式 ==================== */
        .ranch-shelter-bar{display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgba(0,0,0,0.25);border-radius:8px;border:1px solid rgba(196,149,106,0.15)}
        .ranch-shelter-select{flex:1;background:rgba(0,0,0,0.3);border:1px solid rgba(196,149,106,0.25);border-radius:6px;padding:6px 8px;color:#d4a574;font-size:14px;outline:none;cursor:pointer}
        .ranch-shelter-select option{background:#18181f;color:#d4d4d8}
        .farm-force-light .ranch-shelter-select{color:#8b5e38}
        .farm-force-light .ranch-shelter-select option{background:#fff;color:#3d2b1a}
        .ranch-stats{display:flex;gap:10px;margin-bottom:12px}
        .ranch-stat{flex:1;text-align:center;padding:7px 8px;background:rgba(0,0,0,0.2);border-radius:6px;border:1px solid rgba(196,149,106,0.08)}
        .farm-force-light .ranch-stat-val{color:#8b5e38}
        .ranch-stat-val{font-size:22px;font-weight:700;color:#d4a574;font-family:'Consolas',monospace}
        .ranch-stat-label{font-size:11px;color:#52525b;letter-spacing:0.5px;margin-top:2px}
        .ranch-event-bar{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:10px 12px;background:rgba(249,115,22,0.1);border-radius:8px;border:1px solid rgba(249,115,22,0.3);animation:ranch-event-flash 3s ease-in-out infinite}
        @keyframes ranch-event-flash{0%,100%{border-color:rgba(249,115,22,0.3)}50%{border-color:rgba(249,115,22,0.6)}}
        .ranch-item-bar{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap;padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(196,149,106,0.12)}
        .farm-force-light .ranch-item{background:rgba(139,92,56,0.04);border-color:rgba(139,92,56,0.12)}
        .ranch-item{display:flex;align-items:center;gap:5px;padding:6px 10px;background:rgba(196,149,106,0.06);border:1.5px solid rgba(196,149,106,0.2);border-radius:8px;cursor:grab;transition:all 0.2s;user-select:none;position:relative}
        .ranch-item:hover{background:rgba(196,149,106,0.15)}
        .ranch-item.selected{border-color:#d4a574;background:rgba(196,149,106,0.2);box-shadow:0 0 12px rgba(196,149,106,0.3)}
        .ranch-item.empty{opacity:0.35;cursor:not-allowed}
        .ranch-item-icon{font-size:20px}
        .ranch-item-name{font-size:12px;color:#a1a1aa}
        .farm-force-light .ranch-item-name{color:#6b5e52}
        .ranch-item-count{font-size:11px;color:#d4a574;font-weight:700;font-family:'Consolas',monospace;background:rgba(0,0,0,0.3);padding:1px 5px;border-radius:4px;min-width:18px;text-align:center}
        .farm-force-light .ranch-item-count{color:#8b5e38}
        .ranch-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
        .ranch-pen{border-radius:10px;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;padding:10px 6px;transition:all 0.25s;overflow:hidden;border:1.5px solid rgba(196,149,106,0.18);background:linear-gradient(160deg,rgba(196,149,106,0.05),rgba(0,0,0,0.3));min-height:110px}
        .ranch-pen:hover{border-color:rgba(196,149,106,0.45);box-shadow:0 0 14px rgba(196,149,106,0.12);transform:translateY(-2px)}
        .ranch-pen.empty{border-style:dashed;background:rgba(0,0,0,0.15)}
        .ranch-pen.mature{border-color:rgba(250,204,21,0.35);animation:ranch-mature-pulse 3s ease-in-out infinite}
        @keyframes ranch-mature-pulse{0%,100%{box-shadow:0 0 8px rgba(250,204,21,0.1)}50%{box-shadow:0 0 16px rgba(250,204,21,0.2)}}
        .ranch-pen.has-event{border-color:rgba(249,115,22,0.6);animation:ranch-pen-event 2s ease-in-out infinite}
        @keyframes ranch-pen-event{0%,100%{box-shadow:0 0 8px rgba(249,115,22,0.15)}50%{box-shadow:0 0 16px rgba(249,115,22,0.4)}}
        .pen-icon{font-size:36px;line-height:1;margin-bottom:4px}
        .pen-name{font-size:13px;color:#a1a1aa;font-weight:600}
        .farm-force-light .pen-name{color:#6b5e52}
        .pen-stage{font-size:11px;color:#d4a574;margin-top:2px}
        .farm-force-light .pen-stage{color:#8b5e38}
        .pen-progress{width:100%;height:5px;margin-top:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden}
        .pen-progress-fill{height:100%;background:linear-gradient(90deg,#8b5e38,#d4a574);transition:width 0.8s ease;border-radius:3px}
        .ranch-pen.mature .pen-progress-fill{background:linear-gradient(90deg,#a16207,#facc15)}
        .ranch-pen.has-event .pen-progress-fill{background:linear-gradient(90deg,#9a3412,#f97316)}
        .pen-event-badge{position:absolute;top:3px;right:3px;font-size:14px;background:rgba(0,0,0,0.6);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;animation:ranch-badge-bounce 1s ease-in-out infinite}
        @keyframes ranch-badge-bounce{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        .pen-empty-icon{font-size:32px;opacity:0.25}
        .pen-empty-text{font-size:11px;color:#52525b;margin-top:3px}
        .farm-force-light .pen-empty-text{color:#9ca3af}
        .pen-attrs{display:flex;gap:4px;width:100%;margin:5px 0 2px;padding:0 2px}
        .pen-attr-row{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px}
        .pen-attr-bar{width:100%;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden}
        .pen-attr-fill{height:100%;border-radius:3px;transition:width 0.5s}
        .pen-attr-fill.health{background:linear-gradient(90deg,#15803d,#22c55e)}
        .pen-attr-fill.hunger{background:linear-gradient(90deg,#a16207,#facc15)}
        .pen-attr-fill.low{background:linear-gradient(90deg,#991b1b,#ef4444)!important}
        .pen-attr-val{font-size:11px;color:#d4d4d8;font-family:'Consolas',monospace;font-weight:600}
        .pen-attr-val.low{color:#ef4444}
        .ranch-log{margin-top:8px;max-height:350px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:rgba(0,0,0,0.2);border-radius:6px;padding:8px 10px;border:1px solid rgba(196,149,106,0.08)}
        .ranch-log-title{font-size:12px;color:#71717a;letter-spacing:1px;margin-bottom:6px}
        .farm-force-light .ranch-log-title{color:#6b7280}
        .ranch-log-entry{font-size:13px;color:#a1a1aa;padding:2px 0;display:flex;gap:6px}
        .ranch-log-entry .log-time{color:#8b5e38;font-family:'Consolas',monospace;font-size:11px;white-space:nowrap}
        .ranch-temp-bag{margin-top:8px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(196,149,106,0.12);padding:10px}
        .farm-force-light .ranch-temp-bag{background:rgba(0,0,0,0.03);border-color:rgba(139,92,56,0.08)}
        .ranch-temp-bag-title{font-size:12px;color:#71717a;letter-spacing:1px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
        .ranch-temp-bag-item{display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(0,0,0,0.2);border-radius:6px;margin-bottom:4px;border:1px solid rgba(196,149,106,0.08)}
        .ranch-temp-bag-icon{font-size:20px}
        .ranch-temp-bag-name{flex:1;font-size:13px;color:#d4d4d8}
        .farm-force-light .ranch-temp-bag-name{color:#3d2b1a}
        .ranch-temp-bag-count{font-size:13px;font-weight:700;color:#d4a574;font-family:'Consolas',monospace;margin-right:8px}
        .farm-force-light .ranch-temp-bag-count{color:#8b5e38}
        .ranch-temp-bag-actions{display:flex;gap:4px}
        .ranch-bag-btn{padding:3px 8px;border-radius:4px;cursor:pointer;border:1px solid rgba(196,149,106,0.3);background:rgba(196,149,106,0.1);color:#d4a574;font-size:11px}
        .farm-force-light .ranch-bag-btn{color:#8b5e38;border-color:rgba(139,92,56,0.25);background:rgba(139,92,56,0.08)}
        .ranch-bag-btn.danger{border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#f87171}
        .ranch-bag-footer{display:flex;gap:6px;margin-top:8px}
        .ranch-bag-footer .ranch-btn{flex:1;font-size:12px;padding:6px 0;text-align:center}
        .ranch-btn{padding:5px 13px;border-radius:6px;cursor:pointer;border:1px solid rgba(196,149,106,0.35);background:rgba(196,149,106,0.1);color:#d4a574;font-size:13px;font-weight:600;transition:all 0.2s}
        .ranch-btn:hover{background:rgba(196,149,106,0.2);border-color:rgba(196,149,106,0.5)}
        .ranch-btn.danger{border-color:rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#f87171}
        .ranch-btn.warn{border-color:rgba(249,115,22,0.3);background:rgba(249,115,22,0.08);color:#fb923c}
        .farm-force-light .ranch-btn{color:#8b5e38;background:rgba(139,92,56,0.06);border-color:rgba(139,92,56,0.2)}
        .ranch-popup{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000002;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
        .ranch-popup.mobile-inside{position:absolute;border-radius:12px}
        .ranch-popup-card{background:rgba(18,22,16,0.98);border:1px solid rgba(196,149,106,0.3);border-radius:14px;padding:20px;min-width:260px;max-width:340px;box-shadow:0 12px 48px rgba(0,0,0,0.6)}
        .ranch-store-popup{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:1000004;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
        .ranch-store-popup.mobile-inside{position:absolute;border-radius:12px}
        .ranch-store-card{background:rgba(14,20,12,0.97);border:1px solid rgba(196,149,106,0.3);border-radius:14px;padding:16px;box-shadow:0 12px 48px rgba(0,0,0,0.6);max-width:300px;width:90%}
        .ranch-store-list{display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
        .ranch-store-option{display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(0,0,0,0.2);border-radius:8px;border:1px solid rgba(196,149,106,0.1);cursor:pointer}
        .ranch-store-option:hover{background:rgba(196,149,106,0.15)}
        .ranch-animal-picker{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000001;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
        .ranch-animal-picker.mobile-inside{position:absolute;border-radius:12px}
        .ranch-animal-picker-card{background:rgba(18,22,16,0.98);border:1px solid rgba(196,149,106,0.35);border-radius:12px;padding:10px;z-index:1000002;box-shadow:0 8px 24px rgba(0,0,0,0.5);width:min(340px,90vw);max-height:min(520px,85vh);display:flex;flex-direction:column;margin:auto 10px}
        .ranch-animal-picker-title{font-size:13px;color:#71717a;padding:4px 6px 8px;border-bottom:1px solid rgba(196,149,106,0.12);margin-bottom:4px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px}
        .ranch-popup-close{width:24px;height:24px;border:none;background:rgba(255,255,255,0.06);color:#a1a1aa;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;transition:background 0.2s,color 0.2s;flex-shrink:0}
        .ranch-popup-close:hover{background:rgba(239,68,68,0.2);color:#ef4444}
        .ranch-animal-picker-list{overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;flex:1;min-height:0;padding-bottom:8px}
        .ranch-animal-option{display:flex;align-items:center;gap:10px;padding:7px 6px;border-radius:6px;cursor:pointer}
        .ranch-animal-option:hover{background:rgba(196,149,106,0.12)}
        .ranch-animal-option-icon{font-size:24px}
        .ranch-animal-option-info{flex:1;min-width:0}
        .ranch-animal-option-name{font-size:14px;color:#d4d4d8;font-weight:600}
        .ranch-animal-option-meta{font-size:11px;color:#71717a;margin-top:1px}
        .ranch-animal-option-time{font-size:12px;color:#d4a574;opacity:0.7;white-space:nowrap}
        .ranch-animal-picker-card .ranch-animal-option-time{color:#d4a574;opacity:0.8}
        @media(max-width:768px){
            .ranch-grid{grid-template-columns:repeat(2,1fr);gap:6px}
            .ranch-pen{min-height:90px;padding:8px 4px}
            .pen-icon{font-size:28px}
        }
        @media(max-width:360px){
            .ranch-grid{grid-template-columns:repeat(2,1fr);gap:5px}
            .ranch-pen{min-height:78px;padding:6px 3px}
            .pen-icon{font-size:24px}
        }
        /* ── 牧场亮色模式 ── */
        .farm-main-panel.farm-force-light .ranch-shelter-bar{background:rgba(139,92,56,0.06);border-color:rgba(139,92,56,0.15)}
        .farm-main-panel.farm-force-light .ranch-shelter-select{color:#6b3a1f;background:rgba(255,255,255,0.7);border-color:rgba(139,92,56,0.25)}
        .farm-main-panel.farm-force-light .ranch-shelter-select option{background:#fff;color:#3d2b1a}
        .farm-main-panel.farm-force-light .ranch-stat{background:rgba(139,92,56,0.06);border-color:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .ranch-stat-val{color:#6b3a1f}
        .farm-main-panel.farm-force-light .ranch-stat-label{color:#8b7355}
        .farm-main-panel.farm-force-light .ranch-event-bar{background:rgba(249,115,22,0.06);border-color:rgba(194,65,12,0.2)}
        .farm-main-panel.farm-force-light .ranch-item-bar{background:rgba(139,92,56,0.05);border-color:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .ranch-item{background:rgba(139,92,56,0.05);border-color:rgba(139,92,56,0.15)}
        .farm-main-panel.farm-force-light .ranch-item:hover{background:rgba(139,92,56,0.12)}
        .farm-main-panel.farm-force-light .ranch-item.selected{border-color:#a0522d;background:rgba(160,82,45,0.18);box-shadow:0 0 10px rgba(160,82,45,0.15)}
        .farm-main-panel.farm-force-light .ranch-item-name{color:#5c4a3a}
        .farm-main-panel.farm-force-light .ranch-item-count{color:#6b3a1f;background:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .ranch-pen{background:linear-gradient(160deg,rgba(139,92,56,0.06),rgba(139,92,56,0.02));border-color:rgba(139,92,56,0.2)}
        .farm-main-panel.farm-force-light .ranch-pen:hover{border-color:rgba(139,92,56,0.5);box-shadow:0 0 14px rgba(139,92,56,0.08)}
        .farm-main-panel.farm-force-light .ranch-pen.empty{background:rgba(139,92,56,0.03);border-color:rgba(139,92,56,0.12)}
        .farm-main-panel.farm-force-light .pen-name{color:#5c4a3a}
        .farm-main-panel.farm-force-light .pen-stage{color:#8b5e38}
        .farm-main-panel.farm-force-light .pen-progress{background:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .pen-attr-bar{background:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .pen-attr-val{color:#4a3520}
        .farm-main-panel.farm-force-light .pen-attr-val.low{color:#dc2626}
        .farm-main-panel.farm-force-light .pen-empty-text{color:#a09080}
        .farm-main-panel.farm-force-light .pen-event-badge{background:rgba(255,255,255,0.6)}
        .farm-main-panel.farm-force-light .ranch-log{background:rgba(139,92,56,0.04);border-color:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .ranch-log-title{color:#7a6b5c}
        .farm-main-panel.farm-force-light .ranch-log-entry{color:#5c4a3a}
        .farm-main-panel.farm-force-light .ranch-log-entry .log-time{color:#8b5e38}
        .farm-main-panel.farm-force-light .ranch-temp-bag{background:rgba(139,92,56,0.04);border-color:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .ranch-temp-bag-title{color:#7a6b5c}
        .farm-main-panel.farm-force-light .ranch-temp-bag-item{background:rgba(255,255,255,0.6);border-color:rgba(139,92,56,0.1)}
        .farm-main-panel.farm-force-light .ranch-temp-bag-name{color:#3d2b1a}
        .farm-main-panel.farm-force-light .ranch-temp-bag-count{color:#8b5e38}
        .farm-main-panel.farm-force-light .ranch-bag-btn{color:#8b5e38;border-color:rgba(139,92,56,0.25);background:rgba(139,92,56,0.08)}
        .farm-main-panel.farm-force-light .ranch-bag-btn.danger{border-color:rgba(185,28,28,0.25);background:rgba(239,68,68,0.06);color:#b91c1c}
        .farm-main-panel.farm-force-light .ranch-btn{color:#6b3a1f;background:rgba(139,92,56,0.06);border-color:rgba(139,92,56,0.2)}
        .farm-main-panel.farm-force-light .ranch-btn:hover{background:rgba(139,92,56,0.15);border-color:rgba(139,92,56,0.4)}
        .farm-main-panel.farm-force-light .ranch-btn.danger{border-color:rgba(185,28,28,0.25);background:rgba(239,68,68,0.06);color:#b91c1c}
        .farm-main-panel.farm-force-light .ranch-btn.warn{border-color:rgba(194,65,12,0.25);background:rgba(249,115,22,0.06);color:#9a3412}
        /* 牧场弹窗亮色 */
        .ranch-popup-card.ranch-popup-light{background:rgba(250,247,242,0.98);border-color:rgba(139,92,56,0.25);box-shadow:0 8px 32px rgba(0,0,0,0.12)}
        .ranch-popup-card.ranch-popup-light .ranch-btn{color:#6b3a1f;background:rgba(139,92,56,0.08);border-color:rgba(139,92,56,0.25)}
        .ranch-popup-card.ranch-popup-light .ranch-btn.danger{border-color:rgba(185,28,28,0.25);background:rgba(239,68,68,0.06);color:#b91c1c}
        .ranch-store-card.ranch-store-light{background:rgba(250,247,242,0.98);border-color:rgba(139,92,56,0.25);box-shadow:0 8px 32px rgba(0,0,0,0.12)}
        .ranch-store-card.ranch-store-light .ranch-store-option{background:rgba(255,255,255,0.6);border-color:rgba(139,92,56,0.1);color:#4a3520}
        .ranch-store-card.ranch-store-light .ranch-store-option:hover{background:rgba(139,92,56,0.1)}
        .ranch-store-card.ranch-store-light .ranch-btn{color:#6b3a1f;background:rgba(139,92,56,0.08);border-color:rgba(139,92,56,0.25)}
        .ranch-animal-picker-card.ranch-picker-light{background:rgba(250,247,242,0.98);border-color:rgba(139,92,56,0.25);box-shadow:0 8px 32px rgba(0,0,0,0.12)}
        .ranch-animal-picker-card.ranch-picker-light .ranch-animal-option-name{color:#3d2b1a}
        .ranch-animal-picker-card.ranch-picker-light .ranch-animal-option-meta{color:#8b7355}
        .ranch-animal-picker-card.ranch-picker-light .ranch-animal-option-time{color:#8b5e38}
        .ranch-animal-picker-card.ranch-picker-light .ranch-animal-option:hover{background:rgba(139,92,56,0.08)}
        .ranch-animal-picker-card.ranch-picker-light .ranch-animal-picker-title{color:#7a6b5c;border-bottom-color:rgba(139,92,56,0.12)}
        .ranch-animal-picker-card.ranch-picker-light .ranch-popup-close{background:rgba(0,0,0,0.04);color:#8b7355}
        .ranch-animal-picker-card.ranch-picker-light .ranch-popup-close:hover{background:rgba(239,68,68,0.12);color:#dc2626}

        /* ===== 升级面板 ===== */
        .upgrade-popup { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000002; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
        .upgrade-card { background: rgba(18, 22, 16, 0.98); border: 1px solid rgba(212,165,116,0.35); border-radius: 14px; padding: 18px; width: 320px; max-width: 90vw; box-shadow: 0 0 30px rgba(212,165,116,0.12); }
        .upgrade-list { display: flex; flex-direction: column; gap: 8px; max-height: 380px; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
        .upgrade-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; }
        .upgrade-item.disabled { opacity: 0.5; }
        .upgrade-item.maxed { border-color: rgba(250,204,21,0.3); background: rgba(250,204,21,0.06); }
        .upgrade-info { flex: 1; min-width: 0; }
        .upgrade-name { font-size: 13px; font-weight: 600; color: #e4e4e7; margin-bottom: 2px; }
        .upgrade-lvl { font-size: 11px; color: #facc15; margin-left: 4px; }
        .upgrade-desc { font-size: 11px; color: #a1a1aa; }
        .upgrade-btn { padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(34,197,94,0.4); background: rgba(34,197,94,0.12); color: #4ade80; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
        .upgrade-btn:hover:not(.disabled) { background: rgba(34,197,94,0.25); }
        .upgrade-btn.disabled { opacity: 0.4; border-color: rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #71717a; cursor: not-allowed; }
        .upgrade-light { background: rgba(245, 248, 242, 0.98); border-color: rgba(202,138,4,0.3); }
        .upgrade-light .upgrade-item { background: rgba(0,0,0,0.03); border-color: rgba(0,0,0,0.08); }
        .upgrade-light .upgrade-name { color: #1f2937; }
        .upgrade-light .upgrade-desc { color: #6b7280; }
        .upgrade-light .upgrade-btn { border-color: rgba(22,101,52,0.3); background: rgba(34,197,94,0.1); color: #15803d; }
        .upgrade-light .upgrade-btn:hover:not(.disabled) { background: rgba(34,197,94,0.2); }
        .upgrade-light .upgrade-btn.disabled { border-color: rgba(0,0,0,0.1); background: rgba(0,0,0,0.04); color: #9ca3af; }
    </style>`;

    // ==================== 工具函数 ====================
    function timeAgo(ts) {
        const sec = Math.floor((Date.now() - ts) / 1000);
        if (sec < 60) return sec + '秒前';
        const min = Math.floor(sec / 60);
        if (min < 60) return min + '分钟前';
        const hr = Math.floor(min / 60);
        return hr + '小时前';
    }
    function formatMin(m) {
        if (m < 1) return Math.round(m * 60) + '秒';
        if (m < 60) return m.toFixed(1) + '分钟';
        return (m / 60).toFixed(1) + '小时';
    }

    function appendOverlay(overlay) {
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            overlay.classList.add('mobile-inside');
            panel.appendChild(overlay);
        } else {
            p.document.body.appendChild(overlay);
        }
    }
    function showToast(msg, isEvent = false) {
        const t = p.document.createElement('div');
        t.className = 'farm-toast' + (isEvent ? ' event-toast' : '');
        if (panel.classList.contains('farm-force-light')) t.classList.add('farm-toast-light');
        t.textContent = msg;
        p.document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

    function getActiveEventCount() {
        return Object.values(farmState.events).filter(e => !e.resolved).length;
    }

    // ==================== 初始化检查：移除旧 DOM ====================
    /**
     * 如果页面上已存在旧的农场 UI（脚本重启但 DOM 未清理），先移除
     * 这解决了"酒馆助手关闭后图标不消失"的问题
     */
    await loadConfig();
    await loadState(farmConfig.selectedShelter || '');
    await loadRanchState(farmConfig.selectedShelter || '');
    const p = window.parent || window;
    const existingPanel = p.document.getElementById('farm-panel');
    const existingBubble = p.document.getElementById('farm-bubble');
    if (existingPanel || existingBubble) {
        console.warn('[小农场] 检测到残留 DOM，正在清理...');
        if (existingPanel) existingPanel.remove();
        if (existingBubble) existingBubble.remove();
        p.document.querySelectorAll('.crop-picker-overlay, .crop-detail-popup, .harvest-popup, .farm-toast').forEach(el => el.remove());
    }

    // ==================== HTML ====================
    const HTML = `
    <div id="farm-panel" class="farm-main-panel"
         style="display:${farmConfig.isMinimized ? 'none' : 'flex'};
                left:50%; top:50%;
                width:${farmConfig.panelWidth}; height:${farmConfig.panelHeight};
                transform: translate(-50%, -50%);">
        <div class="farm-header" id="farm-drag-handle">
            <div class="farm-header-title">
                <span class="farm-title-icon">🌻</span> 末世田园
            </div>
            <div style="display:flex;gap:4px;">
                <button class="farm-btn" id="farm-theme-toggle" title="切换亮色/暗色模式">🌑</button>
                <button class="farm-btn" id="farm-refresh" title="刷新庇护所">🔄</button>
                <button class="farm-btn" id="farm-close" title="关闭面板">✕</button>
            </div>
        </div>
        <div class="farm-tabs" id="farm-tabs">
            <div class="farm-tab active" data-tab="farm">🌾 农场</div>
            <div class="farm-tab" data-tab="fish">🎣 钓鱼</div>
            <div class="farm-tab" data-tab="ranch">🐄 牧场</div>
            <div class="farm-tab" data-tab="cheat">⚡ 外星科技</div>
        </div>
        <div class="farm-body" id="farm-body"></div>
        <div class="fish-body" id="fish-body" style="display:none;-webkit-overflow-scrolling:touch;"></div>
        <div id="ranch-body" style="display:none;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:14px;flex:1;box-sizing:border-box;min-height:0;"></div>
        <div id="cheat-body" style="display:none;flex-direction:column;gap:10px;padding:14px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1;box-sizing:border-box;min-height:0;"></div>
        <div class="farm-footer" id="farm-footer">
            <span style="font-size:11px;color:#52525b;">🌱 末世田园</span>
            <div style="display:flex;gap:6px;">
                <button class="farm-btn danger" id="farm-clear-plots">清除农田</button>
                <button class="farm-btn warn" id="farm-disable" title="停用农场（数据保留）">🛑 停用</button>
            </div>
            <div class="farm-resizer" id="farm-resizer"></div>
        </div>
    </div>
    <div id="farm-bubble" style="top:${farmConfig.bubbleTop}; left:${farmConfig.bubbleLeft || '10px'};">🌻</div>`;

    p.document.body.insertAdjacentHTML('beforeend', CSS + HTML);

    const panel = p.document.getElementById('farm-panel');
    const bubble = p.document.getElementById('farm-bubble');
    const body = p.document.getElementById('farm-body');

    // ==================== 渲染 ====================
    let currentShelters = {};
    let selectedShelter = farmConfig.selectedShelter || '';
    let tickInterval = null;
    let selectedItemKey = null; // 移动端：已选中的道具
    let hasFarmRanchAccess = true; // 农场/牧场标签始终显示，收获存储时无庇护所/营地会自动降级

    function updateTabVisibility() {
        // 农场和牧场始终显示，无需权限控制
        // （收获存储时若无庇护所/营地，会自动降级为仅背包/卖出）
    }

    async function refreshShelters(forceCold = true) {
        currentShelters = await getShelters(!forceCold);
        const shelterNames = Object.keys(currentShelters);

        // 检查是否有农场/牧场访问权限（庇护所或营地）
        const result = getLatestFullData();
        const hasCamp = !!(result?.data?.stat_data?.营地?.名称);
        // 农场和牧场始终可用，无需庇护所/营地权限也能种植养殖
        hasFarmRanchAccess = true;
        updateTabVisibility();

        if (!selectedShelter || !shelterNames.includes(selectedShelter)) {
            /* 庇护所列表变化，保存旧状态并加载新庇护所 */
            const oldShelter = selectedShelter;
            selectedShelter = shelterNames[0] || '';
            if (oldShelter && oldShelter !== selectedShelter) {
                await saveState(oldShelter);
                await saveRanchState(oldShelter);
                await loadState(selectedShelter);
                await loadRanchState(selectedShelter);
            }
        }
        renderPanel();
        if (currentTab === 'ranch') renderRanchPanel();
        if (currentTab === 'fish') renderFish();
        if (currentTab === 'cheat') renderCheat();
    }

    function renderPanel() {
        if (_renderPanelRaf) return;
        _renderPanelRaf = requestAnimationFrame(() => {
            _renderPanelRaf = null;
            _doRenderPanel();
        });
    }
    function _doRenderPanel() {
        if (currentTab !== 'farm') return;
        const savedScrollTop = body.scrollTop;
        const shelterNames = Object.keys(currentShelters);
        const activeEvents = Object.entries(farmState.events).filter(([, e]) => !e.resolved);

        if (activeEvents.length > 0) {
            bubble.classList.add('has-event');
        } else {
            bubble.classList.remove('has-event');
        }

        // 没有庇护所时，使用默认空key（流浪营地）
        if (!selectedShelter || !shelterNames.includes(selectedShelter)) {
            selectedShelter = shelterNames[0] || '';
        }

        const planted = farmState.plots.filter(p => p !== null).length;
        const ready = farmState.plots.filter((p, i) => p && getPlotStage(p, i)?.stageIdx === 4).length;
        const totalHarvested = farmState.harvestLog.length;
        const eventCount = activeEvents.length;

        let html = '';
        if (shelterNames.length > 0) {
            html += `
            <div class="farm-shelter-bar">
                <span class="shelter-label">🏠 庇护所</span>
                <select class="farm-shelter-select" id="farm-shelter-sel">
                    ${shelterNames.map(n => `<option value="${n}" ${n === selectedShelter ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
            </div>`;
        } else {
            html += `
            <div class="farm-shelter-bar">
                <span class="shelter-label">🏕️ 流浪营地</span>
                <span style="font-size:12px;color:#3f3f46;">收获后暂存背包/卖出</span>
            </div>`;
        }
        html += `
            <div class="farm-stats">
                <div class="farm-stat"><div class="farm-stat-val">${planted}</div><div class="farm-stat-label">种植中</div></div>
                <div class="farm-stat"><div class="farm-stat-val" style="color:#facc15">${ready}</div><div class="farm-stat-label">可收获</div></div>
                <div class="farm-stat"><div class="farm-stat-val">${totalHarvested}</div><div class="farm-stat-label">总收获</div></div>
                <div class="farm-stat"><div class="farm-stat-val" style="color:#facc15">¥${fishState.money}</div><div class="farm-stat-label">资金</div></div>
                ${eventCount > 0 ? `<div class="farm-stat"><div class="farm-stat-val" style="color:#f97316">${eventCount}</div><div class="farm-stat-label">⚠ 警报</div></div>` : ''}
            </div>
            ${ready > 0 ? `<button class="farm-btn warn" id="farm-harvest-all" style="width:100%;margin-bottom:10px;font-size:14px;padding:7px 0;">🌾 一键收获 (${ready}块田地)</button>` : ''}
            <button class="farm-btn" id="farm-upgrade-btn" style="width:100%;margin-bottom:10px;font-size:13px;padding:6px 0;background:rgba(34,197,94,0.08);color:#4ade80;border-color:rgba(34,197,94,0.25);">📈 农场升级</button>`;

        // 事件警报条
        if (activeEvents.length > 0) {
            const latestEvent = activeEvents[activeEvents.length - 1];
            const evtIdx = latestEvent[0];
            const evt = latestEvent[1];
            const et = EVENT_TYPES[evt.type];
            const neededItem = Object.entries(ITEMS).find(([, i]) => i.resolves === evt.type);
            html += `
                <div class="farm-event-bar">
                    <span class="event-icon">${et.icon}</span>
                    <div class="event-info">
                        <div class="event-title">${et.name}！田地${parseInt(evtIdx) + 1}的${farmState.plots[evtIdx]?.crop || '作物'}需要${et.actionName}</div>
                        <div class="event-desc">${et.desc} · 拖拽${neededItem ? neededItem[1].icon + neededItem[1].name : ''}到田地解除</div>
                    </div>
                </div>`;
        }

        // 道具工具栏
        html += `<div class="farm-item-bar"><div class="farm-item-bar-title">🧰 道具（拖拽到田地使用 · 每2分钟+1）</div>`;
        for (const [key, item] of Object.entries(ITEMS)) {
            const count = farmState.items[key] || 0;
            const isEmpty = count <= 0;
            const isSelected = selectedItemKey === key;
            html += `
                <div class="farm-item${isEmpty ? ' empty' : ''}${isSelected ? ' selected' : ''}"
                     draggable="${isEmpty ? 'false' : 'true'}" data-item="${key}">
                    <span class="farm-item-icon">${item.icon}</span>
                    <span class="farm-item-name">${item.name}</span>
                    <span class="farm-item-count">${count}</span>
                    <span class="farm-item-tip">${item.desc} → ${EVENT_TYPES[item.resolves]?.name || ''}</span>
                </div>`;
        }
        html += `</div>`;

        html += `<div class="farm-grid" id="farm-grid">`;

        for (let i = 0; i < PLOT_COUNT; i++) {
            const plot = farmState.plots[i];
            if (!plot) {
                html += `
                    <div class="farm-plot empty" data-idx="${i}">
                        <div class="plot-empty-icon">➕</div>
                        <div class="plot-empty-text">种植</div>
                    </div>`;
            } else {
                const info = getPlotStage(plot, i);
                const crop = CROPS[plot.crop];
                const isReady = info.stageIdx === 4;
                const isMature = info.stageIdx === 3;
                const evt = farmState.events[i];
                const hasEvent = evt && !evt.resolved;
                const cls = [hasEvent ? 'has-event' : '', isReady ? 'ready' : isMature ? 'mature' : 'growing'].filter(Boolean).join(' ');
                const icon = (isMature || isReady) ? crop.icon : info.stage.icon;
                const pctText = Math.round(info.progress * 100);
                const evtBadge = hasEvent ? `<div class="plot-event-badge">${EVENT_TYPES[evt.type].icon}</div>` : '';
                const stageName = hasEvent ? EVENT_TYPES[evt.type].name : isReady ? '可收获!' : info.stage.name;
                const water = plot.water ?? 80;
                const fertilizer = plot.fertilizer ?? 75;
                const health = plot.health ?? 100;
                html += `
                    <div class="farm-plot ${cls}" data-idx="${i}" title="${isReady ? '点击收获' : info.stage.name + ' ' + pctText + '%'}">
                        ${evtBadge}
                        <div class="plot-icon">${icon}</div>
                        <div class="plot-name">${plot.crop}</div>
                        <div class="plot-stage">${stageName}</div>
                        ${!isReady ? `<div class="plot-attrs">
                            <div class="plot-attr-row"><span class="plot-attr-icon">💧</span><div class="plot-attr-bar"><div class="plot-attr-fill water${water < 30 ? ' low' : ''}" style="width:${water}%"></div></div><span class="plot-attr-val${water < 30 ? ' low' : ''}">${Math.round(water)}</span></div>
                            <div class="plot-attr-row"><span class="plot-attr-icon">🧪</span><div class="plot-attr-bar"><div class="plot-attr-fill fert${fertilizer < 30 ? ' low' : ''}" style="width:${fertilizer}%"></div></div><span class="plot-attr-val${fertilizer < 30 ? ' low' : ''}">${Math.round(fertilizer)}</span></div>
                            <div class="plot-attr-row"><span class="plot-attr-icon">❤️</span><div class="plot-attr-bar"><div class="plot-attr-fill health${health < 30 ? ' low' : ''}" style="width:${health}%"></div></div><span class="plot-attr-val${health < 30 ? ' low' : ''}">${Math.round(health)}</span></div>
                        </div>` : ''}
                        <div class="plot-progress"><div class="plot-progress-fill" style="width:${pctText}%"></div></div>
                    </div>`;
            }
        }
        html += `</div>`;

        // 日志
        const allLogs = [
            ...farmState.harvestLog.map(l => ({ ...l, type: 'harvest' })),
            ...farmState.stolenLog.map(l => ({ ...l, type: 'stolen' })),
        ].sort((a, b) => b.time - a.time);

        if (allLogs.length > 0) {
            html += `<div class="farm-log"><div class="farm-log-title" style="display:flex;justify-content:space-between;align-items:center;">📋 农场记录<button class="farm-btn danger" id="farm-clear-log" style="padding:2px 8px;font-size:11px;">清空</button></div>`;
            allLogs.forEach(log => {
                const isStolen = log.type === 'stolen';
                html += `<div class="farm-log-entry"><span class="log-time">${timeAgo(log.time)}</span><span class="log-text${isStolen ? ' stolen' : ''}">${log.text}</span></div>`;
            });
            html += `</div>`;
        }

        body.innerHTML = html;
        requestAnimationFrame(() => { body.scrollTop = Math.min(savedScrollTop, body.scrollHeight - body.clientHeight); });

        // 绑定庇护所切换
        const sel = p.document.getElementById('farm-shelter-sel');
        if (sel) {
            sel.addEventListener('change', async (e) => {
                const oldShelter = selectedShelter;
                const newShelter = e.target.value;
                if (oldShelter === newShelter) return;
                await saveState(oldShelter);
                await saveRanchState(oldShelter);
                selectedShelter = newShelter;
                saveConfig({ selectedShelter });
                await loadState(newShelter);
                await loadRanchState(newShelter);
                renderPanel();
                if (currentTab === 'ranch') renderRanchPanel();
            });
        }

        // 绑定清空日志
        const clearLogBtn = p.document.getElementById('farm-clear-log');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', async () => {
                farmState.harvestLog = [];
                farmState.stolenLog = [];
                await saveState();
                renderPanel();
                showToast('📋 记录已清空');
            });
        }

        // 绑定一键收获
        const harvestAllBtn = p.document.getElementById('farm-harvest-all');
        if (harvestAllBtn) {
            harvestAllBtn.addEventListener('click', () => harvestAll());
        }
        const farmUpgradeBtn = p.document.getElementById('farm-upgrade-btn');
        if (farmUpgradeBtn) {
            farmUpgradeBtn.addEventListener('click', () => showFarmUpgradePanel());
        }
    }

    // ==================== 道具拖拽 & 移动端选择（事件委托模式）====================
    /**
     * 绑定道具拖拽和移动端点击选择
     * 使用事件委托避免重复绑定，支持桌面拖拽和移动端点击两种交互模式
     */
    function bindItemDragDrop() {
        // 道具拖拽开始（桌面端）
        body.addEventListener('dragstart', (e) => {
            const itemEl = e.target.closest('.farm-item:not(.empty)');
            if (!itemEl) return;
            e.dataTransfer.setData('text/plain', itemEl.dataset.item);
            e.dataTransfer.effectAllowed = 'move';
            itemEl.style.opacity = '0.5';
            itemEl._isDragging = true;
        });

        // 道具拖拽结束（桌面端）
        body.addEventListener('dragend', (e) => {
            const itemEl = e.target.closest('.farm-item');
            if (!itemEl) return;
            itemEl.style.opacity = '1';
            itemEl._isDragging = false;
        });

        // 道具点击选择（移动端）
        body.addEventListener('click', (e) => {
            const itemEl = e.target.closest('.farm-item:not(.empty)');
            if (!itemEl || itemEl._isDragging) return;
            e.stopPropagation();
            const key = itemEl.dataset.item;
            if (selectedItemKey === key) {
                selectedItemKey = null; // 取消选择
            } else {
                selectedItemKey = key;
            }
            renderPanel();
        });

        // 田地拖拽悬停高亮
        body.addEventListener('dragover', (e) => {
            const plotEl = e.target.closest('.farm-plot:not(.empty)');
            if (plotEl) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                plotEl.classList.add('drag-over');
            }
        });

        // 田地拖拽离开
        body.addEventListener('dragleave', (e) => {
            const plotEl = e.target.closest('.farm-plot');
            if (plotEl && !plotEl.contains(e.relatedTarget)) {
                plotEl.classList.remove('drag-over');
            }
        });

        // 田地接收道具拖放
        body.addEventListener('drop', (e) => {
            const plotEl = e.target.closest('.farm-plot');
            if (!plotEl) return;
            e.preventDefault();
            plotEl.classList.remove('drag-over');
            const itemKey = e.dataTransfer.getData('text/plain');
            const plotIdx = parseInt(plotEl.dataset.idx);
            if (itemKey && !isNaN(plotIdx)) {
                useItemOnPlot(itemKey, plotIdx);
            }
        });
    }

    // ==================== 田地点击（种植/收获/道具使用）事件委托 ====================
    /**
     * 绑定田地点击事件（事件委托模式）
     * 支持：空地种植、生长中查看详情、成熟收获、移动端道具使用
     */
    function bindPlotClicks() {
        body.addEventListener('click', async (e) => {
            const plotEl = e.target.closest('.farm-plot');
            if (!plotEl) return;

            const idx = parseInt(plotEl.dataset.idx);
            if (isNaN(idx)) return;

            // 移动端：如果已选中道具，使用道具
            if (selectedItemKey) {
                useItemOnPlot(selectedItemKey, idx);
                selectedItemKey = null;
                renderPanel();
                return;
            }

            const plot = farmState.plots[idx];
            if (!plot) {
                // 空地：打开种植选择器
                p._farmPlant(idx);
                return;
            }

            const info = getPlotStage(plot, idx);
            const evt = farmState.events[idx];
            const hasEvent = evt && !evt.resolved;
            const crop = CROPS[plot.crop];

            // 有事件：弹出提示面板（只能用道具解决）
            if (hasEvent) {
                const et = EVENT_TYPES[evt.type];
                const neededItem = Object.entries(ITEMS).find(([, i]) => i.resolves === evt.type);
                const isReady = info.stageIdx === 4;

                const overlay = p.document.createElement('div');
                overlay.className = 'harvest-popup';
                if (panel.classList.contains('farm-force-light')) overlay.classList.add('farm-harvest-light');

                let harvestSection = '';
                if (isReady) {
                    const actualYield = calcYield(plot, idx);
                    const normalYield = crop.yield;
                    const penaltyText = actualYield < normalYield ? `<div class="harvest-yield-penalty">⚠ 因${et.name}减产：${normalYield} → ${actualYield}</div>` : '';
                    harvestSection = `
                        <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.1);">
                            <div class="harvest-title" style="font-size:15px;">同时收获 ${crop.icon}${plot.crop}</div>
                            ${penaltyText}
                        </div>`;
                }

                overlay.innerHTML = `
                    <div class="harvest-card">
                        <div class="harvest-icon">${et.icon}</div>
                        <div class="harvest-title" style="color:${et.color};">${et.name}！</div>
                        <div class="harvest-desc">${et.desc}<br>田地${idx + 1}的${plot.crop}需要${et.actionName}</div>
                        <div class="harvest-item-hint">💡 拖拽 ${neededItem ? neededItem[1].icon + neededItem[1].name : ''} 到田地解除</div>
                        ${harvestSection}
                        <div class="harvest-actions" style="margin-top:16px;">
                            ${isReady ? `<button class="harvest-btn store" id="h-store">📦 收获并存入</button>` : ''}
                            <button class="harvest-btn cancel" id="h-cancel">关闭</button>
                        </div>
                    </div>`;
                appendOverlay(overlay);

                if (isReady) {
                    const storeBtn = overlay.querySelector('#h-store');
                    if (storeBtn) {
                        storeBtn.addEventListener('click', async () => {
                            const actualYield = calcYield(plot, idx);
                            const targets = getStorageTargets();
                            if (targets.length === 0) { showToast('❌ 没有可用的存储位置', true); return; }
                            if (targets.length === 1) {
                                farmState.plots[idx] = null;
                                delete farmState.events[idx];
                                farmState.harvestLog.push({ time: Date.now(), text: `收获 ${crop.icon}${plot.crop} ×${actualYield} → ${targets[0].label}` });
                                await saveState();
                                renderPanel();
                                overlay.remove();
                                showToast(`📦 收获 ${crop.icon}${plot.crop} ×${actualYield}`);
                                storeCrop(plot.crop, actualYield, targets[0]).then(ok => {
                                    if (ok) { showToast(`📦 已存入${targets[0].label}`); } else { showToast('❌ 存入失败'); }
                                    refreshShelters(false);
                                });
                                return;
                            }
                            // 多目标：弹出选择
                            const hTargets = getStorageTargets();
                            const hOverlay = p.document.createElement('div');
                            hOverlay.className = 'ranch-store-popup';
                            hOverlay.innerHTML = `<div class="ranch-store-card${panel.classList.contains('farm-force-light') ? ' ranch-store-light' : ''}"><div style="font-size:14px;font-weight:700;color:#d4a574;margin-bottom:10px;text-align:center;">📦 选择收获存储位置</div><div class="ranch-store-list">${hTargets.map(t => `<div class="ranch-store-option" data-type="${t.type}" data-name="${t.name}" data-label="${t.label}">${t.icon} ${t.label}</div>`).join('')}</div><button class="ranch-btn" id="h-store-close" style="width:100%;margin-top:8px;">取消</button></div>`;
                            appendOverlay(hOverlay);
                            hOverlay.querySelector('#h-store-close').addEventListener('click', () => hOverlay.remove());
                            hOverlay.querySelectorAll('.ranch-store-option').forEach(opt => opt.addEventListener('click', async () => {
                                const target = { type: opt.dataset.type, name: opt.dataset.name, label: opt.dataset.label };
                                farmState.plots[idx] = null;
                                delete farmState.events[idx];
                                farmState.harvestLog.push({ time: Date.now(), text: `收获 ${crop.icon}${plot.crop} ×${actualYield} → ${target.label}` });
                                await saveState();
                                renderPanel();
                                hOverlay.remove();
                                overlay.remove();
                                showToast(`📦 收获 ${crop.icon}${plot.crop} ×${actualYield}`);
                                storeCrop(plot.crop, actualYield, target).then(ok => {
                                    if (ok) { showToast(`📦 已存入${target.label}`); } else { showToast('❌ 存入失败'); }
                                    refreshShelters(false);
                                });
                            }));
                        });
                    }
                }

                overlay.querySelector('#h-cancel').addEventListener('click', () => overlay.remove());
                overlay.addEventListener('click', (e) => { if (!e.target.closest('.harvest-card')) overlay.remove(); });
                return;
            }

            // 生长中的作物：显示详情
            if (info.stageIdx < 4) {
                showCropDetail(plot, idx, info);
                return;
            }

            // 可收获：立即收获并存入
            const yield_ = calcYield(plot, idx);
            const targets = getStorageTargets();
            if (targets.length === 0) { showToast('❌ 没有可用的存储位置', true); return; }
            if (targets.length === 1) {
                farmState.plots[idx] = null;
                delete farmState.events[idx];
                farmState.harvestLog.push({ time: Date.now(), text: `收获 ${crop.icon}${plot.crop} ×${yield_} → ${targets[0].label}` });
                await saveState();
                renderPanel();
                showToast(`📦 收获 ${crop.icon}${plot.crop} ×${yield_}`);
                storeCrop(plot.crop, yield_, targets[0]).then(ok => {
                    if (ok) { showToast(`📦 已存入${targets[0].label}`); } else { showToast('❌ 存入失败'); }
                    refreshShelters(false);
                });
                return;
            }
            // 多目标：弹出选择
            const hOverlay = p.document.createElement('div');
            hOverlay.className = 'ranch-store-popup';
            hOverlay.innerHTML = `<div class="ranch-store-card${panel.classList.contains('farm-force-light') ? ' ranch-store-light' : ''}"><div style="font-size:14px;font-weight:700;color:#d4a574;margin-bottom:10px;text-align:center;">📦 选择收获存储位置</div><div class="ranch-store-list">${targets.map(t => `<div class="ranch-store-option" data-type="${t.type}" data-name="${t.name}" data-label="${t.label}">${t.icon} ${t.label}</div>`).join('')}</div><button class="ranch-btn" id="h-store-close" style="width:100%;margin-top:8px;">取消</button></div>`;
            appendOverlay(hOverlay);
            hOverlay.querySelector('#h-store-close').addEventListener('click', () => hOverlay.remove());
            hOverlay.querySelectorAll('.ranch-store-option').forEach(opt => opt.addEventListener('click', async () => {
                const target = { type: opt.dataset.type, name: opt.dataset.name, label: opt.dataset.label };
                farmState.plots[idx] = null;
                delete farmState.events[idx];
                farmState.harvestLog.push({ time: Date.now(), text: `收获 ${crop.icon}${plot.crop} ×${yield_} → ${target.label}` });
                await saveState();
                renderPanel();
                hOverlay.remove();
                showToast(`📦 收获 ${crop.icon}${plot.crop} ×${yield_}`);
                storeCrop(plot.crop, yield_, target).then(ok => {
                    if (ok) { showToast(`📦 已存入${target.label}`); } else { showToast('❌ 存入失败'); }
                    refreshShelters(false);
                });
            }));
        });
    }

    // ==================== 钓鱼系统 ====================
    const fishBody = () => p.document.getElementById('fish-body');

    function pickRandomFish() {
        const pool = FISHES.map(f => ({ ...f }));
        const bait = BAITS.find(b => b.key === fishState.currentBait) || BAITS[0];
        const rBonus = bait.rarityBonus || 0;
        // 普通鱼权重高，传说鱼权重低；鱼饵稀有度加成提升高稀有鱼概率
        const weights = pool.map(f => {
            let w = 10;
            if (f.rarity === '稀有') w = 5;
            else if (f.rarity === '史诗') w = 2;
            else if (f.rarity === '传说') w = 0.8;
            return w * (1 + rBonus);
        });
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (let i = 0; i < pool.length; i++) {
            r -= weights[i];
            if (r <= 0) {
                const base = pool[i];
                const lenR = getFishLenRange(base.rarity);
                const len = +(lenR.min + Math.random() * (lenR.max - lenR.min) * (1 + bait.lenBonus)).toFixed(1);
                const weight = +(base.minW + Math.random() * (base.maxW - base.minW) * (1 + bait.weightBonus)).toFixed(2);
                return { ...base, actualLen: len, actualWeight: weight };
            }
        }
        const base = pool[0];
        const lenR = getFishLenRange(base.rarity);
        const len = +(lenR.min + Math.random() * (lenR.max - lenR.min) * (1 + bait.lenBonus)).toFixed(1);
        const weight = +(base.minW + Math.random() * (base.maxW - base.minW) * (1 + bait.weightBonus)).toFixed(2);
        return { ...base, actualLen: len, actualWeight: weight };
    }

    function pickRandomTrash() {
        return { ...TRASHES[Math.floor(Math.random() * TRASHES.length)] };
    }

    function calcFishPrice(fish) {
        if (!fish || fish.isTrash) return 2;
        const rarityMulti = { '普通': 1.6, '稀有': 2.8, '史诗': 5.2, '传说': 9 };
        const rmul = rarityMulti[fish.rarity] || 1;
        const lenBonus = 1 + (fish.actualLen - 20) * 0.025;
        const weightBonus = 1 + (fish.actualWeight - 0.5) * 0.18;
        return Math.max(1, Math.floor(fish.basePrice * rmul * lenBonus * weightBonus));
    }

    function renderFish() {
        if (_renderFishRaf) return;
        _renderFishRaf = requestAnimationFrame(() => {
            _renderFishRaf = null;
            _doRenderFish();
        });
    }
    function _doRenderFish() {
        if (currentTab !== 'fish') return;
        const fb = fishBody();
        if (!fb) return;
        const savedScrollTop = fb.scrollTop;

        const isPlaying = fishState.isPlaying;
        const rod = RODS.find(r => r.key === fishState.currentRod) || RODS[0];
        const bait = BAITS.find(b => b.key === fishState.currentBait) || BAITS[0];

        let gameHtml = '';
        if (isPlaying && !fishState.hasBitten) {
            gameHtml = `
                <div class="fish-game-wrap">
                    <div class="fish-pond-name">🌊 垂钓中${'.'.repeat((Math.floor(performance.now() / 500) % 3) + 1)}</div>
                    <div class="fish-wait-indicator">
                        <div class="fish-wait-ripple"></div>
                        <div class="fish-wait-ripple" style="animation-delay:0.4s"></div>
                        <div class="fish-wait-ripple" style="animation-delay:0.8s"></div>
                    </div>
                    <div class="fish-hint">浮漂静静等待中，鱼儿随时可能上钩...</div>
                    <div class="fish-controls">
                        <button class="fish-btn warn" id="fish-quit-btn">🚫 收杆</button>
                    </div>
                </div>`;
        } else if (isPlaying && fishState.hasBitten) {
            const f = fishState.currentFish;
            const isTrash = f && f.isTrash;
            // 用面板容器真实宽度判断，而非 window.innerWidth（嵌入环境下后者是外层窗口宽度）
            const panelEl = p.document.getElementById('farm-panel');
            const panelW = panelEl ? panelEl.getBoundingClientRect().width : 380;
            // 上钩时自动扩宽面板到560px，给右侧操作区留足空间
            if (panelEl && !isTrash) {
                panelEl.style.width = Math.max(panelW, 560) + 'px';
                panelEl._fishExpanded = true;
            }
            const usePcLayout = !isTrash;
            const pcClass = usePcLayout ? ' pc-bitten' : '';
            if (usePcLayout) {
                // PC横向布局：竖条在左，右侧放标题/进度/按钮/提示
                gameHtml = `
                <div class="fish-game-wrap${pcClass}">
                    <div class="fish-bar-container" id="fish-bar-container">
                        <div class="fish-bar-fill" id="fish-bar-fill"></div>
                        <div class="fish-target" id="fish-target"></div>
                        <div class="fish-bobber" id="fish-bobber"></div>
                    </div>
                    <div class="fish-right-panel">
                        <div class="fish-pond-name">${f ? f.icon + ' ' + f.name : '???'}</div>
                        <div class="fish-progress-outer"><div class="fish-progress-inner" id="fish-progress-inner"></div></div>
                        <div class="fish-controls">
                            <button class="fish-btn" id="fish-hold-btn">🎣 点击 / Space 提竿</button>
                        </div>
                        <div class="fish-controls">
                            <button class="fish-btn warn" id="fish-quit-btn">🚫 放弃</button>
                        </div>
                        <div class="fish-hint">把鱼（黄色区域）保持在绿色浮标内<br>🖱️ 点击竖条 · ⌨️ 空格 / ↑ 键提竿</div>
                    </div>
                </div>`;
            } else {
                // 移动端 / 垃圾：原竖排布局
                gameHtml = `
                <div class="fish-game-wrap">
                    <div class="fish-pond-name">${isTrash ? '🗑️ 有东西上钩了' : (f ? f.icon + ' ' + f.name : '???')}</div>
                    <div class="fish-bar-container" id="fish-bar-container">
                        <div class="fish-bar-fill" id="fish-bar-fill"></div>
                        <div class="fish-target" id="fish-target"></div>
                        <div class="fish-bobber" id="fish-bobber"></div>
                    </div>
                    <div class="fish-progress-outer"><div class="fish-progress-inner" id="fish-progress-inner"></div></div>
                    <div class="fish-controls">
                        <button class="fish-btn" id="fish-hold-btn">${isTrash ? '收杆' : '疯狂点击提竿'}</button>
                        <button class="fish-btn warn" id="fish-quit-btn">🚫 放弃</button>
                    </div>
                    <div class="fish-hint">${isTrash ? '好像不是鱼...' : '疯狂点击让浮标上升，把鱼保持在绿色区域内'}</div>
                </div>`;
            }
        }

        // 库存
        const shelterNames = Object.keys(currentShelters);
        const invHtml = fishState.inventory.slice(0, 8).map((it, i) => `
            <div class="fish-inv-item" data-inv="${i}">
                <span class="fish-inv-icon">${it.icon}</span>
                <span class="fish-inv-name">${it.name}</span>
                <span class="fish-inv-price">¥${it.price}</span>
                ${shelterNames.length > 0 ? `<button class="fish-inv-store" data-store="${i}" title="存入庇护所">📦</button>` : ''}
            </div>
        `).join('');

        const rc = fishState.records;
        const longestHtml = rc.longest
            ? `<div class="fish-record-stat" style="position:relative;">📏 最长<button class="fish-btn" data-reset-record="longest" style="position:absolute;top:2px;right:2px;padding:1px 4px;font-size:10px;line-height:1;">×</button><br><span class="fish-record-val">${rc.longest.icon} ${rc.longest.name}<br>${rc.longest.length}cm</span><span class="fish-record-time">${timeAgo(rc.longest.time)}</span></div>`
            : `<div class="fish-record-stat">📏 最长<br><span class="fish-record-val">--</span></div>`;
        const heaviestHtml = rc.heaviest
            ? `<div class="fish-record-stat" style="position:relative;">⚖️ 最重<button class="fish-btn" data-reset-record="heaviest" style="position:absolute;top:2px;right:2px;padding:1px 4px;font-size:10px;line-height:1;">×</button><br><span class="fish-record-val">${rc.heaviest.icon} ${rc.heaviest.name}<br>${rc.heaviest.weight}kg</span><span class="fish-record-time">${timeAgo(rc.heaviest.time)}</span></div>`
            : `<div class="fish-record-stat">⚖️ 最重<br><span class="fish-record-val">--</span></div>`;
        const bestHtml = rc.bestQuality
            ? `<div class="fish-record-stat" style="position:relative;">👑 最佳<button class="fish-btn" data-reset-record="bestQuality" style="position:absolute;top:2px;right:2px;padding:1px 4px;font-size:10px;line-height:1;">×</button><br><span class="fish-record-val">${rc.bestQuality.icon} ${rc.bestQuality.name}<br>${rc.bestQuality.rarity}</span><span class="fish-record-time">${timeAgo(rc.bestQuality.time)}</span></div>`
            : `<div class="fish-record-stat">👑 最佳<br><span class="fish-record-val">--</span></div>`;

        const logHtml = fishState.log.slice(0, 100).map((l, i) => `
            <div class="fish-log-entry" style="justify-content:space-between;align-items:center;">
                <span style="display:flex;gap:6px;overflow:hidden;"><span class="fish-log-time">${timeAgo(l.time)}</span><span class="fish-log-text" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${l.text}</span></span>
                <button class="fish-btn" data-del-log="${i}" style="padding:1px 6px;font-size:10px;line-height:1;flex-shrink:0;">×</button>
            </div>
        `).join('');

        fb.innerHTML = `
            <div class="fish-header">
                <div class="fish-header-left">
                    <span class="fish-money">💰 ¥${fishState.money}</span>
                </div>
                <div class="fish-header-right">
                    <span class="fish-gear" title="${rod.desc}">${rod.icon} ${rod.name}</span>
                    <span class="fish-gear" title="${bait.desc}">${bait.icon} ${bait.name}</span>
                </div>
            </div>
            <div class="fish-action-bar">
                <button class="fish-btn primary" id="fish-start-btn" ${isPlaying ? 'disabled' : ''}>
                    ${isPlaying ? '垂钓中...' : '🎣 开始钓鱼'}
                </button>
                <button class="fish-btn" id="fish-shop-btn">🏪 渔具店</button>
                <button class="fish-btn warn" id="fish-sell-all-btn">💴 清仓卖出</button>
            </div>
            ${gameHtml}
            <div class="fish-inv-box">
                <div class="fish-inv-title" style="display:flex;justify-content:space-between;align-items:center;">
                    <span>🎒 背包 (${fishState.inventory.length})</span>
                    ${shelterNames.length > 0 ? `<button class="fish-btn" id="fish-store-all-btn" style="padding:2px 8px;font-size:11px;">📦 全部存入</button>` : ''}
                </div>
                <div style="font-size:11px;color:#71717a;margin-bottom:6px;">💡 点击物品直接卖出</div>
                <div class="fish-inv-grid">${invHtml || '<span style="color:#52525b;font-size:12px;">背包空空如也</span>'}</div>
            </div>
            <div class="fish-record-box">
                <div class="fish-record-title" style="display:flex;justify-content:space-between;align-items:center;">
                    <span>🏆 钓鱼记录 · 共${fishState.totalCaught}条</span>
                    <button class="fish-btn" id="fish-clear-log-btn" style="padding:2px 8px;font-size:11px;">🗑️ 清空</button>
                </div>
                <div class="fish-record-stats">${longestHtml}${heaviestHtml}${bestHtml}</div>
                ${logHtml ? `<div class="fish-log-list">${logHtml}</div>` : '<div style="color:#52525b;font-size:12px;text-align:center;padding:8px;">暂无记录</div>'}
            </div>
        `;
        requestAnimationFrame(() => { fb.scrollTop = Math.min(savedScrollTop, fb.scrollHeight - fb.clientHeight); });

        // DOM 重建后失效旧引用
        _fishElCache = { target: null, bobber: null, progress: null, barFill: null };
        _fishLast = { targetTop: -1, targetH: -1, bobberTop: -1, bobberH: -1, progress: -1, barFill: -1 };
        bindFishEvents();
        if (isPlaying) updateFishVisuals();
    }

    function bindFishEvents() {
        const startBtn = p.document.getElementById('fish-start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => startFishGame());
        }
        const shopBtn = p.document.getElementById('fish-shop-btn');
        if (shopBtn) {
            shopBtn.addEventListener('click', () => openFishShop());
        }
        const sellAllBtn = p.document.getElementById('fish-sell-all-btn');
        if (sellAllBtn) {
            sellAllBtn.addEventListener('click', () => sellAllFish());
        }
        if (fishState.isPlaying && fishState.hasBitten) {
            const holdBtn = p.document.getElementById('fish-hold-btn');
            const bar = p.document.getElementById('fish-bar-container');
            const clickBobber = (e) => {
                if (e && e.cancelable) e.preventDefault();
                if (!fishState.isPlaying || !fishState.hasBitten) return;
                fishState.bobberVel -= 32;
            };
            const addTapHandler = (el, handler) => {
                if (!el) return;
                // 【修复】只注册 pointerdown 一个事件
                // 原代码同时注册 pointerdown + touchstart + mousedown
                // 触摸设备单次点击会依次触发全部三个，导致 bobberVel -= 96（应为 -32）
                // 浮标每次上冲 3 倍速，手动钓鱼无法正常操作
                el.addEventListener('pointerdown', handler);
            };
            addTapHandler(holdBtn, clickBobber);
            addTapHandler(bar, clickBobber);

            // PC端键盘支持：空格 / 上方向键 提竿
            const keyHandler = (e) => {
                if (e.code === 'Space' || e.code === 'ArrowUp') {
                    e.preventDefault();
                    if (fishState.isPlaying && fishState.hasBitten) {
                        fishState.bobberVel -= 32;
                    }
                }
            };
            p.document.addEventListener('keydown', keyHandler);
            // 钓鱼结束后自动移除（通过标记到 fishState 上，stopFishGame 调用时清理）
            fishState._keyHandler = keyHandler;
        }
        const quitBtn = p.document.getElementById('fish-quit-btn');
        if (quitBtn) {
            quitBtn.addEventListener('click', () => {
                if (fishState.isPlaying) {
                    showToast('🚫 已放弃钓鱼');
                    stopFishGame(false, true);
                }
            });
        }
        // 库存点击卖出单件（点击非按钮区域）
        p.document.querySelectorAll('.fish-inv-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.fish-inv-store')) return;
                const idx = parseInt(el.dataset.inv);
                if (!isNaN(idx) && fishState.inventory[idx]) {
                    sellOneFish(idx);
                }
            });
        });
        // 库存单件存入庇护所
        p.document.querySelectorAll('.fish-inv-store').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.store);
                if (!isNaN(idx) && fishState.inventory[idx]) {
                    openStoreFishDialog(idx);
                }
            });
        });
        const storeAllBtn = p.document.getElementById('fish-store-all-btn');
        if (storeAllBtn) {
            storeAllBtn.addEventListener('click', () => openStoreAllDialog());
        }
        const clearLogBtn = p.document.getElementById('fish-clear-log-btn');
        if (clearLogBtn) {
            clearLogBtn.addEventListener('click', () => clearFishRecords());
        }
        // 日志逐条删除
        p.document.querySelectorAll('[data-del-log]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.delLog);
                deleteFishLog(idx);
            });
        });
        // 记录统计单独重置
        p.document.querySelectorAll('[data-reset-record]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const type = btn.dataset.resetRecord;
                resetFishRecord(type);
            });
        });
    }

    function startFishGame() {
        if (fishState.isPlaying) return;
        if (fishAnimId) { cancelAnimationFrame(fishAnimId); fishAnimId = null; }
        if (fishWaitTimeoutId) { clearTimeout(fishWaitTimeoutId); fishWaitTimeoutId = null; }
        fishState.isPlaying = true;
        fishState.hasBitten = false;
        fishState.currentFish = null;
        fishState.catchProgress = 30;
        fishState.bobberPos = 92;
        fishState.bobberVel = 0;
        fishState.bobberLen = 8; // 等待时很小
        fishState.fishPos = 50;
        fishState.fishVel = 0;
        fishState.fishMode = 'idle';
        fishState.fishModeTimer = 0;
        // 随机等待时间：根据鱼饵咬钩率动态调整（好鱼饵等待更短）
        // 蚯蚓(1.0x): 8~25s  面团(1.25x): 6~20s  虾肉(1.6x): 5~16s  仿生(2.0x): 3~12s  魔法(2.8x): 2~8s
        const baitForWait = BAITS.find(b => b.key === fishState.currentBait) || BAITS[0];
        const biteRateFactor = baitForWait.biteRate; // 1.0 ~ 2.8
        const minWaitMs = Math.max(2000, 8000 / biteRateFactor);
        const maxWaitMs = Math.max(8000, 25000 / biteRateFactor);
        const waitMs = minWaitMs + Math.random() * (maxWaitMs - minWaitMs);
        fishState.biteTime = performance.now() + waitMs;
        // setTimeout 做主触发器，requestAnimationFrame 只做 UI 动画，双重保险
        fishWaitTimeoutId = setTimeout(() => {
            fishWaitTimeoutId = null;
            if (fishState.isPlaying && !fishState.hasBitten) {
                doFishBite();
                // 确保 rAF 循环继续（如果之前因异常中断）
                if (!fishAnimId) {
                    fishAnimId = requestAnimationFrame(fishGameLoop);
                }
            }
        }, waitMs);
        renderFish();
        fishAnimId = requestAnimationFrame(fishGameLoop);
    }

    function doFishBite() {
        const bait = BAITS.find(b => b.key === fishState.currentBait) || BAITS[0];
        // 鱼饵影响上钩率：基础60%是鱼，40%是垃圾；好鱼饵提高鱼率
        const isFish = Math.random() < (0.55 + bait.biteRate * 0.12);
        if (isFish) {
            const fish = pickRandomFish();
            fishState.currentFish = fish;
        } else {
            const trash = pickRandomTrash();
            fishState.currentFish = { ...trash, isTrash: true, difficulty: 1, rarity: '垃圾', color: '#6b7280' };
        }
        fishState.hasBitten = true;
        fishState.biteStartTime = performance.now(); // 记录咬钩时刻，用于开局保护计时
        const rod = RODS.find(r => r.key === fishState.currentRod) || RODS[0];
        fishState.bobberLen = rod.bobberLen;
        fishState.bobberPos = 50;
        fishState.bobberVel = 0;
        fishState.catchProgress = 30;
        if (!fishState.currentFish.isTrash) {
            fishState.fishLen = fishState.currentFish.actualLen;
            fishState.fishPos = 20 + Math.random() * 60;
            fishState.fishVel = 0;
            fishState.fishMode = 'idle';
            // 初始静止时间按稀有度设置：普通鱼0.6~1.2s，稀有0.4~0.9s，史诗0.2~0.6s，传说0.1~0.4s
            const _rarityTimerBase = { '普通': [0.6, 0.6], '稀有': [0.4, 0.5], '史诗': [0.2, 0.4], '传说': [0.1, 0.3] };
            const _tb = _rarityTimerBase[fishState.currentFish.rarity] || [0.3, 0.5];
            fishState.fishModeTimer = _tb[0] + Math.random() * _tb[1];
        } else {
            // 垃圾不会动，直接成功
            fishState.fishLen = 30;
            fishState.fishPos = 50;
            fishState.fishVel = 0;
            fishState.fishMode = 'idle';
        }
        renderFish();
    }

    function stopFishGame(success, isQuit = false) {
        fishState.isPlaying = false;
        fishState.hasBitten = false;
        // 恢复面板宽度（如果钓鱼时扩宽过）
        const panelEl = p.document.getElementById('farm-panel');
        if (panelEl && panelEl._fishExpanded) {
            panelEl.style.width = farmConfig.panelWidth;
            panelEl._fishExpanded = false;
        }
        // 清理键盘监听
        if (fishState._keyHandler) {
            p.document.removeEventListener('keydown', fishState._keyHandler);
            fishState._keyHandler = null;
        }
        if (fishAnimId) {
            cancelAnimationFrame(fishAnimId);
            fishAnimId = null;
        }
        if (fishWaitTimeoutId) {
            clearTimeout(fishWaitTimeoutId);
            fishWaitTimeoutId = null;
        }
        const f = fishState.currentFish;
        if (success && f) {
            const price = calcFishPrice(f);
            const item = {
                type: f.isTrash ? 'trash' : 'fish',
                name: f.name,
                icon: f.icon,
                rarity: f.rarity || '垃圾',
                weight: f.actualWeight || 0,
                length: f.actualLen || 0,
                price,
                time: Date.now(),
            };
            fishState.inventory.unshift(item);
            if (!f.isTrash) {
                fishState.totalCaught++;
                if (!fishState.bestFish || f.difficulty > fishState.bestFish.difficulty) {
                    fishState.bestFish = f;
                }
                const now = Date.now();
                if (!fishState.records.longest || f.actualLen > fishState.records.longest.length) {
                    fishState.records.longest = { name: f.name, icon: f.icon, length: f.actualLen, time: now };
                }
                if (!fishState.records.heaviest || f.actualWeight > fishState.records.heaviest.weight) {
                    fishState.records.heaviest = { name: f.name, icon: f.icon, weight: f.actualWeight, time: now };
                }
                const rarityScore = { '传说': 4, '史诗': 3, '稀有': 2, '普通': 1 };
                const curScore = rarityScore[f.rarity] || 0;
                const bestScore = rarityScore[fishState.records.bestQuality?.rarity] || 0;
                if (curScore > bestScore) {
                    fishState.records.bestQuality = { name: f.name, icon: f.icon, rarity: f.rarity, time: now };
                }
                fishState.log.unshift({ time: now, text: `🎣 钓到了 ${f.icon} ${f.name}（${f.rarity} · ${f.actualWeight}kg · ¥${price}）` });
                showToast(`🎉 钓到了 ${f.icon}${f.name}！`);
            } else {
                fishState.log.unshift({ time: Date.now(), text: `🗑️ 钓到了 ${f.icon} ${f.name}` });
                showToast(`🗑️ 钓到了${f.icon}${f.name}...`);
            }
            showFishChoice(item);
        } else {
            if (f) {
                fishState.log.unshift({ time: Date.now(), text: `❌ ${f.icon} ${f.name} 跑掉了...` });
            }
            if (!isQuit) {
                showToast('😢 鱼跑掉了...');
            }
            fishState.currentFish = null;
        }
        saveFishState();
        renderFish();
    }

    // 钓到后弹出选择：卖出 / 存入背包
    function showFishChoice(item) {
        p.document.querySelectorAll('.fish-choice-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'fish-choice-popup';
        if (panel.classList.contains('farm-force-light')) overlay.classList.add('fish-choice-light');

        const isTrash = item.type === 'trash';
        const detail = isTrash
            ? `<div style="font-size:13px;color:#a1a1aa;margin-top:4px;">${item.name}</div>`
            : `<div style="font-size:13px;color:#a1a1aa;margin-top:4px;">${item.rarity} · ${item.length}cm · ${item.weight}kg</div>`;

        overlay.innerHTML = `
            <div class="fish-choice-card">
                <div class="fish-choice-icon">${item.icon}</div>
                <div class="fish-choice-name">${isTrash ? '钓到了垃圾' : '钓到了 ' + item.name}</div>
                ${detail}
                <div class="fish-choice-price">估价 ¥${item.price}</div>
                <div class="fish-choice-actions">
                    <button class="fish-choice-btn sell" id="fc-sell">💴 卖出 (+¥${item.price})</button>
                    <button class="fish-choice-btn store" id="fc-store">✅ 关闭</button>
                </div>
            </div>`;
        appendOverlay(overlay);

        overlay.querySelector('#fc-sell').addEventListener('click', () => {
            fishState.money += item.price;
            const idx = fishState.inventory.indexOf(item);
            if (idx >= 0) fishState.inventory.splice(idx, 1);
            saveFishState();
            showToast(`💴 卖出 ${item.icon}${item.name}，获得 ¥${item.price}`);
            overlay.remove();
            renderFish();
        });
        overlay.querySelector('#fc-store').addEventListener('click', () => {
            overlay.remove();
            renderFish();
        });
    }

    async function storeFishToMvu(item, shelterName) {
        if (!mvuReady) return false;
        try {
            const result = getLatestFullData();
            if (!result) return false;
            const { data, targetMsgId } = result;
            const sd = data.stat_data;
            if (!sd.建筑 || !sd.建筑[shelterName]) return false;
            if (!sd.建筑[shelterName].storage || typeof sd.建筑[shelterName].storage !== 'object') {
                sd.建筑[shelterName].storage = {};
            }
            const key = item.name;
            const existing = sd.建筑[shelterName].storage[key];
            const existingCount = existing ? parseCount(existing.detail || '') : 0;
            const newCount = existingCount + 1;
            sd.建筑[shelterName].storage[key] = {
                detail: `${item.icon} ${item.name}${newCount > 1 ? ' ×' + newCount : ''}`,
                weight: +(item.weight * newCount).toFixed(1),
                category: item.type === 'trash' ? '其他杂物' : '食物与水',
            };
            await Mvu.replaceMvuData(data, { type: 'message', message_id: targetMsgId });
            cachedTargetMsgId = null;
            try {
                if (typeof eventEmit === 'function' && Mvu?.events?.VARIABLE_UPDATE_ENDED) {
                    eventEmit(Mvu.events.VARIABLE_UPDATE_ENDED);
                }
            } catch (e) {}
            return true;
        } catch (e) {
            console.error('[钓鱼] 存入庇护所失败:', e);
            return false;
        }
    }

    function sellOneFish(idx) {
        const item = fishState.inventory[idx];
        if (!item) return;
        fishState.money += item.price;
        fishState.inventory.splice(idx, 1);
        saveFishState();
        showToast(`💴 卖出 ${item.icon}${item.name}，获得 ¥${item.price}`);
        renderFish();
    }

    function sellAllFish() {
        if (fishState.inventory.length === 0) {
            showToast('背包里什么都没有');
            return;
        }
        let total = 0;
        for (const it of fishState.inventory) total += it.price;
        fishState.money += total;
        const count = fishState.inventory.length;
        fishState.inventory = [];
        saveFishState();
        showToast(`💴 清仓卖出 ${count} 件物品，获得 ¥${total}`);
        renderFish();
    }

    async function storeAllFishToShelter(shelterName) {
        const name = shelterName || selectedShelter;
        if (!name) {
            showToast('❌ 没有可用的庇护所');
            return;
        }
        if (fishState.inventory.length === 0) {
            showToast('🎒 背包空空如也');
            return;
        }
        let stored = 0;
        for (const item of [...fishState.inventory]) {
            const ok = await storeFishToMvu(item, name);
            if (ok) {
                stored++;
                const idx = fishState.inventory.indexOf(item);
                if (idx >= 0) fishState.inventory.splice(idx, 1);
            }
        }
        if (stored > 0) {
            saveFishState();
            showToast(`📦 已将 ${stored} 件物品存入 ${name}`);
            renderFish();
            refreshShelters(false);
        } else {
            showToast('❌ 存入失败，请检查庇护所状态');
        }
    }

    function openStoreFishDialog(invIdx) {
        const item = fishState.inventory[invIdx];
        if (!item) return;
        const shelters = Object.keys(currentShelters);
        if (shelters.length === 0) {
            showToast('❌ 没有可用的庇护所');
            return;
        }
        p.document.querySelectorAll('.fish-store-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'fish-store-popup';
        if (panel.classList.contains('farm-force-light')) overlay.classList.add('fish-store-light');

        const listHtml = shelters.map(name => `
            <div class="fish-store-option" data-shelter="${name}">
                <span style="font-size:18px;">🏠</span>
                <span style="flex:1;font-size:14px;color:#d4d4d8;">${name}</span>
                <span style="font-size:12px;color:#a1a1aa;">存入</span>
            </div>
        `).join('');

        overlay.innerHTML = `
            <div class="fish-store-card">
                <div style="font-size:15px;font-weight:700;color:#4ade80;margin-bottom:12px;text-align:center;">📦 将 ${item.icon}${item.name} 存入</div>
                <div class="fish-store-list">${listHtml}</div>
                <button class="fish-shop-close" id="fish-store-close" style="margin-top:10px;">取消</button>
            </div>`;
        appendOverlay(overlay);

        overlay.querySelector('#fish-store-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.fish-store-card')) overlay.remove(); });
        overlay.querySelectorAll('.fish-store-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const shelterName = opt.dataset.shelter;
                const ok = await storeFishToMvu(item, shelterName);
                if (ok) {
                    fishState.inventory.splice(invIdx, 1);
                    showToast(`📦 已存入 ${shelterName}`);
                    renderFish();
                    refreshShelters(false);
                } else {
                    showToast('❌ 存入失败');
                }
                overlay.remove();
            });
        });
    }

    function openStoreAllDialog() {
        const shelters = Object.keys(currentShelters);
        if (shelters.length === 0) {
            showToast('❌ 没有可用的庇护所');
            return;
        }
        if (fishState.inventory.length === 0) {
            showToast('🎒 背包空空如也');
            return;
        }
        p.document.querySelectorAll('.fish-store-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'fish-store-popup';
        if (panel.classList.contains('farm-force-light')) overlay.classList.add('fish-store-light');

        const listHtml = shelters.map(name => `
            <div class="fish-store-option" data-shelter="${name}">
                <span style="font-size:18px;">🏠</span>
                <span style="flex:1;font-size:14px;color:#d4d4d8;">${name}</span>
                <span style="font-size:12px;color:#a1a1aa;">全部存入</span>
            </div>
        `).join('');

        overlay.innerHTML = `
            <div class="fish-store-card">
                <div style="font-size:15px;font-weight:700;color:#4ade80;margin-bottom:12px;text-align:center;">📦 将全部 ${fishState.inventory.length} 件物品存入</div>
                <div class="fish-store-list">${listHtml}</div>
                <button class="fish-shop-close" id="fish-store-close" style="margin-top:10px;">取消</button>
            </div>`;
        appendOverlay(overlay);

        overlay.querySelector('#fish-store-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.fish-store-card')) overlay.remove(); });
        overlay.querySelectorAll('.fish-store-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const shelterName = opt.dataset.shelter;
                overlay.remove();
                await storeAllFishToShelter(shelterName);
            });
        });
    }

    function deleteFishLog(index) {
        if (index < 0 || index >= fishState.log.length) return;
        fishState.log.splice(index, 1);
        saveFishState();
        renderFish();
    }

    function resetFishRecord(type) {
        if (!fishState.records[type]) return;
        const label = type === 'longest' ? '最长' : type === 'heaviest' ? '最重' : '最佳品质';
        if (!confirm(`确定重置"${label}"记录吗？`)) return;
        fishState.records[type] = null;
        saveFishState();
        renderFish();
        showToast('🗑️ 记录已重置');
    }

    function clearFishRecords() {
        if (!confirm('确定清空所有钓鱼记录吗？\n\n日志、最长、最重、最佳等记录将全部被重置。')) return;
        fishState.log = [];
        fishState.records = { longest: null, heaviest: null, bestQuality: null };
        fishState.totalCaught = 0;
        fishState.bestFish = null;
        saveFishState();
        renderFish();
        showToast('🗑️ 钓鱼记录已清空');
    }

    function openFishShop() {
        p.document.querySelectorAll('.fish-shop-popup').forEach(el => el.remove());
        const overlay = p.document.createElement('div');
        overlay.className = 'fish-shop-popup';
        if (panel.classList.contains('farm-force-light')) overlay.classList.add('fish-shop-light');

        const rodHtml = RODS.map(r => {
            const owned = fishState.currentRod === r.key;
            const canBuy = fishState.money >= r.price;
            return `
                <div class="fish-shop-item${owned ? ' owned' : ''}">
                    <div class="fish-shop-item-icon">${r.icon}</div>
                    <div class="fish-shop-item-info">
                        <div class="fish-shop-item-name">${r.name}</div>
                        <div class="fish-shop-item-desc">${r.desc} · 浮标+${r.bobberLen}%</div>
                    </div>
                    <button class="fish-shop-buy-btn${owned ? ' owned' : ''}" data-rod="${r.key}" ${owned || !canBuy ? 'disabled' : ''}>
                        ${owned ? '已装备' : (r.price === 0 ? '免费' : '¥' + r.price)}
                    </button>
                </div>`;
        }).join('');

        const baitHtml = BAITS.map(b => {
            const active = fishState.currentBait === b.key;
            const canBuy = fishState.money >= b.price;
            const bonusText = b.rarityBonus > 0
                ? `品质+${Math.round(b.rarityBonus * 100)}% 尺寸+${Math.round(b.lenBonus * 100)}%`
                : '无加成';
            return `
                <div class="fish-shop-item${active ? ' owned' : ''}">
                    <div class="fish-shop-item-icon">${b.icon}</div>
                    <div class="fish-shop-item-info">
                        <div class="fish-shop-item-name">${b.name}</div>
                        <div class="fish-shop-item-desc">${b.desc} · 上钩率×${b.biteRate} · ${bonusText}</div>
                    </div>
                    <button class="fish-shop-buy-btn${active ? ' owned' : ''}" data-bait="${b.key}" ${active || !canBuy ? 'disabled' : ''}>
                        ${active ? '使用中' : (b.price === 0 ? '免费' : '¥' + b.price)}
                    </button>
                </div>`;
        }).join('');

        overlay.innerHTML = `
            <div class="fish-shop-card">
                <div class="fish-shop-header">
                    <span>🏪 渔具店</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="fish-shop-money">💰 ¥${fishState.money}</span>
                        <button class="ranch-popup-close" id="fish-shop-close" title="关闭">✕</button>
                    </div>
                </div>
                <div class="fish-shop-section">
                    <div class="fish-shop-section-title">🎣 钓竿</div>
                    ${rodHtml}
                </div>
                <div class="fish-shop-section">
                    <div class="fish-shop-section-title">🪱 鱼饵</div>
                    ${baitHtml}
                </div>
                <button class="fish-shop-close" id="fish-shop-close">关闭</button>
            </div>`;
        appendOverlay(overlay);

        overlay.querySelector('#fish-shop-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#fish-shop-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (!e.target.closest('.fish-shop-card')) overlay.remove(); });

        overlay.querySelectorAll('[data-rod]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.rod;
                const rod = RODS.find(r => r.key === key);
                if (!rod || fishState.currentRod === key) return;
                if (fishState.money < rod.price) return;
                fishState.money -= rod.price;
                fishState.currentRod = key;
                saveFishState();
                showToast(`🎣 购买了 ${rod.icon}${rod.name}`);
                overlay.remove();
                openFishShop();
                renderFish();
            });
        });
        overlay.querySelectorAll('[data-bait]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.bait;
                const bait = BAITS.find(b => b.key === key);
                if (!bait || fishState.currentBait === key) return;
                if (fishState.money < bait.price) return;
                fishState.money -= bait.price;
                fishState.currentBait = key;
                saveFishState();
                showToast(`🪱 购买了 ${bait.icon}${bait.name}`);
                overlay.remove();
                openFishShop();
                renderFish();
            });
        });
    }

    function fishGameLoop() {
        if (!fishState.isPlaying) return;
        try {
            const dt = 0.016;

            // ===== 等待上钩阶段 =====
            // 触发由 setTimeout 负责，这里只做动画循环保活
            if (!fishState.hasBitten) {
                fishAnimId = requestAnimationFrame(fishGameLoop);
                return;
            }

            const f = fishState.currentFish;
            if (!f) {
                fishAnimId = requestAnimationFrame(fishGameLoop);
                return;
            }

            // 垃圾不会动，自动缓慢成功
            if (f.isTrash) {
                fishState.catchProgress += 1.2 * dt * 60;
                updateFishVisuals();
                if (fishState.catchProgress >= 100) {
                    stopFishGame(true);
                    return;
                }
                fishAnimId = requestAnimationFrame(fishGameLoop);
                return;
            }

            // ===== 鱼的游动状态机 =====
            fishState.fishModeTimer -= dt;
            if (fishState.fishModeTimer <= 0) {
            // 切换状态：随机选择下一个行为（按稀有度调整停留时长）
                const r = Math.random();
                const diffFactor = f.difficulty * 0.08; // 难度越高越活跃
                // 各稀有度的状态持续时间：普通鱼慢悠悠，传说鱼疯狂乱窜
                const _rarityDur = { '普通': [0.5, 1.0], '稀有': [0.35, 0.7], '史诗': [0.2, 0.5], '传说': [0.12, 0.3] };
                const _dur = _rarityDur[f.rarity] || [0.3, 0.6];
                const _randDur = () => _dur[0] + Math.random() * _dur[1];
                if (r < 0.25 - diffFactor * 0.1) {
                    // 停着
                    fishState.fishMode = 'idle';
                    fishState.fishModeTimer = _randDur() * 1.2; // 静止期略长
                    fishState.fishVel *= 0.3;
                } else if (r < 0.55) {
                    // 缓慢上浮
                    fishState.fishMode = 'up';
                    fishState.fishModeTimer = _randDur();
                    fishState.fishVel = -(12 + Math.random() * 18 + diffFactor * 8);
                } else if (r < 0.80 + diffFactor * 0.1) {
                    // 缓慢下沉
                    fishState.fishMode = 'down';
                    fishState.fishModeTimer = _randDur();
                    fishState.fishVel = 12 + Math.random() * 18 + diffFactor * 8;
                } else {
                    // 突然冲刺（难度越高越容易出现，传说鱼冲刺时间最短最快）
                    fishState.fishMode = 'dash';
                    fishState.fishModeTimer = _dur[0] * 0.5 + Math.random() * _dur[0] * 0.5;
                    fishState.fishVel = (Math.random() < 0.5 ? -1 : 1) * (35 + Math.random() * 35 + diffFactor * 20);
                }
            }

            // 根据模式微调速度（idle 时逐渐减速）
            if (fishState.fishMode === 'idle') {
                fishState.fishVel *= 0.92;
            }

            // 更新鱼位置
            fishState.fishPos += fishState.fishVel * dt;
            // clamp
            fishState.fishPos = Math.max(fishState.fishLen / 2, Math.min(100 - fishState.fishLen / 2, fishState.fishPos));
            // 撞边反弹
            if (fishState.fishPos <= fishState.fishLen / 2 + 1) {
                fishState.fishVel = Math.abs(fishState.fishVel) * 0.5;
            }
            if (fishState.fishPos >= 100 - fishState.fishLen / 2 - 1) {
                fishState.fishVel = -Math.abs(fishState.fishVel) * 0.5;
            }

            // ===== 滑块物理（点击冲量模式）=====
            const gravity = 85;   // 重力加速度
            const damping = 0.96; // 空气阻尼
            fishState.bobberVel += gravity * dt;
            fishState.bobberVel *= damping;
            fishState.bobberPos += fishState.bobberVel * dt;
            // clamp 滑块
            fishState.bobberPos = Math.max(fishState.bobberLen / 2, Math.min(100 - fishState.bobberLen / 2, fishState.bobberPos));

            // ===== 重叠判定 =====
            const fishTop = fishState.fishPos - fishState.fishLen / 2;
            const fishBot = fishState.fishPos + fishState.fishLen / 2;
            const bobTop = fishState.bobberPos - fishState.bobberLen / 2;
            const bobBot = fishState.bobberPos + fishState.bobberLen / 2;
            const overlap = Math.max(0, Math.min(fishBot, bobBot) - Math.max(fishTop, bobTop));
            const isInside = overlap > 2;

            // ===== 开局保护（咬钩后前1.5秒进度不会下降，给玩家反应时间）=====
            const _biteElapsed = (performance.now() - fishState.biteStartTime) / 1000;
            const _protected = _biteElapsed < 1.5;

            // ===== 进度变化 =====
            // 命中加速：稳定在0.32~0.40（难度越高稍快，但差距缩小，可玩性更好）
            // 脱离减速：普通鱼更宽松，传说鱼仍有压迫但给够反应时间（最快~2.5s才脱钩）
            if (isInside) {
                fishState.catchProgress += (0.32 + f.difficulty * 0.012) * dt * 60;
            } else if (!_protected) {
                fishState.catchProgress -= (0.10 + f.difficulty * 0.018) * dt * 60;
            }
            fishState.catchProgress = Math.max(0, Math.min(100, fishState.catchProgress));

            // 更新视觉
            updateFishVisuals();

            // 胜负判定
            if (fishState.catchProgress >= 100) {
                stopFishGame(true);
                return;
            }
            if (fishState.catchProgress <= 0) {
                stopFishGame(false);
                return;
            }

            fishAnimId = requestAnimationFrame(fishGameLoop);
        } catch (e) {
            console.error('[钓鱼] 游戏循环异常:', e);
            if (fishState.isPlaying) {
                fishAnimId = requestAnimationFrame(fishGameLoop);
            }
        }
    }

    function updateFishVisuals() {
        const c = _fishElCache;
        if (!c.target || !c.bobber || !c.progress) {
            c.target = p.document.getElementById('fish-target');
            c.bobber = p.document.getElementById('fish-bobber');
            c.progress = p.document.getElementById('fish-progress-inner');
            c.barFill = p.document.getElementById('fish-bar-fill');
            if (!c.target || !c.bobber || !c.progress) return;
        }

        const fishTop = +(fishState.fishPos - fishState.fishLen / 2).toFixed(2);
        const bobTop = +(fishState.bobberPos - fishState.bobberLen / 2).toFixed(2);
        const cp = +(fishState.catchProgress).toFixed(2);
        const l = _fishLast;

        if (fishTop !== l.targetTop) { c.target.style.top = fishTop + '%'; l.targetTop = fishTop; }
        if (fishState.fishLen !== l.targetH) { c.target.style.height = fishState.fishLen + '%'; l.targetH = fishState.fishLen; }
        if (bobTop !== l.bobberTop) { c.bobber.style.top = bobTop + '%'; l.bobberTop = bobTop; }
        if (fishState.bobberLen !== l.bobberH) { c.bobber.style.height = fishState.bobberLen + '%'; l.bobberH = fishState.bobberLen; }
        if (cp !== l.progress) {
            c.progress.style.width = cp + '%';
            c.progress.className = 'fish-progress-inner' + (cp < 25 ? ' fail' : '');
            l.progress = cp;
        }
        if (c.barFill && cp !== l.barFill) { c.barFill.style.height = cp + '%'; l.barFill = cp; }
    }

    // ==================== 种植交互 ====================
    p._farmPlant = function (idx) {
        p.document.querySelectorAll('.crop-picker-overlay').forEach(el => el.remove());

        const overlay = p.document.createElement('div');
        overlay.className = 'crop-picker-overlay';

        const picker = p.document.createElement('div');
        picker.className = 'crop-picker';
        if (panel.classList.contains('farm-force-light')) picker.classList.add('farm-picker-light');

        let optionsHtml = `<div class="crop-picker-title"><span>🌱 选择作物 <span style="font-size:12px;color:#facc15;margin-left:8px;">💰 ¥${fishState.money}</span></span><button class="ranch-popup-close" id="crop-picker-close" title="关闭">✕</button></div><div class="crop-picker-list">`;
        Object.entries(CROPS).forEach(([name, crop]) => {
            const canBuy = fishState.money >= crop.seedPrice;
            optionsHtml += `
                <div class="crop-option" data-crop="${name}" style="${!canBuy ? 'opacity:0.45;pointer-events:none;' : ''}">
                    <span class="crop-option-icon">${crop.icon}</span>
                    <div class="crop-option-info">
                        <div class="crop-option-name">${name} <span style="font-size:11px;color:#facc15;">¥${crop.seedPrice}</span></div>
                        <div class="crop-option-meta">${crop.desc} · 产出×${crop.yield} · 抗性${Math.round(crop.resist * 100)}% · 售¥${crop.sellPrice}</div>
                    </div>
                    <span class="crop-option-time">${formatMin(crop.growMin)}</span>
                </div>`;
        });
        optionsHtml += '</div>';
        picker.innerHTML = optionsHtml;
        overlay.appendChild(picker);
        picker.querySelector('#crop-picker-close').addEventListener('click', () => overlay.remove());
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            overlay.classList.add('mobile-inside');
            panel.appendChild(overlay);
        } else {
            p.document.body.appendChild(overlay);
        }

        picker.querySelectorAll('.crop-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const cropName = opt.dataset.crop;
                const crop = CROPS[cropName];
                if (!crop) return;
                if (fishState.money < crop.seedPrice) { showToast(`❌ 资金不足，需要 ¥${crop.seedPrice}`); return; }
                fishState.money -= crop.seedPrice;
                await saveFishState();
                // 肥料继承上一茬，水量和健康重置为100
                const prevPlot = farmState.plots[idx];
                const prevFert = prevPlot?.fertilizer ?? 75;
                farmState.plots[idx] = { crop: cropName, plantedAt: Date.now(), water: 100, fertilizer: prevFert, health: 100 };
                await saveState();
                overlay.remove();
                renderPanel();
                showToast(`🌱 种下了${cropName}，花费 ¥${crop.seedPrice}`);
            });
        });

        overlay.addEventListener('click', (e) => {
            if (!e.target.closest('.crop-picker')) overlay.remove();
        });
    };

    // ==================== 定时刷新（后台持续运行）====================
    /**
     * 启动定时器：每5秒执行道具恢复、属性衰减、随机事件检查
     * 注意：即使面板最小化也会继续运行，确保游戏逻辑不中断
     */
    function startTick() {
        if (tickInterval) clearInterval(tickInterval);
        tickInterval = setInterval(() => {
            regenItems();
            decayPlotAttrs();
            checkRandomEvents();
            // 牧场tick
            regenRanchItems();
            decayAnimalAttrs();
            checkRanchEvents();
            checkProductGeneration();
            // 注意：各子函数内部已有 changed 判断，有变化时才会触发 saveState + render
            // 避免无变化时仍每5秒全量重绘DOM
        }, 5000);
    }

    // ==================== 拖拽 & 缩放（Pointer Events 统一处理）====================
    /**
     * 拖拽状态管理
     * 使用 Pointer Events API 统一处理鼠标和触摸事件，避免双触发问题
     */
    let activeEl = null;           // 当前拖拽的元素
    let mode = null;               // 拖拽模式：'drag' | 'resize'
    let startX = 0, startY = 0;    // 拖拽起点坐标
    let startLeft = 0, startTop = 0; // 元素初始位置
    let startWidth = 0, startHeight = 0; // 元素初始尺寸
    let isDragging = false;        // 是否正在拖拽（用于区分点击和拖拽）

    /**
     * 指针按下事件处理
     */
    const onPointerDown = (e) => {
        const el = e.currentTarget._el;
        const m = e.currentTarget._mode;

        activeEl = el;
        mode = m;
        isDragging = false;

        // 拖拽面板时，移除居中 transform 并转换为像素坐标
        if (el === panel && panel.style.transform) {
            const rect = panel.getBoundingClientRect();
            panel.style.transform = 'none';
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
        }

        startX = e.clientX;
        startY = e.clientY;
        startLeft = el.offsetLeft;
        startTop = el.offsetTop;
        startWidth = el.offsetWidth;
        startHeight = el.offsetHeight;

        // 禁用 bubble 的过渡动画，避免拖拽时抖动
        if (el === bubble) {
            bubble.style.transition = 'none';
        }

        // 阻止默认行为（避免文本选择、图片拖拽等）
        e.preventDefault();
    };

    /**
     * 指针移动事件处理
     */
    const onPointerMove = (e) => {
        if (!activeEl) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        // 移动距离超过5px才认为是拖拽（避免误触）
        if (!isDragging && Math.hypot(dx, dy) > 5) {
            isDragging = true;
        }

        if (!isDragging) return;

        if (mode === 'drag') {
            // 拖拽模式：更新位置
            activeEl.style.left = Math.max(0, startLeft + dx) + 'px';
            activeEl.style.top = Math.max(0, startTop + dy) + 'px';
        } else if (mode === 'resize') {
            // 缩放模式：更新尺寸
            activeEl.style.width = Math.max(300, startWidth + dx) + 'px';
            activeEl.style.height = Math.max(400, startHeight + dy) + 'px';
        }
    };

    /**
     * 指针释放事件处理
     */
    const onPointerUp = () => {
        if (!activeEl) return;

        // 保存位置/尺寸到配置
        if (activeEl === bubble) {
            saveConfig({
                bubbleTop: bubble.style.top,
                bubbleLeft: bubble.style.left
            });
            bubble.style.transition = 'transform 0.2s ease';
        } else if (activeEl === panel) {
            saveConfig({
                panelLeft: panel.style.left,
                panelTop: panel.style.top,
                panelWidth: panel.style.width,
                panelHeight: panel.style.height
            });
        }

        // 如果不是拖拽（只是点击），则切换面板显示状态
        if (activeEl === bubble && !isDragging) {
            togglePanel();
        }

        activeEl = null;
        mode = null;
        isDragging = false;
    };

    /**
     * 切换面板显示/隐藏
     */
    function togglePanel() {
        const showing = panel.style.display !== 'none';
        panel.style.display = showing ? 'none' : 'flex';
        farmConfig.isMinimized = showing;
        saveConfig();

        if (showing) {
            // 关闭面板时停止钓鱼
            if (fishState.isPlaying) stopFishGame(false);
        } else {
            // 根据当前 tab 渲染对应视图
            switchTab(currentTab);
            refreshShelters(true);
            startTick();
            startEventCheck();

            // 移动端用 JS 精确计算居中，避免 CSS transform 在 SillyTavern 容器内失效
            if (window.innerWidth <= 768) {
                panel.style.display = 'flex';
                panel.style.inset = '';
                panel.style.margin = '';
                panel.style.transform = 'none';
                void panel.offsetWidth; // 强制 reflow 拿到实际尺寸
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const pw = panel.offsetWidth || 360;
                const ph = panel.offsetHeight || 480;
                panel.style.left = Math.max(8, Math.round((vw - pw) / 2)) + 'px';
                panel.style.top = Math.max(8, Math.round((vh - ph) / 2)) + 'px';
                panel.style.bottom = '';
            } else {
                panel.style.inset = '';
                panel.style.margin = '';
                panel.style.left = '50%';
                panel.style.top = '50%';
                panel.style.bottom = '';
                panel.style.transform = 'translate(-50%, -50%)';
            }
        }
    }

    /**
     * 注册拖拽/缩放事件
     * @param {HTMLElement} el - 要拖拽的元素
     * @param {HTMLElement} handle - 拖拽手柄（触发区域）
     * @param {string} m - 模式：'drag' | 'resize'
     */
    const registerDragHandle = (el, handle, m) => {
        handle._el = el;
        handle._mode = m;
        handle.addEventListener('pointerdown', onPointerDown);
    };

    // 注册拖拽手柄
    registerDragHandle(panel, p.document.getElementById('farm-drag-handle'), 'drag');
    registerDragHandle(panel, p.document.getElementById('farm-footer'), 'drag');
    registerDragHandle(panel, p.document.getElementById('farm-resizer'), 'resize');
    registerDragHandle(bubble, bubble, 'drag');

    // 全局监听指针移动和释放
    p.document.addEventListener('pointermove', onPointerMove);
    p.document.addEventListener('pointerup', onPointerUp);
    p.document.addEventListener('pointercancel', onPointerUp); // 处理意外中断（如切换应用）

    // ==================== 按钮事件 ====================
    // Tab 切换
    let currentTab = farmConfig.currentTab || 'farm';
    function switchTab(tabName) {
        currentTab = tabName;
        saveConfig({ currentTab });
        const farmBodyEl = p.document.getElementById('farm-body');
        const fishBodyEl = p.document.getElementById('fish-body');
        const ranchBodyEl = p.document.getElementById('ranch-body');
        const cheatBodyEl = p.document.getElementById('cheat-body');
        const tabs = p.document.querySelectorAll('.farm-tab');
        tabs.forEach(t => {
            if (t.dataset.tab === tabName) t.classList.add('active');
            else t.classList.remove('active');
        });
        if (farmBodyEl) farmBodyEl.style.display = tabName === 'farm' ? 'block' : 'none';
        if (fishBodyEl) {
            fishBodyEl.style.display = tabName === 'fish' ? 'flex' : 'none';
            if (tabName === 'fish') renderFish();
        }
        if (ranchBodyEl) {
            if (tabName === 'ranch') {
                ranchBodyEl.style.display = '';
                renderRanchPanel();
            } else {
                ranchBodyEl.style.display = 'none';
            }
        }
        if (cheatBodyEl) {
            cheatBodyEl.style.display = tabName === 'cheat' ? 'flex' : 'none';
            if (tabName === 'cheat') renderCheat();
        }
        if (tabName === 'farm') renderPanel();
    }
    p.document.querySelectorAll('.farm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (fishState.isPlaying && tab.dataset.tab !== 'fish' && tab.dataset.tab !== 'cheat' && tab.dataset.tab !== 'ranch') {
                stopFishGame(false);
            }
            switchTab(tab.dataset.tab);
        });
    });

    // 刷新庇护所列表
    p.document.getElementById('farm-refresh').addEventListener('click', () => refreshShelters(true));

    // 关闭面板按钮
    p.document.getElementById('farm-close')?.addEventListener('click', () => togglePanel());

    // 点击面板外部关闭
    const OVERLAY_CLASSES = ['crop-picker-overlay','crop-detail-popup','harvest-popup','farm-toast','ranch-popup','ranch-animal-picker','ranch-store-popup','fish-shop-popup','fish-store-popup','fish-choice-popup'];
    p.document.addEventListener('click', (e) => {
        if (panel.style.display === 'none') return;
        const path = e.composedPath();
        if (path.includes(panel) || path.includes(bubble)) return;
        if (path.some(el => el.nodeType === 1 && OVERLAY_CLASSES.some(c => el.classList?.contains(c)))) return;
        togglePanel();
    });

    // 主题切换
    const themeBtn = p.document.getElementById('farm-theme-toggle');
    const themeModes = ['dark', 'light'];
    const themeIcons = { dark: '🌑', light: '☀️' };
    let currentTheme = farmConfig.theme || 'dark';

    /**
     * 应用主题样式
     * @param {string} mode - 主题模式：'dark' | 'light'
     */
    function applyTheme(mode) {
        currentTheme = mode;
        panel.classList.remove('farm-force-light');
        bubble.classList.remove('farm-force-light');
        if (mode === 'light') {
            panel.classList.add('farm-force-light');
            bubble.classList.add('farm-force-light');
        }
        themeBtn.textContent = themeIcons[mode];
        themeBtn.title = mode === 'dark' ? '暗色模式（点击切换亮色）' : '亮色模式（点击切换暗色）';
        saveConfig({ theme: mode });
    }
    applyTheme(currentTheme);

    themeBtn.addEventListener('click', () => {
        const nextIdx = (themeModes.indexOf(currentTheme) + 1) % themeModes.length;
        applyTheme(themeModes[nextIdx]);
    });

    // 清空农田
    p.document.getElementById('farm-clear-plots').addEventListener('click', async () => {
        const hasPlots = farmState.plots.some(p => p !== null);
        if (!hasPlots) return;
        farmState.plots = new Array(PLOT_COUNT).fill(null);
        farmState.events = {};
        await saveState();
        renderPanel();
        showToast('🧹 农田已清空');
    });

    // 停用农场（数据保留，UI 完全移除）
    p.document.getElementById('farm-disable').addEventListener('click', async () => {
        if (confirm('确定停用农场吗？\n\n数据会保留，下次启用酒馆助手时自动恢复。')) {
            await saveState();
            await saveConfig();
            window._farmCleanup();
        }
    });

    // ==================== 监听 MVU 变量更新 ====================
    let mvuEventHandler = null; // 保存事件处理器引用，用于清理

    try {
        if (typeof eventOn === 'function' && Mvu?.events) {
            mvuEventHandler = async () => {
                if (!farmConfig.isMinimized) {
                    await refreshShelters(false);
                }
            };
            eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, mvuEventHandler);
        }
    } catch (e) { console.warn('[小农场] MVU事件监听失败:', e); }

    // ==================== 初始加载（冷读取模式）====================
    await initMvu();
    await loadFishState();

    // 从 MVU 同步数据到本地（跨设备数据统一）
    if (mvuReady) {
        const synced = await syncFromMvu();
        if (synced) {
            selectedShelter = farmConfig.selectedShelter || selectedShelter;
            await loadState(selectedShelter);
            await loadRanchState(selectedShelter);
            console.log('[小农场] 已从 MVU 同步农场数据');
        }
    }

    if (!farmConfig.isMinimized) {
        startTick();
        startEventCheck();
        switchTab(currentTab);
    }

    // 事件委托只需绑定一次（body 元素不会被重建）
    bindItemDragDrop();
    bindPlotClicks();

    console.log('[小农场] 插件已加载 🌻', mvuReady ? '(MVU已连接·冷读取模式)' : '(MVU未连接)');

    // ==================== ⚡ 作弊器模块 ====================
    let cheatAutoFarmEnabled = false;
    let cheatAutoFishEnabled = false;
    let cheatAutoFarmInterval = null;
    let cheatAutoFishInterval = null;

    // ── 一键成熟 ──
    function cheatInstantMature() {
        let count = 0;
        for (let i = 0; i < farmState.plots.length; i++) {
            const plot = farmState.plots[i];
            if (!plot) continue;
            const crop = CROPS[plot.crop];
            if (!crop) continue;
            // 把种植时间倒拨到足够成熟，并清除阻止生长的负面事件
            plot.plantedAt = Date.now() - crop.growMin * 60000 * 1.05;
            delete farmState.events[i];
            count++;
        }
        if (count === 0) { showToast('🌱 没有种植中的作物'); return; }
        saveState();
        renderPanel();
        showToast(`⚡ 已让 ${count} 块田地作物瞬间成熟！`);
    }

    // ── 一键补满道具 ──
    function cheatFillItems() {
        for (const key of Object.keys(ITEMS)) {
            farmState.items[key] = MAX_ITEM_COUNT;
        }
        saveState();
        renderPanel();
        showToast('⚡ 道具已全部补满（每种 ×10）');
    }

    // ── 自动农场单次 tick ──
    async function cheatAutoFarmTick() {
        if (!cheatAutoFarmEnabled) return;
        let changed = false;
        for (let i = 0; i < farmState.plots.length; i++) {
            const plot = farmState.plots[i];
            if (!plot) continue;
            const info = getPlotStage(plot, i);
            if (!info) continue;

            // 自动收获成熟作物
            if (info.stageIdx === 4) {
                const cropInfo = CROPS[plot.crop];
                const y = calcYield(plot, i);
                farmState.plots[i] = null;
                delete farmState.events[i];
                const targets = getStorageTargets();
                if (targets.length > 0) {
                    const target = targets[0];
                    farmState.harvestLog.push({ time: Date.now(), text: `🤖 自动收获 ${cropInfo.icon}${plot.crop} ×${y} → ${target.label}` });
                    storeCrop(plot.crop, y, target);
                } else {
                    farmState.harvestLog.push({ time: Date.now(), text: `🤖 自动收获 ${cropInfo.icon}${plot.crop} ×${y}（无存储位置）` });
                }
                changed = true;
                continue;
            }

            // 自动解除所有负面事件（虫害/干旱/杂草/贫瘠）
            const evt = farmState.events[i];
            if (evt && !evt.resolved) {
                delete farmState.events[i];
                changed = true;
            }

            // 自动补满属性：水量/肥力/健康
            if (plot.water == null || plot.water < 85)      { plot.water = 100;      changed = true; }
            if (plot.fertilizer == null || plot.fertilizer < 85) { plot.fertilizer = 100; changed = true; }
            if (plot.health == null || plot.health < 85)    { plot.health = 100;     changed = true; }
        }

        if (changed) {
            await saveState();
            if (!farmConfig.isMinimized && currentTab === 'farm') renderPanel();
            if (!farmConfig.isMinimized && currentTab === 'cheat') renderCheat();
        }
    }

    function toggleCheatAutoFarm() {
        cheatAutoFarmEnabled = !cheatAutoFarmEnabled;
        if (cheatAutoFarmEnabled) {
            cheatAutoFarmInterval = setInterval(cheatAutoFarmTick, 2000);
            showToast('🤖 自动农场 已开启');
        } else {
            if (cheatAutoFarmInterval) { clearInterval(cheatAutoFarmInterval); cheatAutoFarmInterval = null; }
            showToast('🤖 自动农场 已关闭');
        }
        renderCheat();
    }

    // ── 自动钓鱼单次 tick（50ms 高频轮询）──
    function cheatAutoFishTick() {
        if (!cheatAutoFishEnabled) return;

        // 优先处理钓到后弹出的选择弹窗 → 自动卖出
        const choicePopup = p.document.querySelector('.fish-choice-popup');
        if (choicePopup) {
            const sellBtn = choicePopup.querySelector('#fc-sell');
            if (sellBtn) { sellBtn.click(); return; }
            const closeBtn = choicePopup.querySelector('#fc-store');
            if (closeBtn) { closeBtn.click(); return; }
        }

        // 未在钓鱼中 → 自动开始新一轮
        if (!fishState.isPlaying) {
            startFishGame();
            // 立即跳过等待时间，直接上钩
            if (fishWaitTimeoutId) { clearTimeout(fishWaitTimeoutId); fishWaitTimeoutId = null; }
            if (fishAnimId) { cancelAnimationFrame(fishAnimId); fishAnimId = null; }
            doFishBite();
            fishAnimId = requestAnimationFrame(fishGameLoop);
            return;
        }

        // 等待上钩阶段 → 立即触发
        if (fishState.isPlaying && !fishState.hasBitten) {
            if (fishWaitTimeoutId) { clearTimeout(fishWaitTimeoutId); fishWaitTimeoutId = null; }
            doFishBite();
            if (!fishAnimId) fishAnimId = requestAnimationFrame(fishGameLoop);
            return;
        }

// 已上钩 → 作弊：把浮标锁死在鱼的中心
if (fishState.hasBitten && fishState.currentFish && !fishState.currentFish.isTrash) {
    fishState.bobberPos = fishState.fishPos;
    fishState.bobberVel = 0;
}
    }

    function toggleCheatAutoFish() {
        cheatAutoFishEnabled = !cheatAutoFishEnabled;
        if (cheatAutoFishEnabled) {
            // 切换到钓鱼标签（让 renderFish 初始化 UI）
            if (currentTab !== 'fish' && currentTab !== 'cheat') {
                switchTab('fish');
            } else if (currentTab === 'fish') {
                renderFish();
            }
            cheatAutoFishInterval = setInterval(cheatAutoFishTick, 50);
            showToast('🎣 自动钓鱼 已开启，持续运行中…');
        } else {
            if (cheatAutoFishInterval) { clearInterval(cheatAutoFishInterval); cheatAutoFishInterval = null; }
            if (fishState.isPlaying) stopFishGame(false, true);
            showToast('🎣 自动钓鱼 已关闭');
        }
        renderCheat();
        if (currentTab === 'fish') renderFish();
    }

    // ── 牧场作弊函数 ──
    function cheatAutoRanchTick() {
        if (!ranchCheat.autoRanchEnabled) return;
        let changed = false;
        for (let i = 0; i < ranchState.pens.length; i++) {
            const a = ranchState.pens[i];
            if (!a) continue;
            if ((a.health ?? 100) < 85) { a.health = 100; changed = true; }
            if ((a.hunger ?? 100) < 85) { a.hunger = 100; changed = true; }
            if (ranchState.events[i] && !ranchState.events[i].resolved) { delete ranchState.events[i]; changed = true; }
        }
        if (changed) { saveRanchState(); if (!farmConfig.isMinimized && currentTab === 'ranch') renderRanchPanel(); }
    }

    function cheatAutoSlaughterTick() {
        if (!ranchCheat.autoSlaughterEnabled) return;
        for (let i = 0; i < ranchState.pens.length; i++) {
            const a = ranchState.pens[i];
            if (!a) continue;
            if (getAnimalStage(a)?.stage === 'mature') {
                const ad = ANIMALS[a.animal], ma = getMeatAmount(a);
                if (ranchState.tempBag.length < TEMP_BAG_MAX) {
                    ranchState.tempBag.push({ icon: ad.meat.icon, name: ad.meat.name, count: ma, time: Date.now() });
                    ranchState.log.push({ time: Date.now(), text: `🤖 自动宰杀 ${ad.icon}${a.animal} 获得 ${ad.meat.icon}${ad.meat.name} ×${ma}` });
                    ranchState.pens[i] = { animal: a.animal, placedAt: Date.now(), health: 100, hunger: 100 };
                    delete ranchState.events[i];
                    saveRanchState(); if (!farmConfig.isMinimized && currentTab === 'ranch') renderRanchPanel();
                }
            }
        }
    }

    function toggleCheatAutoRanch() {
        ranchCheat.autoRanchEnabled = !ranchCheat.autoRanchEnabled;
        if (ranchCheat.autoRanchEnabled) {
            ranchCheat.autoRanchInterval = setInterval(cheatAutoRanchTick, 2000);
            showToast('🤖 自律型畜牧矩阵 已开启');
        } else {
            if (ranchCheat.autoRanchInterval) { clearInterval(ranchCheat.autoRanchInterval); ranchCheat.autoRanchInterval = null; }
            showToast('🤖 自律型畜牧矩阵 已关闭');
        }
        renderCheat();
    }

    function toggleCheatAutoSlaughter() {
        ranchCheat.autoSlaughterEnabled = !ranchCheat.autoSlaughterEnabled;
        if (ranchCheat.autoSlaughterEnabled) {
            if (ranchCheat.autoRanchEnabled) { clearInterval(ranchCheat.autoRanchInterval); ranchCheat.autoRanchInterval = null; ranchCheat.autoRanchEnabled = false; }
            ranchCheat.autoSlaughterInterval = setInterval(cheatAutoSlaughterTick, 2000);
            showToast('🔪 精准屠宰协议 已开启');
        } else {
            if (ranchCheat.autoSlaughterInterval) { clearInterval(ranchCheat.autoSlaughterInterval); ranchCheat.autoSlaughterInterval = null; }
            showToast('🔪 精准屠宰协议 已关闭');
        }
        renderCheat();
    }

    function toggleCheatMetabolism() {
        ranchCheat.metabolismEnabled = !ranchCheat.metabolismEnabled;
        showToast(`♾️ 代谢加速力场 ${ranchCheat.metabolismEnabled ? '已开启' : '已关闭'}`);
        renderCheat();
    }

    // ── 渲染作弊器面板 ──
function renderCheat() {
    const cb = p.document.getElementById('cheat-body');
    if (!cb || cb.style.display === 'none') return;

    const baseBtn = `
        display:flex;align-items:center;gap:10px;padding:12px 14px;
        background:rgba(34,197,94,0.07);border:1.5px solid rgba(34,197,94,0.22);
        border-radius:10px;cursor:pointer;transition:all 0.2s;width:100%;box-sizing:border-box;
        font-family:inherit;font-size:13px;color:#4ade80;text-align:left;margin:0;
    `;
    const activeBtn = baseBtn + `
        background:rgba(34,197,94,0.18);border-color:rgba(34,197,94,0.55);
        box-shadow:0 0 14px rgba(34,197,94,0.2);
    `;
    const ranchBaseBtn = `
        display:flex;align-items:center;gap:10px;padding:12px 14px;
        background:rgba(196,149,106,0.07);border:1.5px solid rgba(196,149,106,0.22);
        border-radius:10px;cursor:pointer;transition:all 0.2s;width:100%;box-sizing:border-box;
        font-family:inherit;font-size:13px;color:#d4a574;text-align:left;margin:0;
    `;
    const ranchActiveBtn = ranchBaseBtn + `
        background:rgba(196,149,106,0.18);border-color:rgba(196,149,106,0.55);
        box-shadow:0 0 14px rgba(196,149,106,0.2);
    `;
    const tag = (on) => `
        <span style="
            padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;
            background:${on ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.18)'};
            color:${on ? '#4ade80' : '#f87171'};
            border:1px solid ${on ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.3)'};
            margin-left:auto;flex-shrink:0;
        ">${on ? 'ON' : 'OFF'}</span>
    `;
    const ranchTag = (on) => `
        <span style="
            padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;
            background:${on ? 'rgba(196,149,106,0.22)' : 'rgba(239,68,68,0.18)'};
            color:${on ? '#d4a574' : '#f87171'};
            border:1px solid ${on ? 'rgba(196,149,106,0.4)' : 'rgba(239,68,68,0.3)'};
            margin-left:auto;flex-shrink:0;
        ">${on ? 'ON' : 'OFF'}</span>
    `;
    const desc = (t) => `<div style="font-size:11px;color:#71717a;margin-top:2px;">${t}</div>`;

    cb.innerHTML = `
        <div style="font-size:11px;color:#52525b;letter-spacing:1px;padding-bottom:4px;">👽 泽塔星系农业科技终端</div>

        <div style="font-size:11px;color:#71717a;letter-spacing:0.5px;padding:4px 0 2px;">🌌 作物干涉协议</div>

        <button style="${baseBtn}" id="cheat-mature-btn">
            <span style="font-size:20px;">⏳</span>
            <div>
                <div style="font-weight:600;">量子基因催化</div>
                ${desc('时空扭曲力场，直接将该维度作物推向丰收状态')}
            </div>
        </button>

        <button style="${baseBtn}" id="cheat-fillitems-btn">
            <span style="font-size:20px;">🧬</span>
            <div>
                <div style="font-weight:600;">纳米重组器</div>
                ${desc('跨维度物质重组，瞬间合成满额农业工具')}
            </div>
        </button>

        <button style="${cheatAutoFarmEnabled ? activeBtn : baseBtn}" id="cheat-autofarm-btn">
            <span style="font-size:20px;">🛸</span>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
                    自律型生态矩阵 ${tag(cheatAutoFarmEnabled)}
                </div>
                ${desc('全自动维生、除害、收割，无需人类干预')}
            </div>
        </button>

        <div style="font-size:11px;color:#71717a;letter-spacing:0.5px;padding:8px 0 2px;">🌊 水生生物捕获协议</div>

        <button style="${cheatAutoFishEnabled ? activeBtn : baseBtn}" id="cheat-autofish-btn">
            <span style="font-size:20px;">🌊</span>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
                    引力波诱捕阵列 ${tag(cheatAutoFishEnabled)}
                </div>
                ${desc('锁定水下目标，自动捕获并转换为本地货币')}
            </div>
        </button>

        ${cheatAutoFishEnabled ? `
        <div style="
            padding:8px 12px;border-radius:8px;
            background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.18);
            font-size:11px;color:#52525b;line-height:1.8;
        ">
            🌊 诱捕阵列运行中…<br>
            💰 当前本地货币：<span style="color:#facc15;font-weight:700;">¥${fishState.money}</span>
            🐟 已捕获个体：<span style="color:#4ade80;font-weight:700;">${fishState.totalCaught} 条</span>
            🎒 临时存储仓：<span style="color:#a1a1aa;">${fishState.inventory.length} 件</span>
        </div>` : ''}

        <div style="font-size:11px;color:#71717a;letter-spacing:0.5px;padding:8px 0 2px;">🐄 畜牧生产协议</div>

        <button style="${ranchCheat.autoRanchEnabled ? ranchActiveBtn : ranchBaseBtn}" id="cheat-autoranch-btn">
            <span style="font-size:20px;">🤖</span>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
                    自律型畜牧矩阵 ${ranchTag(ranchCheat.autoRanchEnabled)}
                </div>
                ${desc('全自动治疗/喂食/驱兽，维持属性极值')}
            </div>
        </button>

        <button style="${ranchCheat.autoSlaughterEnabled ? ranchActiveBtn : ranchBaseBtn}" id="cheat-autoslaughter-btn">
            <span style="font-size:20px;">🔪</span>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
                    精准屠宰协议 ${ranchTag(ranchCheat.autoSlaughterEnabled)}
                </div>
                ${desc('自动宰杀成熟动物并免费补栏同种')}
            </div>
        </button>

        <button style="${ranchCheat.metabolismEnabled ? ranchActiveBtn : ranchBaseBtn}" id="cheat-metabolism-btn">
            <span style="font-size:20px;">♾️</span>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;display:flex;align-items:center;gap:6px;">
                    代谢加速力场 ${ranchTag(ranchCheat.metabolismEnabled)}
                </div>
                ${desc('副产物间隔缩短至10~20秒，发育加速3倍')}
            </div>
        </button>

        <div style="
            font-size:11px;color:#3f3f46;padding-top:10px;margin-top:2px;
            border-top:1px solid rgba(34,197,94,0.1);line-height:1.9;
        ">
            📡 <b style="color:#52525b;">量子基因催化</b>：对目标作物施加时间曲率，立即进入成熟态<br>
            📡 <b style="color:#52525b;">纳米重组器</b>：无视自然恢复周期，直接补满所有工具<br>
            📡 <b style="color:#52525b;">自律型生态矩阵</b>：强制维持属性极值并自动收割，无需消耗道具<br>
            📡 <b style="color:#52525b;">引力波诱捕阵列</b>：可于本终端或渔获界面后台运行，切换页面即暂停<br>
            📡 <b style="color:#ac8b6a;">自律型畜牧矩阵</b>：自动维生/除害 + 收取副产物到临时背包<br>
            📡 <b style="color:#ac8b6a;">精准屠宰协议</b>：成熟即宰+免费补栏，肉入临时背包<br>
            📡 <b style="color:#ac8b6a;">代谢加速力场</b>：三倍生长速度，大幅缩短产品周期<br>
            📡 以上技术均由<b style="color:#71717a;">泽塔星系</b>提供，使用前请确认地球稳定锚已开启
        </div>
    `;

    p.document.getElementById('cheat-mature-btn').addEventListener('click', cheatInstantMature);
    p.document.getElementById('cheat-fillitems-btn').addEventListener('click', cheatFillItems);
    p.document.getElementById('cheat-autofarm-btn').addEventListener('click', toggleCheatAutoFarm);
    p.document.getElementById('cheat-autofish-btn').addEventListener('click', toggleCheatAutoFish);
    p.document.getElementById('cheat-autoranch-btn').addEventListener('click', toggleCheatAutoRanch);
    p.document.getElementById('cheat-autoslaughter-btn').addEventListener('click', toggleCheatAutoSlaughter);
    p.document.getElementById('cheat-metabolism-btn').addEventListener('click', toggleCheatMetabolism);
}

    // ==================== 作弊器模块结束 ====================

    // ==================== 清理函数：脚本关闭时移除所有 DOM 和定时器 ====================
    /**
     * 完整清理函数：移除 UI、停止定时器、取消事件监听
     * 在酒馆助手禁用脚本或页面卸载时自动调用
     */
    window._farmCleanup = () => {
        // 尽力保存当前状态（pagehide/beforeunload 场景下的安全网）
        try { saveState(); saveConfig(); saveRanchState(); } catch (e) { /* 忽略 */ }

        // 停止所有定时器和动画
        if (tickInterval) {
            clearInterval(tickInterval);
            tickInterval = null;
        }
        if (eventCheckInterval) {
            clearInterval(eventCheckInterval);
            eventCheckInterval = null;
        }
        if (fishAnimId) {
            cancelAnimationFrame(fishAnimId);
            fishAnimId = null;
        }
        if (fishWaitTimeoutId) {
            clearTimeout(fishWaitTimeoutId);
            fishWaitTimeoutId = null;
        }
        fishState.isPlaying = false;

        // 清理作弊器定时器
        if (cheatAutoFarmInterval) { clearInterval(cheatAutoFarmInterval); cheatAutoFarmInterval = null; }
        if (cheatAutoFishInterval) { clearInterval(cheatAutoFishInterval); cheatAutoFishInterval = null; }
        if (ranchCheat.autoRanchInterval) { clearInterval(ranchCheat.autoRanchInterval); ranchCheat.autoRanchInterval = null; }
        if (ranchCheat.autoSlaughterInterval) { clearInterval(ranchCheat.autoSlaughterInterval); ranchCheat.autoSlaughterInterval = null; }
        cheatAutoFarmEnabled = false;
        cheatAutoFishEnabled = false;
        ranchCheat.autoRanchEnabled = false;
        ranchCheat.autoSlaughterEnabled = false;

        // 移除 MVU 事件监听器
        if (mvuEventHandler && typeof eventRemoveListener === 'function' && Mvu?.events) {
            try {
                eventRemoveListener(Mvu.events.VARIABLE_UPDATE_ENDED, mvuEventHandler);
                mvuEventHandler = null;
            } catch (e) {
                console.warn('[小农场] MVU事件监听器移除失败:', e);
            }
        }

        // 移除全局事件监听器
        p.document.removeEventListener('pointermove', onPointerMove);
        p.document.removeEventListener('pointerup', onPointerUp);
        p.document.removeEventListener('pointercancel', onPointerUp);

        // 移除所有 DOM 元素
        const bp = p.document.getElementById('farm-bubble');
        const pp = p.document.getElementById('farm-panel');
        if (bp) bp.remove();
        if (pp) pp.remove();
        p.document.querySelectorAll('.crop-picker-overlay, .crop-detail-popup, .harvest-popup, .farm-toast, .ranch-popup, .ranch-animal-picker, .ranch-store-popup').forEach(el => el.remove());

        // 清空全局引用
        window._farmCleanup = undefined;

        console.log('[小农场] 已完全清理');
    };

    // 注册页面卸载事件（酒馆助手禁用脚本时触发）
    window.addEventListener('pagehide', window._farmCleanup);
    window.addEventListener('beforeunload', window._farmCleanup);
})();