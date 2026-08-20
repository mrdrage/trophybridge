export type ShareErrorCode =
  | "INVALID_SHARE_TOKEN"
  | "SHARE_LINK_REVOKED"
  | "GAME_NOT_FOUND"
  | "INVALID_REQUEST"
  | "STORAGE_ERROR";

const statusByCode: Record<ShareErrorCode, number> = {
  INVALID_SHARE_TOKEN: 404,
  SHARE_LINK_REVOKED: 410,
  GAME_NOT_FOUND: 404,
  INVALID_REQUEST: 400,
  STORAGE_ERROR: 500,
};

const messageByCode: Record<ShareErrorCode, string> = {
  INVALID_SHARE_TOKEN: "Il link TrophyBridge non è valido.",
  SHARE_LINK_REVOKED: "Il link TrophyBridge è stato revocato.",
  GAME_NOT_FOUND: "Il gioco richiesto non è disponibile in questa condivisione.",
  INVALID_REQUEST: "La richiesta pubblica non è valida.",
  STORAGE_ERROR: "TrophyBridge non riesce a leggere i dati condivisi.",
};

export class ShareError extends Error {
  readonly httpStatus: number;

  constructor(readonly code: ShareErrorCode) {
    super(messageByCode[code]);
    this.name = "ShareError";
    this.httpStatus = statusByCode[code];
  }
}
