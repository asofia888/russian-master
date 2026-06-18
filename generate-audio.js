#!/usr/bin/env node
'use strict';
/**
 * generate-audio.js — ロシア語マスター用 音声一括生成スクリプト
 *
 * courses.json の全テキスト(例文・語彙・アルファベット)を
 * Google Cloud Text-to-Speech の Chirp 3: HD 音声 (ru-RU) で MP3 化し、
 * audio/<md5先頭12桁>.mp3 に保存して audio-manifest.json(テキスト→ファイル名の対応表)を生成する。
 *
 * 使い方:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json   # リポジトリの外に置くこと
 *   npm install
 *   node generate-audio.js --list-voices          # 利用可能な ru-RU 音声を一覧表示
 *   node generate-audio.js --dry-run              # 件数・文字数・概算コストだけ表示
 *   node generate-audio.js                        # 全件生成(既存ファイルはスキップ=途中再開可)
 *   node generate-audio.js --voice ru-RU-Chirp3-HD-Charon   # 男性音声で生成
 *   node generate-audio.js --limit 20             # 最初の20件だけ生成(試聴用)
 *
 * オプション:
 *   --voice <name>        使用する音声名(既定: ru-RU-Chirp3-HD-Leda)
 *   --rate <0.25-2.0>     話速(既定: 0.9。アプリ側はこの値を基準に再生速度を補正する)
 *   --concurrency <n>     並列リクエスト数(既定: 4)
 *   --limit <n>           先頭 n 件のみ処理(動作確認用)
 *   --force               既存 MP3 も作り直す
 *   --dry-run             生成せずに件数と概算コストを表示
 *   --list-voices         ru-RU の利用可能音声を表示して終了
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const textToSpeech = require('@google-cloud/text-to-speech');

const COURSES_PATH = path.join(__dirname, 'courses.json');
const AUDIO_DIR = path.join(__dirname, 'audio');
const MANIFEST_PATH = path.join(__dirname, 'audio-manifest.json');

// ---------- CLI ----------
const argv = process.argv.slice(2);
function flag(name) { return argv.includes(name); }
function opt(name, def) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : def;
}

const VOICE = opt('--voice', 'ru-RU-Chirp3-HD-Leda');
const RATE = parseFloat(opt('--rate', '0.9'));
const CONCURRENCY = Math.max(1, parseInt(opt('--concurrency', '4'), 10));
const LIMIT = parseInt(opt('--limit', '0'), 10);
const FORCE = flag('--force');
const DRY_RUN = flag('--dry-run');
const LIST_VOICES = flag('--list-voices');

// ---------- テキスト収集 ----------
// manifest のキーは「アプリが表示・再生するテキスト」(sentence.ru / word.ru)。
// アルファベット表(例: "Б б")は tts フィールドの読み上げ用テキスト(例: "бэ")で合成する。
// ファイル名は md5(読み上げテキスト) 先頭12桁 — 同じ音声は1ファイルに共有される。
function collectTexts() {
  const courses = JSON.parse(fs.readFileSync(COURSES_PATH, 'utf8'));
  const map = new Map(); // key(表示テキスト) -> spoken(読み上げテキスト)
  for (const courseKey of Object.keys(courses)) {
    for (const unit of courses[courseKey].units) {
      for (const s of unit.sentences) {
        if (s.ru && !map.has(s.ru)) map.set(s.ru, s.tts || s.ru);
        for (const w of s.words || []) {
          if (w.ru && !map.has(w.ru)) map.set(w.ru, w.tts || w.ru);
        }
      }
    }
  }
  return map;
}

function fileNameFor(spoken) {
  return crypto.createHash('md5').update(spoken, 'utf8').digest('hex').slice(0, 12) + '.mp3';
}

// ---------- メイン ----------
async function listVoices() {
  const client = new textToSpeech.TextToSpeechClient();
  const [res] = await client.listVoices({ languageCode: 'ru-RU' });
  const voices = (res.voices || []).sort((a, b) => a.name.localeCompare(b.name));
  console.log('ru-RU で利用可能な音声:');
  for (const v of voices) {
    const hd = v.name.includes('Chirp3-HD') ? '  ★ Chirp 3: HD' : '';
    console.log(`  ${v.name}  (${v.ssmlGender})${hd}`);
  }
  console.log('\n★ の付いた Chirp 3: HD 音声の使用を推奨します。');
}

async function synthesize(client, spoken, outPath) {
  const request = {
    input: { text: spoken },
    voice: { languageCode: 'ru-RU', name: VOICE },
    audioConfig: { audioEncoding: 'MP3', speakingRate: RATE },
  };
  const maxAttempts = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const [response] = await client.synthesizeSpeech(request);
      fs.writeFileSync(outPath, response.audioContent, 'binary');
      return;
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const wait = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
      console.warn(`  リトライ ${attempt}/${maxAttempts - 1} (${wait / 1000}s 待機): ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  if (LIST_VOICES) return listVoices();

  const texts = collectTexts();
  let entries = [...texts.entries()]; // [key, spoken]
  if (LIMIT > 0) entries = entries.slice(0, LIMIT);

  const totalChars = entries.reduce((a, [, spoken]) => a + spoken.length, 0);
  console.log(`テキスト総数: ${texts.size} 件(処理対象 ${entries.length} 件)`);
  console.log(`読み上げ文字数: 約 ${totalChars.toLocaleString()} 文字`);
  console.log(`音声: ${VOICE} / 話速: ${RATE}`);
  console.log(`概算コスト: $${((totalChars / 1e6) * 30).toFixed(2)} (Chirp 3: HD を $30/100万文字とした場合。最新の料金表で要確認)`);

  if (DRY_RUN) {
    console.log('\n--dry-run のため生成はしません。');
    return;
  }

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const client = new textToSpeech.TextToSpeechClient();

  let done = 0, skipped = 0, failed = 0;
  const queue = [...entries];
  async function worker() {
    while (queue.length) {
      const [key, spoken] = queue.shift();
      const file = fileNameFor(spoken);
      const outPath = path.join(AUDIO_DIR, file);
      if (!FORCE && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        skipped++;
      } else {
        try {
          await synthesize(client, spoken, outPath);
          done++;
        } catch (err) {
          failed++;
          console.error(`✗ 生成失敗: "${spoken.slice(0, 40)}" — ${err.message}`);
          continue;
        }
      }
      const n = done + skipped + failed;
      if (n % 50 === 0 || n === entries.length) {
        console.log(`  進捗 ${n}/${entries.length} (生成 ${done} / スキップ ${skipped} / 失敗 ${failed})`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // manifest は全テキスト分を書き出す(--limit 時は対象分のみ)
  const manifest = {};
  for (const [key, spoken] of entries) {
    const file = fileNameFor(spoken);
    if (fs.existsSync(path.join(AUDIO_DIR, file))) manifest[key] = file;
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 1), 'utf8');

  console.log(`\n完了: 生成 ${done} / スキップ ${skipped} / 失敗 ${failed}`);
  console.log(`audio-manifest.json に ${Object.keys(manifest).length} 件を書き出しました。`);
  if (failed > 0) {
    console.log('失敗があります。もう一度実行すると失敗分だけ再試行します(既存はスキップされます)。');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('エラー:', err.message);
  console.error('GOOGLE_APPLICATION_CREDENTIALS が正しく設定されているか、API が有効か確認してください。');
  process.exit(1);
});
