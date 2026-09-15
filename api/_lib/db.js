import postgres from "postgres";

let sqlClient;
let schemaPromise;

export function db() {
  const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("POSTGRES_URL não configurada");
  if (!sqlClient) {
    sqlClient = postgres(databaseUrl, {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false
    });
  }
  return sqlClient;
}

export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = db();
      await sql`
        CREATE TABLE IF NOT EXISTS portal_users (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          email TEXT,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS post_requests (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES portal_users(id),
          title TEXT NOT NULL,
          platforms TEXT NOT NULL,
          content_format TEXT NOT NULL,
          objective TEXT NOT NULL,
          details TEXT NOT NULL,
          caption_notes TEXT,
          reference_links TEXT,
          publication_date DATE NOT NULL,
          status TEXT NOT NULL DEFAULT 'recebido' CHECK (
            status IN ('recebido','briefing','criacao','revisao','aprovado','agendado','publicado','cancelado')
          ),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS post_requests_user_id_idx ON post_requests(user_id)`;
      await sql`CREATE INDEX IF NOT EXISTS post_requests_publication_date_idx ON post_requests(publication_date)`;
      await sql`
        CREATE TABLE IF NOT EXISTS login_attempts (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          ip TEXT NOT NULL,
          attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx ON login_attempts(username, ip, attempted_at)`;
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}
