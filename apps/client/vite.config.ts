import { defineConfig } from "vite";

export default defineConfig({
	server: {
		// 開発中はサーバー(:8080)へプロキシして同一オリジンで叩く（CORS回避）。
		// 本番のクライアント配信・接続先は Week 6-7 で設計する。
		// 環境変数で管理する
		proxy: {
			"/health": "http://localhost:8080",
		},
	},
});
