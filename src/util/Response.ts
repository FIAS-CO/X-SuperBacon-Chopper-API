import { StatusCode } from "hono/utils/http-status";
import { Context } from "vm";

export function respondWithError(c: Context, message: string, errorCode: number, httpStatus = 403) {
    return c.json(
        {
            message: message,
            code: errorCode
        },
        httpStatus as StatusCode
    );
}