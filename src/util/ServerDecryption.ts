export class ServerDecryption {
    decrypt(encryptedData: string): string {
        try {
            return atob(
                encryptedData
                    .replace(/_/g, '=')
                    .split('').reverse().join('')
            );
        } catch (error) {
            console.error('Decryption error:', error);
            return '';
        }
    }
}

export const serverDecryption = new ServerDecryption();