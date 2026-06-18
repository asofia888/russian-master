'use strict';
// srs.js の単体テスト。実行: npm test (= node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const { nextIntervalDays, nextEase, mergeProgress } = require('./srs.js');

const approx = (a, b) => Math.abs(a - b) < 1e-9;

test('nextIntervalDays: 失敗(q<3)は 0 日(当日内の再学習)', () => {
  assert.equal(nextIntervalDays({ e: 2.5, i: 10, r: 5 }, 1), 0);
  assert.equal(nextIntervalDays({ e: 2.5, i: 10, r: 5 }, 2), 0);
});

test('nextIntervalDays: 最初の2回の正解は固定で 1 → 6 日', () => {
  assert.equal(nextIntervalDays({ e: 2.5, i: 0, r: 0 }, 4), 1);
  assert.equal(nextIntervalDays({ e: 2.5, i: 1, r: 1 }, 4), 6);
});

test('nextIntervalDays: 3回目以降は ease 倍(最低1日)', () => {
  assert.equal(nextIntervalDays({ e: 2.5, i: 6, r: 2 }, 4), 15);  // round(6*2.5)
  assert.equal(nextIntervalDays({ e: 1.3, i: 1, r: 2 }, 4), 1);   // round(1*1.3)=1
});

test('nextIntervalDays: 簡単(q=5)は最低でも +1日 かつ 1.3倍', () => {
  assert.equal(nextIntervalDays({ e: 2.0, i: 10, r: 3 }, 5), 26); // max(21, round(20*1.3))
  assert.equal(nextIntervalDays({ e: 2.5, i: 0, r: 0 }, 5), 2);   // max(2, round(1*1.3))
});

test('nextEase: 簡単で上昇 / もう一度で低下 / 下限1.3', () => {
  assert.ok(approx(nextEase(2.5, 5), 2.6)); // +0.1
  assert.ok(approx(nextEase(2.5, 4), 2.5)); // 正解は据え置き
  assert.ok(nextEase(2.5, 1) < 2.5);        // もう一度で低下
  assert.ok(approx(nextEase(1.3, 1), 1.3)); // 下限で止まる
});

test('mergeProgress: 新規 learned だけ加算し既存は二重計上しない', () => {
  const target = { learned: { a: 1 }, srs: {} };
  const r = mergeProgress(target, { learned: { a: 1, b: 1, c: 1 }, srs: {} });
  assert.equal(r.learned, 2);
  assert.deepEqual(Object.keys(target.learned).sort(), ['a', 'b', 'c']);
});

test('mergeProgress: 新しい記録優先 — 古い取り込みは新しいローカルを上書きしない', () => {
  const target = { learned: {}, srs: { k: { e: 2.5, i: 10, r: 3, d: 0, l: 200 } } };
  mergeProgress(target, { learned: {}, srs: { k: { e: 1.3, i: 1, r: 1, d: 0, l: 100 } } });
  assert.equal(target.srs.k.i, 10); // ローカル維持
  assert.equal(target.srs.k.l, 200);
});

test('mergeProgress: 同じか新しい l なら置き換える', () => {
  const target = { learned: {}, srs: { k: { e: 2.5, i: 10, r: 3, d: 0, l: 100 } } };
  mergeProgress(target, { learned: {}, srs: { k: { e: 2.0, i: 30, r: 5, d: 0, l: 100 } } });
  assert.equal(target.srs.k.i, 30); // l が同値(>=)なので置換
});

test('mergeProgress: 壊れた srs エントリは無視し、型は数値へ強制', () => {
  const target = { learned: {}, srs: {} };
  const r = mergeProgress(target, { learned: {}, srs: { bad: null, ok: { e: '2.1', i: '5', r: '2', d: '0', l: '9' } } });
  assert.equal(r.srs, 1);
  assert.deepEqual(target.srs.ok, { e: 2.1, i: 5, r: 2, d: 0, l: 9 });
});

test('mergeProgress: learned/srs が欠けた入力でも壊れない', () => {
  const target = { learned: {}, srs: {} };
  const r = mergeProgress(target, {});
  assert.deepEqual(r, { learned: 0, srs: 0 });
});
