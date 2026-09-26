import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Hammer,
  Home,
  Link2,
  LockKeyhole,
  Menu,
  MessageSquare,
  Plus,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { appHashRoute } from "../../appLinks";
import { ProductScreenshot } from "./ProductScreenshot";
import "./LandingPage.css";

type Audience = "contractor" | "homeowner";
const signup = (role: Audience) => appHashRoute(role, { mode: "signup" });

const journey = [
  {
    label: "Connect",
    title: "Find a contractor for your home.",
    copy: "Browse local contractor profiles and choose who to connect with. You can also use ServSync with a contractor you already know.",
    icon: Link2,
    status: "Connected",
    detail: "The homeowner and contractor are connected.",
    items: [
      "Choose a contractor",
      "Choose which home details to share",
      "Start the conversation",
    ],
  },
  {
    label: "Plan",
    title: "Agree on the work before it starts.",
    copy: "Describe what needs attention, review the estimate, and confirm a proposed visit. You can refer back to the scope and pricing whenever you need to.",
    icon: FileText,
    status: "Estimate accepted",
    detail: "The homeowner has reviewed and accepted the estimate.",
    items: [
      "Send a service request",
      "Review the estimate",
      "Confirm a proposed visit",
    ],
  },
  {
    label: "Complete",
    title: "Keep the details with the job.",
    copy: "Contractors can add notes and photos, work through a checklist, and prepare a service report. Homeowners can review the updates shared with them.",
    icon: ClipboardCheck,
    status: "Work completed",
    detail: "The installation is finished and the report is ready.",
    items: [
      "Organize the job",
      "Document the work",
      "Share the completed report",
    ],
  },
  {
    label: "Keep",
    title: "Save the records you’ll need later.",
    copy: "Keep service records in Home History so you can look up past work when a repair or warranty question comes up. You can also add your own follow-up reminders to check in the app.",
    icon: FolderOpen,
    status: "Filed to Home History",
    detail: "The service record is saved in Home History.",
    items: [
      "Review the invoice",
      "File your service records",
      "Add a manual follow-up reminder",
    ],
  },
];

const questions = [
  {
    question: "Who is ServSync for?",
    answer:
      "ServSync is for homeowners and home-service contractors, especially solo operators and small teams. Homeowners can find contractors, request service, and keep home records. Contractors can manage customers, estimates, jobs, reports, and invoices.",
  },
  {
    question: "Is ServSync free to use?",
    answer:
      "The core homeowner features are free. Contractor accounts are free during beta, and you don’t need a credit card. We’ll explain any future paid plans before you choose one.",
  },
  {
    question: "Can I use ServSync with my existing customers?",
    answer:
      "Yes. You can keep customer and property records and prepare work even if a customer hasn’t joined ServSync. Where document sharing is available, you can send a secure link to an estimate, invoice, or completed report. Each link expires and opens only that document. Customers who join can connect with you and keep their own home records.",
  },
  {
    question: "What information can a contractor see?",
    answer:
      "You choose which home information to share with each connected contractor, and you can change or remove that access. Connecting doesn’t give a contractor access to every document or all of your Home History. Trust & Safety explains how sharing works.",
  },
  {
    question: "Can customers pay invoices in ServSync?",
    answer:
      "Online payments aren’t available yet. Customers pay outside ServSync, and contractors with billing access can update an invoice’s payment status in the app.",
  },
  {
    question: "Does ServSync work on my phone?",
    answer:
      "Yes. Open ServSync in the browser on your phone, tablet, or computer. You don’t need to download an app.",
  },
];

function Brand() {
  return (
    <a
      className="ss-brand"
      href={appHashRoute("home")}
      aria-label="ServSync home"
    >
      <span className="ss-brand-mark">
        <img src="/landing/brand-mark.webp" alt="" width="90" height="90" />
      </span>
      <span>
        Serv<span className="ss-brand-sync">Sync</span>
      </span>
    </a>
  );
}

function SectionLink({
  id,
  children,
  className = "",
  onNavigate,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  onNavigate?: () => void;
}) {
  const scroll = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onNavigate?.();
    const target = document.getElementById(id);
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
    target?.focus({ preventScroll: true });
  };
  return (
    <a
      href={appHashRoute("home", { section: id })}
      onClick={scroll}
      className={className}
    >
      {children}
    </a>
  );
}

