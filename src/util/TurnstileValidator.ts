export class TurnstileValidator {
    private secretKey: string;

    constructor(secretKey: string) {
        this.secretKey = secretKey;
    }

    async verify(token: string, ip?: string): Promise<boolean> {
        const formData = new URLSearchParams();
        formData.append("secret", this.secretKey);
        formData.append("response", token);
        if (ip) {
            formData.append("remoteip", ip);
        }

        const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
        });

        if (!response.ok) {
            console.error("Turnstile verification failed: HTTP error");
            return false;
        }

        const result = await response.json();
        return result.success === true;
    }
}