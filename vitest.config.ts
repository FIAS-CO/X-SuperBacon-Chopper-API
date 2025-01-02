import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// .envファイルを読み込む
const env = dotenv.config().parsed;

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        env: env, // 環境変数をテストに渡す
        setupFiles: ['./test/setup.ts'], // セットアップファイルを指定
    },
});