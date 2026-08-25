import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages はリポジトリ名のサブパスで配信されるため、fork 先の名前に
  // 追従する必要がある。CI が BASE_PATH を渡す（ワークフロー参照）。
  // Firebase Hosting などルート配信のときは BASE_PATH=/ を指定する。
  base: process.env.BASE_PATH ?? '/copia-shift-app/',
  plugins: [react(), tailwindcss()],
})
