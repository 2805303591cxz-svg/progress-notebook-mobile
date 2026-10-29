import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../scripts/serve.mjs';
import { launch, sleep } from '../scripts/browser.mjs';

const sampleRows = [
  { id: '2026-10-23', title: '把繁忙的事情理清', content: '完成了比赛和整理。', tag: '生活', createdAt: '2026-10-23T15:39:29.975Z', updatedAt: '2026-10-23T16:03:35.152Z', deleted: false },
  { id: '2026-10-24', title: '学习健身辩论三不误', content: '完成了翻译练习和锻炼。', tag: '', createdAt: '2026-10-24T15:33:33.389Z', updatedAt: '2026-10-24T15:33:33.389Z', deleted: false },
  { id: '2026-10-25', title: '辩论锻炼思想', content: '参加了辩论赛。', tag: '', createdAt: '2026-10-25T15:41:43.703Z', updatedAt: '2026-10-25T15:41:43.703Z', deleted: false }
];

test('手机端主流程、刷新持久化与离线打开', async () => {
  const server = await startServer({ root: 'dist', port: 0, host: '127.0.0.1' });
  const browser = await launch({ viewport: { width: 375, height: 812 }, mobile: true, name: 'progress-e2e' });
  try {
    await browser.goto(server.url('/'), 20000);
    await browser.waitFor("!!window.__progressApp && !document.querySelector('#panel-today').hidden", 15000);
    await browser.evaluate(`window.__progressApp.replaceRows(${JSON.stringify(sampleRows)})`);
    await browser.waitFor("document.querySelector('#todayDays').textContent === '3'", 5000);

    await browser.evaluate(`
      const title = document.querySelector('#entryTitle');
      const story = document.querySelector('#entryStory');
      title.value = '今天完成了手机版首测';
      title.dispatchEvent(new Event('input', { bubbles: true }));
      story.value = '手机版可以记录、保存，并且断网以后数据仍然留在设备里。';
      story.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('.tag[data-tag="学习"]').click();
      document.querySelector('#saveButton').click();
    `);
    await browser.waitFor("window.__progressApp.state.entries.some(e => e.id === '2026-10-29' && e.title === '今天完成了手机版首测')", 8000);
    await browser.waitFor("document.querySelector('#todayStreak').textContent === '1'", 5000);

    await browser.cdp.send('Page.reload', { ignoreCache: false });
    await sleep(1200);
    await browser.waitFor("document.querySelector('#entryTitle').value === '今天完成了手机版首测'", 10000);
    await browser.evaluate("document.querySelector('[data-go=\"trace\"]').click()");
    await browser.waitFor("!document.querySelector('#panel-trace').hidden", 5000);
    await browser.waitFor("document.querySelectorAll('.star-recorded').length >= 4", 5000);

    await browser.evaluate("document.querySelector('[data-go=settings]').click()");
    await browser.waitFor("!document.querySelector('#panel-settings').hidden && !!document.querySelector('#connectGithub')", 5000);
    await browser.evaluate("document.querySelector('#connectGithub').click()");
    await browser.waitFor("document.querySelector('#syncDialog').open === true", 3000);
    await browser.evaluate("document.querySelector('#closeSyncDialog').click()");

    const swReady = await browser.evaluate("navigator.serviceWorker.ready.then(r => !!r.active)");
    assert.equal(swReady, true);
    await sleep(500);
    await browser.screenshot('artifacts/e2e-mobile.png');

    await browser.cdp.send('Network.enable');
    await browser.cdp.send('Network.emulateNetworkConditions', {
      offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0
    });
    await browser.cdp.send('Page.reload', { ignoreCache: false });
    await sleep(1600);
    await browser.waitFor("!!window.__progressApp && window.__progressApp.state.entries.length >= 4", 12000);
    const offlineTitle = await browser.evaluate("document.querySelector('#entryTitle').value");
    assert.equal(offlineTitle, '今天完成了手机版首测');
  } finally {
    await browser.close();
    await server.close();
  }
});
