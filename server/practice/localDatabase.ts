// Local/test transport only: no URL, password, Supabase client or remote TCP target accepted.
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
export type LocalDatabase = {
  socket: string;
  port: number;
  database: string;
  psql: string;
};
export function sql(value: unknown): string {
  if (value === null) return "null";
  const s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (s.includes("\u0000")) throw new Error("NUL is not allowed.");
  return `'${s.replaceAll("'", "''")}'`;
}
export function uuid(value: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("Invalid identifier.");
  return value;
}
export async function query<T>(
  db: LocalDatabase,
  actor: string,
  statement: string,
  role:
    | "practice_app"
    | "practice_cleanup"
    | "practice_reconcile"
    | "practice_destination"
    | "practice_destination_reconcile"
    | "postgres" = "practice_app",
): Promise<T> {
  const socket = realpathSync(db.socket);
  if (
    !/^\/private\/tmp\/servsync-practice-[A-Za-z0-9]+\/socket$/.test(socket) &&
    !/^\/tmp\/servsync-practice-[A-Za-z0-9]+\/socket$/.test(socket)
  )
    throw new Error("Local disposable socket required.");
  if (!/^servsync_(practice|destination)_local_[a-f0-9]+$/.test(db.database))
    throw new Error("Local database name required.");
  uuid(actor);
  return await new Promise((resolve, reject) => {
    const child = spawn(
      db.psql,
      [
        "-X",
        "-qAt",
        "-P",
        "null=null",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        socket,
        "-p",
        String(db.port),
        "-U",
        "postgres",
        "-d",
        db.database,
      ],
      {
        env: { PATH: process.env.PATH, LANG: "en_US.UTF-8" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    let error = "";
    child.stdout.on("data", (d) => {
      output += d;
    });
    child.stderr.on("data", (d) => {
      error += d;
    });
    child.on("error", reject);
    // `exit` can precede the final stdout data event. Wait for stdio to drain;
    // otherwise concurrent psql processes can manufacture a missing/null result.
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(error.trim()));
      const result = output.trim().split("\n").filter(Boolean).at(-1);
      if (!result) return reject(new Error("Missing database result."));
      try {
        resolve(JSON.parse(result) as T);
      } catch {
        reject(new Error("Invalid database result."));
      }
    });
    child.stdin.end(
      `begin; set local statement_timeout='10s'; set local standard_conforming_strings=on; set local role ${role}; set local practice.actor_id=${sql(actor)};\n${statement}\ncommit;`,
    );
  });
}
