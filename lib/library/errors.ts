export type LibrarySyncErrorCode =
  | "SYNC_COOLDOWN"
  | "SYNC_IN_PROGRESS"
  | "LIBRARY_TOO_LARGE"
  | "STORAGE_ERROR";

const httpStatusByCode: Record<LibrarySyncErrorCode, number> = {
  SYNC_COOLDOWN: 429,
  SYNC_IN_PROGRESS: 409,
  LIBRARY_TOO_LARGE: 422,
  STORAGE_ERROR: 500,
};

const messageByCode: Record<LibrarySyncErrorCode, string> = {
  SYNC_COOLDOWN: "La libreria è già stata sincronizzata di recente.",
  SYNC_IN_PROGRESS: "Una sincronizzazione della libreria è già in corso.",
  LIBRARY_TOO_LARGE: "La risposta PSN supera il limite di sicurezza previsto per TrophyBridge v0.1.",
  STORAGE_ERROR: "Non è stato possibile salvare la libreria PlayStation.",
};

export class LibrarySyncError extends Error {
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    readonly code: LibrarySyncErrorCode,
    options?: { retryable?: boolean; retryAfterSeconds?: number },
  ) {
    super(messageByCode[code]);
    this.name = "LibrarySyncError";
    this.httpStatus = httpStatusByCode[code];
    this.retryable = options?.retryable ?? false;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}
