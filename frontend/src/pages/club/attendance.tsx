import { ScanBarcode, Sparkles, UsersRound, type LucideIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/common/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useHomeRoute, usePermission } from '@/hooks/use-permission';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import { ClassBarcodeCheckInPanel, MemberBarcodeCheckInPanel, SpaBarcodeCheckInPanel } from './fitness/barcode-check-in';

export type ClubAttendanceTab = 'members' | 'spa' | 'classes';

interface AttendanceTab {
  value: ClubAttendanceTab;
  label: string;
  icon: LucideIcon;
  /** The catalogued page whose View permission shows this tab. */
  route: string;
  Panel: ComponentType;
}

const TABS: AttendanceTab[] = [
  { value: 'members', label: 'حضور الأعضاء', icon: UsersRound, route: CR.members.barcodeMemberCheckIn, Panel: MemberBarcodeCheckInPanel },
  { value: 'spa', label: 'حضور السبا', icon: Sparkles, route: CR.members.barcodeSpaCheckIn, Panel: SpaBarcodeCheckInPanel },
  { value: 'classes', label: 'حضور الحصص', icon: ScanBarcode, route: CR.members.barcodeClassesCheckIn, Panel: ClassBarcodeCheckInPanel },
];

/**
 * Reception check-in: member, SPA and class barcode scanners as tabs of one page.
 * Switching tabs only changes `?tab=`, so the route guard does not reload the page, and a
 * tab opened once stays mounted (hidden) so its scanned member is still there on return.
 */
export function ClubAttendancePage() {
  const { canRoute } = usePermission();
  const { homeRoute } = useHomeRoute();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = TABS.filter((tab) => canRoute(tab.route));
  const requested = searchParams.get('tab');
  // Local copy of `?tab=` so a click switches in the same render, before a scanner types.
  const [selected, setSelected] = useState(requested);
  useEffect(() => setSelected(requested), [requested]);
  const active = tabs.find((tab) => tab.value === selected) ?? tabs[0];
  const [opened, setOpened] = useState<Set<ClubAttendanceTab>>(() => new Set(active ? [active.value] : []));
  const panelsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!active) return;
    setOpened((prev) => (prev.has(active.value) ? prev : new Set(prev).add(active.value)));
    // The barcode scanner types into the focused field; give it the visible tab's input.
    panelsRef.current
      ?.querySelector<HTMLInputElement>(`[data-attendance-tab="${active.value}"] input:not([disabled])`)
      ?.focus();
  }, [active?.value]);

  if (!active) return <Navigate to={homeRoute} replace />;

  const selectTab = (value: string) => {
    setSelected(value);
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="حضور" description="تسجيل حضور الأعضاء والسبا والحصص بالباركود من شاشة واحدة." />
      <Tabs value={active.value} onValueChange={selectTab}>
        <TabsList className="h-11 w-full flex-wrap">
          {tabs.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="gap-2 px-4">
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div ref={panelsRef}>
          {tabs.filter((tab) => tab.value === active.value || opened.has(tab.value)).map(({ value, Panel }) => (
            <TabsContent key={value} value={value} forceMount data-attendance-tab={value} className="data-[state=inactive]:hidden">
              <Panel />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
