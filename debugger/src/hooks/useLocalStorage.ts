import { useState, useCallback } from "react";

export function useLocalStorage<T>(key: string, initial: T) {
   const [value, setValue] = useState<T>(() => {
      try {
         const stored = localStorage.getItem(key);
         return stored !== null ? JSON.parse(stored) : initial;
      } catch {
         return initial;
      }
   });

   const set = useCallback(
      (v: T | ((prev: T) => T)) => {
         setValue((prev) => {
            const next = v instanceof Function ? v(prev) : v;
            localStorage.setItem(key, JSON.stringify(next));
            return next;
         });
      },
      [key],
   );

   return [value, set] as const;
}
