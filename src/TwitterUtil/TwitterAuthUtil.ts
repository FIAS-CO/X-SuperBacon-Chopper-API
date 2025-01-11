import puppeteer from "puppeteer";

export async function fetchAuthToken(userId: string, password: string): Promise<string> {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);

    try {
        await page.goto('https://x.com/login');

        await page.waitForSelector('input[autocomplete="username"]');
        await page.type('input[autocomplete="username"]', userId);

        await page.waitForSelector('[role="button"]');
        const clicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('[role="button"]'));
            const nextButton = buttons.find(button => button.textContent?.includes('次へ'));
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
import { writeFile } from 'fs/promises';