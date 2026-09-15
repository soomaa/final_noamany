import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CameraBarcodeScanner } from '@/components/club/camera-barcode-scanner';
import { useHardwareScanner } from '@/components/club/use-hardware-scanner';
import {
  buildPersistentScanUrl,
  pathOwnsItsOwnScanner,
  persistentCameraShouldOpen,
  persistentScannerAllowedPath,
  persistentScannerPermissionKeys,
  PERSISTENT_SCANNER_STORAGE_KEY,
  readPersistentScannerOpen,
} from '@/lib/persistent-scanner-model';
import { usePermission } from '@/hooks/use-permission';

interface PersistentScannerContextValue {
  available: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const PersistentScannerContext = createContext<PersistentScannerContextValue | null>(null);

export function PersistentScannerProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const routeOwnsScanner = pathOwnsItsOwnScanner(pathname);
  const { can, isReady } = usePermission();
  const destinationPermissions = persistentScannerPermissionKeys(pathname, search);
  const scannerAllowed = persistentScannerAllowedPath(pathname)
    && isReady
    && destinationPermissions.some((permission) => can(permission));
  const [open, setOpen] = useState(() => readPersistentScannerOpen(
    typeof window === 'undefined' ? null : window.localStorage.getItem(PERSISTENT_SCANNER_STORAGE_KEY),
  ));

  useEffect(() => {
    window.localStorage.setItem(PERSISTENT_SCANNER_STORAGE_KEY, open ? '1' : '0');
  }, [open]);

  // The USB handheld is the scanner reception actually uses, and it types like a keyboard.
  // Listening here — above every page, with no panel to open first — means a card scanned
  // while the operator is anywhere in the system still opens that member's card. Screens
  // that drive their own scanner (event check-in) keep their scans to themselves.
  useHardwareScanner(
    (code) => {
      const target = buildPersistentScanUrl(code, pathname, search);
      if (target) navigate(target);
    },
    { enabled: scannerAllowed && !routeOwnsScanner },
  );

  const value = useMemo<PersistentScannerContextValue>(() => ({
    available: scannerAllowed,
    open,
    setOpen,
    toggle: () => setOpen((current) => !current),
  }), [open, scannerAllowed]);

  return (
    <PersistentScannerContext.Provider value={value}>
      {children}
      <CameraBarcodeScanner
        open={scannerAllowed && persistentCameraShouldOpen(open, pathname)}
        onOpenChange={setOpen}
        onDetected={(code) => {
          const target = buildPersistentScanUrl(code, pathname, search);
          if (target) navigate(target);
        }}
      />
    </PersistentScannerContext.Provider>
  );
}

export function usePersistentScanner() {
  const value = useContext(PersistentScannerContext);
  // Leaf pages can render during staged route integration; the app-shell provider
  // turns this into a working scanner once centrally registered.
  return value ?? { available: false, open: false, setOpen: () => undefined, toggle: () => undefined };
}
