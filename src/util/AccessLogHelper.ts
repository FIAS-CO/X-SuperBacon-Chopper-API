import { Context } from 'hono';

/**
 * ブロック情報をContextに設定するヘルパー関数
 */
export const setBlockInfo = (c: Context, reason: string, errorCode: number): void => {
    c.set('blockInfo', { reason, errorCode });
};

/**
 * よく使われるブロック理由の定数
 */
export const BlockReasons = {
    RATE_LIMIT_VERY_SHORT: 'Rate limit: VeryShort (2sec/4req)',
    RATE_LIMIT_SHORT: 'Rate limit: Short (1min/5req)',
    RATE_LIMIT_MIDDLE: 'Rate limit: Middle (2min/9req)',
    RATE_LIMIT_LONG: 'Rate limit: Long (20min/40req)',
    IP_BLACKLISTED: 'IP blacklisted',
    IP_NOT_WHITELISTED: 'IP not whitelisted',
    INVALID_IP_FORMAT: 'Invalid IP format',
    POW_INVALID_FORMAT: 'PoW: Invalid challenge format',
    POW_EXPIRED: 'PoW: Challenge expired',
    POW_INVALID_NONCE: 'PoW: Invalid nonce',
    MISSING_PARAMETERS: 'Missing required parameters',
} as const;