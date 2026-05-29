import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

// AI经常将z.record对象写成JSON字符串（如 "storage": "{}" 或 "storage": "{...}"），
// 此函数自动解析字符串为对象，避免ZOD验证失败导致整条insert/replace被拒绝
const parseStr = (schema) => z.preprocess((val) => {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch (e) { console.warn('[ZOD] JSON字符串解析失败:', val); return val; }
  }
  return val;
}, schema);

// MVU 路径解析把 '.' 当分隔符时，会把 "8.6 BLK 弹药" 误解析为嵌套对象 {8: {"6 BLK 弹药": {...}}}
// 此函数在 ZOD 验证前自动展平这种嵌套，让带小数点的键名能通过验证
const flattenRecord = (obj) => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v) &&
        v.detail === undefined && v.weight === undefined && v.category === undefined) {
      const nested = flattenRecord(v);
      let flattened = false;
      for (const [subK, subV] of Object.entries(nested)) {
        if (subV && typeof subV === 'object' && !Array.isArray(subV) &&
            (subV.detail !== undefined || subV.weight !== undefined || subV.category !== undefined)) {
          result[`${k}.${subK}`] = subV;
          flattened = true;
        }
      }
      if (!flattened) result[k] = v;
    } else {
      result[k] = v;
    }
  }
  return result;
};

// 专用于物品类 record 字段，先 JSON.parse，再展平嵌套，最后验证
const parseRecordStr = (keySchema, valueSchema) => z.preprocess((val) => {
  if (typeof val === 'string') {
    try { val = JSON.parse(val); } catch (e) { console.warn('[ZOD] JSON字符串解析失败:', val); return val; }
  }
  return flattenRecord(val);
}, z.record(keySchema, valueSchema).prefault({}));

