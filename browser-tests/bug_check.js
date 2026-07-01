/**
 * bug_check.js — 不具合確認テスト
 * 1. コメント部のシングルクリックで反応があるか
 * 2. DDで移動後に .sel が残り続けるか
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const SS = path.join(__dirname, 'screenshots_bug');
fs.mkdirSync(SS, { recursive: true });

async function ss(page, name) {
  await page.screenshot({ path: path.join(SS, name + '.png') });
  console.log('  📸', name + '.png');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);

  // ログイン
  await page.fill('#pwNew1', '0000');
  await page.fill('#pwNew2', '0000');
  await page.click('#pwRegSubmit');
  await page.waitForTimeout(2000);

  // 7/13へスクロール
  await page.evaluate(() => {
    document.getElementById('scroll').scrollLeft = Math.max(0, 193 * 46 - 400);
  });
  await page.waitForTimeout(300);

  // タスク（スケジュール部）と コメント（コメント部）をUIで追加
  const pos = await page.evaluate(() => {
    const dc = document.querySelector('[data-d="2026-07-13"]');
    const ln = document.getElementById('lanes');
    const dr = dc ? dc.getBoundingClientRect() : null;
    const lr = ln ? ln.getBoundingClientRect() : null;
    return { x: dr ? dr.left + 23 : 423, y: lr ? lr.top + 15 : 136 };
  });
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(200);
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(300);
  const inp = await page.$('.inlineEdit');
  if (inp) { await page.fill('.inlineEdit', 'くろちゃんテスト用'); await page.keyboard.press('Enter'); await page.waitForTimeout(400); }

  const nc = await page.evaluate(() => {
    const el = document.querySelector('#daynotes [data-date="2026-07-13"]');
    const r = el ? el.getBoundingClientRect() : null;
    return r ? { x: r.left + 23, y: r.top + 32 } : { x: 423, y: 575 };
  });
  await page.mouse.click(nc.x, nc.y);
  await page.waitForTimeout(200);
  await page.mouse.click(nc.x, nc.y);
  await page.waitForTimeout(300);
  const ta = await page.$('.noteEditTa');
  if (ta) { await page.fill('.noteEditTa', 'くろちゃんテスト用'); await page.keyboard.press('Enter'); await page.waitForTimeout(400); }

  // スクロールリセット
  await page.evaluate(() => {
    document.getElementById('scroll').scrollLeft = Math.max(0, 193 * 46 - 400);
    document.getElementById('scroll').scrollTop = 300;
  });
  await page.waitForTimeout(300);

  // ==============================
  // 不具合1: コメント部のシングルクリックで .sel が付くか
  // ==============================
  console.log('\n=== 不具合1確認: コメント部シングルクリック ===');
  const notePos = await page.evaluate(() => {
    const el = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
    const r = el ? el.getBoundingClientRect() : null;
    return r && r.top > 0 && r.top < window.innerHeight ? { x: r.left + 23, y: r.top + 32 } : null;
  });
  console.log('  コメントセル位置:', JSON.stringify(notePos));

  if (notePos) {
    await ss(page, '01_before_single_click');
    await page.mouse.click(notePos.x, notePos.y);
    await page.waitForTimeout(400);
    await ss(page, '02_after_single_click');

    const selExists = await page.evaluate(() => !!document.querySelector('.ncell.sel'));
    const hasClass713 = await page.evaluate(() => {
      const el = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
      return el ? Array.from(el.classList).join(', ') : 'NOT_FOUND';
    });
    console.log('  シングルクリック後 .sel あり:', selExists ? '❌ 付いていない（本来付くべき？）→ 不具合あり' : '✅ なし');
    console.log('  7/13 セルのclassList:', hasClass713);
  }

  // ==============================
  // 不具合2: DDで移動後の .sel が消えるか
  // ==============================
  console.log('\n=== 不具合2確認: DD後のフォーカス残り ===');

  const notePos2 = await page.evaluate(() => {
    const el = document.querySelector('#daynotes .ncell[data-date="2026-07-13"]');
    const r = el ? el.getBoundingClientRect() : null;
    return r && r.top > 0 && r.top < window.innerHeight ? { x: r.left + 23, y: r.top + 32 } : null;
  });

  if (notePos2) {
    // コメントをドラッグして1行下（ncell2の同日）へ移動
    const nc2pos = await page.evaluate(() => {
      const el = document.querySelector('#daynotes2 .ncell2[data-date="2026-07-13"]');
      const r = el ? el.getBoundingClientRect() : null;
      return r ? { x: r.left + 23, y: r.top + 32 } : null;
    });
    console.log('  ドロップ先（daynotes2 7/13）:', JSON.stringify(nc2pos));

    await ss(page, '03_before_dd');

    // DD実行（7/13のコメントを daynotes2 の7/13へ）
    await page.mouse.move(notePos2.x, notePos2.y);
    await page.mouse.down();
    await page.waitForTimeout(80);
    const targetY = nc2pos ? nc2pos.y : notePos2.y + 67;
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(notePos2.x, notePos2.y + (targetY - notePos2.y) * i / 15);
      await page.waitForTimeout(20);
    }
    await ss(page, '04_during_dd');
    await page.mouse.up();
    await page.waitForTimeout(600);
    await ss(page, '05_after_dd');

    const selAfterDD = await page.evaluate(() => {
      const sels = document.querySelectorAll('.ncell.sel, .ncell2.sel, .ncell3.sel, .ncell4.sel, .ncell5.sel');
      return Array.from(sels).map(el => el.dataset.date + ':' + Array.from(el.classList).join(','));
    });
    console.log('  DD後の .sel 要素:', selAfterDD.length > 0 ? selAfterDD : 'なし');

    // 7/14のコメントセルをシングルクリックして .sel が消えるか確認
    const note714Pos = await page.evaluate(() => {
      const el = document.querySelector('#daynotes .ncell[data-date="2026-07-14"]');
      const r = el ? el.getBoundingClientRect() : null;
      return r && r.top > 0 && r.top < window.innerHeight ? { x: r.left + 23, y: r.top + 32 } : null;
    });
    console.log('  7/14 コメントセル位置:', JSON.stringify(note714Pos));

    if (note714Pos) {
      await page.mouse.click(note714Pos.x, note714Pos.y);
      await page.waitForTimeout(400);
      await ss(page, '06_after_click_714');

      const selAfterClick = await page.evaluate(() => {
        const sels = document.querySelectorAll('.ncell.sel, .ncell2.sel, .ncell3.sel, .ncell4.sel, .ncell5.sel');
        return Array.from(sels).map(el => el.dataset.date + ':' + Array.from(el.classList).join(','));
      });
      console.log('  7/14クリック後の .sel 要素:', selAfterClick.length > 0 ? JSON.stringify(selAfterClick) : 'なし（.sel消えた）');

      const dd713selGone = !selAfterClick.some(s => s.includes('2026-07-13'));
      console.log('  7/13の .sel が消えたか:', dd713selGone ? '✅ 消えた' : '❌ 残ってる ← 不具合');
    }
  }

  await ss(page, '07_final');
  await browser.close();
  console.log('\n=== 確認完了 ===');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
