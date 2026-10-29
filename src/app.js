import {
  activeEntries,
  calcStreak,
  charCount,
  dateFromKey,
  dateKey,
  mergeEntries,
  monthStats,
  statePayload,
  totalStats
} from './core.js';
import {
  deleteEntry,
  getAllEntries,
  importRows,
  putEntries,
  putEntry,
  getMeta,
  requestPersistentStorage,
  setMeta
} from './db.js';
import {
  isValidGithubToken,
  isValidGistId,
  makeGistSyncLink,
  parseGistSyncHash,
  syncWithCloud
} from './sync-client.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const prompts = [
  '今晚，哪件小事让你觉得自己在变好？',
  '今天学到了什么，哪怕只有一句话？',
  '哪一刻，你比昨天多走了一步？',
  '今天完成了什么原本有点不想做的事？',
  '有什么值得谢谢今天坚持下来的自己？',
  '把今天的进步写成一个标题，会是什么？'
];

const today = new Date();
const todayKey = dateKey(today);
const state = {
  entries: [],
  syncToken: '',
  gistId: '',
  lastSyncAt: null,
  syncPhase: 'idle',
  syncMessage: '',
  currentPanel: 'today',
  selectedTag: '',
  promptIndex: Math.floor(Math.random() * prompts.length),
  viewedMonth: new Date(today.getFullYear(), today.getMonth(), 1),
  showAllEntries: false,
  detailDate: null,
  deferredInstall: null,
  syncTimer: null,
  syncController: null
};

const form = $('#entryForm');
const titleInput = $('#entryTitle');
const storyInput = $('#entryStory');
const saveButton = $('#saveButton');
const saveLabel = $('#saveLabel');
const saveHint = $('#saveHint');
const charCountEl = $('#charCount');
const entryDialog = $('#entryDialog');
const toast = $('#toast');
let toastTimer = null;

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function chineseDate(date, options = {}) {
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

function activeMap() {
  return Object.fromEntries(activeEntries(state.entries).map((entry) => [entry.id, entry]));
}

function findAnyEntry(id) {
  return state.entries.find((entry) => entry.id === id) || null;
}

function fallbackTitle(content) {
  const clean = String(content || '').trim().replace(/\s+/g, ' ');
  const first = clean.split(/[。！？!?；;\n]/).find(Boolean) || clean;
  return first.length > 20 ? `${first.slice(0, 20)}…` : first || '今天的一小步';
}

function greetingText() {
  const hour = new Date().getHours();
  if (hour < 5) return '夜很长，';
  if (hour < 10) return '早安，';
  if (hour < 14) return '中午好，';
  if (hour < 18) return '今天辛苦了，';
  if (hour < 22) return '晚上好，';
  return '夜深了，';
}

function showToast(message) {
  $('#toastText').textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function showPanel(name) {
  state.currentPanel = name;
  $$('.panel-view').forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  });
  $$('.nav-button').forEach((button) => {
    const active = button.dataset.go === name;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHeaderDate() {
  $('#todayKicker').textContent = chineseDate(new Date(), { month: 'long', day: 'numeric', weekday: 'long' });
  $('#greeting').textContent = greetingText();
  $('#promptText').textContent = prompts[state.promptIndex];
}

function updateCharCount() {
  const count = charCount(storyInput.value);
  charCountEl.textContent = `${count} / 1200`;
  charCountEl.style.color = count > 1080 ? 'rgba(232, 135, 114, .85)' : '';
}

function syncTags() {
  $$('.tag').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tag === state.selectedTag)));
}

function updateSaveState(saved = false) {
  const hasContent = storyInput.value.trim().length > 0;
  saveButton.disabled = !hasContent;
  saveLabel.textContent = saved ? '更新今天的进步' : '收好今天的进步';
  saveHint.innerHTML = saved
    ? '今天已经被好好收下了。想补充什么，随时可以再写。'
    : hasContent
      ? '只写给自己看。具体一点，未来的你会感谢今晚的你。'
      : '<strong>至少写下一句话</strong>，就可以点亮今天。';
}

