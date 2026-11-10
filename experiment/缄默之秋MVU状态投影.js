// 缄默之秋 MVU 状态投影 v1.0.0
// 从即将发送的正文状态块生成摘要。适用角色卡 3.2 / 3.5。
(() => {
  'use strict';

  const TAG = '[缄默之秋投影]';
  const STATUS = /(^[ \t]*<status_current_variable>[ \t]*\r?\n)([\s\S]*?)(\r?\n[ \t]*<\/status_current_variable>[ \t]*$)/m;
  const STATE_TAGS = /^[ \t]*<\/?status_current_variable>[ \t]*$/gm;
  const MAIN_TYPES = new Set(['normal', 'regenerate', 'swipe', 'continue']);
  const PERSON_LIMITS = {
    appearance: 64, personality: 64, background: 96, thoughts: 64, detail: 110,
  };
  const HELPER_TIMEOUT = 120_000;
  const helpers = new Map();
  const diagnosticAttempts = new Set();
  const updateSummaries = new WeakMap();
  let savedReplies = [];
  let nativeTurn = null;

  function log(level, text) {
    try {
      const logger = typeof _th_impl === 'undefined' ? window.parent?.TavernHelper?._th_impl : _th_impl;
      const name = typeof getIframeName === 'function' ? getIframeName() : '缄默之秋投影';
      logger?._log(name, level, TAG + ' ' + text);
    } catch {
      // 日志失败时照常生成。
    }
  }

  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const chat = () => SillyTavern.getContext?.()?.chat ?? SillyTavern.chat ?? [];
  const normalize = value => typeof value === 'string' ? value.toLowerCase() : '';

  function project(state, recentText) {
    let shortened = 0;
    const mentioned = names => names.some(name => {
      const value = normalize(name).trim();
      return value && recentText.includes(value);
    });
    function shorten(entry, key, limit) {
      const value = entry[key];
      if (typeof value !== 'string' || value.length <= limit) return;
      const prefix = [...value].slice(0, limit - 1).join('').trimEnd();
      if (prefix.length + 1 >= value.length) return;
      entry[key] = prefix + '…';
      shortened++;
    }
    for (const [group, multiplier] of [['NPC', 1], ['队友', 2]]) {
      if (!isRecord(state[group])) continue;
      for (const [name, person] of Object.entries(state[group])) {
        if (!isRecord(person)) continue;
        const aliases = Array.isArray(person.aliases) ? person.aliases : [];
        if (mentioned([name, ...aliases])) continue;
        for (const [field, limit] of Object.entries(PERSON_LIMITS)) {
          shorten(person, field, limit * multiplier);
        }
      }
    }
    if (isRecord(state.公共通讯)) {
      for (const message of Object.values(state.公共通讯).slice(0, -5)) {
        if (isRecord(message) && !mentioned([message.sender])) shorten(message, 'content', 96);
      }
    }
    if (isRecord(state.私人通讯)) {
      for (const [name, messages] of Object.entries(state.私人通讯)) {
        if (!Array.isArray(messages) || mentioned([name])) continue;
        for (const message of messages.slice(0, -3)) {
          if (isRecord(message)) shorten(message, 'content', 96);
        }
      }
    }
    return shortened;
  }

  function formatSavings({ before, after }) {
    return before + ' → ' + after + ' 字，节省 ' + (before - after) + ' 字';
  }

  function rewriteRequest(payload) {
    if (!nativeTurn?.pending || payload?.dryRun || payload?.dry_run || !Array.isArray(payload?.messages)) return;
    const messages = payload.messages;
    if (String(payload.model ?? '').startsWith('mvu-pi-prompt-capture:') ||
        messages.some(part => typeof part?.content === 'string' && /<past_observe>|<additional_information>/.test(part.content))) return;
    // 酒馆助手也会发出请求就绪事件。并发脚本请求期间不改任何状态块。
    const now = Date.now();
    for (const [id, since] of helpers) if (now - since > HELPER_TIMEOUT) helpers.delete(id);
    if (helpers.size) return;

    nativeTurn.pending = false;
    const candidates = messages.filter(part => part?.role === 'system' &&
      typeof part.content === 'string' && [...part.content.matchAll(STATE_TAGS)].length);
    if (candidates.length !== 1 || !STATUS.test(candidates[0].content)) return;
    const [target] = candidates;
    if ([...target.content.matchAll(STATE_TAGS)].length !== 2) return;
    const [block, open, body, close] = target.content.match(STATUS);
    if (typeof YAML === 'undefined') return;
    let state;
    try { state = YAML.parse(body, { maxAliasCount: 0, stringKeys: true }); }
    catch { return; }
    if (!isRecord(state) || !isRecord(state.核心状态) || !isRecord(state.环境) ||
        !Object.hasOwn(state, '世界阶段') || !isRecord(state.SPECIAL)) return;
    const recentText = normalize(chat().slice(-8).filter(message => !message.is_system)
      .slice(-4).map(message => String(message.mes ?? '').slice(-3500)).join('\n'));
    if (!project(state, recentText)) return;
    const projected = YAML.stringify(state, { blockQuote: 'literal' }).trimEnd();
    const replacement = open + projected + close +
      '\n（状态投影：部分历史描写与通讯仅列摘要。「…」表示文本省略；更新变量时保留未变化的原字段。）';
    if (replacement.length >= block.length) return;
    target.content = target.content.replace(STATUS, () => replacement);
    nativeTurn.savings = { before: block.length, after: replacement.length };
    log('info', '正文状态投影：' + formatSavings(nativeTurn.savings));
  }

  function bindReply(messageId, type) {
    if (type === 'first_message' || type === 'quiet' || type === 'impersonate') return;
    const messages = chat();
    const message = messages[Number(messageId)];
    if (!message || message.is_user || message.is_system || !nativeTurn?.savings) return;
    const swipe = message.swipe_id ?? 0;
    savedReplies = savedReplies.filter(reply => reply.message !== message || reply.swipe !== swipe);
    savedReplies.push({ message, swipe, savings: nativeTurn.savings });
    if (savedReplies.length > 12) savedReplies.shift();
    nativeTurn = null;
  }

  function recordCommands(variables, commands, content) {
    if (!isRecord(variables)) return;
    const matches = typeof content === 'string' ? savedReplies.filter(({ message, swipe }) =>
      swipe === (message.swipe_id ?? 0) && content === message.mes) : [];
    updateSummaries.set(variables, {
      count: Array.isArray(commands) ? commands.length : undefined,
      savings: matches.length === 1 ? matches[0].savings : undefined,
    });
  }

  function logSettlement(next, previous) {
    if (!isRecord(next?.stat_data) || !isRecord(previous?.stat_data)) return;
    const { count, savings } = updateSummaries.get(next) ?? {};
    updateSummaries.delete(next);
    const equal = typeof _ === 'undefined' ? (a, b) => JSON.stringify(a) === JSON.stringify(b) : _.isEqual;
    const keys = new Set([...Object.keys(next.stat_data), ...Object.keys(previous.stat_data)]);
    let groups = 0;
    for (const key of keys) if (!key.startsWith('$') && !equal(next.stat_data[key], previous.stat_data[key])) groups++;
    const commands = count === undefined ? '' : count + ' 条命令，';
    const projection = savings ? ' ｜ 正文状态压缩：' + formatSavings(savings) : '';
    log('info', 'MVU 变量结算：' + commands + groups + ' 组变化' + projection);
  }

  function observeDiagnostic(event) {
    const id = event?.generationId;
    if (!id) return;
    if (event.status === 'started') {
      diagnosticAttempts.add(id);
      if (diagnosticAttempts.size > 32) diagnosticAttempts.delete(diagnosticAttempts.values().next().value);
      return;
    }
    if (!diagnosticAttempts.delete(id) || event.status !== 'rejected') return;
    const raw = event.response;
    const text = raw == null ? '（未收到模型输出）' :
      typeof raw === 'string' ? raw || '（模型返回空字符串）' : JSON.stringify(raw, null, 2);
    log('error', '额外模型 [' + id + '] 解析未通过：' + (event.error || '未知错误') + '\n完整输出：\n' + text);
  }

  if (typeof eventOn !== 'function' || typeof tavern_events === 'undefined' || window.__jmzqProjectionLoaded) return;
  window.__jmzqProjectionLoaded = true;
  const onFirst = typeof eventMakeFirst === 'function' ? eventMakeFirst : eventOn;
  const onLast = typeof eventMakeLast === 'function' ? eventMakeLast : eventOn;
  eventOn(tavern_events.GENERATION_AFTER_COMMANDS, (type, options, dryRun) => {
    // 酒馆原生 Generate 会传 force_name2；酒馆助手的 generate 和 generateRaw 会传空对象。
    if (!Object.hasOwn(options ?? {}, 'force_name2')) return;
    nativeTurn = !dryRun && MAIN_TYPES.has(type) ? { pending: true } : null;
  });
  onLast(tavern_events.CHAT_COMPLETION_SETTINGS_READY, payload => {
    try { rewriteRequest(payload); }
    catch (error) { log('error', '正文状态投影失败：' + String(error)); }
  });
  eventOn(tavern_events.GENERATION_ENDED, () => { if (nativeTurn) nativeTurn.pending = false; });
  eventOn(tavern_events.GENERATION_STOPPED, id => {
    if (typeof id === 'string') helpers.delete(id);
    else nativeTurn = null;
  });
  onFirst(tavern_events.MESSAGE_RECEIVED, bindReply);
  eventOn('js_generation_requested', id => {
    if (!id) return;
    helpers.set(id, Date.now());
    if (helpers.size > 32) helpers.delete(helpers.keys().next().value);
  });
  eventOn('js_generation_ended', (_text, id) => { helpers.delete(id); });
  eventOn(tavern_events.CHAT_CHANGED, () => {
    helpers.clear();
    diagnosticAttempts.clear();
    savedReplies = [];
    nativeTurn = null;
  });
  eventOn('mag_command_parsed', recordCommands);
  onLast('mag_variable_update_ended_for_zod', logSettlement);
  eventOn('daoyuan_mvu_extra_model_diagnostic', observeDiagnostic);
})();
