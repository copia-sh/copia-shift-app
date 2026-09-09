# Cloudflare Worker（運用エージェントAPI / カレンダー購読フィード）

アプリ本体（React + Firebase）とは別に、この `worker/` だけ Cloudflare にデプロイします。
サービスアカウントでFirestoreを読む必要がある機能を、ここにまとめています。

| エンドポイント | 用途 | 状態 |
| --- | --- | --- |
| `GET /agent/shifts?date=&name=` | Slackの運用エージェントが勤務予定を読む（読み取り専用） | `AGENT_GROUP_ID` と `AGENT_API_TOKEN` を設定すると有効 |
| `POST /mcp` | ChatGPT Workspace Agent が `get_shift` ツールで勤務予定を読む（読み取り専用） | `AGENT_GROUP_ID` と `MCP_API_TOKEN` を設定すると有効 |
| Cron → `シフト同期` | Workspace Agent が既存のGoogle Drive接続で勤務予定を読むため、Google Sheetsへ毎時同期 | 共有とSheets API有効化後に `SHIFT_SYNC_ENABLED="true"` で有効 |
| `GET /feed/{groupId}/{token}.ics` | メンバーが自分のシフトをカレンダーアプリで購読する | **既定で無効**。`ICS_FEED_ENABLED="true"` のときだけ有効 |

いずれも任意機能です。設定しなくてもアプリ本体は今まで通り動きます。
Worker名 `copia-shift-ics-feed` は、既存の購読URLを壊さないため変更しません。

