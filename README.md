# シフト管理アプリ

チームの出勤希望日と確定シフトを、カレンダー上で一覧できるWebアプリです。
**各団体が自分のFirebaseプロジェクトを用意して動かす**（セルフホスト）形で配布しています。
データは団体ごとに完全に分離され、開発元を含む誰も他団体のデータに触れません。

## できること

- **希望と確定を分けて管理** — メンバーが出した希望を、管理者かリーダーが「確定」に変える
- **1日に複数のシフト枠** — 「9:00-13:00 出社 / 13:00-18:00 在宅」のように時間で分けられ、セルが時間の比率で左右に分かれて表示される
- **一覧 / 月 / 週** の3ビュー
- **複数チーム** — 1つのFirebaseの中にグループをいくつでも作れる。1人が複数グループに所属することもできる
- **3段階の権限** — 管理者 / リーダー / メンバー
- **シフト種別のカスタマイズ** — 「出勤・リモート・欠勤」を、その団体の言葉（「ホール・キッチン」など）に変えられる。色・記号も設定可能

## 動作の前提

| | |
|---|---|
| 料金 | Firebaseの無料枠（Spark）で動きます。数十人規模なら課金は発生しない想定です |
| 認証 | メールアドレス＋パスワード |
| 参加方法 | 管理者が発行する**招待リンク**を配る（招待コードだけでは参加できません。詳細は後述） |

---

# セットアップ

所要 20〜30分。Firebaseコンソールでの作業が中心です。

> 既に**旧バージョンを運用中**の場合は、先に [MIGRATION.md](./MIGRATION.md) を読んでください。
> 既存データを新しい構造へ移すスクリプトがあります。

## 1. リポジトリを用意する

このリポジトリを**フォーク**するか、コピーして自分のGitHubリポジトリを作ります。
リポジトリ名は何でも構いません（配信URLが自動で追従します）。

## 2. Firebaseプロジェクトを作る