function loadTodayIntoForm() {
  const entry = activeMap()[todayKey];
  titleInput.value = entry?.title || '';
  storyInput.value = entry?.content || '';
  state.selectedTag = entry?.tag || '';
  syncTags();
  updateCharCount();
  updateSaveState(Boolean(entry));
}

async function saveToday(event) {
  event.preventDefault();
  const content = storyInput.value.trim();
  if (!content) {
    storyInput.focus();
    return;
  }
  const now = new Date().toISOString();
  const existing = findAnyEntry(todayKey);
  const entry = {
    id: todayKey,
    title: titleInput.value.trim() || fallbackTitle(content),
    content,
    tag: state.selectedTag,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    deleted: false
  };
  try {
    await putEntry(entry);
    state.entries = mergeEntries(state.entries.filter((row) => row.id !== todayKey), [entry]);
    updateSaveState(true);
    renderAll();
    showToast(existing && !existing.deleted ? '今晚的进步，又添了一笔。' : '今天的第一颗星，亮起来了。');
    scheduleSync();
  } catch (error) {
    showToast(`保存失败：${error.message}`);
  }
}

function isSyncConfigured() {
  return Boolean(state.syncToken && state.gistId);
}

function scheduleSync() {
  if (!state.syncToken) return;
  clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(() => performSync({ silent: true }), 4000);
}

function syncStatusText() {
  if (!state.syncToken) return { text: '本机模式', cls: '' };
  if (state.syncPhase === 'syncing') return { text: '正在同步', cls: 'is-syncing' };
  if (state.syncPhase === 'error') return { text: '同步待重试', cls: 'is-error' };
  if (!state.gistId) return { text: '等待初始化', cls: '' };
  if (state.lastSyncAt) return { text: '已同步', cls: 'is-synced' };
  return { text: '等待同步', cls: '' };
}

