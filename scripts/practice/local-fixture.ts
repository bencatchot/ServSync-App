import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { query, type LocalDatabase } from "../../server/practice/localDatabase";
import type { PracticeSnapshot } from "../../src/features/practice/contracts";

export const OWNER = "10000000-0000-4000-8000-000000000001";
export const OTHER_OWNER = "10000000-0000-4000-8000-000000000002";
export const CONTRACTOR = "20000000-0000-4000-8000-000000000001";
export const OTHER_CONTRACTOR = "20000000-0000-4000-8000-000000000002";
export const SNAPSHOT: PracticeSnapshot = {
  business: { name: "Fictional Sample Service Co.", laborRate: "75" },
  prices: [
    {
      id: "sample-price-1",
      title: "Small repair",
      customer_description: "Example repair scope",
      line_type: "material",
      unit: "each",
      default_unit_price_cents: 12500,
      labor_hours: null,
    },
  ],
  templates: [
    {
      id: "sample-template-1",
      name: "Example repair",
      scope: "Inspect and complete the agreed small repair.",
      line_items: [
        {
          line_type: "material",
          description: "Small repair",
          quantity: 1,
          unit: "each",
          unit_price_cents: 12500,
          sort_order: 0,
        },
      ],
    },
  ],
};

export async function createLocalFixture() {
  const dir = mkdtempSync("/tmp/servsync-practice-");
  const bin = process.env.PG16_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
  const suffix = randomBytes(6).toString("hex");
  const socket = `${dir}/socket`;
  mkdirSync(socket);
  const base = { socket, port: 55483, psql: `${bin}/psql` };
  const db: LocalDatabase = {
    ...base,
    database: `servsync_practice_local_${suffix}`,
  };
  const destination: LocalDatabase = {
    ...base,
    database: `servsync_destination_local_${suffix}`,
  };
  const command = (name: string, args: string[], input?: string) =>
    execFileSync(`${bin}/${name}`, args, {
      input,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, LANG: "en_US.UTF-8" },
    });
  let started = false;
  const close = () => {
    if (started)
      command("pg_ctl", ["-D", `${dir}/data`, "-m", "fast", "-w", "stop"]);
    // Only this process's newly-created disposable cluster, never an external path.
    rmSync(dir, { recursive: true, force: true });
  };
  try {
    command("initdb", [
      "-D",
      `${dir}/data`,
      "-U",
      "postgres",
      "--auth=trust",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    command("pg_ctl", [
      "-D",
      `${dir}/data`,
      "-l",
      `${dir}/postgres.log`,
      "-o",
      `-k ${socket} -p 55483 -c listen_addresses=''`,
      "-w",
      "start",
    ]);
    started = true;
    for (const target of [db, destination])
      command("createdb", [
        "-h",
        socket,
        "-p",
        "55483",
        "-U",
        "postgres",
        target.database,
      ]);
    command(
      "psql",
      [
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        socket,
        "-p",
        "55483",
        "-U",
        "postgres",
        "-d",
        db.database,
      ],
      readFileSync(
        fileURLToPath(
          new URL("../../server/practice/local-schema.sql", import.meta.url),
        ),
        "utf8",
      ),
    );
    await query(
      db,
      OWNER,
      `insert into practice.owners values('${CONTRACTOR}','${OWNER}',true),('${OTHER_CONTRACTOR}','${OTHER_OWNER}',true); select '{}'::json;`,
      "postgres",
    );
    await query(
      destination,
      OWNER,
      `
      create table destination_drafts(id uuid primary key, contractor_id uuid not null, status text not null check(status='draft'), payload jsonb not null);
      create table transfer_receipts(operation_id uuid primary key, contractor_id uuid not null, package_hash text not null, destination_id uuid not null references destination_drafts, created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default clock_timestamp()+interval '2160 hours');
      select '{}'::json;`,
      "postgres",
    );
    const restart = () => command("pg_ctl", ["-D", `${dir}/data`, "-l", `${dir}/postgres.log`, "-m", "fast", "-w", "restart"]);
    return { db, destination, close, restart };
  } catch (error) {
    close();
    throw error;
  }
}
