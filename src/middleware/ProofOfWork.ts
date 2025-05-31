import { Context, Next } from 'hono'
import { PowService } from '../service/PowService'
import { Log } from '../util/Log'
import { DiscordChannel, discordNotifyService } from '../service/DiscordNotifyService'
import { DelayUtil } from '../util/DelayUtil'
import { respondWithError } from '../util/Response'
import { setBlockInfo, BlockReasons } from '../util/AccessLogHelper'

export const pow = async (c: Context, next: Next) => {
    const challenge = c.req.header('X-Session-Token') || '';
    const nonce = c.req.header('X-Request-Hash') || '';

    // 1. フォーマットチェック
    if (!PowService.checkChallengeFormat(challenge, nonce)) {
        setBlockInfo(c, BlockReasons.POW_INVALID_FORMAT, 9999);
        return await handlePowFailure(c, challenge, nonce, '計算問題または回答が提出されませんでした。');
    }

    // 2. ストア存在＋有効期限チェック
    if (!PowService.checkChallengeValid(challenge)) {
        setBlockInfo(c, BlockReasons.POW_EXPIRED, 9999);
        return await handlePowFailure(c, challenge, nonce, '計算問題が発行されたものでないか、または期限切れです。');
    }

    // 3. PoWハッシュ検証
    if (!await PowService.verifyChallengeAndNonce(challenge, nonce)) {
        setBlockInfo(c, BlockReasons.POW_INVALID_NONCE, 9999);
        return await handlePowFailure(c, challenge, nonce, '計算問題と回答が一致しません。');
    }

    await next();
};

async function handlePowFailure(c: Context, challenge: string, nonce: string, reason: string): Promise<Response> {
    // Contextから既にパース済みのデータを取得
    const data = c.get('requestData') || {};

    const screenName = data.screen_name ?? 'No screen name';
    const checkSearchBan = data.searchban ?? 'No Check Search Ban';
    const checkRepost = data.repost ?? 'No Check Repost';
    const ip = c.get('ip') || 'No IP';
    const connectionIp = c.get('connectionIp') || 'No Connection IP';

    Log.error(`PoW検証失敗: ${reason}`, { screenName, challenge, nonce });

    await notifyPowFailed({
        reason,
        screenName,
        challenge,
        nonce,
        checkSearchBan,
        checkRepost,
        ip,
        connectionIp
    });

    await DelayUtil.randomDelay();

    return respondWithError(c, 'Internal server error', 9999, 500);
}

type NotifyData = {
    reason: string;
    screenName: string;
    challenge: string;
    nonce: string;
    checkSearchBan: string;
    checkRepost: string;
    ip: string;
    connectionIp: string;
};

async function notifyPowFailed(data: NotifyData): Promise<void> {
    const message = `
🚨 **PoW検証失敗: ${data.reason}**
**Screen Name:** ${data.screenName}
**Check Search Ban:** ${data.checkSearchBan}
**Check Repost:** ${data.checkRepost}
**IP:** ${data.ip}
**Connection IP:** ${data.connectionIp}
    `.trim();

    await discordNotifyService.sendMessage(message, DiscordChannel.INVALID_URL_PARAM);
}