カレンダー購読フィードを使う予定がなければ、[共通セットアップ](#共通セットアップfirestoreへの読み取り権限) と
[運用エージェント向けAPI](#運用エージェント向けapiagentshifts) だけ読めば足ります。
フィード側の設定は一切不要で、経路も公開されません。

## 共通セットアップ（Firestoreへの読み取り権限）

所要10分程度。**どちらのエンドポイントを使う場合も、ここは必要です。**

Workerがブラウザのログインを介さずFirestoreを読むには、サービスアカウント鍵が必要です。
これはカレンダー購読フィード固有の設定ではなく、サーバー側からFirestoreを読むための共通の土台です。
Firebase Cloud Functionsは有料(Blaze)プラン必須なため、無料枠で動く Cloudflare Workers を使っています。

### 1. サービスアカウント鍵を発行する

1. [Firebaseコンソール](https://console.firebase.google.com/) → プロジェクトの設定 → **サービス アカウント**
2. 「新しい秘密鍵の生成」→ JSONファイルをダウンロード
3. **このファイルは絶対にコミットしない**こと（`.gitignore` で `serviceAccount*.json` 等を除外済み）

このファイルの中身が、Worker にFirestoreの読み取り権限を与える唯一の秘密情報です。

### 2. Cloudflareにログインする

```bash
npx wrangler login
```

### 3. プロジェクトIDを設定する

`worker/wrangler.toml` の `FIREBASE_PROJECT_ID` に、Firebaseプロジェクトの `projectId` を入れます
（`.env` の `VITE_FIREBASE_PROJECT_ID` と同じ値）。これは秘密ではないのでコミットして構いません。

### 4. サービスアカウント鍵をシークレットとして登録する

```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY --config worker/wrangler.toml
# プロンプトが出たら、ダウンロードしたJSONファイルの中身を「1行で」貼り付けて Enter
# 例: cat path/to/serviceAccount.json | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_KEY --config worker/wrangler.toml
```

### 5. デプロイする

```bash
npm run worker:deploy
```

成功すると `https://copia-shift-ics-feed.<あなたのサブドメイン>.workers.dev` のようなURLが表示されます。

この時点では、どちらのエンドポイントもまだ有効になっていません
（`/agent/shifts` も `/feed/...` も404を返します）。使う機能の設定を続けてください。

## 運用エージェント向けAPI (`/agent/shifts`)

Slackの `@スタダ` が、出社時のタスク案内と終業時の再通知に使う**読み取り専用**APIです。
「スタダ運用エージェント実装計画」5章の推奨案（Firestoreをサーバー側で参照する読み取り専用API）に相当します。

任意機能です。`AGENT_GROUP_ID` と `AGENT_API_TOKEN` の両方が設定されるまで、このパスは404を返し続けます。

### リクエスト

```
GET /agent/shifts?date=YYYY-MM-DD&name=<氏名>
Authorization: Bearer <AGENT_API_TOKEN>
```

| パラメータ | 必須 | 説明 |
| --- | --- | --- |
| `name` | 必須 | シフトアプリの表示名。姓名の間の空白（半角/全角）や英数字の全角/半角の違いは吸収する |
| `date` | 任意 | `YYYY-MM-DD`（Asia/Tokyo基準）。省略すると日本時間の本日 |

グループは `AGENT_GROUP_ID` に固定で、リクエストからは指定できません。
シークレットが漏れた場合でも、影響範囲をそのグループだけに閉じるためです。

### レスポンス

```json
{
  "date": "2026-09-09",
  "name": "田村 翔",
  "workStart": "10:00",
  "workEnd": "18:00",
  "segments": [
    { "type": "出勤", "label": "出勤", "attendance": "available", "startTime": "10:00", "endTime": "13:00" },
    { "type": "リモート", "label": "リモート", "attendance": "available", "startTime": "14:00", "endTime": "18:00" }
  ]
}
```

- `name` は、問い合わせ時の表記ではなく、シフトアプリに登録されている実際の表示名を返します
- `workStart` / `workEnd` は、**出勤扱いの区分（`attendance: "available"`）だけ**から算出した当日の勤務開始・終了です。
  1日に複数区分（既定で最大4）が入るため、区分をまたいだ最早の開始と最遅の終了になります
- 欠勤や、種別定義が消えた区分（`却下`・`未定` など）は `segments` には出ますが、`workStart` / `workEnd` には含めません。
  実際には働いていない時刻で再通知が飛ぶのを防ぐためです
- `startTime` / `endTime` が両方 `null` の区分は終日（時刻未設定）です。この場合 `workStart` / `workEnd` は `null` になります
- `segments` が空配列なら、その日のシフトは登録されていません（エラーではありません）
- 希望・確定の区別（`status`）は返しません。返す値を氏名・開始時刻・終了時刻・勤務種別だけに絞る方針のためです。
  **希望段階のシフトも含まれる**点に注意してください

### エラー

| ステータス | `error` | 意味 |
| --- | --- | --- |
| 401 | `unauthorized` | `Authorization` ヘッダが無い、またはトークンが一致しない |
| 400 | `missing_name` | `name` が無い |
| 400 | `invalid_name` | `name` が200文字を超えている |
| 400 | `invalid_date` | `date` が `YYYY-MM-DD` でない、または暦上存在しない日 |
| 404 | `name_not_found` | 在籍中のメンバーに該当氏名がいない |
| 409 | `ambiguous_name` | 同姓同名の在籍メンバーが2名以上いる。どちらかを推測せず、必ず本人へ確認する |
| 404 | (本文なし) | `AGENT_GROUP_ID` または `AGENT_API_TOKEN` が未設定・トークンが32文字未満（機能そのものが無効） |
| 500 | `internal_error` | 設定ミスやGoogle側の一時障害など |

### セットアップ

上の[共通セットアップ](#共通セットアップfirestoreへの読み取り権限)を済ませたら、次の3つだけです。
**カレンダー購読フィード側の設定は必要ありません。**

#### 1. 対象グループを設定する

`worker/wrangler.toml` の `AGENT_GROUP_ID` に対象グループのIDを入れます（秘密ではないのでコミットして構いません）。

#### 2. 共有シークレットを発行して登録する

```bash
openssl rand -hex 32   # 表示された64文字をコピーする
```

```bash
npx wrangler secret put AGENT_API_TOKEN --config worker/wrangler.toml
# `Enter a secret value:` が出たら貼り付けて Enter(入力は表示されない)
```

**パイプ(`cat file |` や `pbpaste |`)で渡さないでください。** 環境によって値が登録されず、
`secret list` に名前は出るのに認証が通らない、という切り分けにくい状態になります。
必ず上の対話プロンプトを使ってください。

`base64` ではなく `hex` を使うのは、base64 が `+` `/` `=` を含むため貼り付けで壊れやすく、
**末尾に改行が混じると認証が必ず失敗する**ためです（`worker/src/agentAuth.ts` は完全一致で比較します）。
hex 32バイトは64文字なので、32文字の最小長も満たします。

発行した値はエージェント側にだけ渡します。Firebaseの管理権限やサービスアカウント鍵はエージェントへ渡しません。

`AGENT_API_TOKEN` は**32文字以上**が必要です。これを下回る値を設定すると、APIは有効にならず404を返し続け、
理由が `wrangler tail` のログに出ます（総当たりされうる短いシークレットを黙って受け入れないため）。

#### 3. Cloudflareのレート制限ルールを入れる

コードでは対応していない、運用側の必須作業です。

このAPIの防御はシークレットのエントロピーだけで、Worker内には総当たり対策がありません。
Cloudflareダッシュボードの Security → WAF → Rate limiting rules で、パス `/agent/shifts` に対して
レート制限（例: 同一IPから1分あたり20リクエスト）を設定してください。
併せて、401が連続するようなら気づけるようにしておくと安全です。

### 安全性

- Firestoreはサービスアカウント（管理者権限）で読みますが、返すのは**照合できた1名・指定日の分だけ**です。
  メールアドレスやFirebaseのuidは返しません
- クエリ結果を過信せず、`memberId` と `date` をコード側でも再確認しています（`worker/src/agentShifts.ts`）
- 退会したメンバー（`active: false`）は照合対象から外れます
- 同姓同名が2名以上いるときは、他人のシフトを本人へ返さないよう `409` で止めます
- トークンの比較は、両方をSHA-256で固定長に畳んでから定数時間で行います。応答時間の差から
  1文字ずつ推測されることも、シークレットの長さが漏れることも防いでいます（`worker/src/agentAuth.ts`）
- `name` は200文字で上限を切ってから正規化処理に渡します
- **レート制限はWorker内では行っていません。**Cloudflare側のWAFルールで設定してください（上記セットアップ3）
- Firestoreの追加インデックスは不要です。`memberId` と `date` の等価条件だけなので足ります

### 動作確認（ローカル）

```bash
# 1) 別ターミナルでFirestoreエミュレータを起動
npx firebase emulators:start --only firestore

# 2) ダミーデータを投入
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node worker/dev-seed.mjs

# 3) worker/.dev.vars.example を worker/.dev.vars にコピーしてWorkerを起動
npm run worker:dev

# 4) 叩く（dev-seedは本日を2区分で入れるので 10:00-18:00 が返る）
curl -H 'Authorization: Bearer dev-agent-token-0123456789abcdef' \
  'http://127.0.0.1:8787/agent/shifts?name=開発用ユーザー'
```

## Workspace Agent 向けGoogle Sheets同期

ChatGPT BusinessでカスタムMCPの開発者モードを使えない場合の代替です。Workerが毎時（1時間に1回）
`スタダチーム_タスク表_更新履歴` の `シフト同期` タブを更新し、Workspace Agentは既に接続済みの
Google Driveからそのタブを読めます。同期する列は更新日時・日付・氏名・勤務開始/終了・勤務区分・同期状態だけで、
メールアドレスやFirebase UIDは書き込みません。

### 有効化

1. Google Cloud Consoleでプロジェクト `copia-shift-app` の **Google Sheets API** を有効にする。
2. Firebase Console → プロジェクトの設定 → **サービスアカウント** で、Workerに登録済みの鍵の
   `client_email` を確認する。
3. 同期先の更新履歴スプレッドシート（`スタダチーム_タスク表_更新履歴`）を、そのメールアドレスへ
   **編集者**として共有する。
4. 同期先のスプレッドシートIDをシークレットとして登録する。

```bash
npx wrangler secret put SHIFT_SYNC_SPREADSHEET_ID --config worker/wrangler.toml
# `Enter a secret value:` が出たらスプレッドシートIDを貼り付けて Enter
```

スプレッドシートIDを `wrangler.toml` に書かないのは、**このリポジトリが公開されている**ためです。
IDは実質URLと同じで、リンク共有に切り替わった瞬間に誰でも読めてしまいます。
`vars` に書くとその値が公開リポジトリに載るので、シークレットにします。

5. `worker/wrangler.toml` の `SHIFT_SYNC_ENABLED` を `"true"` に変え、デプロイする。

```bash
npm run worker:deploy
```

`シフト同期` タブは無ければ自動で作られるので、手で用意する必要はありません。

設定前はCronは登録されていますが同期処理は何も書き込まないため、共有が済むまで安全にデプロイできます。
有効化後は本日から7日先までの在籍メンバーの予定を毎回全置換します（行数を決め打ちせず A:G 列を
消してから書き直すので、人数が減っても古い行は残りません）。

Agent側では、`シフト同期` の当日・本人名の行を読み、`更新日時` が**90分以内**の場合だけ勤務終了時刻として
使います。行がない、または古い場合は、従来どおり本人に終了時刻を尋ねます。

90分としているのは、同期が1時間間隔のためです。データは正常時でも最大1時間古くなるので、
これより短い閾値（例: 10分）にすると正常なデータまで捨ててしまいます。逆に90分を超えて古い場合は
同期が1回以上飛んでいるので、本人に尋ねる動作が正しくなります。同期間隔を変えるときは、
この閾値も合わせて見直してください。

### 同期の失敗に気づく

同期が失敗すると Cron の実行が**失敗として記録されます**（握りつぶしていません）。
Cloudflareダッシュボードの Workers → 該当Worker → Settings → Trigger Events の実行履歴、
または `npx wrangler tail --config worker/wrangler.toml` で理由を確認できます。

よくある失敗は、Sheets APIが未有効（403）、サービスアカウントへの共有漏れ（403）、
スプレッドシートIDの誤り（404）です。

### 読み取り量の目安

1回の同期で「在籍メンバー全員 + 8日分のシフト + 種別定義1件」をFirestoreから読みます。
1時間間隔なら1日24回です。メンバー10人・8日分で90件程度なら1日およそ2,200読み取りで、
Firebase無料枠の1日50,000読み取りの5%弱に収まります。アプリ本体の利用分を足しても余裕があります。

間隔を短くする場合は読み取り量が比例して増えます（5分間隔なら1日約26,000件で無料枠の半分強）。
その場合は `worker/src/shiftSync.ts` の `SYNC_DAYS` を縮めて相殺できます。日次運用
（当日の終業時刻）だけなら2日分あれば足ります。間隔を変えたときは、上の鮮度判定（90分）も
合わせて見直してください。

## ChatGPT Workspace Agent 用 MCP (`/mcp`)

ChatGPT Workspace Agent にシフト確認をさせるための、**読み取り専用** MCP (Model Context Protocol) です。
公開するツールは `get_shift` だけで、Firestoreの更新やシフトの変更はできません。

MCPは Streamable HTTP の `POST /mcp` を使います。MCPの初期化・ツール一覧・ツール実行を実装しており、
状態を持たないため SSE と `Mcp-Session-Id` は使いません。

### 有効化

`AGENT_GROUP_ID` と、MCP専用の `MCP_API_TOKEN` が両方必要です。Slack API 用の
`AGENT_API_TOKEN` は MCP に流用しません。接続先ごとに失効できるよう、必ず別の値にします。

```bash
openssl rand -hex 32
npx wrangler secret put MCP_API_TOKEN --config worker/wrangler.toml
```

`MCP_API_TOKEN` は32文字以上のランダム値にしてください。未設定・短すぎる値では `/mcp` は404になります。

ChatGPTのカスタムMCP設定では、WorkerのURL末尾に `/mcp` を付けます。

```
https://copia-shift-ics-feed.<あなたのサブドメイン>.workers.dev/mcp
```

認証は `Authorization: Bearer <MCP_API_TOKEN>` です。トークンをチャット本文やエージェントの
Instructions に貼らず、カスタムMCPの認証設定にだけ登録してください。ChatGPT側の認証UIが
OAuthのみを求める組織設定の場合は、このWorkerにOAuth 2.1の認可サーバーを追加する必要があります。
その場合も、ここで実装した `get_shift` と Firestore参照ロジックはそのまま使えます。

### `get_shift`

| 引数 | 必須 | 内容 |
| --- | --- | --- |
| `name` | はい | シフト表の表示名。表記ゆれは既存APIと同じ規則で照合する |
| `date` | いいえ | Asia/Tokyo基準の `YYYY-MM-DD`。省略時は当日 |

返す値は `/agent/shifts` と同じ、氏名・勤務開始/終了・勤務種別だけです。メールアドレス、Firebase UID、他人のシフトは返しません。

### 運用上の注意

- `MCP_API_TOKEN` は Cloudflare と ChatGPTのカスタムMCP認証設定にのみ保存します
- Cloudflare WAFで `/mcp` にも `/agent/shifts` と同じレート制限（例: IPあたり毎分20回）を設定してください
- MCPは `Origin` ヘッダを持つブラウザ経由の呼び出しを拒否し、ChatGPTのサーバー間接続だけを想定しています
- デプロイとChatGPT Workspace Agentへの接続設定は、コード変更とは別の管理操作です

## カレンダー購読フィード (`/feed/...`)

**この機能は既定で無効です。** 使う予定がなければ、この節は読み飛ばして構いません。
`ICS_FEED_ENABLED` を設定しない限り、共通セットアップを済ませても `/feed/...` は404を返し、
Firestoreへの往復もOAuthトークン取得も行いません。

メンバーが自分のシフトを、iPhone/Googleカレンダーなどに**URLで購読**できるようにする機能です。
無効のときや未設定のときは、アプリの「カレンダー購読」ダイアログにその旨が表示されるだけです。

### なぜ別サービスが必要か

カレンダーアプリは、URLに定期的に(裏側で自動的に)GETリクエストを送って予定を取りに来ます。
これはブラウザでのログインを伴わないので、Firebaseの認証・セキュリティルールだけでは
「本人の確定シフトだけ」を返す判定ができません。そこで、トークン(推測不可能なURL)を検証して
`.ics`を返す小さなサーバーを別途用意します。

### 有効にする場合のセットアップ

[共通セットアップ](#共通セットアップfirestoreへの読み取り権限)を済ませたうえで、次の3つを行います。

#### 1. Firestoreの複合インデックスを反映しておく

この機能は `memberId` と `date` の両方で絞り込む複合クエリを使うため、複合インデックスが必要です
（`/agent/shifts` は等価条件だけなので不要ですが、こちらは日付範囲で絞ります）。
本体のセットアップ手順3(`firebase deploy --only firestore:rules,firestore:indexes`)を
まだ実行していない場合は、先にそちらを済ませてください。

#### 2. フィードを有効化する

`worker/wrangler.toml` の `ICS_FEED_ENABLED` を `"true"` にして、デプロイし直します。
`"true"` 以外の値（未設定・空文字・`"false"`・大文字の `"TRUE"` など）はすべて無効として扱います。

```bash
npm run worker:deploy
```

#### 3. アプリ側に設定する

`.env` に追加してから、アプリを再ビルド・再デプロイしてください。

```
VITE_ICS_FEED_BASE_URL=https://copia-shift-ics-feed.<あなたのサブドメイン>.workers.dev
```

GitHub Pagesで配信している場合は、GitHub Actionsのシークレットにも同じ値を
`VITE_ICS_FEED_BASE_URL` として追加します（`.github/workflows/deploy.yml` の `env` には既に渡してあります）。

### 仕組みと安全性

- 各メンバーは「カレンダー購読」ダイアログから、自分のシフトを購読するリンクを発行できます
- リンクは `https://.../feed/{groupId}/{token}.ics` の形。`token` は32バイトの乱数で、推測できません
- Workerはサービスアカウント(管理者権限)でFirestoreを読みますが、**トークンに紐づく本人のシフトだけ**
  を返すようアプリ側のコードで絞り込んでいます(Firestoreのセキュリティルールはこの経路には効きません)
- リンクは本人がいつでも「失効」でき、失効後はそのURLからは何も返らなくなります。
  URLが漏洩した場合などに備え、管理者も代理で失効できます
- 退会(在籍フラグをオフ)したメンバーのリンクも、以後は何も返しません
- 返す予定は直近60日前〜180日先までに限定しています(際限のない過去データを毎回読み込まないため)

## 開発

```bash
npm run worker:typecheck   # 型チェック
npx vitest run worker      # ユニットテスト(実際のCloudflareアカウントは不要)
npm run worker:dev         # ローカルで起動(要: 上記シークレット設定 or worker/.dev.vars)
```
