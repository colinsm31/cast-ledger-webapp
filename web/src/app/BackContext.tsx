import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Lets a page declare where its "Back" button should go — its logical parent in
// the cascade — instead of relying on browser history (which would return to a
// just-submitted form). Pages with no target fall back to history.
interface BackContextValue {
  target: string | null;
  setTarget: (t: string | null) => void;
}

const BackContext = createContext<BackContextValue>({ target: null, setTarget: () => {} });

export function BackProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<string | null>(null);
  return <BackContext.Provider value={{ target, setTarget }}>{children}</BackContext.Provider>;
}

// Declare this screen's parent path (or null to use history). Cleared on unmount.
export function useBack(target: string | null) {
  const { setTarget } = useContext(BackContext);
  useEffect(() => {
    setTarget(target);
    return () => setTarget(null);
  }, [target, setTarget]);
}

export function useBackTarget(): string | null {
  return useContext(BackContext).target;
}
