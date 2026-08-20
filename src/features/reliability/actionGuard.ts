export type ActionGuard = {
  begin: (key: string) => boolean;
  end: (key: string) => void;
  isActive: (key: string) => boolean;
};

export function createActionGuard(): ActionGuard {
  const active = new Set<string>();

  return {
    begin(key) {
      if (active.has(key)) return false;
      active.add(key);
      return true;
    },
    end(key) {
      active.delete(key);
    },
    isActive(key) {
      return active.has(key);
    },
  };
}
