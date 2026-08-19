export type TrophySyncErrorCode =
  | "GAME_NOT_FOUND"
  | "SYNC_COOLDOWN"
  | "SYNC_IN_PROGRESS"
  | "TROPHY_SNAPSHOT_TOO_LARGE"
  | "INVALID_TROPHY_SNAPSHOT"
  | "STORAGE_ERROR";

const httpStatusByCode: Record<TrophySyncErrorCode, number> = {
  GAME_NOT_FOUND: 404,
  SYNC_COOLDOWN: 429,
  SYNC_IN_PROGRESS: 409,
  TROPHY_SNAPSHOT_TOO_LARGE: 422,
  INVALID_TROPHY_SNAPSHOT: 502,
  STORAGE_ERROR: 500,
};

const messageByCode: Record<TrophySyncErrorCode, string> = {
  GAME_NOT_FOUND: "Il gioco non appartiene alla libreria PlayStation sincronizzata.",
  SYNC_COOLDOWN: "I trofei di questo gioco sono già stati sincronizzati di recente.",
  SYNC_IN_PROGRESS: "Una sincronizzazione dei trofei di questo gioco è già in corso.",
  TROPHY_SNAPSHOT_TOO_LARGE:
    "La risposta PSN supera il limite di sicurezza previsto per TrophyBridge v0.1.",
  INVALID_TROPHY_SNAPSHOT:
    "PlayStation Network ha restituito dati trofeo incoerenti e TrophyBridge non li ha salvati.",
  STORAGE_ERROR: "Non è stato possibile salvare i trofei PlayStation.",
};

export class TrophySyncError extends Error {
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    readonly code: TrophySyncErrorCode,
    options?: { retryable?: boolean; retryAfterSeconds?: number },
  ) {
    super(messageByCode[code]);
    this.name = "TrophySyncError";
    this.httpStatus = httpStatusByCode[code];
    this.retryable = options?.retryable ?? false;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}
