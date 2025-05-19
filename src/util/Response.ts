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

export function respondWithDetailedError(
    c: Context,
    err: Error,
    errorCode: number,
    httpStatus: StatusCode = 500
) {
    return c.json(
        {
            message: err.message,
            code: errorCode,
            name: err.name,
            stack: err.stack,
        },
        httpStatus
    );
}