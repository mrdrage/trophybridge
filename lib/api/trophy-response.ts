import { privateJson, psnErrorResponse } from "./private-response";
import { PsnConnectionError } from "../psn/connection-errors";
import { PsnProviderError } from "../psn/errors";
import { TrophySyncError } from "../trophies/errors";

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
  FORBIDDEN: "PlayStation Network non consente questa richiesta trofei.",
  NOT_FOUND: "I trofei PlayStation richiesti non sono disponibili.",
  RATE_LIMITED: "PlayStation Network sta limitando temporaneamente le richieste.",
  INVALID_RESPONSE: "PlayStation Network ha restituito una risposta trofei non valida.",
  UPSTREAM_UNAVAILABLE: "PlayStation Network non è raggiungibile in questo momento.",
};

export function trophySyncErrorResponse(error: unknown) {
  if (error instanceof TrophySyncError) {
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
        message: "Sincronizzazione dei trofei non riuscita.",
        retryable: true,
      },
    },
    { status: 500 },
  );
}
