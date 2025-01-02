import { beforeAll } from 'vitest';
import dotenv from 'dotenv';

beforeAll(() => {
    // .envファイルを読み込む
    dotenv.config();

    // 必要な環境変数が存在することを確認
    if (!process.env.AUTH_TOKEN) {
        console.warn('Warning: AUTH_TOKEN is not set in environment variables');
    }
});