function SignupLink({
  role,
  children,
  secondary = false,
}: {
  role: Audience;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a
      href={signup(role)}
      className={`ss-button ${secondary ? "ss-button-secondary" : "ss-button-primary"}`}
    >
      {children}
      <ArrowUpRight size={18} aria-hidden="true" />
    </a>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="ss-check-list">
      {items.map((item) => (
        <li key={item}>
          <Check size={17} aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [audience, setAudience] = useState<Audience>("contractor");
  const [step, setStep] = useState(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const currentStep = journey[step];
  const StepIcon = currentStep.icon;

  useEffect(() => {
    const section = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    ).get("section");
    if (section)
      requestAnimationFrame(() =>
        document.getElementById(section)?.scrollIntoView(),
      );
  }, []);

  const closeMenu = (event: KeyboardEvent) => {
    if (event.key === "Escape" && menuOpen) {
      setMenuOpen(false);
      menuButton.current?.focus();
    }
  };
  const changeTab = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
    count: number,
    select: (index: number) => void,
  ) => {
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % count
        : event.key === "ArrowLeft"
          ? (index + count - 1) % count
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    select(next);
    (
      event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[
        next
      ] as HTMLButtonElement
    )?.focus();
  };

  return (
    <div
      className="ss-landing"
      onClick={(event) => {
        const link = (event.target as HTMLElement).closest("a");
        const href = link?.getAttribute("href");
        if (
          href?.startsWith("#/") &&
          !href.includes("section=") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      }}
    >
      <a
        className="ss-skip"
        href="#ss-main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("ss-main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="ss-header" onKeyDown={closeMenu}>
        <div className="ss-container ss-header-inner">
          <Brand />
          <nav className="ss-desktop-nav" aria-label="Main navigation">
            <SectionLink id="how-it-works">How it works</SectionLink>
            <SectionLink id="for-you">Built for you</SectionLink>
            <SectionLink id="the-difference">Why ServSync</SectionLink>
            <SectionLink id="questions">FAQs</SectionLink>
          </nav>
          <div className="ss-header-actions">
            <details
              className="ss-signin-menu"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  event.currentTarget.open = false;
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary>
                Sign in <ChevronDown size={14} aria-hidden="true" />
              </summary>
              <div>
                <a href={appHashRoute("homeowner")}>
                  Homeowner <Home size={16} aria-hidden="true" />
                </a>
                <a href={appHashRoute("contractor")}>
                  Contractor <Wrench size={16} aria-hidden="true" />
                </a>
              </div>
            </details>
            <SectionLink
              id="get-started"
              className="ss-button ss-button-small ss-button-navy"
            >
              Get started <ArrowUpRight size={16} aria-hidden="true" />
            </SectionLink>
          </div>
          <button
            type="button"
            ref={menuButton}
            className="ss-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="ss-mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
        {menuOpen && (
          <nav
            id="ss-mobile-nav"
            className="ss-mobile-nav"
            aria-label="Mobile navigation"
          >
            <SectionLink
              id="how-it-works"
              onNavigate={() => setMenuOpen(false)}
            >
              How it works
            </SectionLink>
            <SectionLink id="for-you" onNavigate={() => setMenuOpen(false)}>
              Built for you
            </SectionLink>
            <SectionLink
              id="the-difference"
              onNavigate={() => setMenuOpen(false)}
            >
              Why ServSync
            </SectionLink>
            <SectionLink id="questions" onNavigate={() => setMenuOpen(false)}>
              FAQs
            </SectionLink>
            <a href={appHashRoute("homeowner")}>
              Homeowner sign in <ArrowUpRight size={16} />
            </a>
            <a href={appHashRoute("contractor")}>
              Contractor sign in <ArrowUpRight size={16} />
            </a>
          </nav>
        )}
      </header>

      <main id="ss-main" tabIndex={-1}>
        <section
          className="ss-hero ss-container"
          aria-labelledby="ss-hero-title"
        >
          <div className="ss-hero-copy">
            <p className="ss-eyebrow">
              <span className="ss-eyebrow-line" /> HOMEOWNERS & LOCAL
              CONTRACTORS
            </p>
            <h1 id="ss-hero-title">
              Home service,
              <br />
              <span>in sync.</span>
            </h1>
            <p className="ss-hero-description">
              Find a contractor and
              <br className="ss-desktop-break" /> keep track of the work.
            </p>
            <p className="ss-hero-detail">
              ServSync helps homeowners manage repairs and gives contractors the
              tools to manage their jobs.
            </p>
            <div className="ss-hero-buttons">
              <SignupLink role="homeowner">I’m a homeowner</SignupLink>
              <SignupLink role="contractor" secondary>
                I’m a contractor
              </SignupLink>
            </div>
            <p className="ss-beta-note">
              <Check size={15} aria-hidden="true" /> Free during beta <span />{" "}
              No credit card required
            </p>
            <SectionLink id="how-it-works" className="ss-explore-link">
              <span>
                <ArrowDown size={17} aria-hidden="true" />
              </span>{" "}
              See how ServSync works
            </SectionLink>
          </div>
          <div className="ss-hero-visual">
            <picture>
              <source
                media="(max-width: 640px)"
                srcSet="/landing/home-service-mobile.webp"
              />
              <img
                className="ss-hero-photo"
                src="/landing/home-service.webp"
                alt="A home-service professional arriving at a welcoming coastal home"
                width="1200"
                height="800"
                loading="eager"
              />
            </picture>
            <div className="ss-photo-tag">
              <span>
                <Home size={15} />
              </span>{" "}
              Repairs & routine maintenance
            </div>
            <div className="ss-connection-card">
              <div className="ss-connection-top">
                <span className="ss-connection-icon">
                  <Link2 size={20} />
                </span>
                <div>
                  <p>YOUR SERVICE DETAILS</p>
                  <strong>Know where things stand.</strong>
                </div>
                <Check size={18} />
              </div>
              <div className="ss-connection-flow">
                <span>
                  <Home size={15} /> Your home
                </span>
                <span className="ss-connection-line" />
                <span>
                  <Wrench size={15} /> Your contractor
                </span>
              </div>
              <p className="ss-connection-caption">
                Service requests, estimates & invoices
              </p>
            </div>
            <span className="ss-photo-caption">
              For homeowners, solo contractors, and small teams.
            </span>
          </div>
        </section>

        <div className="ss-promise-strip">
          <div className="ss-container">
            <span>
              <Link2 /> Local contractors
            </span>
            <span>
              <FileText /> Estimates & scheduling
            </span>
            <span>
              <MessageSquare /> Job updates
            </span>
            <span>
              <FolderOpen /> Home service records
            </span>
          </div>
        </div>

        <section
          id="how-it-works"
          tabIndex={-1}
          className="ss-section ss-container ss-how"
          aria-labelledby="ss-how-title"
        >
          <div className="ss-section-heading">
            <div>
              <p className="ss-eyebrow">HOW SERVSYNC WORKS</p>
              <h2 id="ss-how-title">
                From the first request
                <br />
                to the finished job.
              </h2>
            </div>
            <p>
              Find a contractor, agree on the work, and keep the paperwork when
              it’s done. Here’s how that looks in ServSync.
            </p>
          </div>
          <div
            className="ss-journey-tabs"
            role="tablist"
            aria-label="Explore the service journey"
          >
            {journey.map((item, index) => (
              <button
                type="button"
                key={item.label}
                id={`ss-step-${index}`}
                role="tab"
                aria-selected={step === index}
                aria-controls="ss-journey-panel"
                tabIndex={step === index ? 0 : -1}
                onClick={() => setStep(index)}
                onKeyDown={(event) =>
                  changeTab(event, index, journey.length, setStep)
                }
              >
                <span>0{index + 1}</span>
                {item.label}
                <ArrowRight size={19} />
              </button>
            ))}
          </div>
          <div
            id="ss-journey-panel"
            className="ss-journey-panel"
            role="tabpanel"
            aria-labelledby={`ss-step-${step}`}
            tabIndex={0}
          >
            <div className="ss-journey-copy">
              <h3>{currentStep.title}</h3>
              <p>{currentStep.copy}</p>
              <CheckList items={currentStep.items} />
            </div>
            <div className="ss-journey-example">
              <div className="ss-example-heading">
                <span>A TYPICAL HOME REPAIR</span>
                <span>Illustrative example</span>
              </div>
              <div className="ss-job-card">
                <div className="ss-job-top">
                  <span className="ss-job-icon">
                    <StepIcon size={24} />
                  </span>
                  <span className="ss-pill">{currentStep.status}</span>
                </div>
                <h4>Water heater replacement</h4>
                <p>{currentStep.detail}</p>
                <div className="ss-job-progress" aria-hidden="true">
                  {journey.map((item, i) => (
                    <span
                      className={i <= step ? "is-complete" : ""}
                      key={item.label}
                    />
                  ))}
                </div>
                <div className="ss-job-footer">
                  <span>
                    <Home size={14} /> Homeowner
                  </span>
                  <Link2 size={16} />
                  <span>
                    <Wrench size={14} /> Contractor
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="for-you"
          tabIndex={-1}
          className="ss-audience-section"
          aria-labelledby="ss-audience-title"
        >
          <div className="ss-container">
            <div className="ss-audience-heading">
              <p className="ss-eyebrow">WHAT YOU CAN DO</p>
              <h2 id="ss-audience-title">See what’s here for you.</h2>
              <div
                className="ss-audience-tabs"
                role="tablist"
                aria-label="Choose your perspective"
              >
                {(["contractor", "homeowner"] as Audience[]).map(
                  (role, index) => (
                    <button
                      type="button"
                      id={`ss-${role}-tab`}
                      key={role}
                      role="tab"
                      aria-selected={audience === role}
                      aria-controls="ss-audience-panel"
                      tabIndex={audience === role ? 0 : -1}
                      onClick={() => setAudience(role)}
                      onKeyDown={(event) =>
                        changeTab(event, index, 2, (next) =>
                          setAudience(next === 0 ? "contractor" : "homeowner"),
                        )
                      }
                    >
                      {role === "contractor" ? (
                        <Hammer size={17} />
                      ) : (
                        <Home size={17} />
                      )}{" "}
                      For {role}s
                    </button>
                  ),
                )}
              </div>
            </div>
            <div
              className="ss-audience-panel"
              id="ss-audience-panel"
              role="tabpanel"
              aria-labelledby={`ss-${audience}-tab`}
              tabIndex={0}
            >
              <div className="ss-audience-copy">
                <span className="ss-number-label">
                  {audience === "contractor"
                    ? "FOR CONTRACTORS"
                    : "FOR HOMEOWNERS"}
                </span>
                <h3>
                  {audience === "contractor" ? (
                    <>
                      Manage your jobs
                      <br />
                      and customers.
                    </>
                  ) : (
                    <>
                      Keep track of work
                      <br />
                      done on your home.
                    </>
                  )}
                </h3>
                <p>
                  {audience === "contractor"
                    ? "Put together an estimate, check the job details, and send the invoice. Your customer information and paperwork are in the same place."
                    : "Look up who did the repair, find an old invoice, or request another visit. Keep your contractors and service records together so you don’t have to start from scratch."}
                </p>
                <CheckList
                  items={
                    audience === "contractor"
                      ? [
                          "Prepare estimates with reusable templates and pricing",
                          "Keep job notes, photos, and checklists together",
                          "Create invoices connected to the work",
                          "Manage existing customers, even before they join",
                        ]
                      : [
                          "Find local contractors and choose who to connect with",
                          "Review estimates and proposed appointment times",
                          "File eligible reports and invoices to Home History",
                          "Choose what you share with each contractor",
                        ]
                  }
                />
                <SignupLink role={audience}>
                  {audience === "contractor"
                    ? "Create a contractor account"
                    : "Create a homeowner account"}
                </SignupLink>
                <p className="ss-small-note">
                  {audience === "contractor"
                    ? "For solo pros and small teams. Free during beta."
                    : "Core homeowner features are free."}
                </p>
              </div>
              <ProductScreenshot key={audience} audience={audience} />
            </div>
          </div>
        </section>

        <section
          id="the-difference"
          tabIndex={-1}
          className="ss-section ss-container ss-difference"
          aria-labelledby="ss-difference-title"
        >
          <div className="ss-section-heading">
            <div>
              <p className="ss-eyebrow">WHY SERVSYNC</p>
              <h2 id="ss-difference-title">
                There’s a lot to keep track of.
                <br />
                ServSync helps you stay organized.
              </h2>
            </div>
            <p>
              Home repairs come with appointments, decisions, and paperwork.
              Keep those details handy for this job and the next one.
            </p>
          </div>
          <div className="ss-value-grid">
            <article>
              <span className="ss-value-icon">
                <LockKeyhole size={24} />
              </span>
              <h3>
                You choose <br />
                what to share.
              </h3>
              <p>
                Choose who you connect with and what home information you share.
                Change or remove that access whenever you need to.
              </p>
              <a href={appHashRoute("trust-safety")}>
                Read about sharing <ArrowUpRight size={16} />
              </a>
            </article>
            <article>
              <span className="ss-value-icon">
                <CalendarDays size={24} />
              </span>
              <h3>
                Look up <br />
                past work.
              </h3>
              <p>
                Check what was done, when it happened, and who handled it. Your
                service records are there to refer back to before the next
                visit.
              </p>
              <SectionLink id="for-you">
                See the features <ArrowUpRight size={16} />
              </SectionLink>
            </article>
            <article>
              <span className="ss-value-icon">
                <Wrench size={24} />
              </span>
              <h3>
                Spend less time <br />
                on paperwork.
              </h3>
              <p>
                Reuse estimate templates and pricing, keep a checklist for each
                job, and create invoices from the work you’ve already entered.
              </p>
              <a href={signup("contractor")}>
                Get started as a contractor <ArrowUpRight size={16} />
              </a>
            </article>
          </div>
          <div className="ss-trust-note">
            <ShieldCheck size={20} />
            <p>
              You choose who to hire. ServSync does not verify contractor
              licenses, insurance, or quality of work.
            </p>
          </div>
        </section>

        <section
          id="questions"
          tabIndex={-1}
          className="ss-faq-section"
          aria-labelledby="ss-faq-title"
        >
          <div className="ss-container ss-faq-grid">
            <div>
              <p className="ss-eyebrow">BEFORE YOU GET STARTED</p>
              <h2 id="ss-faq-title">
                Common
                <br />
                questions.
              </h2>
              <p>
                A few things to know about accounts, pricing, and how ServSync
                works.
              </p>
              <span className="ss-beta-badge">CURRENTLY IN BETA</span>
            </div>
            <div className="ss-faq-list">
              {questions.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <Plus size={20} aria-hidden="true" />
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          id="get-started"
          tabIndex={-1}
          className="ss-closing-section"
          aria-labelledby="ss-closing-title"
        >
          <div className="ss-container">
            <div className="ss-closing-top">
              <p className="ss-eyebrow">TRY SERVSYNC</p>
              <span className="ss-closing-mark">
                <Link2 size={38} />
              </span>
            </div>
            <h2 id="ss-closing-title">
              Ready to
              <br />
              <span>get started?</span>
            </h2>
            <div className="ss-closing-bottom">
              <p>
                Choose a homeowner or contractor account.
                <br />
                You can try ServSync for free during beta.
              </p>
              <div>
                <div className="ss-closing-buttons">
                  <SignupLink role="homeowner">I’m a homeowner</SignupLink>
                  <SignupLink role="contractor" secondary>
                    I’m a contractor
                  </SignupLink>
                </div>
                <p className="ss-closing-note">
                  Free during beta. No credit card required.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="ss-footer">
        <div className="ss-container">
          <div className="ss-footer-top">
            <div>
              <Brand />
              <p>Home service, in sync.</p>
            </div>
            <div>
              <p className="ss-footer-label">YOUR SERVSYNC</p>
              <a href={appHashRoute("homeowner")}>
                Homeowner sign in <ArrowUpRight size={14} />
              </a>
              <a href={appHashRoute("contractor")}>
                Contractor sign in <ArrowUpRight size={14} />
              </a>
            </div>
            <div>
              <p className="ss-footer-label">THE DETAILS</p>
              <a href={appHashRoute("trust-safety")}>Trust & Safety</a>
              <a href={appHashRoute("privacy")}>Privacy Policy</a>
              <a href={appHashRoute("terms")}>Terms of Service</a>
            </div>
          </div>
          <div className="ss-footer-bottom">
            <span>
              © {new Date().getFullYear()} ServSync. All rights reserved.
            </span>
            <div>
              <a href={appHashRoute("acceptable-use")}>Acceptable Use</a>
              <a href={appHashRoute("contractor-agreement")}>
                Contractor Agreement
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
