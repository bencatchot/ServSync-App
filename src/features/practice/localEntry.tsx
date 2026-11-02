// Only loaded by scripts/practice/index.html in the explicit local harness.
import { createRoot } from "react-dom/client";
import { PracticeLocalReview } from "./PracticeLocalReview";
import "../../index.css";
createRoot(document.getElementById("root")!).render(<PracticeLocalReview />);
