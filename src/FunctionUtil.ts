export function generateRandomHexString(length: number) {
    let result = "";
    const characters = "0123456789abcdef";
    for (let i = 0; i < length * 2; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}
