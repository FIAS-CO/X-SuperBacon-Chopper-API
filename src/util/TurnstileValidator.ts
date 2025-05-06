export class TurnstileValidator {
    private secretKey: string;

    constructor(secretKey: string) {
        this.secretKey = secretKey;
    }

    async verify(token: string, ip?: string): Promise<{ isValid: boolean; errorCodes: string[] }> {
        const formData = new URLSearchParams();
        formData.append("secret", this.secretKey);
        formData.append("response", token);
        if (ip) {
            formData.append("remoteip", ip);
        }

        try {
            const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: formData.toString(),
            });

            if (!response.ok) {
                console.error(`Turnstile verification failed: HTTP ${response.status}`);
                return { isValid: false, errorCodes: [`http_error_${response.status}`] };
            }

            const result = await response.json();
            return {
                isValid: result.success === true,
                errorCodes: result["error-codes"] || []
            };
        } catch (error) {
            console.error("Turnstile verification failed:", error);
            return { isValid: false, errorCodes: ["network_error"] };
        }
    }
}