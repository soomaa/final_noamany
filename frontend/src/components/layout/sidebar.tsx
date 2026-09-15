import { ChevronDown, ChevronLeft, ChevronRight, LayoutDashboard, LayoutGrid } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LOGO_SRC } from '@/components/brand/logo';
import {
  activeGroupId,
  activeNavPath,
  activeSectionId,
  NAV_SECTIONS,
  navGroupKey,
  navSectionLandingPath,
  navSectionKey,
  translateNavRoute,
  type NavGroup,
  type NavItem,
  type NavSection,
} from '@/lib/nav';
import { cn } from '@/lib/utils';
import { filterNavSections } from '@/lib/filter-nav';
import { useAuth } from '@/store/auth';
import { useLocale } from '@/store/locale';
import { usePermission, useHomeRoute } from '@/hooks/use-permission';

const ICON_STROKE = 2.1;

function SidebarHeader() {
  const { user } = useAuth();
  const { t } = useLocale();
  const roleLabel = user?.job_title?.trim() || (user?.level != null ? t(`levels.${user.level}`) : '');

  return (
    <div className="relative shrink-0 border-b border-white/10 px-4 pb-3 pt-3">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-brand-500/25 via-brand-600/10 to-transparent" />
      <div className="relative flex flex-col items-center gap-2 text-center">
        {/* Soft light plate so the dark logo wordmark stays readable on the dark sidebar */}
        <div className="relative w-full max-w-[16rem] overflow-hidden rounded-xl bg-gradient-to-br from-white via-[#FFF5F5] to-brand-100 p-2 shadow-[0_10px_28px_-12px_rgba(237,28,36,0.5)] ring-1 ring-white/40">
          <div className="pointer-events-none absolute -end-8 -top-10 size-28 rounded-full bg-brand-500/20 blur-2xl" />
          <div className="pointer-events-none absolute -start-6 bottom-0 size-20 rounded-full bg-brand-400/15 blur-xl" />
          <img
            src={LOGO_SRC}
            alt="Noamany Fitness Center"
            className="relative mx-auto h-24 w-full max-w-[13.5rem] object-contain"
          />
        </div>
        {(roleLabel || user?.name) && (
          <p className="truncate px-2 text-sm font-semibold tracking-wide text-white">
            {roleLabel || user?.name}
          </p>
        )}
      </div>
    </div>
  );
}

function HomeNavLink({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { t } = useLocale();
  const { homeRoute } = useHomeRoute();
  const { canRoute, isReady } = usePermission();
  const showAdminDashboard = isReady && canRoute('/dashboard');
  const to = showAdminDashboard ? '/dashboard' : homeRoute;
  const active = pathname === to || (!showAdminDashboard && pathname === homeRoute);

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-bold text-white transition-colors',
        active ? 'bg-white/15' : 'hover:bg-white/10',
      )}
    >
      {active && <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-white" aria-hidden />}
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-white/20 text-white' : 'bg-white/10 text-white group-hover:bg-white/18',
        )}
      >
        <LayoutDashboard className="size-[18px]" strokeWidth={ICON_STROKE} />
      </span>
      <span>{t('nav.dashboard')}</span>
    </Link>
  );
}

function LeafLink({
  item,
  activePath,
  onNavigate,
  label,
  nested,
}: {
  item: NavItem;
  activePath: string;
  onNavigate?: () => void;
  label: string;
  nested?: boolean;
}) {
  const active = item.to === activePath;
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors',
        active ? 'bg-white/15 font-bold text-white' : 'font-medium text-white/70 hover:bg-white/8 hover:text-white',
      )}
    >
      {active && (
        <span
          className={cn(
            'absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-white',
            nested && 'shadow-[0_0_8px_rgba(255,255,255,0.65)]',
          )}
          aria-hidden
        />
      )}
      <span
        className={cn(
          'size-1.5 shrink-0 rounded-full transition-all',
          active
            ? cn('bg-white', nested && 'shadow-[0_0_6px_rgba(255,255,255,0.85)]')
            : cn(
                'bg-white/40 group-hover:bg-white/70',
                nested && 'group-hover:shadow-[0_0_5px_rgba(255,255,255,0.35)]',
              ),
        )}
      />
      <span className="min-w-0 flex-1">{label}</span>
    </Link>
  );
}

