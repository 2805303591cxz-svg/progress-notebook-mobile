import test from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateLegacy,
  mergeEntries,
  activeEntries,
  calcStreak,
  monthStats,
  totalStats,
  statePayload,
  isValidSyncCode,
  generateSyncCode,
  makeSyncLink
} from '../src/core.js';

const legacy = {
  '2026-10-23': {
    title: '把繁忙的事情理清',
    content: '完成了比赛和整理。',
    tag: '生活',
    createdAt: '2026-10-23T15:39:29.975Z',
    updatedAt: '2026-10-23T16:03:35.152Z'
  },
  '2026-10-27': {
    title: '作文健身理发',
    content: '听完作文讲解，也完成了锻炼。',
    tag: '学习',
    createdAt: '2026-10-27T14:59:10.421Z',
    updatedAt: '2026-10-27T15:07:42.896Z'
  }
};

test('旧版记录可迁移且不会丢失原始时间', () => {
  const rows = migrateLegacy(legacy, '2026-10-29T00:00:00.000Z');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, '2026-10-23');
  assert.equal(rows[0].deleted, false);
  assert.equal(rows[0].updatedAt, legacy['2026-10-23'].updatedAt);
});

test('同日记录取 updatedAt 更新的版本', () => {
  const old = { id: '2026-10-29', title: '旧', content: '旧内容', updatedAt: '2026-10-29T10:00:00.000Z' };
  const fresh = { id: '2026-10-29', title: '新', content: '新内容', updatedAt: '2026-10-29T11:00:00.000Z' };
  const rows = mergeEntries([old], [fresh]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].content, '新内容');
});

test('删除墓碑优先，且不会出现在有效记录里', () => {
  const live = { id: '2026-10-28', content: '写过', updatedAt: '2026-10-28T10:00:00.000Z', deleted: false };
  const deleted = { id: '2026-10-28', content: '写过', updatedAt: '2026-10-28T11:00:00.000Z', deleted: true };
  const rows = mergeEntries([live], [deleted]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deleted, true);
  assert.equal(activeEntries(rows).length, 0);
});

test('不同日期合并后都保留并按日期倒序', () => {
  const rows = mergeEntries([
    { id: '2026-10-23', content: 'A', updatedAt: '2026-10-23T10:00:00Z' },
    { id: '2026-10-27', content: 'B', updatedAt: '2026-10-27T10:00:00Z' }
  ]);
  assert.deepEqual(rows.map((r) => r.id), ['2026-10-27', '2026-10-23']);
});

test('今天尚未记录时，连续天数仍从昨天计算', () => {
  const rows = [
    { id: '2026-10-27', content: 'A', updatedAt: '2026-10-27T10:00:00Z' },
    { id: '2026-10-28', content: 'B', updatedAt: '2026-10-28T10:00:00Z' }
  ];
  assert.equal(calcStreak(rows, '2026-10-29'), 2);
});

test('月度与总统计只计算有效记录', () => {
  const rows = [
    { id: '2026-10-27', content: '一二三', updatedAt: '2026-10-27T10:00:00Z' },
    { id: '2026-10-28', content: '四五六七', updatedAt: '2026-10-28T10:00:00Z' },
    { id: '2026-10-29', content: '', deleted: true, updatedAt: '2026-10-29T10:00:00Z' }
  ];
  assert.deepEqual(monthStats(rows, 2026, 9), { days: 2, words: 7 });
  assert.deepEqual(totalStats(rows), { days: 2, words: 7 });
});

test('同步载荷保留删除墓碑', () => {
  const payload = statePayload([
    { id: '2026-10-29', title: '标题', content: '正文', tag: '学习', updatedAt: '2026-10-29T10:00:00Z' },
    { id: '2026-10-28', content: '已删', deleted: true, updatedAt: '2026-10-28T10:00:00Z' }
  ]);
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.entries.length, 2);
  assert.equal(payload.entries.find((entry) => entry.id === '2026-10-28').deleted, true);
});

test('同步码使用足够长的无歧义字符', () => {
  const code = generateSyncCode(() => 1, 20);
  assert.equal(code.length, 20);
  assert.equal(isValidSyncCode(code), true);
  assert.equal(isValidSyncCode('123'), false);
});

test('同步链接把同步码放在不会发送给服务器的 hash 中', () => {
  const link = makeSyncLink('https://example.github.io/app/', 'ABCDEFGH23456789');
  assert.match(link, /#code=ABCDEFGH23456789$/);
  assert.equal(new URL(link).searchParams.has('code'), false);
});