function renderSyncUI() {
  const status = syncStatusText();
  const pill = $('#headerSync');
  pill.classList.remove('is-synced', 'is-syncing', 'is-error');
  if (status.cls) pill.classList.add(status.cls);
  $('#syncStatus').textContent = status.text;

  const badge = $('#cloudBadge');
  badge.classList.remove('is-synced', 'is-error');
  badge.textContent = status.text;
  if (status.cls) badge.classList.add(status.cls);

  $('#gistIdLabel').textContent = state.gistId ? '••••' + state.gistId.slice(-10) : '尚未连接';
  $('#connectGithub').textContent = state.syncToken ? '更换连接' : '连接 GitHub';
  $('#syncNow').disabled = !state.syncToken || state.syncPhase === 'syncing';
  $('#copyLink').disabled = !isSyncConfigured();
  $('#syncHelp').textContent = isSyncConfigured()
    ? '连接正常。同步链接包含访问令牌，请只发送到你自己的另一台设备。'
    : state.syncToken
      ? '令牌已保存，正在等待创建或确认私有 Gist。'
      : '建议直接使用交付时提供的同步链接，一次完成连接。';
  const syncTime = state.lastSyncAt
    ? chineseDate(new Date(state.lastSyncAt), { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  $('#syncMeta').textContent = syncTime
    ? '上次同步：' + syncTime + (state.syncMessage ? ' · ' + state.syncMessage : '')
    : state.syncMessage || '尚未同步';
}

async function performSync({ silent = false } = {}) {
  if (!isValidGithubToken(state.syncToken)) {
    if (!silent) showToast('请先连接 GitHub 私有 Gist。');
    return;
  }
  if (state.syncPhase === 'syncing') return;
  state.syncPhase = 'syncing';
  state.syncMessage = '';
  renderSyncUI();
  state.syncController?.abort();
  state.syncController = new AbortController();
  const timeout = setTimeout(() => state.syncController.abort(), 20000);
  try {
    const result = await syncWithCloud({
      token: state.syncToken,
      gistId: state.gistId,
      signal: state.syncController.signal
    }, state.entries);
    state.gistId = result.gistId;
    await setMeta('gistId', result.gistId);
    await putEntries(result.rows);
    state.entries = mergeEntries(result.rows);
    state.lastSyncAt = result.syncedAt;
    state.syncPhase = 'idle';
    state.syncMessage = result.created ? '已创建私有 Gist' : result.pushed ? '已合并并上传' : '已拉取最新记录';
    await setMeta('lastSyncAt', state.lastSyncAt);
    renderAll();
    if (!silent) showToast('GitHub 记录已同步。');
  } catch (error) {
    state.syncPhase = 'error';
    state.syncMessage = error.name === 'AbortError' ? '连接超时，下次会重试' : '同步失败：' + error.message;
    renderSyncUI();
    if (!silent) showToast(state.syncMessage);
  } finally {
    clearTimeout(timeout);
  }
}

function openSyncDialog() {
  $('#githubTokenInput').value = '';
  $('#githubTokenInput').placeholder = state.syncToken ? '已保存令牌；留空则继续使用' : 'ghp_... 或 github_pat_...';
  $('#gistIdInput').value = state.gistId || '';
  const dialog = $('#syncDialog');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeSyncDialog() {
  const dialog = $('#syncDialog');
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

async function saveGithubConnection() {
  const token = $('#githubTokenInput').value.trim() || state.syncToken;
  const gistId = $('#gistIdInput').value.trim();
  if (!isValidGithubToken(token)) {
    showToast('GitHub 令牌格式不正确。');
    return;
  }
  if (gistId && !isValidGistId(gistId)) {
    showToast('Gist ID 格式不正确。');
    return;
  }
  if (state.gistId && gistId && state.gistId !== gistId) {
    const ok = window.confirm('切换数据仓库后，本机记录会合并到新的私有 Gist。确定切换吗？');
    if (!ok) return;
  }
  state.syncToken = token;
  state.gistId = gistId;
  state.lastSyncAt = null;
  state.syncPhase = 'idle';
  state.syncMessage = gistId ? '连接已保存，正在同步' : '正在创建私有 Gist';
  await setMeta('syncToken', token);
  await setMeta('gistId', gistId);
  renderSyncUI();
  closeSyncDialog();
  await performSync();
}

async function copySyncLink() {
  if (!isSyncConfigured()) {
    showToast('请先完成一次同步，生成私有 Gist。');
    return;
  }
  const link = makeGistSyncLink(location.origin + location.pathname, {
    gistId: state.gistId,
    token: state.syncToken
  });
  try {
    await navigator.clipboard.writeText(link);
    showToast('同步链接已复制。链接含密钥，请只发给自己的设备。');
  } catch (_) {
    showToast('无法访问剪贴板，请在连接页面手动输入令牌和 Gist ID。');
  }
}

function renderTodayStats() {
  const active = activeEntries(state.entries);
  const month = monthStats(state.entries, today.getFullYear(), today.getMonth());
  $('#todayStreak').textContent = calcStreak(state.entries, todayKey);
  $('#todayDays').textContent = active.length;
  $('#todayWords').textContent = month.words;
}

function renderTraceStats() {
  const total = totalStats(state.entries);
  $('#traceDays').innerHTML = `${total.days}<small>天</small>`;
  $('#traceStreak').innerHTML = `${calcStreak(state.entries, todayKey)}<small>天</small>`;
  $('#traceWords').innerHTML = `${total.words}<small>字</small>`;
  $('#monthStars').textContent = monthStats(state.entries, today.getFullYear(), today.getMonth()).days;
}

function renderStarMap() {
  const width = 560;
  const height = 220;
  const active = activeMap();
  const days = [];
  for (let i = 27; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push({ date, id: dateKey(date), entry: active[dateKey(date)] });
  }
  const points = days.map((day, index) => {
    const jitter = Math.sin(index * 1.71 + 0.6) * 9 + Math.cos(index * 0.57) * 4;
    return {
      ...day,
      x: 26 + index * ((width - 52) / 27),
      y: 108 + Math.sin(index * 0.8 + 0.2) * 31 + jitter
    };
  });
  const baseLine = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  let lit = '';
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].entry || points[i - 1].entry) {
      const a = points[i - 1];
      const b = points[i];
      lit += `<line class="star-line-lit" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" opacity="${points[i].entry && points[i - 1].entry ? '.8' : '.32'}"></line>`;
    }
  }
  const nodes = points.map((point, index) => {
    if (!point.entry) {
      const isToday = point.id === todayKey;
      return `${isToday ? `<circle class="star-today-ring" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="8"></circle>` : ''}<circle class="star-empty-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${isToday ? 2.8 : 1.6}"></circle>`;
    }
    const words = charCount(point.entry.content);
    const radius = Math.min(6.4, 3.2 + words / 140);
    const label = `${chineseDate(point.date, { month: 'long', day: 'numeric' })}：${point.entry.title || fallbackTitle(point.entry.content)}`;
    return `<circle class="star-halo" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${(radius + 6).toFixed(1)}"></circle>
      <circle class="star-recorded" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="${radius.toFixed(1)}" tabindex="0" role="button" data-star-date="${point.id}" aria-label="${escapeHTML(label)}"><title>${escapeHTML(label)}</title></circle>
      <circle class="star-hit" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="12" data-star-date="${point.id}" aria-hidden="true"></circle>`;
  }).join('');
  const labels = points.map((point, index) => {
    if (![0, 7, 14, 21, 27].includes(index)) return '';
    const text = index === 27 ? '今天' : chineseDate(point.date, { month: 'numeric', day: 'numeric' });
    return `<text class="star-label" x="${point.x.toFixed(1)}" y="204" text-anchor="${index === 0 ? 'start' : index === 27 ? 'end' : 'middle'}">${text}</text>`;
  }).join('');
  $('#starMap').innerHTML = `<polyline class="star-line" points="${baseLine}"></polyline>${lit}${nodes}${labels}`;
  $('#starEmpty').hidden = Boolean(days.find((day) => day.entry));
  $$('[data-star-date]').forEach((node) => {
    node.addEventListener('click', () => openEntry(node.dataset.starDate));
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openEntry(node.dataset.starDate);
      }
    });
  });
}