/** Collapsible sub-group inside a drilled-in section. One open at a time (managed by the parent). */
function SubGroup({
  group,
  open,
  onToggle,
  activePath,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  activePath: string;
  onNavigate?: () => void;
}) {
  const { t } = useLocale();
  const Icon = group.icon;
  const hasActive = group.items.some((i) => i.to === activePath);
  const label = t(navGroupKey(group.id));

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-bold transition-colors',
          open || hasActive ? 'text-white' : 'text-white/75 hover:text-white',
        )}
      >
        {Icon ? (
          <span
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md transition-colors',
              hasActive ? 'bg-white/18 text-white' : 'bg-white/8 text-white/80 group-hover:bg-white/14',
            )}
          >
            <Icon className="size-[15px]" strokeWidth={ICON_STROKE} />
          </span>
        ) : (
          <span className="size-1.5 shrink-0 rounded-full bg-white/50" aria-hidden />
        )}
        <span className="min-w-0 flex-1 text-start">{label}</span>
        {hasActive && !open && <span className="size-1.5 shrink-0 rounded-full bg-white/80" aria-hidden />}
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-white/50 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          open ? 'mt-0.5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              'sidebar-sub-rail me-2 ms-4 space-y-0.5 border-s border-white/10 ps-2 transition-[border-color] duration-300',
              open && 'sidebar-sub-rail-glow border-white/25',
            )}
          >
            {group.items.map((item) => (
              <LeafLink
                key={item.to}
                item={item}
                activePath={activePath}
                onNavigate={onNavigate}
                label={translateNavRoute(t, item.to)}
                nested
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A row in the root list — opens its section in the drilled-in panel. */
function SectionRow({
  section,
  active,
  onOpen,
}: {
  section: NavSection;
  active: boolean;
  onOpen: () => void;
}) {
  const { t, isRtl } = useLocale();
  const Icon = section.icon;
  const Forward = isRtl ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-bold text-white transition-colors',
        active ? 'bg-white/10' : 'hover:bg-white/10',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-white/20 text-white' : 'bg-white/10 text-white group-hover:bg-white/18',
        )}
      >
        <Icon className="size-[18px]" strokeWidth={ICON_STROKE} />
      </span>
      <span className="min-w-0 flex-1 text-start">{t(navSectionKey(section.id))}</span>
      {active && <span className="size-1.5 shrink-0 rounded-full bg-white/80" aria-hidden />}
      <Forward className="size-4 shrink-0 text-white/45 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white/80 rtl:group-hover:-translate-x-0.5" />
    </button>
  );
}

