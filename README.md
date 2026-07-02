# ロシア語マスター(Russian Master)

日本語話者のための例文ベースのロシア語学習PWA。
[タイ語マスター(thai-master)](https://github.com/asofia888/thai-master) と同じ構成・デザイン・学習フローのロシア語版です。

- **文字コース** — キリル文字33字+発音ルール(母音弱化・無声化)+読みの練習
- **初級47ユニット / 中級47ユニット / 上級48ユニット** — 各10文(計約1,480文+語彙約2,000語)
- 学習モード: 一覧 / フラッシュカード / SRS復習(SM-2)/ クイズ(総合4択・聴き取り・語彙の3形式)
- 表示: キリル文字・アクセント位置つきローマ字発音表記・日本語訳
- 音声: Google Cloud Text-to-Speech **Chirp 3: HD(ru-RU)** の事前生成MP3+Web Speech APIフォールバック
- モチベーション: 連続学習日数(ストリーク)+1日の学習目標(20件)をホームに表示
- 進捗は localStorage 保存(JSONエクスポート/インポート対応)・PWAオフライン対応

## ファイル構成

```
russian-master/
├── index.html            # アプリ本体(HTML+CSS+JS)
├── srs.js                # SRS間隔計算・進捗マージの純粋ロジック(ブラウザ/Node共用)
├── srs.test.js           # srs.js の単体テスト(node --test)
├── courses.json          # 学習データ(コース→ユニット→例文・語彙)
├── generate-audio.js     # 音声一括生成スクリプト(Node.js)
├── audio-manifest.json   # テキスト→MP3ファイル名の対応表(generate-audio.js が生成)
├── audio/                # 生成されたMP3(テキストのMD5先頭12桁.mp3)
├── service-worker.js     # PWAキャッシュ
├── manifest.json         # PWAマニフェスト
├── icon.svg / icon-*.png # アイコン
└── vercel.json           # デプロイ用ヘッダー設定
```

> **注意:** `audio/` のMP3と `audio-manifest.json` はリポジトリ作成時点では未生成です。
> 下記の手順で生成するまでは、端末のロシア語TTS(Web Speech API)で再生されます。

---

## 音声の生成手順(Google Cloud Text-to-Speech)

### 1. Google Cloud 側の準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成(または既存のものを使用)
2. **Cloud Text-to-Speech API を有効化**
   - コンソール: 「APIとサービス」→「ライブラリ」→ *Cloud Text-to-Speech API* → 有効にする
   - または CLI: `gcloud services enable texttospeech.googleapis.com`
3. **課金を有効化**(Chirp 3: HD は有料。目安は下記)
4. **サービスアカウントを作成して鍵をダウンロード**
   - 「IAMと管理」→「サービスアカウント」→ 作成(ロールは不要、または *Cloud Text-to-Speech ユーザー*)
   - 「キー」タブ → 鍵を追加 → JSON → ダウンロード
   - **鍵ファイル(service-account.json)はこのリポジトリの中に置かないでください。**
     `.gitignore` で除外してはいますが、リポジトリの外(例: 1つ上の階層)に置くのが安全です。

### 2. 実行

```bash
cd russian-master
npm install                       # @google-cloud/text-to-speech を導入

# 認証情報を指定(リポジトリの外に置いた鍵を指す)
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/keys/service-account.json"
# Windows (PowerShell) の場合:
#   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\keys\service-account.json"

# 利用できる ru-RU 音声を確認(Chirp 3: HD には ★ が付きます)
node generate-audio.js --list-voices

# 件数・文字数・概算コストを確認(生成はしない)
node generate-audio.js --dry-run

# まず20件だけ試して声を確認
node generate-audio.js --limit 20

# 全件生成(中断しても再実行すれば続きから。既存MP3はスキップ)
node generate-audio.js
```

完了すると `audio/` にMP3(約3,500件)、`audio-manifest.json` に対応表が書き出されます。

### 3. 音声の選択(男女の候補)

Chirp 3: HD の ru-RU 対応音声(2026年6月時点の主な8種):

| 性別 | 音声名 | 印象の目安 |
|---|---|---|
| **女性(既定)** | `ru-RU-Chirp3-HD-Leda` | 若々しくクリア |
| 女性 | `ru-RU-Chirp3-HD-Kore` | 落ち着いたミドルトーン |
| 女性 | `ru-RU-Chirp3-HD-Aoede` | 明るく軽やか |
| 女性 | `ru-RU-Chirp3-HD-Zephyr` | はきはきと明瞭 |
| **男性(推奨)** | `ru-RU-Chirp3-HD-Charon` | 低めで聞き取りやすい |
| 男性 | `ru-RU-Chirp3-HD-Orus` | しっかりした中低音 |
| 男性 | `ru-RU-Chirp3-HD-Fenrir` | 力強くエネルギッシュ |
| 男性 | `ru-RU-Chirp3-HD-Puck` | 軽快でフレンドリー |

```bash
# 例: 男性音声で生成
node generate-audio.js --voice ru-RU-Chirp3-HD-Charon
```

音声ラインアップは追加されることがあるため、`--list-voices` での確認が確実です。
話速は既定 0.9(学習用にやや遅め)。`--rate 1.0` などで変更できます。
アプリ側の「ゆっくり再生」ボタンは、この生成済みMP3の再生速度を落として実現しています。

### 4. コストの目安

全テキストの読み上げ文字数は `--dry-run` で表示されます(おおよそ9〜12万文字)。
Chirp 3: HD を **$30/100万文字** とすると全件で **$3前後** ですが、
最新の単価は [Cloud TTS の料金ページ](https://cloud.google.com/text-to-speech/pricing) で確認してください。

---

## ローカルでの動作確認

```bash
cd russian-master
npx serve .
```

表示されたURL(通常 `http://localhost:3000`)をブラウザで開きます。

確認ポイント:
1. ホームに「文字 / 初級 / 中級 / 上級」の4コースが表示される
2. 任意のユニットを開き、一覧 / カード / 復習 / クイズ の4モードが動く
3. キリル文字をタップして音声が鳴る
   - 音声生成**前**: 端末のロシア語TTSで再生(ブラウザ・OSによっては鳴らないことがあります)
   - 音声生成**後**: `audio/` のChirp 3 HD MP3が再生される(DevToolsのNetworkタブで `audio/xxxx.mp3` を確認)
4. 「学習済み」チェックやカードの評価が、リロード後も保持される

> Service Worker のキャッシュが効きすぎるときは、DevTools → Application → Service Workers で
> 「Update on reload」を有効にするか、キャッシュを削除してください。

## テスト

SRSの間隔計算(`nextIntervalDays` / `nextEase`)と進捗マージ(`mergeProgress`)の純粋ロジックは
`srs.js` に分離してあり、単体テストできます(依存パッケージ不要・Node標準のテストランナー)。

```bash
npm test     # = node --test  (srs.test.js を実行)
```

`srs.js` はブラウザでは `index.html` から `<script>` で読み込まれ、Node では `require` でテストされます。
同じコードを出荷とテストの両方で使うため、テストが実挙動を保証します。

## デプロイ

Vercel にそのままデプロイできます(`vercel.json` でキャッシュヘッダー設定済み)。
`audio/` を生成してからデプロイしてください。

## 学習データの形式(courses.json)

```jsonc
{
  "beginner": {
    "title": "初級", "ruTitle": "Начальный уровень",
    "subtitle": "FOUNDATION", "description": "基本的な日常表現を身につける",
    "units": [
      {
        "id": "b01", "title": "はじめてのあいさつ", "ruTitle": "Приветствия",
        "sentences": [
          {
            "ru": "Здравствуйте!",        // キリル文字本文(表示・音声のキー)
            "ph": "zdrávstvuyte",          // アクセント位置つきローマ字発音
            "jp": "こんにちは(丁寧)",     // 日本語訳
            "words": [ { "ru": "...", "ph": "...", "jp": "..." } ]   // 新出語彙
          }
        ]
      }
    ]
  }
}
```

文字コース(`script`)の項目には `tts` フィールドがあり(例: `"ru": "Б б", "tts": "бэ"`)、
表示は「Б б」のまま、音声は文字の名前「ベー」で生成されます。

発音表記の規則: 実用式ローマ字+強勢母音にアキュート記号(á é í ó ú ý)。
ь は `'`、х は `kh`、щ は `shch`。綴りと発音が異なる定型(его=yevó、что=shto、
конечно=konéshno など)は発音に従っています。母音弱化は表記せず、アクセント記号から
読み手が適用します(вода → vodá ヴァダー)。