function renderCalendar() {
  const year = state.viewedMonth.getFullYear();
  const month = state.viewedMonth.getMonth();
  const active = activeMap();
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<span class="day-cell is-blank" aria-hidden="true"></span>');
  let count = 0;
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(year, month, day);
    const id = dateKey(date);
    const entry = active[id];
    const words = entry ? charCount(entry.content) : 0;
    const level = words <= 30 ? 1 : words <= 80 ? 2 : words <= 170 ? 3 : 4;
    const classes = ['day-cell', entry ? 'is-recorded' : '', entry ? `level-${level}` : '', id === todayKey ? 'is-today' : ''].filter(Boolean).join(' ');
    if (entry) {
      count += 1;
      cells.push(`<button class="${classes}" type="button" data-calendar-date="${id}" aria-label="${escapeHTML(chineseDate(date, { month: 'long', day: 'numeric' }))}，已记录 ${words} 字">${day}</button>`);
    } else {
      cells.push(`<span class="${classes}">${day}</span>`);
    }
  }
  $('#calendarGrid').innerHTML = cells.join('');
  $('#monthLabel').textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
  $('#calendarSummary').textContent = count ? `这个月有 ${count} 天在发光` : '这个月还没有记录';
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  $('#nextMonth').disabled = state.viewedMonth >= currentMonth;
  $$('[data-calendar-date]').forEach((node) => node.addEventListener('click', () => openEntry(node.dataset.calendarDate)));
}