export const Schema = z.object({

  // ═══════════════ 核心状态 ═══════════════
  核心状态: z.object({
    hp_current: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 0, 150)).describe('当前生命值'),
    hp_max: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 1, 150)).describe('最大生命值，基础100+每点E×5'),
    stamina_current: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 0, 150)).describe('当前体力值'),
    stamina_max: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 1, 150)).describe('最大体力值，基础100+每点E×5'),
    hunger_current: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 0, 100)).describe('当前饱食度'),
    hunger_max: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 1, 100)).describe('最大饱食度'),
    thirst_current: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 0, 100)).describe('当前饱水度'),
    thirst_max: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 1, 100)).describe('最大饱水度'),
    morale_current: z.coerce.number().nullable().transform(v => v == null ? 80 : _.clamp(v, 0, 150)).describe('当前情绪值'),
    morale_max: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 1, 150)).describe('最大情绪值，基础100+每点L×5'),
    infection_current: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, 0, 100)).describe('当前感染值，≥60危险'),
    infection_max: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 1, 100)).describe('最大感染值'),
  }),

  // ═══════════════ 世界阶段 ═══════════════
  世界阶段: z.enum(['秩序期', '爆发期', '末世期']).nullable().transform(v => v ?? '秩序期').describe('世界阶段：秩序期=8月24日12:00前，爆发期=8月24日12:00~8月26日12:00，末世期=8月26日12:00后'),

  // ═══════════════ 感染者行为模式 ═══════════════
  感染者行为模式: z.enum(['普通型', '狂病型']).nullable().transform(v => v ?? '狂病型').describe('感染者行为模式：普通型=保留部分本能可诱导，狂病型=完全丧失理智极度攻击性'),

  // ═══════════════ NPC行为模式 ═══════════════
  NPC行为模式: z.enum(['正常型', '全员恶人型']).nullable().transform(v => v ?? '正常型').describe('NPC行为模式：正常型=大部分NPC有善恶之分，全员恶人型=几乎所有NPC都自私残忍不可信'),

  // ═══════════════ 衍生状态 ═══════════════
  衍生状态: z.object({
    physical_status: z.string().nullable().transform(v => v ?? '健康').describe('生理状态描述'),
    mental_status: z.string().nullable().transform(v => v ?? '冷静').describe('心理状态描述'),
    bmi: z.enum(['过瘦', '较瘦', '标准', '较胖', '过胖']).nullable().transform(v => v ?? '标准').describe('BMI体型等级'),
    reputation: z.enum(['遗臭万年', '劣迹斑斑', '默默无闻', '声誉鹊起', '青史留名']).nullable().transform(v => v ?? '默默无闻').describe('名声等级'),
    nationality: z.enum(['华国', '美利坚国', '法国', '大毛国', '日本国', '巴西国', '北非', '其他']).nullable().describe('国籍，影响出生点'),
    camp: z.string().nullable().transform(v => v ?? '流浪').describe('所属营地'),
  }),

  // ═══════════════ 营地 ═══════════════
  营地: z.object({
    名称: z.string().nullable().transform(v => v ?? '').describe('营地名称'),
    人数: z.coerce.number().nullable().transform(v => v ?? 0).describe('营地人数'),
    运作情况: z.string().nullable().transform(v => v ?? '').describe('营地当前运作状态'),
    防御状态: z.string().nullable().transform(v => v ?? '').describe('营地防御概况'),
    士气: z.coerce.number().nullable().transform(v => v == null ? 50 : _.clamp(v, 0, 100)).describe('营地士气0-100'),
    资源: parseStr(z.object({
      食物与水: z.coerce.number().nullable().transform(v => v == null ? 0 : Math.max(0, v)).describe('食物类资源池'),
      医疗药品: z.coerce.number().nullable().transform(v => v == null ? 0 : Math.max(0, v)).describe('医疗类资源池'),
      建筑材料: z.coerce.number().nullable().transform(v => v == null ? 0 : Math.max(0, v)).describe('建材类资源池'),
      武器弹药: z.coerce.number().nullable().transform(v => v == null ? 0 : Math.max(0, v)).describe('武器类资源池'),
      燃料能源: z.coerce.number().nullable().transform(v => v == null ? 0 : Math.max(0, v)).describe('燃料类资源池'),
      工具零件: z.coerce.number().nullable().transform(v => v == null ? 0 : Math.max(0, v)).describe('工具类资源池'),
      护甲衣物: z.coerce.number().nullable().transform(v => v == null ? 0 : Math.max(0, v)).describe('护甲类资源池')
    }).prefault({ 食物与水: 0, 医疗药品: 0, 建筑材料: 0, 武器弹药: 0, 燃料能源: 0, 工具零件: 0, 护甲衣物: 0 })).describe('营地分类资源池（由物品拆解得来），用于建造/升级/维修'),
    物资: parseRecordStr(
      z.string().describe('物品名称'),
      z.object({
        detail: z.string().nullable().transform(v => v ?? '').describe('数量/品质/状态'),
        weight: z.coerce.number().nullable().transform(v => v ?? 0).describe('单件重量kg'),
        category: z.enum(['食物与水','医疗药品','建筑材料','武器弹药','燃料能源','工具零件','护甲衣物','其他杂物']).nullable().transform(v => v ?? '其他杂物').describe('物资分类')
      }).prefault({ detail: '', weight: 0, category: '其他杂物' })
    ).describe('营地公共物资，格式同物品字段'),
    领袖: z.string().nullable().transform(v => v ?? '').describe('营地领袖或负责人'),
    成员: parseStr(z.record(
      z.string().describe('成员姓名'),
      z.object({
        角色: z.enum(['领袖','骨干','普通成员','工匠','守卫','医生','农夫','侦察兵','交易员','其他']).nullable().transform(v => v ?? '普通成员').describe('营地角色'),
        状态: z.string().nullable().transform(v => v ?? '正常').describe('当前状态'),
        detail: z.string().nullable().transform(v => v ?? '').describe('技能/职责/背景简述')
      }).prefault({ 角色: '普通成员', 状态: '正常', detail: '' })
    ).prefault({})).describe('营地成员，上限20人'),
    建筑: parseStr(z.record(
      z.string().describe('建筑名称'),
      z.object({
        类型: z.enum(['居住','防御','生产','仓储','医疗','训练','研究','其他']).nullable().transform(v => v ?? '其他').describe('建筑类型'),
        等级: z.coerce.number().nullable().transform(v => v == null ? 1 : _.clamp(v, 1, 5)).describe('建筑等级1-5'),
        效果: z.string().nullable().transform(v => v ?? '').describe('建筑提供的实际增益效果'),
        condition: z.coerce.number().nullable().transform(v => v == null ? 80 : _.clamp(v, 0, 100)).describe('建筑完整度0-100'),
        status: z.enum(['完好','轻微损坏','中度损坏','严重损坏','损毁','建设中']).nullable().transform(v => v ?? '完好').describe('建筑状态'),
        desc: z.string().nullable().transform(v => v ?? '').describe('外观/功能简述')
      }).prefault({ 类型: '其他', 等级: 1, 效果: '', condition: 80, status: '完好', desc: '' })
    ).prefault({})).describe('营地建筑，无数量上限，可升级(1-5级)'),
    近期动态: z.array(z.string()).prefault([]).describe('营地近期事件日志，最多8条，格式"HH:MM 内容"')
  }).prefault({ 名称: '', 人数: 0, 运作情况: '', 防御状态: '', 士气: 50, 资源: { 食物与水: 0, 医疗药品: 0, 建筑材料: 0, 武器弹药: 0, 燃料能源: 0, 工具零件: 0, 护甲衣物: 0 }, 物资: {}, 领袖: '', 成员: {}, 建筑: {}, 近期动态: [] }).describe('营地信息面板，流浪时内容可留空'),

  // ═══════════════ 任务队列 ═══════════════
  任务队列: z.array(z.object({
    类型: z.string().nullable().transform(v => v ?? '搜索').describe('任务类型，如搜索/建设/制造/维修/防御/管理/侦察/交易/医疗/训练/清理等'),
    目标: z.string().nullable().transform(v => v ?? '').describe('搜索地点/建筑名/物品名'),
    执行者: z.string().nullable().transform(v => v ?? '').describe('执行者：NPC名/主角/泛称如"3名幸存者"'),
    预计耗时: z.string().nullable().transform(v => v ?? '').describe('预计完成时间，如"4小时""1天"'),
    所需资源: z.string().nullable().transform(v => v ?? '').describe('所需资源，如"木材×10, 铁钉×5"或"无"'),
    进度: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, 0, 100)).describe('任务进度0-100'),
    状态: z.enum(['待执行', '进行中', '已完成', '失败', '中断']).nullable().transform(v => v ?? '进行中').describe('任务状态'),
    结果: z.string().nullable().transform(v => v ?? '').describe('完成或失败后的结果描述'),
  })).prefault([]).describe('进行中的经营任务队列，上限3个'),

  // ═══════════════ SPECIAL属性 ═══════════════
  SPECIAL: z.object({
    S: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('力量 Strength -10~10，影响负重/近战/物理破坏'),
    P: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('感知 Perception -10~10，影响观察/远程/搜刮'),
    E: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('耐力 Endurance -10~10，影响HP上限/体力上限/抗性'),
    C: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('魅力 Charisma -10~10，影响NPC态度/好感/议价/士气'),
    I: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('智力 Intelligence -10~10，每点+5%技能经验/配方上限/医疗'),
    A: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('敏捷 Agility -10~10，影响闪避/轻武器/潜行/跑酷'),
    L: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('意志 Willpower -10~10，影响恐慌抗性/精神上限/抗精神攻击'),
  }).prefault({ S: 0, P: 0, E: 0, C: 0, I: 0, A: 0, L: 0 }),

  // ═══════════════ 特质 ═══════════════
  特质: z.object({
    正面: z.array(z.string()).prefault([]).describe('正面特质列表'),
    负面: z.array(z.string()).prefault([]).describe('负面特质列表'),
    自定义: z.array(z.string()).prefault([]).describe('自定义特质列表'),
  }).prefault({ 正面: [], 负面: [], 自定义: [] }),

  // ═══════════════ 技能 ═══════════════
  技能: parseStr(z.record(
    z.string().describe('技能名称'),
    z.object({
      level: z.coerce.number().nullable().transform(v => v == null ? 1 : _.clamp(v, 1, 10)).describe('技能等级1-10'),
      desc: z.string().nullable().transform(v => v ?? '').describe('技能描述')
    }).prefault({ level: 1, desc: '' })
  ).prefault({})).describe('已习得的技能'),

  // ═══════════════ 环境 ═══════════════
  环境: z.object({
    location: z.string().nullable().transform(v => v ?? '未知地点').describe('当前地点'),
    time_weather: z.string().nullable().transform(v => v ?? '2030年08月23日 08:00 / 晴朗').describe('当前时间与天气'),
    temperature: z.string().nullable().transform(v => v ?? '25°C 舒适').describe('体感温度'),
    radiation: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, 0, 100)).describe('辐射指数0-100，≥20警告≥50危险'),
    threat_level: z.string().nullable().transform(v => v ?? '安全').describe('威胁等级评估'),
    noise: z.string().nullable().transform(v => v ?? '寂静').describe('周围动静'),
    comfort: z.coerce.number().nullable().transform(v => v == null ? 50 : _.clamp(v, 0, 100)).describe('休息环境舒适度0-100'),
    hatred: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, 0, 100)).describe('世界仇恨值0-100'),
  }),

  // ═══════════════ 物品 ═══════════════
  物品: parseRecordStr(
    z.string().describe('物品名称'),
    z.object({
      detail: z.string().nullable().transform(v => v ?? '').describe('数量/品质/状态'),
      weight: z.coerce.number().nullable().transform(v => v ?? 0).describe('单件重量kg'),
      category: z.enum(['食物与水','医疗药品','建筑材料','武器弹药','燃料能源','工具零件','护甲衣物','其他杂物']).nullable().transform(v => v ?? '其他杂物').describe('物资分类')
    }).prefault({ detail: '', weight: 0, category: '其他杂物' })
  ).describe('物品栏'),

  // ═══════════════ 载具 ═══════════════
  载具: parseStr(z.record(
    z.string().describe('载具名称'),
    z.object({
      type: z.enum(['民用汽车', '商用车辆', '二轮载具', '重装载具', '水上载具', '航空载具', '其他']).nullable().transform(v => v ?? '其他').describe('载具类型'),
      name: z.string().nullable().transform(v => v ?? '未知载具'),
      appearance: z.string().nullable().transform(v => v ?? '').describe('载具外观描述：颜色、型号特征、改装痕迹、锈蚀破损、涂装标志等'),
      condition: z.coerce.number().nullable().transform(v => v == null ? 80 : _.clamp(v, 0, 100)).describe('载具完整度0-100，≤40抛锚风险，≤20随时损坏'),
      status: z.string().nullable().transform(v => v ?? '完好'),
      fuel: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, 0, 100)).describe('燃油百分比0-100'),
      mileage: z.union([z.string(), z.number()]).nullable().transform(v => { if (v == null) return '0 km'; if (typeof v === 'number') return v + ' km'; return String(v); })
    }).prefault({ type: '其他', name: '未知载具', appearance: '', condition: 80, status: '完好', fuel: 0, mileage: '0 km' })
  ).prefault({})).describe('拥有的载具'),

  // ═══════════════ 建筑 ═══════════════
  建筑: parseStr(z.record(
    z.string().describe('庇护所名称'),
    z.object({
      status: z.enum(['完好', '轻微损坏', '中度损坏', '严重损坏', '损毁', '建设中']).nullable().transform(v => v ?? '完好').describe('庇护所整体状态'),
      condition: z.coerce.number().nullable().transform(v => v == null ? 80 : _.clamp(v, 0, 100)).describe('庇护所完整度0-100，≤40功能受限，≤20基本失效'),
      desc: z.string().nullable().transform(v => v ?? '').describe('状态描述：外观/结构/破损/居住条件，不少于30字'),
      storage: parseRecordStr(
        z.string().describe('物品名称'),
        z.object({
          detail: z.string().nullable().transform(v => v ?? '').describe('数量/品质/状态'),
          weight: z.coerce.number().nullable().transform(v => v ?? 0).describe('单件重量kg'),
          category: z.enum(['食物与水','医疗药品','建筑材料','武器弹药','燃料能源','工具零件','护甲衣物','其他杂物']).nullable().transform(v => v ?? '其他杂物').describe('物资分类')
        }).prefault({ detail: '', weight: 0, category: '其他杂物' })
      ).describe('仓储物，格式与物品字段一致，可互相转移'),
      defense: z.string().nullable().transform(v => v ?? '').describe('防御工事描述'),
      facilities: z.string().nullable().transform(v => v ?? '').describe('设施描述'),
    }).prefault({ status: '完好', condition: 80, desc: '', storage: {}, defense: '', facilities: '' })
  ).prefault({})).describe('庇护所/据点，流浪时为空'),

  // ═══════════════ 队友 ═══════════════
  队友: parseStr(z.record(
    z.string().describe('队友姓名'),
    z.object({
      gender: z.enum(['男', '女', '其他']).prefault('男'),
      age: z.coerce.number().nullable().transform(v => v ?? 25),
      status: z.string().nullable().transform(v => v ?? '健康'),
      appearance: z.string().nullable().transform(v => v ?? '').describe('详细外貌描述：面容、发型、身材、气质等'),
      equipment: z.string().nullable().transform(v => v ?? '').describe('详细衣着装备：穿着、配饰、携带物品'),
      SPECIAL: z.object({
        S: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('力量'),
        P: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('感知'),
        E: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('耐力'),
        C: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('魅力'),
        I: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('智力'),
        A: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('敏捷'),
        L: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('意志'),
      }).prefault({ S: 0, P: 0, E: 0, C: 0, I: 0, A: 0, L: 0 }).describe('SPECIAL属性'),
      hp: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 0, 150)).describe('生命值0-150'),
      mp: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 0, 150)).describe('精神值0-150'),
      favor: z.coerce.number().nullable().transform(v => v == null ? 75 : _.clamp(v, 0, 100)),
      abilities: z.string().nullable().transform(v => v ?? ''),
      thoughts: z.string().nullable().transform(v => v ?? '').describe('内心想法/经验记录：当前心理活动、对主角的态度、过往经历摘要'),
      detail: z.string().nullable().transform(v => v ?? '')
    }).prefault({ gender: '男', age: 25, status: '健康', appearance: '', equipment: '', SPECIAL: { S: 0, P: 0, E: 0, C: 0, I: 0, A: 0, L: 0 }, hp: 100, mp: 100, favor: 75, abilities: '', thoughts: '', detail: '' })
  ).prefault({})).describe('同行队友'),

  // ═══════════════ NPC ═══════════════
  NPC: parseStr(z.record(
    z.string().describe('NPC姓名'),
    z.object({
      gender: z.enum(['男', '女', '其他']).prefault('男'),
      age: z.coerce.number().nullable().transform(v => v ?? 30),
      title: z.string().nullable().transform(v => v ?? '流浪者'),
      appearance: z.string().nullable().transform(v => v ?? '').describe('详细外貌描述：面容、发型、身材、气质等'),
      equipment: z.string().nullable().transform(v => v ?? '').describe('详细衣着装备：穿着、配饰、携带物品'),
      SPECIAL: z.object({
        S: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('力量'),
        P: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('感知'),
        E: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('耐力'),
        C: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('魅力'),
        I: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('智力'),
        A: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('敏捷'),
        L: z.coerce.number().nullable().transform(v => v == null ? 0 : _.clamp(v, -10, 10)).describe('意志'),
      }).prefault({ S: 0, P: 0, E: 0, C: 0, I: 0, A: 0, L: 0 }).describe('SPECIAL属性'),
      relation: z.coerce.number().nullable().transform(v => v ?? 0).describe('好感度，≥75归入队友'),
      hp: z.coerce.number().nullable().transform(v => v == null ? 100 : _.clamp(v, 0, 150)).describe('生命值0-150'),
      thoughts: z.string().nullable().transform(v => v ?? '').describe('内心想法/经验记录：当前心理活动、对主角的态度、过往经历摘要'),
      detail: z.string().nullable().transform(v => v ?? '')
    }).prefault({ gender: '男', age: 30, title: '流浪者', appearance: '', equipment: '', SPECIAL: { S: 0, P: 0, E: 0, C: 0, I: 0, A: 0, L: 0 }, relation: 0, hp: 100, thoughts: '', detail: '' })
  ).prefault({})).describe('遇到的NPC'),

  // ═══════════════ 世界事件 ═══════════════
  世界事件: parseStr(z.record(
    z.string().describe('事件ID或标题'),
    z.object({
      type: z.string().nullable().transform(v => v ?? '未知'),
      title: z.string().nullable().transform(v => v ?? ''),
      location: z.string().nullable().transform(v => v ?? ''),
      desc: z.string().nullable().transform(v => v ?? '')
    }).prefault({ type: '未知', title: '', location: '', desc: '' })
  ).prefault({})).describe('世界事件'),

  // ═══════════════ 各大洲 ═══════════════
  各大洲: z.object({
    asia: z.string().nullable().transform(v => v ?? '局势尚不明朗'),
    europe: z.string().nullable().transform(v => v ?? '局势尚不明朗'),
    africa: z.string().nullable().transform(v => v ?? '局势尚不明朗'),
    namerica: z.string().nullable().transform(v => v ?? '南部出现零星恶性暴力事件，源头不明'),
    samerica: z.string().nullable().transform(v => v ?? '部分地区出现骚乱，通讯信号不稳定'),
    oceania: z.string().nullable().transform(v => v ?? '局势尚不明朗')
  }).prefault({
    asia: '局势尚不明朗',
    europe: '局势尚不明朗',
    africa: '局势尚不明朗',
    namerica: '南部出现零星恶性暴力事件，源头不明',
    samerica: '部分地区出现骚乱，通讯信号不稳定',
    oceania: '局势尚不明朗'
  }),

  // ═══════════════ 公共通讯 ═══════════════
  公共通讯: parseStr(z.record(
    z.string().describe('消息ID'),
    z.object({
      sender: z.string().nullable().transform(v => v ?? '未知来源'),
      time: z.string().nullable().transform(v => v ?? ''),
      content: z.string().nullable().transform(v => v ?? '')
    }).prefault({ sender: '未知来源', time: '', content: '' })
  ).prefault({})).describe('公共通讯'),

  // ═══════════════ 私人通讯 ═══════════════
  私人通讯: parseStr(z.record(
    z.string().describe('联系人姓名'),
    z.array(z.object({
      sender: z.string().nullable().transform(v => v ?? ''),
      time: z.string().nullable().transform(v => v ?? ''),
      content: z.string().nullable().transform(v => v ?? '')
    })).prefault([])
  ).prefault({})).describe('私人通讯，按联系人分组，每人一个消息数组'),
});

$(() => {
  registerMvuSchema(Schema);
});