/** The drilled-in view: only the chosen section, its overview hub link, and accordion sub-groups. */
function SectionDetail({
  section,
  activePath,
  currentGroup,
  onBack,
  onNavigate,
}: {
  section: NavSection;
  activePath: string;
  currentGroup: string | null;
  onBack: () => void;
  onNavigate?: () => void;
}) {
  const { t, isRtl } = useLocale();
  const { pathname } = useLocation();
  const Back = isRtl ? ChevronRight : ChevronLeft;
  const Icon = section.icon;
  const hubPath = navSectionLandingPath(section.id);
  const onHub = pathname === hubPath;

  // Only one sub-group is open at a time; opening one folds the others.
  const [openGroup, setOpenGroup] = useState<string | null>(currentGroup);
  useEffect(() => {
    if (currentGroup) setOpenGroup(currentGroup);
  }, [currentGroup]);
  const toggleGroup = (id: string) => setOpenGroup((cur) => (cur === id ? null : id));

  const directItems = section.items ?? [];
  const groups = section.groups ?? [];

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="group mb-5 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-start transition-colors hover:bg-white/8"
      >
        <Back className="size-4 shrink-0 text-white/55 transition-transform group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5" />
        <LayoutGrid className="size-4 shrink-0 text-white/55" strokeWidth={ICON_STROKE} />
        <span className="text-[16px] font-bold leading-snug text-white">{t('nav.allDepartments')}</span>
      </button>

      <Link
        to={hubPath}
        onClick={onNavigate}
        className={cn(
          'group relative mb-4 flex items-center gap-3 overflow-hidden rounded-xl px-3 py-3 text-white transition-colors',
          onHub ? 'bg-white/15' : 'bg-white/[0.07] hover:bg-white/12',
        )}
      >
        {onHub && <span className="absolute inset-y-2.5 start-0 w-[3px] rounded-full bg-white" aria-hidden />}
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/18 text-white">
          <Icon className="size-[19px]" strokeWidth={ICON_STROKE} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold leading-tight">{t(navSectionKey(section.id))}</span>
        <LayoutDashboard className="size-4 shrink-0 text-white/45" strokeWidth={ICON_STROKE} />
      </Link>

      <div className="space-y-0.5">
        {directItems.map((item) => (
          <LeafLink
            key={item.to}
            item={item}
            activePath={activePath}
            onNavigate={onNavigate}
            label={translateNavRoute(t, item.to)}
          />
        ))}
        {groups.map((group) => (
          <SubGroup
            key={group.id}
            group={group}
            open={openGroup === group.id}
            onToggle={() => toggleGroup(group.id)}
            activePath={activePath}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t, isRtl } = useLocale();
  const { canNavRoute, isReady } = usePermission();
  const activePath = activeNavPath(pathname);
  const currentSection = activeSectionId(pathname);
  const currentGroup = activeGroupId(pathname);
  // Strict filter: a nav item shows only when its route maps to a catalog resource the user can view.
  // Unmapped/uncatalogued routes are hidden (never leak into the menu).
  const sections = isReady ? filterNavSections(NAV_SECTIONS, canNavRoute) : NAV_SECTIONS;

  // Which section is drilled into. Mirrors the active route, but can be collapsed back to the root list.
  const [drilled, setDrilled] = useState<string | null>(currentSection);
  useEffect(() => {
    setDrilled(currentSection);
  }, [currentSection]);

  const detailSection = drilled ? sections.find((s) => s.id === drilled) ?? null : null;

  const openSection = (section: NavSection) => {
    setDrilled(section.id);
    navigate(navSectionLandingPath(section.id));
  };

  // Entry slide: the detail panel pushes in from the inline-end; the root slides back from the inline-start.
  const panelFrom = (mode: 'root' | 'detail') =>
    mode === 'detail' ? (isRtl ? '-14px' : '14px') : isRtl ? '14px' : '-14px';

  return (
    <aside className="sidebar-shell flex h-full w-[288px] shrink-0 flex-col">
      <SidebarHeader />

      <nav className="relative flex-1 overflow-hidden">
        {detailSection ? (
          <div
            key={`detail-${detailSection.id}`}
            className="sidebar-panel sidebar-scroll absolute inset-0 space-y-1 overflow-y-auto px-3 py-4"
            style={{ '--panel-from': panelFrom('detail') } as CSSProperties}
          >
            <SectionDetail
              section={detailSection}
              activePath={activePath}
              currentGroup={currentGroup}
              onBack={() => setDrilled(null)}
              onNavigate={onNavigate}
            />
          </div>
        ) : (
          <div
            key="root"
            className="sidebar-panel sidebar-scroll absolute inset-0 space-y-1.5 overflow-y-auto px-3 py-4"
            style={{ '--panel-from': panelFrom('root') } as CSSProperties}
          >
            <HomeNavLink onNavigate={onNavigate} />

            <p className="px-3 pb-1 pt-3 text-[10px] font-bold tracking-[0.2em] text-white/40">{t('nav.departments')}</p>

            {sections.map((section) => (
              <SectionRow
                key={section.id}
                section={section}
                active={currentSection === section.id}
                onOpen={() => openSection(section)}
              />
            ))}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="text-center text-[10px] font-bold tracking-wide text-white/40">{t('nav.footer')}</p>
      </div>
    </aside>
  );
}
