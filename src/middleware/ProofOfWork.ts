import { Context, Next } from 'hono'
import { PowService } from '../service/PowService'
import { Log } from '../util/Log'
import { discordNotifyService } from '../service/DiscordNotifyService'
import { DelayUtil } from '../util/DelayUtil'
import { respondWithError } from '../util/Response'
import { serverDecryption } from '../util/ServerDecryption'

export const pow = async (c: Context, next: Next) => {
    const challenge = c.req.header('X-Session-Token') || '';
    const nonce = c.req.header('X-Request-Hash') || '';

    // 1. フォーマットチェック
    if (!PowService.checkChallengeFormat(challenge, nonce)) {
        return await handlePowFailure(c, challenge, nonce, '計算問題または回答が提出されませんでした。');
    }

    // 2. ストア存在＋有効期限チェック
    if (!PowService.checkChallengeValid(challenge)) {
        return await handlePowFailure(c, challenge, nonce, '計算問題が発行されたものでないか、または期限切れです。');
    }

    // 3. PoWハッシュ検証
    if (!await PowService.verifyChallengeAndNonce(challenge, nonce)) {
        return await handlePowFailure(c, challenge, nonce, '計算問題と回答が一致しません。');
    }

    await next();
};

async function handlePowFailure(c: Context, challenge: string, nonce: string, reason: string): Promise<Response> {
    type PowRequestData = {
        screen_name?: string;
        searchban?: string;
        repost?: string;
        key?: string;
    };
    let data: PowRequestData = {};
    try {
        data = await c.req.json();
    } catch {
        // JSONパース失敗時は空オブジェクトにする
    }

    const screenName = data.screen_name ?? 'No screen name';
    const checkSearchBan = data.searchban ?? 'No Check Search Ban';
    const checkRepost = data.repost ?? 'No Check Repost';
    const encryptedIp = data.key;
    const ip = encryptedIp ? serverDecryption.decrypt(encryptedIp) : 'No IP';
    const connectionIp = c.req.header('x-forwarded-for') ||
        c.req.raw.headers.get('x-forwarded-for') ||
        c.req.header('x-real-ip') ||
        c.env?.remoteAddress ||
        'No Connection IP';

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

    return respondWithError(c, 'Internal server error', 99994, 500);
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

    await discordNotifyService.sendMessage(message);
}