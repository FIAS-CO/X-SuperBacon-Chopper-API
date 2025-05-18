import { Hono } from 'hono'
import { MiddlewareHandler } from 'hono';
import { Log } from '../util/Log';
import { systemSettingService } from '../service/SystemSettingService';
import { SystemSettingsUtil } from '../util/SystemSettingsUtil';

const app = new Hono()

// アクセス数を記録する構造
let accessLog: number[] = []

// トリガーされたかを記録（連続発火を防ぐため）
let triggered = false

// 閾値と時間範囲
const THRESHOLD = 20
const INTERVAL_MS = 30 * 60 * 1000 // 30分

async function triggerAction() {
    Log.error('⚠️ 30分で500アクセス超えました！Aegisによりアクセス制限を行います。')

    let updatedSettings = await systemSettingService.enableBlackAndWithitelist();

    await SystemSettingsUtil.notifyAegisTriggeredByAccessSpike();
    await SystemSettingsUtil.notifyAccessSettingsChange(updatedSettings);
}

/**
 * アクセス全体をチェックして、閾値を超えた場合に処理を実行するミドルウェア
 * @param c 
 * @param next 
 * @returns 
 */
export const aegisMonitor: MiddlewareHandler = async (_c, next) => {
    const now = Date.now()

    // 現在時刻より30分前より古いものを削除
    accessLog = accessLog.filter(ts => now - ts <= INTERVAL_MS)

    // 現在のアクセスを記録
    accessLog.push(now)

    // 閾値を超えたら処理を実行
    if (accessLog.length > THRESHOLD && !triggered) {
        triggered = true
        triggerAction()

        // 一度トリガーされた後、再び可能になるのはさらに30分後とする
        setTimeout(() => {
            triggered = false
        }, INTERVAL_MS)
    }

    await next()
}
