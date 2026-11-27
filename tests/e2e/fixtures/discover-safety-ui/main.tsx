import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DiscoverSafetyActions } from "../../../../src/features/discover/DiscoverSafetyActions";
import {
  DiscoverSafetyAdminQueue,
  type DiscoverSafetyQueueItem,
} from "../../../../src/features/discover/DiscoverSafetyAdminQueue";
import "../../../../src/index.css";

const queue: DiscoverSafetyQueueItem[] = [
  { id: "p1", post_id: "post-1", kind: "post", title: "Review my garden project", description: "A garden without personal information.", photos: ["/fixtures/safe-photo.svg"], status: "pending_review" },
  { id: "p2", post_id: "post-2", kind: "post", title: "Review only when all photos load", photos: ["https://not-the-approved-host.invalid/example.jpg"], status: "pending_review" },
  { id: "r1", post_id: "post-3", kind: "report", title: "Reported project", reason: "privacy", status: "open" },
];

export default function DiscoverSafetyFixture() {
  const [calls, setCalls] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  return (
    <main className="p-4 max-w-xl space-y-6">
      <section aria-label="Fictional post">
        <h1>Kitchen repair</h1>
        <DiscoverSafetyActions
          postId="test-post"
          contractorId="test-contractor"
          title="Kitchen repair"
          onReport={async (id, reason) => {
            setCalls((previous) => [...previous, `report:${id}:${reason}`]);
            if (reason === "other" && !failed) {
              setFailed(true);
              throw new Error("private internal error");
            }
            return "TEST-REPORT-123";
          }}
          onBlock={async (id) => { setCalls((previous) => [...previous, `block:${id}`]); }}
        />
      </section>
      <DiscoverSafetyAdminQueue
        loadQueue={async () => queue.filter((item) => !removed.includes(item.id))}
        onDecide={async (id, kind, decision, reason) => {
          setCalls((previous) => [...previous, `decide:${id}:${kind}:${decision}:${reason}`]);
          setRemoved((previous) => [...previous, id]);
        }}
      />
      <pre aria-label="Fixture callback log">{calls.join("\n")}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<DiscoverSafetyFixture />);
