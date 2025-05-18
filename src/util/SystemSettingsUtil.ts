import { discordNotifyService } from "../service/DiscordNotifyService";
import { AccessSettings } from "../types/Types";

export class SystemSettingsUtil {
    // クラスのインスタンス化を防止
    private constructor() { }

    static async notifyAegisStatusChange(enabled: boolean): Promise<void> {
        const message = `
🛡️ **Aegisステータス変更**
Aegisは現在: ${enabled ? '有効' : '無効'}
    `.trim();

        await discordNotifyService.sendMessage(message);
    }

    static async notifyAegisTriggeredByAccessSpike(): Promise<void> {
        const message = `
    🚨 **Aegisによりアクセス制御が有効化されました**
    30分で500アクセスがあったのでブラックリストとホワイトリストを有効にしました。
        `.trim();

        await discordNotifyService.sendMessage(message);
    }

    static async notifyAccessSettingsChange(settings: AccessSettings): Promise<void> {
        const message = `
🔒 **アクセス制御設定変更**
**ブラックリスト:** ${settings.blacklistEnabled ? '有効' : '無効'}
**ホワイトリスト:** ${settings.whitelistEnabled ? '有効' : '無効'}
**モード説明:** ${this.getAccessModeDescription(settings)}
        `.trim();

        await discordNotifyService.sendMessage(message);
    }

    /**
     * 現在のモード説明を取得
     */
    private static getAccessModeDescription(settings: AccessSettings): string {
        if (settings.blacklistEnabled && settings.whitelistEnabled) {
            return "ブラックリストに登録されておらず、ホワイトリストに登録されたIPのみアクセス可能(ブラックリスト優先)";
        } else if (settings.whitelistEnabled) {
            return "ホワイトリストに登録されたIPのみアクセス可能";
        } else if (settings.blacklistEnabled) {
            return "ブラックリストに登録されたIP以外はアクセス可能";
        } else {
            return "アクセス制限なし（全てのIPがアクセス可能）";
        }
    }
}