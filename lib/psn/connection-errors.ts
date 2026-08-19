export type PsnConnectionErrorCode =
  | "INVALID_NPSSO"
  | "IDENTITY_NOT_FOUND"
  | "IDENTITY_MISMATCH"
  | "REAUTH_REQUIRED"
  | "NOT_CONNECTED"
  | "ACCOUNT_ALREADY_LINKED"
  | "UPSTREAM_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "STORAGE_ERROR"
  | "CREDENTIAL_DECRYPTION_FAILED";

const httpStatusByCode: Record<PsnConnectionErrorCode, number> = {
  INVALID_NPSSO: 400,
  IDENTITY_NOT_FOUND: 404,
  IDENTITY_MISMATCH: 409,
  REAUTH_REQUIRED: 401,
  NOT_CONNECTED: 404,
  ACCOUNT_ALREADY_LINKED: 409,
  UPSTREAM_UNAVAILABLE: 503,
  INVALID_RESPONSE: 502,
  STORAGE_ERROR: 500,
  CREDENTIAL_DECRYPTION_FAILED: 500,
};

const safeMessageByCode: Record<PsnConnectionErrorCode, string> = {
  INVALID_NPSSO: "Il codice NPSSO non è valido o non è più utilizzabile.",
  IDENTITY_NOT_FOUND: "Non riesco a trovare esattamente questo ID PSN.",
  IDENTITY_MISMATCH: "Il token PlayStation appartiene a un account diverso dall'ID PSN indicato.",
  REAUTH_REQUIRED: "La connessione PlayStation deve essere autenticata di nuovo.",
  NOT_CONNECTED: "Nessun account PlayStation è collegato.",
  ACCOUNT_ALREADY_LINKED: "Esiste già una connessione PlayStation incompatibile con questa operazione.",
  UPSTREAM_UNAVAILABLE: "PlayStation Network non è raggiungibile in questo momento.",
  INVALID_RESPONSE: "PlayStation Network ha restituito una risposta non valida.",
  STORAGE_ERROR: "Non è stato possibile salvare lo stato della connessione.",
  CREDENTIAL_DECRYPTION_FAILED: "La credenziale PlayStation salvata non può essere decifrata.",
};

export class PsnConnectionError extends Error {
  readonly httpStatus: number;

  constructor(
    readonly code: PsnConnectionErrorCode,
    options?: { retryable?: boolean },
  ) {
    super(safeMessageByCode[code]);
    this.name = "PsnConnectionError";
    this.httpStatus = httpStatusByCode[code];
    this.retryable = options?.retryable ?? false;
  }

  readonly retryable: boolean;
}

export function normalizeConnectionError(error: unknown): PsnConnectionError {
  if (error instanceof PsnConnectionError) return error;
  return new PsnConnectionError("UPSTREAM_UNAVAILABLE", { retryable: true });
}
