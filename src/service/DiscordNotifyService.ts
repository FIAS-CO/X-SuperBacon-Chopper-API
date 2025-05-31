import { Log } from "../util/Log";

export enum DiscordChannel {
    SHADOWBAN_CHECK = '01',
    TOKEN_RELATED = '02',
    INVALID_URL_PARAM = '03',
    IP_ACCESS_BLOCK = '04',
    LOAD_DETECTION = '05',
    ACCESS_CONTROL_INFO = '06',
    ACCESS_CONTROL_BLOCK = '07',
    TEST = 'TEST'
}

export class DiscordNotifyService {
    private webhookUrls: Map<string, string>;

    constructor() {
        this.webhookUrls = new Map();
        this.loadWebhookUrls();
    }

    private loadWebhookUrls(): void {
        const channels = Object.values(DiscordChannel);

        for (const channel of channels) {
            const url = process.env[`DISCORD_WEBHOOK_URL_${channel}`];
            if (url) {
                this.webhookUrls.set(channel, url);
            } else {
                const detail = `DISCORD_WEBHOOK_URL_${channel} is not defined in environment variables`;
                Log.warn(detail);
                this.notifyDiscordSendError(detail);
            }
        }

        if (this.webhookUrls.size === 0) {
            const detail = 'No Discord webhook URLs are defined in environment variables';
            this.notifyDiscordSendError(detail);
            throw new Error(detail);
        }
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

    async sendMessage(content: string, channel: DiscordChannel = DiscordChannel.SHADOWBAN_CHECK): Promise<boolean> {
        const webhookUrl = this.webhookUrls.get(channel);

        if (!webhookUrl) {
            Log.error(`Webhook URL for channel ${channel} is not available`);
            return false;
        }

        try {
            // メッセージの末尾に常に日本時間を追加
            const timeStampedContent = `${content}\n**Time:** ${this.getJSTDateTime()}`;

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: timeStampedContent
                })
            });

            if (!response.ok) {
                Log.error(`Discord Webhook Error for channel ${channel}:`, await response.text());
                return false;
            }

            return true;
        } catch (error) {
            Log.error(`Discord Webhook Error for channel ${channel}:`, error);
            return false;
        }
    }

    async notifyError(error: Error, context: string, channel: DiscordChannel = DiscordChannel.SHADOWBAN_CHECK): Promise<void> {
        const message = `
🚨 **Error Alert**
**Context:** ${context}
**Error:** ${error.message?.substring(0, 1200) || 'No error message'}
**Stack:** \`\`\`${error.stack?.slice(0, 200)}...\`\`\`
        `.trim();

        await this.sendMessage(message, channel);
    }

    async notifyApiError(status: number, errorText: string, context: string, token: string, channel: DiscordChannel = DiscordChannel.SHADOWBAN_CHECK): Promise<void> {
        const message = `
🚨 **API Error Alert**
**Context:** ${context}
**Status:** ${status}
**Error:** ${errorText?.substring(0, 1500) || "No error text"}
**Token:** ${token}
            `.trim();

        await this.sendMessage(message, channel);
    }

    async notifyAuthTokenRefresh(accountId: string, oldToken: string, newToken: string, oldCsrfToken: string, newCsrfToken: string, isSuccess: boolean): Promise<void> {
        const status = isSuccess ? "✅ Success" : "❌ Failed";
        const truncatedOldToken = oldToken ? `${oldToken.slice(0, 10)}...` : "None";
        const truncatedNewToken = newToken ? `${newToken.slice(0, 10)}...` : "None";
        const truncatedOldCsrfToken = oldCsrfToken ? `${oldCsrfToken.slice(0, 10)}...` : "None";
        const truncatedNewCsrfToken = newCsrfToken ? `${newCsrfToken.slice(0, 10)}...` : "None";

        const message = `
🔄 **Auth Token Refresh**
**Status:** ${status}
**Account:** ${accountId}
**Old Token:** \`${truncatedOldToken}\`
**New Token:** \`${truncatedNewToken}\`
**Old CSRF Token:** \`${truncatedOldCsrfToken}\`
**New CSRF Token:** \`${truncatedNewCsrfToken}\`
        `.trim();

        await this.sendMessage(message, DiscordChannel.TOKEN_RELATED);
    }

    // リッチな埋め込みメッセージを送信するメソッド
    async sendEmbed(options: {
        title: string;
        description: string;
        color?: number;
        fields?: Array<{ name: string; value: string }>;
    }, channel: DiscordChannel = DiscordChannel.SHADOWBAN_CHECK): Promise<boolean> {
        const webhookUrl = this.webhookUrls.get(channel);

        if (!webhookUrl) {
            Log.error(`Webhook URL for channel ${channel} is not available`);
            return false;
        }

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

            const response = await fetch(webhookUrl, {
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
            Log.error(`Error sending embed message to channel ${channel}:`, error);
            return false;
        }
    }

    async notifyDiscordSendError(detail: string): Promise<void> {
        const message = `🚨 **Discord Send Error**
**Detail:** ${detail}`;
        await this.sendMessage(message, DiscordChannel.TEST);
    }
}

// グローバルなインスタンスを作成
export const discordNotifyService = new DiscordNotifyService();