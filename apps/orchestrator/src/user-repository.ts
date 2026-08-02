import { Pool } from "pg";

export type UserProfile = {
  githubId: string;
  githubLogin: string;
  githubEmail?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
};

type UserRow = {
  id: string | number;
  github_id: string;
  github_login: string;
  github_email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: Date;
  last_seen_at: Date;
};

function mapUserRow(row: UserRow): UserProfile & { createdAt: Date; lastSeenAt: Date } {
  return {
    githubId: row.github_id,
    githubLogin: row.github_login,
    githubEmail: row.github_email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export interface UserRepository {
  upsert(profile: UserProfile): Promise<void>;
  getByGithubId(githubId: string): Promise<(UserProfile & { createdAt: Date; lastSeenAt: Date }) | null>;
}

export class PostgresUserRepository implements UserRepository {
  private readonly pool: Pool;

  public constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl });
  }

  /**
   * Inserts a new user on first sign-in, or updates github_login / email / display_name / avatar
   * and bumps last_seen_at on every subsequent sign-in.
   */
  public async upsert(profile: UserProfile): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO flowdb_users (github_id, github_login, github_email, display_name, avatar_url, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (github_id)
      DO UPDATE SET
        github_login  = EXCLUDED.github_login,
        github_email  = COALESCE(EXCLUDED.github_email,  flowdb_users.github_email),
        display_name  = COALESCE(EXCLUDED.display_name,  flowdb_users.display_name),
        avatar_url    = COALESCE(EXCLUDED.avatar_url,    flowdb_users.avatar_url),
        last_seen_at  = NOW()
      `,
      [
        profile.githubId,
        profile.githubLogin,
        profile.githubEmail ?? null,
        profile.displayName ?? null,
        profile.avatarUrl ?? null,
      ]
    );
  }

  public async getByGithubId(
    githubId: string
  ): Promise<(UserProfile & { createdAt: Date; lastSeenAt: Date }) | null> {
    const result = await this.pool.query<UserRow>(
      `
      SELECT id, github_id, github_login, github_email, display_name, avatar_url, created_at, last_seen_at
      FROM flowdb_users
      WHERE github_id = $1
      LIMIT 1
      `,
      [githubId]
    );
    return result.rows[0] ? mapUserRow(result.rows[0]) : null;
  }
}
