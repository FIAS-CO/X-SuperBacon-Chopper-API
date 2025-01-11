import puppeteer from "puppeteer";

export async function fetchAuthToken(userId: string, password: string): Promise<string> {
    const browser = await puppeteer.launch({
        headless: false, // headlessをfalseにして実際のブラウザを表示
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--proxy-server=your-vpn-proxy' // VPNプロキシを指定
        ]
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    try {
        // デバッグ用のスクリーンショット保存ディレクトリ作成
        const debugDir = join(process.cwd(), 'debug-output');
        await mkdir(debugDir, { recursive: true });

        // ログインページに遷移
        await page.goto('https://x.com/i/flow/login', {
            waitUntil: 'networkidle0', // ネットワーク接続が落ち着くまで待機
            timeout: 60000 // タイムアウトを延長
        });

        // 各段階でスクリーンショットを取得
        await page.screenshot({ path: join(debugDir, 'login-page-initial.png') });

        // ユーザー名入力
        await page.waitForSelector('input[autocomplete="username"]', { timeout: 30000 });
        await page.type('input[autocomplete="username"]', userId);
        await page.screenshot({ path: join(debugDir, 'after-username-input.png') });

        // 次へボタンクリック処理
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('[role="button"]'));
            const nextButton = buttons.find(button =>
                button.classList.contains('r-sdzlij') &&
                button.classList.contains('r-1phboty') &&
                button.classList.contains('r-lrvibr')
            );

            if (nextButton && nextButton instanceof HTMLElement) {
                nextButton.click();
                return true;
            }
            return false;
        });

        // スクリーンショット
        await page.screenshot({ path: join(debugDir, 'after-next-button.png') });

        // 追加のデバッグ情報
        const pageContent = await page.content();
        await writeFile(join(debugDir, 'page-content.html'), pageContent);

        // ログ出力
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err));

        // パスワード入力フィールドを待機（タイムアウトを延長）
        await page.waitForSelector('input[name="password"]', {
            timeout: 30000,
            visible: true
        });
        await page.type('input[name="password"]', password);
        await page.click('button[data-testid="LoginForm_Login_Button"]');

        await page.waitForNavigation();
        const cookies = await page.cookies();
        const authToken = cookies.find(cookie => cookie.name === 'auth_token');

        if (!authToken?.value) {
            throw new Error('Auth token not found in cookies');
        }

        return authToken.value;
    } catch (error) {
        // エラー詳細を詳しく出力
        console.error('Detailed Error:', error);

        // スクリーンショットを取得してエラーの状況を保存
        const errorScreenshotPath = join(process.cwd(), 'debug-output', 'error-screenshot.png');
        await page.screenshot({ path: errorScreenshotPath });

        throw error;
    } finally {
        await browser.close();
    }
}

// Node.jsのfsモジュールを使用してファイルに書き込む
import { mkdir, writeFile } from 'fs/promises';
import { join } from "path";
