import { useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import "./ProductScreenshot.css";

const screens = {
  contractor: {
    title: "Contractor estimates",
    caption: "See the scope, pricing, and next step.",
    image: "/landing/contractor-estimate.webp",
    detail: "/landing/contractor-estimate-detail.webp",
    detailHeight: 692,
    height: 2480,
    mobile: "/landing/contractor-estimate-mobile.webp",
    mobileHeight: 2670,
    alt: "An accepted water heater estimate in ServSync with a work description and price.",
  },
  homeowner: {
    title: "Home History",
    caption: "Look back at work done on your home.",
    image: "/landing/homeowner-history.webp",
    detail: "/landing/homeowner-history-detail.webp",
    detailHeight: 508,
    height: 1800,
    mobile: "/landing/homeowner-history-detail.webp",
    mobileHeight: 508,
    alt: "ServSync Home History showing a saved home repair, its service details, and the option to view the report.",
  },
};

type Screen = (typeof screens)[keyof typeof screens];

function ScreenshotDialog({
  screen,
  onClose,
}: {
  screen: Screen;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const zoomRef = useRef<HTMLButtonElement>(null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="ss-screen-dialog"
      aria-labelledby="ss-screen-title"
      aria-describedby="ss-screen-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        if (event.shiftKey && event.target === closeRef.current) {
          event.preventDefault();
          zoomRef.current?.focus();
        } else if (!event.shiftKey && event.target === zoomRef.current) {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <div className="ss-screen-dialog-content">
        <header className="ss-screen-dialog-header">
          <div>
            <h2 id="ss-screen-title">{screen.title}</h2>
            <p id="ss-screen-description">
              Actual ServSync screen · Sample data
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="ss-screen-close"
            aria-label="Close screenshot"
            onClick={onClose}
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div
          className="ss-screen-viewport"
          data-zoomed={zoomed}
          role="region"
          aria-label={`${screen.title} screenshot`}
          tabIndex={0}
        >
          <picture>
            <source
              media="(max-width: 699px)"
              srcSet={screen.mobile}
              width={648}
              height={screen.mobileHeight}
            />
            <img
              src={screen.image}
              alt={screen.alt}
              width={2880}
              height={screen.height}
            />
          </picture>
        </div>
        <div className="ss-screen-dialog-toolbar">
          <p>
            {zoomed
              ? "Scroll to explore the full screen."
              : "Take a closer look at the app."}
          </p>
          <button
            ref={zoomRef}
            type="button"
            className="ss-screen-zoom"
            aria-pressed={zoomed}
            onClick={() => setZoomed(!zoomed)}
          >
            {zoomed ? (
              <Minus size={17} aria-hidden="true" />
            ) : (
              <Plus size={17} aria-hidden="true" />
            )}
            {zoomed ? "Fit to view" : "Zoom in"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

export function ProductScreenshot({
  audience,
}: {
  audience: keyof typeof screens;
}) {
  const [open, setOpen] = useState(false);
  const screen = screens[audience];

  return (
    <figure className="ss-product-stage">
      <button
        type="button"
        className="ss-screen-open"
        aria-label={`Enlarge ${screen.title} screenshot`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="ss-screen-label">
          <span>{screen.title}</span>
          <span>
            <Maximize2 size={16} aria-hidden="true" /> View larger
          </span>
        </span>
        <picture>
          <source
            media="(max-width: 699px)"
            srcSet={screen.detail}
            width={648}
            height={screen.detailHeight}
          />
          <img
            className="ss-screen-detail"
            src={screen.image}
            alt={screen.alt}
            width={2880}
            height={screen.height}
            loading="lazy"
            decoding="async"
          />
        </picture>
      </button>
      <figcaption className="ss-screen-caption">
        <strong>{screen.caption}</strong>
        <span>Actual ServSync screen · Sample data</span>
      </figcaption>
      {open && (
        <ScreenshotDialog screen={screen} onClose={() => setOpen(false)} />
      )}
    </figure>
  );
}