function renderTimeline() {
  const entries = activeEntries(state.entries);
  const list = $('#entryList');
  if (!entries.length) {
    list.innerHTML = '<div class="entry-empty">你的第一条记录，会从今晚开始。<br>写下一个小收获，让这里长出一颗星。</div>';
    $('#toggleEntries').hidden = true;
    return;
  }
  const visible = state.showAllEntries ? entries : entries.slice(0, 6);
  list.innerHTML = visible.map((entry) => {
    const date = dateFromKey(entry.id);
    const title = entry.title || fallbackTitle(entry.content);
    return `<button class="entry-row" type="button" data-entry-date="${entry.id}" aria-label="查看 ${escapeHTML(chineseDate(date, { month: 'long', day: 'numeric' }))} 的记录">
      <span><span class="entry-day">${String(date.getDate()).padStart(2, '0')}</span><span class="entry-date">${escapeHTML(chineseDate(date, { month: 'short', weekday: 'short' }))}</span></span>
      <span class="entry-copy"><span class="entry-title">${escapeHTML(title)}</span><span class="entry-preview">${escapeHTML(entry.content.replace(/\s+/g, ' '))}</span></span>
      <span class="entry-side">${entry.tag ? `<span class="entry-tag">${escapeHTML(entry.tag)}</span>` : ''}<span>${charCount(entry.content)} 字</span></span>
    </button>`;
  }).join('');
  $$('[data-entry-date]').forEach((node) => node.addEventListener('click', () => openEntry(node.dataset.entryDate)));
  const toggle = $('#toggleEntries');
  toggle.hidden = entries.length <= 6;
  toggle.textContent = state.showAllEntries ? '收起' : `查看全部 ${entries.length} 条`;
}

function renderAll() {
  renderTodayStats();
  renderTraceStats();
  renderStarMap();
  renderCalendar();
  renderTimeline();
  renderSyncUI();
}

