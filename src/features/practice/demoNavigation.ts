// A mounted Practice editor can veto hash/back navigation before the root unmounts it.
let leaveGuard: (() => boolean) | null = null;
export function registerPracticeLeaveGuard(guard: () => boolean) {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
}
export function allowPracticeNavigation() {
  return leaveGuard?.() ?? true;
}
