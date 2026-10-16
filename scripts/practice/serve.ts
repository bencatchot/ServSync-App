import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import {
  createLocalFixture,
  OWNER,
  CONTRACTOR,
  SNAPSHOT,
} from "./local-fixture";
import { commitToTestDestination } from "./test-destination";
import { LocalPracticeStore } from "../../server/practice/store";
import { practiceCleanupDryRun } from "../../server/practice/cleanup";
import type { IncomingMessage } from "node:http";

const fixture = await createLocalFixture();
const store = new LocalPracticeStore(fixture.db, OWNER, CONTRACTOR);
const port = 5193;
const origin = `http://127.0.0.1:${port}`;
async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > 1100000)
      throw new Error("Request exceeds local Practice limit.");
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString() || "{}");
}
const server = await createServer({
  configFile: false,
  envFile: false,
  // A shell with VITE_* variables must not connect this review server to a real backend.
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
  },
  root: fileURLToPath(new URL("../../", import.meta.url)),
  server: { host: "127.0.0.1", port, strictPort: true },
  plugins: [
    react(),
    {
      name: "local-practice-only",
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          let pathname: string;
          try {
            pathname = decodeURIComponent(new URL(req.url ?? "/", origin).pathname);
          } catch {
            res.statusCode = 400;
            res.end("Invalid local path");
            return;
          }
          if (
            (pathname.endsWith(".html") && pathname !== "/scripts/practice/index.html") ||
            ["/src/main.tsx", "/src/App.tsx", "/src/supabaseClient.ts"].some((path) => pathname.endsWith(path))
          ) {
            res.statusCode = 403;
            res.end("Only the isolated Practice review entry is available.");
            return;
          }
          if (req.url === "/") {
            res.writeHead(302, { location: "/scripts/practice/index.html" });
            res.end();
            return;
          }
          if (!req.url?.startsWith("/api/")) return next();
          const route = req.url.slice("/api/practice-local/".length);
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          if (
            req.headers.host !== `127.0.0.1:${port}` ||
            (req.headers.origin && req.headers.origin !== origin) ||
            !req.url.startsWith("/api/practice-local/")
          ) {
            res.statusCode = 403;
            res.end(
              JSON.stringify({ error: "Local Practice origin required." }),
            );
            return;
          }
          try {
            if (req.method === "GET" && route === "state") {
              const workspace = (await store.workspaces())[0] ?? null;
              res.end(
                JSON.stringify({
                  workspace,
                  drafts: workspace ? await store.drafts(workspace.id) : [],
                  serverNow: new Date().toISOString(),
                }),
              );
              return;
            }
            if (req.method === "GET" && route === "cleanup-dry-run") {
              res.end(JSON.stringify(await practiceCleanupDryRun(fixture.db)));
              return;
            }
            if (
              req.method !== "POST" ||
              req.headers["x-practice-local"] !== "1" ||
              req.headers.origin !== origin
            )
              throw new Error("Same-origin explicit local action required.");
            const b = await body(req);
            let result: unknown;
            if (route === "start") result = await store.start(SNAPSHOT);
            else if (route === "save")
              result = await store.save(b.workspace, b.id, b.revision, b.draft);
            else if (route === "refresh")
              result = await store.refresh(b.workspace, b.revision, SNAPSHOT);
            else if (route === "review")
              result = await store.review(
                b.workspace,
                b.id,
                b.revision,
                b.operation,
              );
            else if (route === "cancel")
              result = await store.cancelReview(b.operation);
            else if (route === "commit") {
              if (b.approval !== "create-one-test-draft")
                throw new Error("Explicit test destination approval required.");
              result = await commitToTestDestination(
                fixture.destination,
                store,
                b.operation,
                b.hash,
              );
            } else
              throw new Error(
                "Unsupported local action. No provider or cleanup execution is exposed.",
              );
            res.end(JSON.stringify(result));
          } catch (error) {
            res.statusCode = 400;
            const message =
              error instanceof Error
                ? error.message
                : "Local Practice action failed.";
            res.end(JSON.stringify({ error: message.split("\n")[0] }));
          }
        });
      },
    },
  ],
});
try {
  await server.listen();
  console.log(`Practice local review: ${origin}/scripts/practice/index.html`);
} catch (error) {
  fixture.close();
  throw error;
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  fixture.close();
  process.exit(0);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
