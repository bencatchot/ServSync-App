import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
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
  Receipt,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import { appHashRoute } from "../../appLinks";
import "./LandingPage.css";

type Audience = "contractor" | "homeowner";
const signup = (role: Audience) => appHashRoute(role, { mode: "signup" });

const journey = [
  {
    label: "Connect",
    title: "Start with the right connection.",
    copy: "Find local contractors, explore their profiles, and choose who to connect with. Already have someone you trust? Keep your work together in ServSync.",
    icon: Link2,
    status: "Connected",
    detail: "A home. A contractor. A shared place to start.",
    items: [
      "Choose a contractor",
      "Share the details you allow",
      "Start the conversation",
    ],
  },
  {
    label: "Plan",
    title: "Get everyone on the same page.",
    copy: "Describe what needs attention, review an estimate, and coordinate a visit. Keep the scope and next steps with the work, so there’s less to piece together.",
    icon: FileText,
    status: "Estimate accepted",
    detail: "Clear scope. Clear next steps.",
    items: [
      "Send a service request",
      "Review the estimate",
      "Confirm a proposed visit",
    ],
  },
  {
    label: "Complete",
    title: "Keep the details with the job.",
    copy: "Contractors can organize work, add notes and photos, complete checklists, and prepare a report. Homeowners can follow the related updates in one place.",
    icon: ClipboardCheck,
    status: "Work completed",
    detail: "The work gets done. The details stay together.",
    items: [
      "Organize the job",
      "Document the work",
      "Share the completed report",
    ],
  },
  {
    label: "Keep",
    title: "Make the next visit easier.",
    copy: "Review the invoice and file eligible records to Home History. Keep useful service details close for the next repair, a warranty question, or a follow-up.",
    icon: FolderOpen,
    status: "Filed to Home History",
    detail: "A useful record, long after the tools are packed.",
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
      "ServSync is built for homeowners and independent home-service contractors, especially solo operators and small teams. Homeowners get a clearer way to manage service relationships and home records. Contractors get practical tools for customer records, estimates, jobs, reports, and invoices.",
  },
  {
    question: "Is ServSync free to use?",
    answer:
      "Core homeowner use is free. Contractor accounts are currently free during beta, with no credit card required. Any future paid plans will be explained before you choose one.",
  },
  {
    question: "Can I use ServSync with my existing customers?",
    answer:
      "Yes. Contractors can organize local customer and property records and prepare work without waiting for every customer to join. Eligible estimates, invoices, and finalized reports can be shared through secure, expiring links for that specific document. A connected homeowner account supports an ongoing relationship and home records.",
  },
  {
    question: "What information can a contractor see?",
    answer:
      "Homeowners choose what information to share through a contractor connection and can update or revoke that access. Connecting does not automatically share every document or all of your Home History. Visit Trust & Safety for more on sharing and platform boundaries.",
  },
  {
    question: "Can customers pay invoices in ServSync?",
    answer:
      "Online payment collection is not currently available. Payment is arranged outside ServSync, and authorized contractors can manually record invoice payment status in the app.",
  },
  {
    question: "Does ServSync work on my phone?",
    answer:
      "Yes. You can use ServSync in a mobile browser, as well as on a tablet or computer. No app-store download is required.",
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

function WorkPreview({ audience }: { audience: Audience }) {
  const homeowner = audience === "homeowner";
  return (
    <div
      className="ss-product-preview"
      role="group"
      aria-label={`${homeowner ? "Home History" : "Contractor work"} illustrative preview`}
    >
      <div className="ss-preview-bar">
        <span className="ss-preview-dot" />
        <span>ServSync / {homeowner ? "Home History" : "Work"}</span>
        <span className="ss-example">Example</span>
      </div>
      <div className="ss-preview-body">
        <div className="ss-preview-heading">
          <div>
            <p className="ss-small-label">
              {homeowner ? "YOUR HOME, REMEMBERED" : "A CLEAR VIEW OF THE WORK"}
            </p>
            <h3>
              {homeowner
                ? "A history worth keeping."
                : "From request to record."}
            </h3>
          </div>
          <span className="ss-preview-icon">
            {homeowner ? <Home size={24} /> : <Wrench size={24} />}
          </span>
        </div>
        <div className="ss-preview-property">
          <Home size={17} />
          <span>{homeowner ? "My home" : "Customer property"}</span>
          <span>Water heater replacement</span>
        </div>
        {homeowner ? (
          <div className="ss-history-list">
            <div>
              <span className="ss-history-icon">
                <ClipboardCheck size={20} />
              </span>
              <div>
                <strong>New water heater installed</strong>
                <p>Completed work · Service report</p>
              </div>
              <span className="ss-pill">Filed</span>
            </div>
            <div>
              <span className="ss-history-icon">
                <Receipt size={20} />
              </span>
              <div>
                <strong>The invoice, right here</strong>
                <p>Service details kept with your home</p>
              </div>
              <CheckCheck size={20} />
            </div>
            <div>
              <span className="ss-history-icon">
                <FolderOpen size={20} />
              </span>
              <div>
                <strong>The details for next time</strong>
                <p>Notes, documents & warranty context</p>
              </div>
              <ArrowUpRight size={18} />
            </div>
          </div>
        ) : (
          <>
            <div className="ss-work-tabs">
              <span>Overview</span>
              <span>Scope & details</span>
              <span>Documents</span>
            </div>
            <div className="ss-work-line">
              <span className="ss-task-icon">
                <FileText size={18} />
              </span>
              <div>
                <strong>Estimate</strong>
                <p>Scope and pricing reviewed</p>
              </div>
              <span className="ss-pill">Accepted</span>
            </div>
            <div className="ss-work-line">
              <span className="ss-task-icon">
                <Wrench size={18} />
              </span>
              <div>
                <strong>Job & checklist</strong>
                <p>Installation details documented</p>
              </div>
              <span className="ss-pill">Complete</span>
            </div>
            <div className="ss-work-line">
              <span className="ss-task-icon">
                <Receipt size={18} />
              </span>
              <div>
                <strong>Invoice</strong>
                <p>Connected to the completed work</p>
              </div>
              <span className="ss-pill ss-pill-blue">Sent</span>
            </div>
          </>
        )}
        <div className="ss-preview-note">
          <Link2 size={16} />
          <span>
            {homeowner
              ? "Your records stay useful beyond a single visit."
              : "One customer. Connected work. Less searching."}
          </span>
        </div>
      </div>
    </div>
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
              <span className="ss-eyebrow-line" /> GOOD HOMES. GOOD PEOPLE.
            </p>
            <h1 id="ss-hero-title">
              Home service,
              <br />
              <span>in sync.</span>
            </h1>
            <p className="ss-hero-description">
              Find your people. Plan the work.
              <br className="ss-desktop-break" /> Keep the story of your home
              together.
            </p>
            <p className="ss-hero-detail">
              One shared place for homeowners and local contractors, from the
              first request to the final invoice.
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
              A better way to work together
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
              More care. Less chasing.
            </div>
            <div className="ss-connection-card">
              <div className="ss-connection-top">
                <span className="ss-connection-icon">
                  <Link2 size={20} />
                </span>
                <div>
                  <p>GOOD WORK, CONNECTED</p>
                  <strong>A better visit starts here.</strong>
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
                Requests, estimates & records. Together.
              </p>
            </div>
            <span className="ss-photo-caption">
              Built around real homes and the people who care for them.
            </span>
          </div>
        </section>

        <div className="ss-promise-strip">
          <div className="ss-container">
            <span>
              <Link2 /> Meaningful connections
            </span>
            <span>
              <FileText /> Clearer next steps
            </span>
            <span>
              <MessageSquare /> Work that stays connected
            </span>
            <span>
              <FolderOpen /> Records worth keeping
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
              <p className="ss-eyebrow">FROM FIRST HELLO TO WHAT’S NEXT</p>
              <h2 id="ss-how-title">
                Finding your contractor
                <br />
                is just the beginning.
              </h2>
            </div>
            <p>
              Good service is a relationship. ServSync gives both sides a shared
              place to keep it moving, one clear step at a time.
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
                <span>ONE HOME. ONE SERVICE STORY.</span>
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
              <p className="ss-eyebrow">TWO SIDES. ONE SHARED EXPERIENCE.</p>
              <h2 id="ss-audience-title">Built for your side of the work.</h2>
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
                    ? "FOR THE PEOPLE DOING THE WORK"
                    : "FOR THE PLACE YOU CALL HOME"}
                </span>
                <h3>
                  {audience === "contractor" ? (
                    <>
                      Less scattered.
                      <br />
                      More in control.
                    </>
                  ) : (
                    <>
                      Your home has a story.
                      <br />
                      Keep it together.
                    </>
                  )}
                </h3>
                <p>
                  {audience === "contractor"
                    ? "You bring the know-how. Bring your customer details, estimates, jobs, and invoices into one practical workspace built for independent contractors."
                    : "From the first repair to the next routine visit, keep your contractors, service requests, invoices, and home records in one place you can come back to."}
                </p>
                <CheckList
                  items={
                    audience === "contractor"
                      ? [
                          "Prepare estimates with reusable templates and pricing",
                          "Keep job notes, photos, and checklists together",
                          "Create invoices connected to the work",
                          "Work with existing customers, too",
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
                    ? "Bring your work together"
                    : "Start your home’s story"}
                </SignupLink>
                <p className="ss-small-note">
                  {audience === "contractor"
                    ? "For solo pros and small teams. Free during beta."
                    : "Core homeowner use is free."}
                </p>
              </div>
              <div className="ss-product-stage">
                <WorkPreview audience={audience} />
                <div className="ss-product-stage-caption">
                  <span className="ss-mini-icon">
                    <CheckCheck size={18} />
                  </span>
                  <p>
                    {audience === "contractor"
                      ? "The details stay with the work."
                      : "The work ends. The record stays useful."}
                    <span>Illustrative preview · Example data</span>
                  </p>
                </div>
              </div>
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
              <p className="ss-eyebrow">A BETTER KIND OF CONNECTION</p>
              <h2 id="ss-difference-title">
                More than finding someone.
                <br />A better way to work together.
              </h2>
            </div>
            <p>
              Built for the part that matters most: the work, the relationship,
              and everything worth remembering afterward.
            </p>
          </div>
          <div className="ss-value-grid">
            <article>
              <span className="ss-value-icon">
                <LockKeyhole size={24} />
              </span>
              <h3>
                Your home. <br />
                Your say.
              </h3>
              <p>
                Choose who you connect with and what home information you share.
                Update or revoke that access as your needs change.
              </p>
              <a href={appHashRoute("trust-safety")}>
                Explore Trust & Safety <ArrowUpRight size={16} />
              </a>
            </article>
            <article>
              <span className="ss-value-icon">
                <CalendarDays size={24} />
              </span>
              <h3>
                The next visit <br />
                starts ahead.
              </h3>
              <p>
                Keep the contractor relationship and useful service records
                together, so the next conversation has somewhere to begin.
              </p>
              <SectionLink id="for-you">
                See how it comes together <ArrowUpRight size={16} />
              </SectionLink>
            </article>
            <article>
              <span className="ss-value-icon">
                <Wrench size={24} />
              </span>
              <h3>
                Practical tools. <br />
                Real-world work.
              </h3>
              <p>
                Estimates, checklists, reports, and invoices for independent
                pros. A clear way to get organized without enterprise-level
                complexity.
              </p>
              <a href={signup("contractor")}>
                Explore the contractor side <ArrowUpRight size={16} />
              </a>
            </article>
          </div>
          <div className="ss-trust-note">
            <ShieldCheck size={20} />
            <p>
              Connections start with your choice. ServSync does not verify
              contractor licenses, insurance, or quality of work.
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
              <p className="ss-eyebrow">A FEW THINGS TO KNOW</p>
              <h2 id="ss-faq-title">
                Good questions.
                <br />
                Straight answers.
              </h2>
              <p>
                We’re building ServSync carefully, with feedback from the people
                who use it.
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
              <p className="ss-eyebrow">LET’S BRING IT ALL TOGETHER</p>
              <span className="ss-closing-mark">
                <Link2 size={38} />
              </span>
            </div>
            <h2 id="ss-closing-title">
              Good work.
              <br />
              <span>Better connected.</span>
            </h2>
            <div className="ss-closing-bottom">
              <p>
                Your home or your business.
                <br />
                Give the next chapter a better place to start.
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
            <span>Built for better connections.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
