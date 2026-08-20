export type ShareErrorCode =
  | "INVALID_SHARE_TOKEN"
  | "SHARE_LINK_REVOKED"
  | "GAME_NOT_FOUND"
  | "INVALID_REQUEST"
  | "PSN_UNAVAILABLE"
  | "PSN_REAUTH_REQUIRED"
  | "SYNC_FAILED"
  | "STORAGE_ERROR";

const statusByCode: Record<ShareErrorCode, number> = {
  INVALID_SHARE_TOKEN: 404,
  SHARE_LINK_REVOKED: 410,
  GAME_NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  PSN_UNAVAILABLE: 503,
  PSN_REAUTH_REQUIRED: 503,
  SYNC_FAILED: 503,
  STORAGE_ERROR: 500,
};

const messageByCode: Record<ShareErrorCode, string> = {
  INVALID_SHARE_TOKEN: "Il link TrophyBridge non è valido.",
  SHARE_LINK_REVOKED: "Il link TrophyBridge è stato revocato.",
  GAME_NOT_FOUND: "Il gioco richiesto non è disponibile in questa condivisione.",
  INVALID_REQUEST: "La richiesta pubblica non è valida.",
  PSN_UNAVAILABLE: "PlayStation Network non è raggiungibile e non esiste ancora uno stato trofei utilizzabile.",
  PSN_REAUTH_REQUIRED: "La connessione PlayStation deve essere autenticata di nuovo prima di poter aggiornare questo gioco.",
  SYNC_FAILED: "TrophyBridge non è riuscito a creare uno stato trofei utilizzabile per questo gioco.",
  STORAGE_ERROR: "TrophyBridge non riesce a leggere i dati condivisi.",
};

const retryableByCode: Record<ShareErrorCode, boolean> = {
  INVALID_SHARE_TOKEN: false,
  SHARE_LINK_REVOKED: false,
  GAME_NOT_FOUND: false,
  INVALID_REQUEST: false,
  PSN_UNAVAILABLE: true,
  PSN_REAUTH_REQUIRED: false,
  SYNC_FAILED: true,
  STORAGE_ERROR: true,
};

export class ShareError extends Error {
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    readonly code: ShareErrorCode,
    options?: { retryable?: boolean; retryAfterSeconds?: number },
  ) {
    super(messageByCode[code]);
    this.name = "ShareError";
    this.httpStatus = statusByCode[code];
    this.retryable = options?.retryable ?? retryableByCode[code];
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
  }
}