1. [Firebaseコンソール](https://console.firebase.google.com/) で新規プロジェクトを作成
2. **Authentication** → 始める → Sign-in method → **メール / パスワード** を有効化
3. **Firestore Database** → データベースの作成 → **本番環境モード**（ルールは次の手順で入れ替えます）
4. プロジェクトの設定 → 全般 → 「アプリを追加」→ ウェブ（`</>`）を選び、表示される `firebaseConfig` の値を控える

> `apiKey` はブラウザに配布される値で、秘密ではありません。データを守るのはこの後入れるセキュリティルールです。

## 3. セキュリティルールを反映する

**この手順を飛ばすとアプリは一切動きません。**「本番環境モード」で作った直後のFirestoreは全ての読み書きを拒否する設定になっているためです。
（もし「テストモード」で作ってしまった場合は逆に誰でも全データを読み書きできる状態なので、なおさら早く反映してください。）

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # 作成したプロジェクトを選ぶ
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.rules` の内容が反映されます。ルールが保証しているのは次の4点です。

- グループのメンバーだけが、そのグループのデータを読める（他グループは一切見えない）
- 希望の登録・削除は本人のみ（管理者は代理登録も可）
- **確定・確定取消・却下は管理者とリーダーのみ**
- 最後の管理者が自分を降格して、グループが操作不能になることを防ぐ

ルールにはテストが付いています。変更したときは次で確認できます（Javaが必要です）。

```bash
npm install
npx firebase emulators:exec --only firestore "npx vitest run tests/rules.test.ts"
```

## 4. 配信する

### GitHub Pages（無料・おすすめ）

1. リポジトリの **Settings → Secrets and variables → Actions** で、手順2で控えた値を登録します。

   | Secret名 | 入れる値 |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | `apiKey` |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |

2. **Settings → Pages → Source** を **GitHub Actions** に設定
3. `main` ブランチにpushすると `.github/workflows/deploy.yml` が自動でビルド・公開します

公開先は `https://<ユーザー名>.github.io/<リポジトリ名>/` です。
配信パスはリポジトリ名から自動で決まるので、フォーク時に設定を書き換える必要はありません。

### Firebase Hosting（独自ドメインを使いたい場合）

手順3で `firebase login` と `firebase use --add` を済ませてある前提です。

```bash
cp .env.example .env      # .env に firebaseConfig の値を記入
BASE_PATH=/ npm run build
firebase deploy --only hosting
```

`BASE_PATH=/` を付けるのを忘れないでください（ルート配信のため）。

## 5. ログインを許可するドメインを追加する

Firebaseコンソール → Authentication → Settings → **承認済みドメイン** に、公開したドメインを追加します。

- GitHub Pages の場合: `<ユーザー名>.github.io`
- Firebase Hosting の場合: 既定で登録済みです

## 6. 最初のグループを作る

公開したURLを開き、**新規登録**でアカウントを作ります。
続いて表示される画面で「**グループを作る**」を選び、グループ名と招待コードを入力してください。

**このとき作成した人が自動的に管理者になります。** Firestoreを手で編集する必要はありません。

## 7. メンバーを招待する

管理者としてログインし、ヘッダーの「**招待リンク**」を押すとリンクがコピーされます。
このリンクと**招待コード**をメンバーに伝えてください（2つ揃わないと参加できません）。

> **なぜ招待コードだけでは参加できないのか**
> セキュリティルール上、メンバーでない人はグループを検索できません。参加するにはグループのIDが必要で、それを運ぶのが招待リンクです。

---

# 運用

## 権限

| 操作 | メンバー | リーダー | 管理者 |
|---|:---:|:---:|:---:|
| 自分の希望を登録・編集・削除 | ○ | ○ | ○ |
| 他人の希望を確定・確定取消・却下 | × | ○ | ○ |
| 他人の希望を代理で登録 | × | × | ○ |
| メンバーのロール変更・退会処理 | × | × | ○ |
| グループ設定・シフト種別の変更 | × | × | ○ |

ロールの変更は、管理者がヘッダーの「メンバー」から行います。

## 設定できること

ヘッダーの「設定」（管理者のみ）から変更できます。

- 招待コード
- 表示時間帯（既定 9:00〜20:00）— 週ビューの縦軸と、セル内の時間分割に効きます
- 週の開始曜日（日曜 / 月曜）
- 1日に登録できる枠の上限（1〜6）
- **シフト種別** — 表示名・色・記号・「出られる / 出られない」の区分。最大6種類

種別を削除しても、その種別で登録済みのシフトは残ります（グレー表示になります）。

## メンバーを外すとき

メンバーのドキュメントは削除できません。「メンバー」画面で**在籍のチェックを外して**ください。
外れた人はそのグループのデータを一切読めなくなり、カレンダーからも消えます。

---

# 開発

```bash
npm install
cp .env.example .env      # firebaseConfig を記入
npm run dev
```

## ローカルのエミュレータで動かす

本番のFirebaseに触らずに全機能を試せます。**Javaが必要です。**

```bash
# 別ターミナルで
npx firebase emulators:start --only firestore,auth --project demo-copia
```

`.env` に `VITE_USE_EMULATOR=true` を追加してから `npm run dev` すると、エミュレータに接続します。

## テストと検査

```bash
npx vitest run tests/segments.test.ts tests/settings.test.ts tests/shiftTheme.test.ts   # 純粋関数（エミュレータ不要）
npx firebase emulators:exec --only firestore "npx vitest run"                            # ルールを含む全件
npm run build
npx oxlint
```

## データ構造

```
groups/{groupId}
  name, ownerId, createdAt

groups/{groupId}/settings/general      招待コード・表示時間帯・週開始曜日・枠上限
groups/{groupId}/settings/shiftTypes   シフト種別の定義

groups/{groupId}/members/{uid}
  email, displayName, color, role, active, joinedAt

groups/{groupId}/shifts/{自動ID}        1件 = 1つのシフト枠。同じ日に複数並ぶ
  memberId, date, status, type, startTime, endTime, ...

users/{uid}
  groupIds                             所属グループの逆引き
```

`shifts` は自動採番なので、同じ人の同じ日に複数のドキュメントが並びます。
`startTime` と `endTime` が両方 `null` なら終日枠です。

---

# ライセンスと注意

- 個人情報（メールアドレス）を扱います。各団体が自分のFirebaseプロジェクトの管理責任を負います
- セキュリティルールの反映（手順3）を必ず行ってください
- `.env` と Firebase のサービスアカウント鍵は、絶対にリポジトリにコミットしないでください（`.gitignore` 済み）
