import { Log } from './Log';

export class ServerDecryption {
    private async getKey(): Promise<CryptoKey> {
        const rawKeyString = process.env.IP_SECRET_KEY?.slice(0, 32);
        if (!rawKeyString) {
            throw new Error('IP_SECRET_KEY が設定されていません');
        }

        const rawKey = new TextEncoder().encode(rawKeyString);

        if (rawKey.length !== 32) {
            throw new Error('IP_SECRET_KEY は32文字である必要があります（AES-256）');
        }

        return crypto.subtle.importKey(
            'raw',
            rawKey,
            'AES-CBC',
            false,
            ['encrypt', 'decrypt']
        );
    }

    public async encrypt(ip: string): Promise<string> {
        try {
            const key = await this.getKey();
            const iv = crypto.getRandomValues(new Uint8Array(16));
            const encodedIp = new TextEncoder().encode(ip);

            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: 'AES-CBC', iv },
                key,
                encodedIp
            );

            const encryptedBytes = new Uint8Array(encryptedBuffer);
            const combined = new Uint8Array(iv.length + encryptedBytes.length);
            combined.set(iv);
            combined.set(encryptedBytes, iv.length);

            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            Log.error('Encryption error:', error);
            return '';
        }
    }

    public async decrypt(encryptedData: string): Promise<string> {
        try {
            const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
            const iv = combined.slice(0, 16);
            const encryptedBytes = combined.slice(16);

            const key = await this.getKey();

            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv },
                key,
                encryptedBytes
            );

            return new TextDecoder().decode(decryptedBuffer);
        } catch (error) {
            Log.error('Decryption error:', encryptedData, error);
            return '';
        }
    }
}

export const serverDecryption = new ServerDecryption();
