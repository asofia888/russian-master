'use strict';
/**
 * srs.js — ロシア語マスターのSRS純粋ロジック(SM-2 lite)と進捗マージ。
 *
 * DOM や localStorage には一切触れない純粋関数だけを置く。
 * ブラウザでは classic <script> として読み込まれ、関数をグローバルに公開する
 * (index.html がこれらを参照する)。Node では require して単体テストする(srs.test.js)。
 *
 * SRS状態 s の形: { e:ease, i:間隔(日), r:連続正解数, d:次回期限(ms), l:最終学習(ms) }
 * 評価 q: 1=もう一度 / 4=正解 / 5=簡単
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;     // Node
  else Object.assign(root, api);                                                  // ブラウザ: グローバル公開
})(typeof self !== 'undefined' ? self : this, function () {

  // 評価 q に対する次回間隔(日)。q<3(失敗)は 0 を返す = 当日内の再学習扱い。
  // s は変更しない。gradeSrs と previewInterval が共通で使う唯一の真実。
  function nextIntervalDays(s, q) {
    if (q < 3) return 0;
    let i = s.r === 0 ? 1 : s.r === 1 ? 6 : Math.max(1, Math.round(s.i * s.e));
    if (q === 5) i = Math.max(i + 1, Math.round(i * 1.3));   // easy bonus
    return i;
  }

  // SM-2 の ease 更新。下限 1.3 でクランプ。
  function nextEase(e, q) {
    return Math.max(1.3, e + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }

  // 取り込んだ進捗 p を target にその場マージする(新しい記録優先)。
  // SRSエントリは、取り込み側の最終学習 l が現在以上のときだけ置き換える
  // (= 古いバックアップを読み込んでも、より新しいローカル履歴を巻き戻さない)。
  // 日別学習カウント daily は日付ごとに大きい方を採用(二重計上せず、取りこぼしもしない)。
  // 戻り値: 新規追加した learned 件数と、追加/更新した srs 件数。
  function mergeProgress(target, p) {
    let nl = 0, ns = 0;
    Object.keys((p && p.learned) || {}).forEach(k => {
      if (!target.learned[k]) nl++;
      target.learned[k] = 1;
    });
    Object.keys((p && p.srs) || {}).forEach(k => {
      const s = p.srs[k];
      if (!s || typeof s !== 'object') return;
      const cur = target.srs[k];
      if (!cur || (+s.l || 0) >= (+cur.l || 0)) {
        target.srs[k] = { e: +s.e || 2.5, i: +s.i || 0, r: +s.r || 0, d: +s.d || 0, l: +s.l || 0 };
        ns++;
      }
    });
    if (p && p.daily && typeof p.daily === 'object') {
      if (!target.daily) target.daily = {};
      Object.keys(p.daily).forEach(k => {
        const n = +p.daily[k] || 0;
        if (n > (target.daily[k] || 0)) target.daily[k] = n;
      });
    }
    return { learned: nl, srs: ns };
  }

  // 連続学習日数。daily は { 'YYYY-MM-DD': 学習件数 }、today も 'YYYY-MM-DD'。
  // 今日まだ学習していなくてもストリークは切れない(昨日まで続いていれば継続中とみなす)。
  function calcStreak(daily, today) {
    if (!daily || typeof daily !== 'object') return 0;
    const DAY = 86400000;
    let t = Date.parse(today + 'T00:00:00Z');
    if (isNaN(t)) return 0;
    if (!(+daily[today] > 0)) t -= DAY;   // 今日が未学習なら昨日から遡る
    let n = 0;
    while (+daily[new Date(t).toISOString().slice(0, 10)] > 0) { n++; t -= DAY; }
    return n;
  }

  return { nextIntervalDays, nextEase, mergeProgress, calcStreak };
});
