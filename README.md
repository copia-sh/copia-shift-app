# Copia シフト管理

チームメンバー(現在4名)の出勤希望日・出勤日を、Google Calendarの月表示のようなUIで一目で確認・登録できるシフト管理アプリ。

- **出勤希望日**: 各メンバーが自分の希望日をまとめて登録・削除できる(仮決め)
- **出勤日(確定)**: 出勤希望日をチームメンバーの誰か(本人以外でも可)が「確定」することで出勤日になる。確定の取り消しも誰でも可能
- 月表示・週表示(週表示のみ時間も確認可能)
- メールアドレス+パスワードでサイト上から自己登録(招待コードが必要)
- カレンダー上の表示名はメールアドレスの@より前の部分を自動で使用
- Firebase(Firestore + Authentication)を使い、GitHub Pagesで静的サイトとして共有

## セットアップ手順

### 1. Firebaseプロジェクトの作成

1. [Firebaseコンソール](https://console.firebase.google.com/)で新規プロジェクトを作成
2. **Authentication** → Sign-in method で **メール/パスワード** を有効化
3. **Firestore Database** を作成(本番モード)
4. プロジェクト設定 → 全般 → 「アプリを追加」→ ウェブアプリを追加し、`firebaseConfig` の値を控える

### 2. 招待コードの設定

チームの誰でもアカウント作成できてしまうと部外者もシフトを見られてしまうため、新規登録時に招待コードの入力を必須にしている。Firestoreに以下のドキュメントを**手動で1つだけ**作成する。

```
config/settings
  inviteCode: "好きな合言葉(例: COPIA2026)"
```

このドキュメントはセキュリティルールでクライアントからのread/writeを禁止しているので、Firebaseコンソールから直接作成・変更する。招待コードはチームメンバーだけに口頭やチャットなどで共有する。

`members` コレクションは手動登録不要。各メンバーがアプリの「新規登録」→「招待コードを入力して参加」を行うと自動的に作成される。

### 3. Firestoreセキュリティルールのデプロイ

[Firebase CLI](https://firebase.google.com/docs/cli) を導入後:

```bash
firebase login
firebase use --add   # 作成したプロジェクトを選択
firebase deploy --only firestore:rules
```

`firestore.rules` の内容:
- `members` への参加(作成)は、`config/settings` の招待コードと一致した場合のみ許可。1人につき自分のメールアドレスの分しか作成できない
- 出勤希望日の新規登録・削除は本人のみ
- 確定/確定取り消し(希望→出勤日への変更)はチームメンバーなら誰でも可能

### 4. 環境変数の設定(ローカル開発用)

```bash
cp .env.example .env
```

`.env` に手順1で控えた `firebaseConfig` の値を設定する。

### 5. ローカルで起動

```bash
npm install
npm run dev
```

### 6. GitHubリポジトリ & GitHub Pagesの設定

1. このフォルダをGitHubの新規Publicリポジトリにpush
2. リポジトリの Settings → Secrets and variables → Actions で、`.env` と同じ内容を以下のSecretsとして登録:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. リポジトリの Settings → Pages → Source を **GitHub Actions** に設定
4. `main` ブランチにpushすると `.github/workflows/deploy.yml` が自動でビルド・デプロイする

デプロイ後のURLは `https://<GitHubユーザー名>.github.io/copia-shift-app/` になる(`vite.config.ts` の `base` をリポジトリ名に合わせて変更している場合はそちらを参照)。

### 7. Firebase Authenticationの承認済みドメイン設定

Firebaseコンソール → Authentication → Settings → 承認済みドメイン に、GitHub Pagesのドメイン(`<GitHubユーザー名>.github.io`)を追加する。

## 使い方(初回)

1. アプリを開き「新規登録」タブでメールアドレスとパスワードを入力してアカウント作成
2. 続けて表示される「チームに参加」画面で招待コードを入力
3. 参加が完了すると、そのメールアドレスの@より前の部分が名前としてカレンダーに表示される

## 今後の拡張(スコープ外・設計のみ考慮)

- Googleカレンダー連携: `members.email` をキーに、確定した出勤日をGoogleカレンダーへ「出勤/リモート/欠勤」として同期する
