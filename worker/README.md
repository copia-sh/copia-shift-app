# カレンダー購読フィード (Cloudflare Worker)

メンバーが自分のシフトを、iPhone/Googleカレンダーなどに**URLで購読**できるようにする機能です。
アプリ本体（React + Firebase）とは別に、この `worker/` だけ Cloudflare にデプロイします。

任意機能です。設定しなくてもアプリ本体は今まで通り動きます
（「カレンダー購読」ダイアログに、未設定である旨が表示されるだけです）。

## なぜ別サービスが必要か

カレンダーアプリは、URLに定期的に(裏側で自動的に)GETリクエストを送って予定を取りに来ます。
これはブラウザでのログインを伴わないので、Firebaseの認証・セキュリティルールだけでは
「本人の確定シフトだけ」を返す判定ができません。そこで、トークン(推測不可能なURL)を検証して
`.ics`を返す小さなサーバーを別途用意します。Firebase Cloud Functionsは有料(Blaze)プラン必須なため、
無料枠で動く Cloudflare Workers を使っています。

## セットアップ

所要10分程度。

### 0. Firestoreのインデックスを反映しておく

この機能は `memberId` と `date` の両方で絞り込む複合クエリを使うため、複合インデックスが必要です。
本体のセットアップ手順3(`firebase deploy --only firestore:rules,firestore:indexes`)を
まだ実行していない場合は、先にそちらを済ませてください。

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

### 6. アプリ側に設定する

`.env` に追加してから、アプリを再ビルド・再デプロイしてください。

```
VITE_ICS_FEED_BASE_URL=https://copia-shift-ics-feed.<あなたのサブドメイン>.workers.dev
```

GitHub Pagesで配信している場合は、GitHub Actionsのシークレットにも同じ値を
`VITE_ICS_FEED_BASE_URL` として追加し、`.github/workflows/*.yml` の `env` にも渡してください。

## 仕組みと安全性

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