function openEntry(id) {
  const entry = activeMap()[id];
  if (!entry) return;
  state.detailDate = id;
  const date = dateFromKey(id);
  $('#dialogDate').textContent = chineseDate(date, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  $('#dialogTitle').textContent = entry.title || fallbackTitle(entry.content);
  $('#dialogStory').textContent = entry.content;
  $('#dialogTag').textContent = entry.tag || '未分类';
  $('#dialogWords').textContent = `${charCount(entry.content)} 字`;
  if (typeof entryDialog.showModal === 'function') entryDialog.showModal();
  else entryDialog.setAttribute('open', '');
}

function closeEntryDialog() {
  if (typeof entryDialog.close === 'function') entryDialog.close();
  else entryDialog.removeAttribute('open');
}

async function removeDetailEntry() {
  if (!state.detailDate) return;
  const ok = window.confirm('确定删除这一天的记录吗？删除也会同步到其他设备。');
  if (!ok) return;
  try {
    await deleteEntry(state.detailDate);
    state.entries = mergeEntries(state.entries.filter((entry) => entry.id !== state.detailDate), [
      { ...activeMap()[state.detailDate], deleted: true, updatedAt: new Date().toISOString() }
    ].filter((entry) => entry.id));
    closeEntryDialog();
    loadTodayIntoForm();
    renderAll();
    showToast('记录已删除。');
    scheduleSync();
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  }
}

async function exportBackup() {
  const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), entries: state.entries };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `进步记录本备份-${todayKey}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('备份文件已生成。');
}

async function importBackupFile(file) {
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const rows = payload.entries || payload;
    if (!Array.isArray(rows)) throw new Error('文件中没有记录数组');
    await putEntries(rows);
    state.entries = mergeEntries(state.entries, rows);
    loadTodayIntoForm();
    renderAll();
    showToast(`已导入 ${activeEntries(rows).length} 天记录。`);
    scheduleSync();
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  } finally {
    $('#backupFile').value = '';
  }
}

async function initSyncFromURL() {
  const config = parseGistSyncHash(location.hash);
  if (!config) return null;
  history.replaceState(null, '', location.pathname + location.search);
  await setMeta('syncToken', config.token);
  await setMeta('gistId', config.gistId);
  return config;
}

async function bootstrap() {
  updateHeaderDate();
  const urlConfig = await initSyncFromURL();
  state.syncToken = urlConfig?.token || (await getMeta('syncToken', '')) || '';
  state.gistId = urlConfig?.gistId || (await getMeta('gistId', '')) || '';
  state.lastSyncAt = await getMeta('lastSyncAt', null);
  state.entries = await getAllEntries();
  if (!state.entries.length && state.syncToken) {
    state.syncMessage = '正在从 GitHub 取回记录';
  }
  renderAll();
  loadTodayIntoForm();
  await requestPersistentStorage();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (state.syncToken) performSync({ silent: true });
}

form.addEventListener('submit', saveToday);
titleInput.addEventListener('input', () => updateSaveState(Boolean(activeMap()[todayKey])));
storyInput.addEventListener('input', () => {
  updateCharCount();
  updateSaveState(Boolean(activeMap()[todayKey]));
});
$$('.tag').forEach((button) => button.addEventListener('click', () => {
  state.selectedTag = state.selectedTag === button.dataset.tag ? '' : button.dataset.tag;
  syncTags();
  updateSaveState(Boolean(activeMap()[todayKey]));
}));
$('#changePrompt').addEventListener('click', () => {
  state.promptIndex = (state.promptIndex + 1) % prompts.length;
  $('#promptText').textContent = prompts[state.promptIndex];
  storyInput.focus();
});
$$('[data-go]').forEach((button) => button.addEventListener('click', () => showPanel(button.dataset.go)));
$('#prevMonth').addEventListener('click', () => {
  state.viewedMonth = new Date(state.viewedMonth.getFullYear(), state.viewedMonth.getMonth() - 1, 1);
  renderCalendar();
});
$('#nextMonth').addEventListener('click', () => {
  const current = new Date(today.getFullYear(), today.getMonth(), 1);
  const next = new Date(state.viewedMonth.getFullYear(), state.viewedMonth.getMonth() + 1, 1);
  if (next <= current) state.viewedMonth = next;
  renderCalendar();
});
$('#toggleEntries').addEventListener('click', () => {
  state.showAllEntries = !state.showAllEntries;
  renderTimeline();
});
$('#closeEntryDialog').addEventListener('click', closeEntryDialog);
entryDialog.addEventListener('click', (event) => { if (event.target === entryDialog) closeEntryDialog(); });
$('#deleteEntry').addEventListener('click', removeDetailEntry);
$('#connectGithub').addEventListener('click', openSyncDialog);
$('#closeSyncDialog').addEventListener('click', closeSyncDialog);
$('#closeSyncDialogSecondary').addEventListener('click', closeSyncDialog);
$('#syncDialog').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeSyncDialog(); });
$('#saveGithubConnection').addEventListener('click', saveGithubConnection);
$('#syncNow').addEventListener('click', () => performSync());
$('#copyLink').addEventListener('click', copySyncLink);
$('#exportBackup').addEventListener('click', exportBackup);
$('#importBackup').addEventListener('click', () => $('#backupFile').click());
$('#backupFile').addEventListener('change', (event) => importBackupFile(event.target.files?.[0]));
$('#installButton').addEventListener('click', async () => {
  if (state.deferredInstall) {
    state.deferredInstall.prompt();
    await state.deferredInstall.userChoice.catch(() => {});
    state.deferredInstall = null;
  } else {
    showToast('请用浏览器菜单选择“添加到主屏幕”。');
  }
});
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.deferredInstall = event;
});
window.addEventListener('online', () => { if (state.syncToken) performSync({ silent: true }); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.syncToken) performSync({ silent: true });
});

window.__progressApp = {
  state,
  renderAll,
  async replaceRows(rows) {
    await putEntries(rows);
    state.entries = mergeEntries(rows);
    loadTodayIntoForm();
    renderAll();
  },
  importRows,
  performSync
};

bootstrap().catch((error) => {
  showToast(`启动失败：${error.message}`);
  console.error(error);
});
