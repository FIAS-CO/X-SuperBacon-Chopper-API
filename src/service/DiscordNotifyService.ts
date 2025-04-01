import { Log } from "../util/Log";

// discordNotify.ts
export class DiscordNotifyService {
    private webhookUrl: string;

    constructor() {
        const url = process.env.DISCORD_WEBHOOK_URL;
        if (!url) {
            throw new Error('DISCORD_WEBHOOK_URL is not defined in environment variables');
        }
        this.webhookUrl = url;
    }

    private getJSTDateTime(): string {
        return new Date().toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) + ' JST';
    }

    async sendMessage(content: string): Promise<boolean> {
        try {
            // メッセージの末尾に常に日本時間を追加
            const timeStampedContent = `${content}\n**Time:** ${this.getJSTDateTime()}`;

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: timeStampedContent
                })
            });

            if (!response.ok) {
                Log.error('Discord Webhook Error:', await response.text());
                return false;
            }

            return true;
        } catch (error) {
            Log.error('Discord Webhook Error:', error);
            return false;
        }
    }

    // エラー通知用のヘルパーメソッド
    async notifyError(error: Error, context: string): Promise<void> {
        const message = `
🚨 **Error Alert**
**Context:** ${context}
**Error:** ${error.message?.substring(0, 1200) || 'No error message'}
**Stack:** \`\`\`${error.stack?.slice(0, 200)}...\`\`\`
        `.trim();

        await this.sendMessage(message);
    }

    async notifyApiError(status: number, errorText: string, context: string, token: string): Promise<void> {
        const message = `
🚨 **API Error Alert**
**Context:** ${context}
**Status:** ${status}
**Error:** ${errorText?.substring(0, 1500) || "No error text"}
**Token:** ${token}
            `.trim();

        await this.sendMessage(message);
    }

    // auth token切り替え通知用のメソッド
    async notifyAuthTokenRefresh(accountId: string, oldToken: string, newToken: string, isSuccess: boolean): Promise<void> {
        const status = isSuccess ? "✅ Success" : "❌ Failed";
        const truncatedOldToken = oldToken ? `${oldToken.slice(0, 10)}...` : "None";
        const truncatedNewToken = newToken ? `${newToken.slice(0, 10)}...` : "None";

        const message = `
🔄 **Auth Token Refresh**
**Status:** ${status}
**Account:** ${accountId}
**Old Token:** \`${truncatedOldToken}\`
**New Token:** \`${truncatedNewToken}\`
        `.trim();

        await this.sendMessage(message);
    }

    // リッチな埋め込みメッセージを送信するメソッド
    async sendEmbed(options: {
        title: string;
        description: string;
        color?: number;
        fields?: Array<{ name: string; value: string }>;
    }): Promise<boolean> {
        try {
            const embed = {
                title: options.title,
                description: options.description,
                color: options.color || 0xFF0000,
                fields: options.fields || [],
                timestamp: new Date().toISOString(),
                footer: {
                    text: `Sent at ${this.getJSTDateTime()}`
                }
            };

            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    embeds: [embed]
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return true;
        } catch (error) {
            Log.error('Error sending embed message:', error);
            return false;
        }
    }
}

// グローバルなインスタンスを作成
export const discordNotifyService = new DiscordNotifyService();