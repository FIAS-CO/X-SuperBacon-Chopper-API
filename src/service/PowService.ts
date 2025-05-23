import { aegisMonitorService } from "./AegisMonitorService"

const EXPIRY_MS = 60 * 1000 // 1分
const DIFFICULTY = 3
const DIFFICULTY_IN_AEGIS = 4

// Map<challenge文字列, 作成時刻>
const store = new Map<string, number>()

function cleanup() {
    const now = Date.now()
    for (const [challenge, createdAt] of store.entries()) {
        if (now - createdAt > EXPIRY_MS) {
            store.delete(challenge)
        }
    }
}

export const PowService = {
    DIFFICULTY,

    generateChallenge(): { key: string, value: number } {
        cleanup()

        const challenge = crypto.randomUUID()
        store.set(challenge, Date.now())

        const diffculty = aegisMonitorService.isAccessThresholdExceeded() ? DIFFICULTY_IN_AEGIS : DIFFICULTY;

        return { key: challenge, value: diffculty * 123456789 };
    },

    checkChallengeFormat(challenge: string, nonce: string): boolean {
        return (
            typeof challenge === 'string' &&
            challenge.trim() !== '' &&
            typeof nonce === 'string' &&
            nonce.trim() !== ''
        );
    },

    checkChallengeValid(challenge: string): boolean {
        const createdAt = store.get(challenge);
        if (typeof createdAt !== 'number') {
            return false; // challengeが存在しない
        }
        if (Date.now() - createdAt > EXPIRY_MS) {
            return false; // challengeが期限切れ
        }
        return true;
    },

    async verifyChallengeAndNonce(challenge: string, nonce: string): Promise<boolean> {
        const encoder = new TextEncoder();
        const data = encoder.encode(challenge + nonce);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);

        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        const prefix = '0'.repeat(DIFFICULTY);

        const isValid = hashHex.startsWith(prefix);
        if (isValid) {
            store.delete(challenge);
        }

        return isValid;
    },
}
