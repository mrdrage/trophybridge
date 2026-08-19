import { privateJson, psnErrorResponse } from "./private-response";
import { LibrarySyncError } from "../library/errors";
import { PsnConnectionError } from "../psn/connection-errors";
import { PsnProviderError } from "../psn/errors";

const providerStatus: Record<PsnProviderError["code"], number> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INVALID_RESPONSE: 502,
  UPSTREAM_UNAVAILABLE: 503,
};

const providerMessage: Record<PsnProviderError["code"], string> = {
  AUTH_REQUIRED: "La connessione PlayStation deve essere autenticata di nuovo.",
  FORBIDDEN: "PlayStation Network non consente questa richiesta.",
  NOT_FOUND: "La libreria PlayStation richiesta non è disponibile.",
  RATE_LIMITED: "PlayStation Network sta limitando temporaneamente le richieste.",
  INVALID_RESPONSE: "PlayStation Network ha restituito una risposta non valida.",
  UPSTREAM_UNAVAILABLE: "PlayStation Network non è raggiungibile in questo momento.",
};

export function librarySyncErrorResponse(error: unknown) {
  if (error instanceof LibrarySyncError) {
    return privateJson(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          retryAfterSeconds: error.retryAfterSeconds,
        },
      },
      { status: error.httpStatus },
    );
  }

  if (error instanceof PsnConnectionError) return psnErrorResponse(error);

  if (error instanceof PsnProviderError) {
    return privateJson(
      {
        error: {
          code: `PSN_${error.code}`,
          message: providerMessage[error.code],
          retryable: error.retryable,
        },
      },
      { status: providerStatus[error.code] },
    );
  }

  return privateJson(
    {
      error: {
        code: "SYNC_FAILED",
        message: "Sincronizzazione della libreria non riuscita.",
        retryable: true,
      },
    },
    { status: 500 },
  );
}
