// Disposable browser fixture only. No credentials, hosted connections or JWT verification.
// Browser tests intercept the exact Demo RPC and forward synthetic claims here.
import { createServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createLocalFixture,
  OWNER,
  OTHER_OWNER,
  CONTRACTOR,
  OTHER_CONTRACTOR,
} from "./local-fixture";
import { query, sql } from "../../server/practice/localDatabase";

const fixture = await createLocalFixture();
const admin = (statement: string) =>
  query(fixture.db, OWNER, statement, "postgres");
const migration = readFileSync(
  new URL(
    "../../server/practice/demo-draft/20261016171813_practice_demo_review_draft.sql",
    import.meta.url,
  ),
  "utf8",
);
await admin(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create function auth.uid() returns uuid language sql as $$select null::uuid$$;
set local servsync.reviewed_demo_target='bdytwgejqnlblhrnqxkp'; ${migration} select null::json;`);
const actors = [OWNER, OTHER_OWNER];
const root = fileURLToPath(new URL("../../", import.meta.url));
const servers: ViteDevServer[] = [];
try {
  for (const enabled of [true, false]) {
    const port = enabled ? 5194 : 5195;
    const origin = `http://127.0.0.1:${port}`;
    const server = await createServer({
      root,
      configFile: false,
      envFile: false,
      define: {
        "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
          "https://bdytwgejqnlblhrnqxkp.supabase.co",
        ),
        "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(
          "sb_publishable_LOCAL_SYNTHETIC_ONLY",
        ),
        "import.meta.env.VITE_SERVSYNC_DEMO_PROJECT_REF": JSON.stringify(
          "bdytwgejqnlblhrnqxkp",
        ),
        "import.meta.env.VITE_SERVSYNC_DEMO_PRACTICE_ENABLED": JSON.stringify(
          enabled ? "true" : "false",
        ),
      },
      server: { host: "127.0.0.1", port, strictPort: true },
      plugins: [
        react(),
        {
          name: "disposable-demo-rpc-fixture",
          configureServer(vite) {
            vite.middlewares.use(async (req, res, next) => {
              if (!req.url?.startsWith("/__fixture/")) return next();
              res.setHeader("content-type", "application/json");
              if (
                req.headers.host !== `127.0.0.1:${port}` ||
                req.headers["x-local-fixture"] !== "synthetic-browser-test" ||
                req.method !== "POST" ||
                (req.headers.origin && req.headers.origin !== origin)
              ) {
                res.statusCode = 403;
                res.end("{}");
                return;
              }
              try {
                const chunks: Buffer[] = [];
                let size = 0;
                for await (const part of req) {
                  size += part.length;
                  if (size > 1100000) throw new Error("Too large");
                  chunks.push(part);
                }
                const b = JSON.parse(Buffer.concat(chunks).toString());
                if (!actors.includes(b.actor))
                  throw new Error("Synthetic actor required");
                let result: unknown;
                if (req.url === "/__fixture/reset") {
                  await admin(`delete from servsync_practice_demo.drafts where cycle_id in (select id from servsync_practice_demo.cycles where user_id=${sql(b.actor)}); delete from servsync_practice_demo.cycles where user_id=${sql(b.actor)}; delete from servsync_practice_demo.pilots where user_id=${sql(b.actor)};
                insert into servsync_practice_demo.pilots values(${sql(b.actor)},${sql(b.actor === OWNER ? CONTRACTOR : OTHER_CONTRACTOR)},true,clock_timestamp()+interval '31 days'); select null::json;`);
                  result = { ok: true };
                } else if (req.url === "/__fixture/expire") {
                  result = await admin(
                    `update servsync_practice_demo.cycles set expires_at=clock_timestamp()+interval '3 seconds' where user_id=${sql(b.actor)}; select null::json;`,
                  );
                } else if (req.url === "/__fixture/revoke") {
                  result = await admin(
                    `update servsync_practice_demo.pilots set enabled=false where user_id=${sql(b.actor)}; select null::json;`,
                  );
                } else if (req.url === "/__fixture/count") {
                  result = await admin(
                    `select to_json(count(*)) from servsync_practice_demo.drafts where cycle_id in (select id from servsync_practice_demo.cycles where user_id=${sql(b.actor)});`,
                  );
                } else if (req.url === "/__fixture/rpc") {
                  if (!["state", "start", "save"].includes(b.body?.command))
                    throw new Error("Unsupported command");
                  const claims = {
                    sub: b.actor,
                    role: "authenticated",
                    is_anonymous: false,
                    iss: "https://bdytwgejqnlblhrnqxkp.supabase.co/auth/v1",
                  };
                  result = await admin(
                    `set session authorization authenticated; set local request.jwt.claims=${sql(claims)}; select public.servsync_practice_demo(${sql(b.body.command)},${sql(b.body.arguments ?? {})}::jsonb);`,
                  );
                } else throw new Error("Unsupported local control");
                res.end(JSON.stringify(result));
              } catch (e) {
                const message = e instanceof Error ? e.message : "Failed";
                res.statusCode = /revision|conflict/i.test(message) ? 409 : 403;
                res.end(JSON.stringify({ error: message.split("\n")[0] }));
              }
            });
          },
        },
      ],
    });
    servers.push(server);
    await server.listen();
    console.log(
      `Synthetic Demo UI fixture ${enabled ? "enabled" : "disabled"}: ${origin}/#/practice-demo`,
    );
  }
} catch (e) {
  await Promise.all(servers.map((s) => s.close()));
  fixture.close();
  throw e;
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await Promise.all(servers.map((s) => s.close()));
  fixture.close();
  process.exit(0);
}
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
