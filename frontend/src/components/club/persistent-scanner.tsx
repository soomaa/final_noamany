import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CameraBarcodeScanner } from '@/components/club/camera-barcode-scanner';
import { useHardwareScanner } from '@/components/club/use-hardware-scanner';
import {
  createPersistentScanRequest,
  pathOwnsItsOwnScanner,
  PERSISTENT_SCANNER_STORAGE_KEY,
  readPersistentScannerOpen,
  type PersistentScanRequest,
} from '@/lib/persistent-scanner-model';

interface PersistentScannerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  pendingScan: PersistentScanRequest | null;
  completeScan: (id: number) => void;
}

const PersistentScannerContext = createContext<PersistentScannerContextValue | null>(null);

export function PersistentScannerProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => readPersistentScannerOpen(
    typeof window === 'undefined' ? null : window.localStorage.getItem(PERSISTENT_SCANNER_STORAGE_KEY),
  ));
  const scanSequenceRef = useRef(0);
  const [pendingScan, setPendingScan] = useState<PersistentScanRequest | null>(null);

  useEffect(() => {
    window.localStorage.setItem(PERSISTENT_SCANNER_STORAGE_KEY, open ? '1' : '0');
  }, [open]);

  const openScannedMember = useCallback((code: string) => {
    const request = createPersistentScanRequest(code, scanSequenceRef.current);
    if (!request) return;
    scanSequenceRef.current = request.id;
    setPendingScan(request);
    if (pathname !== '/club/reception') navigate('/club/reception');
  }, [navigate, pathname]);

  useHardwareScanner(openScannedMember, {
    enabled: !pendingScan && !pathOwnsItsOwnScanner(pathname),
  });

  const completeScan = useCallback((id: number) => {
    setPendingScan((current) => current?.id === id ? null : current);
  }, []);

  const value = useMemo<PersistentScannerContextValue>(() => ({
    open,
    setOpen,
    toggle: () => setOpen((current) => !current),
    pendingScan,
    completeScan,
  }), [completeScan, open, pendingScan]);

  return (
    <PersistentScannerContext.Provider value={value}>
      {children}
      <CameraBarcodeScanner
        open={open && !pendingScan}
        onOpenChange={setOpen}
        onDetected={openScannedMember}
      />
    </PersistentScannerContext.Provider>
  );
}

export function usePersistentScanner() {
  const value = useContext(PersistentScannerContext);
  if (!value) throw new Error('usePersistentScanner must be used inside PersistentScannerProvider');
  return value;
}
