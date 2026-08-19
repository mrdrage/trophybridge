import type {
  PsnAccount,
  PsnGame,
  PsnGameRef,
  PsnProvider,
  PsnTrophy,
  PsnTrophyGroup,
  PsnUserTrophy,
} from "./provider";

export interface MockPsnFixture {
  account: PsnAccount;
  games: PsnGame[];
  groups: Record<string, PsnTrophyGroup[]>;
  trophies: Record<string, PsnTrophy[]>;
  userTrophies: Record<string, PsnUserTrophy[]>;
}

function keyFor(game: PsnGameRef) {
  return `${game.serviceName}:${game.communicationId}`;
}

export class MockPsnProvider implements PsnProvider {
  constructor(private readonly fixture: MockPsnFixture) {}

  async getAccount() {
    return this.fixture.account;
  }

  async getGames() {
    return this.fixture.games;
  }

  async getTrophyGroups(game: PsnGameRef) {
    return this.fixture.groups[keyFor(game)] ?? [];
  }

  async getTrophies(game: PsnGameRef) {
    return this.fixture.trophies[keyFor(game)] ?? [];
  }

  async getUserTrophies(game: PsnGameRef) {
    return this.fixture.userTrophies[keyFor(game)] ?? [];
  }
}
