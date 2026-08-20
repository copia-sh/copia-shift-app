# Copia シフト管理

チームメンバー(現在4名)の出勤希望日・出勤日を、Google Calendarの月表示のようなUIで一目で確認・登録できるシフト管理アプリ。

- **出勤希望日**: 各メンバーが自分の希望日をまとめて登録・削除できる(仮決め)
- **出勤日(確定)**: 出勤希望日をチームメンバーの誰か(本人以外でも可)が「確定」することで出勤日になる。確定の取り消しも誰でも可能
- 月表示・週表示(週表示のみ時間も確認可能)
- Firebase(Firestore + Google認証)を使い、GitHub Pagesで静的サイトとして共有

## セットアップ手順

### 1. Firebaseプロジェクトの作成

1. [Firebaseコンソール](https://console.firebase.google.com/)で新規プロジェクトを作成
2. **Authentication** → Sign-in method で **Google** を有効化
3. **Firestore Database** を作成(本番モード)
4. プロジェクト設定 → 全般 → 「アプリを追加」→ ウェブアプリを追加し、`firebaseConfig` の値を控える

### 2. Firestoreにチームメンバーを登録

`members` コレクションに、メンバーごとに1ドキュメントを作成する。**ドキュメントIDはGoogleアカウントのメールアドレス(小文字)そのもの**にすること(アクセス制御・本人特定に使うため)。

```
members/yamada@example.com
  name: "山田"
  email: "yamada@example.com"
  color: "#ef4444"
```

4人分をこの形式で登録する。

### 3. Firestoreセキュリティルールのデプロイ

[Firebase CLI](https://firebase.google.com/docs/cli) を導入後:

```bash
firebase login
firebase use --add   # 作成したプロジェクトを選択
firebase deploy --only firestore:rules
```

`firestore.rules` の内容:
- 読み書きは `members` に登録済みのメールアドレスでログインした人のみ許可
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

### 7. Firebase AuthenticationのGoogleログイン許可ドメイン設定

Firebaseコンソール → Authentication → Settings → 承認済みドメイン に、GitHub Pagesのドメイン(`<GitHubユーザー名>.github.io`)を追加する。

## 今後の拡張(スコープ外・設計のみ考慮)

- Googleカレンダー連携: `members.email` をキーに、確定した出勤日をGoogleカレンダーへ「出勤/リモート/欠勤」として同期する
