const EXPIRY_MS = 60 * 1000 // 1分
const DIFFICULTY = 3

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

    generateChallenge(): { challenge: string, difficulty: number } {
        cleanup()

        const challenge = crypto.randomUUID()
        store.set(challenge, Date.now())

        return { challenge, difficulty: DIFFICULTY }
    },

    async verifyAsync(challenge: string, nonce: string): Promise<boolean> {
        if (
            typeof challenge !== 'string' || challenge.length === 0 ||
            typeof nonce !== 'string' || nonce.length === 0
        ) {
            return false
        }

        const createdAt = store.get(challenge)
        if (!createdAt || Date.now() - createdAt > EXPIRY_MS) {
            return false
        }

        const encoder = new TextEncoder()
        const data = encoder.encode(challenge + nonce)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)

        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
        const prefix = '0'.repeat(DIFFICULTY)

        const isValid = hashHex.startsWith(prefix)
        if (isValid) {
            store.delete(challenge)
        }

        return isValid
    }
}
