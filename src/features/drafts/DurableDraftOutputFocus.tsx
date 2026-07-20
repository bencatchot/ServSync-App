import type { ElementType, ReactNode } from 'react';

export type DurableDraftOutputFocusType = 'estimate' | 'job';

export type DurableDraftOutputFocusRequest = {
  token: symbol;
  outputType: DurableDraftOutputFocusType;
  outputId: string;
  contractorId: string;
};

export type DurableDraftOutputFocusContext = {
  outputType: DurableDraftOutputFocusType | null;
  outputId: string | null;
  contractorId: string | null;
  workspaceActive: boolean;
};

type DurableDraftOutputFocusCoordinatorOptions = {
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  getContext: () => DurableDraftOutputFocusContext;
  getRoot?: () => ParentNode;
};

const OUTPUT_HEADING_FRAME_ATTEMPTS = 4;

function requestMatchesContext(request: DurableDraftOutputFocusRequest, context: DurableDraftOutputFocusContext) {
  return context.workspaceActive
    && context.outputType === request.outputType
    && context.outputId === request.outputId
    && context.contractorId === request.contractorId;
}

export function findDurableDraftOutputHeading(
  root: ParentNode,
  outputType: DurableDraftOutputFocusType,
  outputId: string,
) {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-durable-output-heading][data-durable-output-id]'))
    .find(element => element.dataset.durableOutputHeading === outputType
      && element.dataset.durableOutputId === outputId) ?? null;
}

export function createDurableDraftOutputFocusCoordinator(options: DurableDraftOutputFocusCoordinatorOptions) {
  let current: DurableDraftOutputFocusRequest | null = null;
  let frame: number | null = null;

  const clearFrame = () => {
    if (frame === null) return;
    options.cancelFrame(frame);
    frame = null;
  };

  const cancel = (token?: symbol) => {
    if (token && current?.token !== token) return false;
    clearFrame();
    current = null;
    return true;
  };

  const request = (next: DurableDraftOutputFocusRequest) => {
    clearFrame();
    current = next;
    const run = (remainingHeadingFrames: number) => {
      frame = null;
      if (current?.token !== next.token) return;
      if (!requestMatchesContext(next, options.getContext())) {
        cancel(next.token);
        return;
      }
      const heading = findDurableDraftOutputHeading(options.getRoot?.() ?? document, next.outputType, next.outputId);
      if (!heading && remainingHeadingFrames > 0) {
        frame = options.requestFrame(() => run(remainingHeadingFrames - 1));
        return;
      }
      if (!heading || current?.token !== next.token || !requestMatchesContext(next, options.getContext())) {
        cancel(next.token);
        return;
      }
      heading.focus({ preventScroll: true });
      if (current?.token === next.token) current = null;
    };
    frame = options.requestFrame(() => run(OUTPUT_HEADING_FRAME_ATTEMPTS - 1));
    return next.token;
  };

  const cancelUnlessCurrent = () => {
    if (current && !requestMatchesContext(current, options.getContext())) cancel(current.token);
  };

  return {
    request,
    cancel,
    cancelUnlessCurrent,
    dispose: () => cancel(),
    current: () => current,
  };
}

export type DurableDraftOutputHeadingProps = {
  as: ElementType;
  outputType: DurableDraftOutputFocusType;
  outputId: string;
  className?: string;
  testId?: string;
  children: ReactNode;
};

export function DurableDraftOutputHeading({
  as: Heading,
  outputType,
  outputId,
  className,
  testId,
  children,
}: DurableDraftOutputHeadingProps) {
  return (
    <Heading
      className={className}
      data-durable-output-heading={outputType}
      data-durable-output-id={outputId}
      data-testid={testId}
      tabIndex={-1}
    >
      {children}
    </Heading>
  );
}
