import puppeteer from "puppeteer";

export async function fetchAuthToken(userId: string, password: string): Promise<string> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(10000);

    try {
        // ログインページに遷移
        await page.goto('https://x.com/login');

        // この時点のHTMLを保存して確認
        const toppageHtml = await page.content();
        const debugDir = join(process.cwd(), 'debug-output');
        await mkdir(debugDir, { recursive: true });
        await writeFile(join(debugDir, 'login-page-initial.html'), toppageHtml);

        await page.waitForSelector('input[autocomplete="username"]');
        await page.type('input[autocomplete="username"]', userId);

        await page.waitForSelector('[role="button"]');
        const clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('[role="button"]'));
            const nextButton = buttons.find(button => button.textContent?.includes('次へ') || button.textContent?.includes('Next'));
            if (nextButton && nextButton instanceof HTMLElement) {
                nextButton.click();
                return true;
            }
            return false;
        });

        if (!clicked) {
            throw new Error('Failed to click next button');
        }

        // 次へボタンクリック後のHTMLを保存
        const html = await page.content();
        await writeFile('login-page-after-next.html', html);

        await page.waitForSelector('input[name="password"]');
        await page.type('input[name="password"]', password);
        await page.click('button[data-testid="LoginForm_Login_Button"]');

        await page.waitForNavigation();
        const cookies = await page.cookies();
        const authToken = cookies.find(cookie => cookie.name === 'auth_token');

        if (!authToken?.value) {
            throw new Error('Auth token not found in cookies');
        }

        return authToken.value;
    } finally {
        await browser.close();
    }
}

// Node.jsのfsモジュールを使用してファイルに書き込む
import { mkdir, writeFile } from 'fs/promises';
import { join } from "path";
