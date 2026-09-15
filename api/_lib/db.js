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
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS financial_status TEXT NOT NULL DEFAULT 'ok'`;
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12,2) NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS payment_due_date DATE`;
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'one_time'`;
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'Plano atual'`;
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS plan_version TEXT NOT NULL DEFAULT '1.0'`;
      await sql`ALTER TABLE portal_users ADD COLUMN IF NOT EXISTS plan_terms TEXT NOT NULL DEFAULT 'Condições do plano conforme a proposta comercial vigente entre as partes.'`;
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
        CREATE TABLE IF NOT EXISTS request_plan_acceptances (
          id BIGSERIAL PRIMARY KEY,
          request_id BIGINT NOT NULL UNIQUE REFERENCES post_requests(id),
          user_id BIGINT NOT NULL REFERENCES portal_users(id),
          plan_name TEXT NOT NULL,
          plan_version TEXT NOT NULL,
          contract_snapshot TEXT NOT NULL,
          accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          accepted_ip TEXT,
          revoked_at TIMESTAMPTZ,
          revoked_by BIGINT REFERENCES portal_users(id),
          revoke_reason TEXT
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS request_plan_acceptances_user_idx ON request_plan_acceptances(user_id, accepted_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS login_attempts (
          id BIGSERIAL PRIMARY KEY,
          username TEXT NOT NULL,
          ip TEXT NOT NULL,
          attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx ON login_attempts(username, ip, attempted_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS meeting_appointments (
          id BIGSERIAL PRIMARY KEY,
          meeting_date DATE NOT NULL,
          meeting_time TIME NOT NULL,
          start_at TIMESTAMPTZ NOT NULL,
          duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes = 30),
          full_name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          company TEXT,
          notes TEXT,
          requester_ip TEXT,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS meeting_appointments_slot_idx ON meeting_appointments(meeting_date, meeting_time) WHERE status <> 'cancelled'`;
      await sql`CREATE INDEX IF NOT EXISTS meeting_appointments_date_idx ON meeting_appointments(meeting_date, meeting_time)`;
    })().catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}
