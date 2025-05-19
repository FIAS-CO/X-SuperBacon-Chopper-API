import { Log } from "./Log";

export class ServerDecryption {
    decrypt(encryptedData: string): string {
        try {
            return atob(
                encryptedData
                    .replace(/_/g, '=')
                    .split('').reverse().join('')
            );
        } catch (error) {
            Log.error('Decryption error:', error);
            return '';
        }
    }

    encrypt(ip: string): string {
        try {
            return btoa(ip)
                .split('').reverse().join('')
                .replace(/=/g, '_');
        } catch (error) {
            console.error('Encryption error:', error);
            return '';
        }
    }
}

export const serverDecryption = new ServerDecryption();