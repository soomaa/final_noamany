import {
  Bell,
  CalendarDays,
  Clock3,
  CornerDownLeft,
  LogOut,
  Menu,
  ScanBarcode,
  Search,
  User,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PreferenceToggles } from "@/components/layout/preference-toggles";
import { usePersistentScanner } from "@/components/club/persistent-scanner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useNotificationCount,
  useNotifications,
} from "@/hooks/use-notifications";
import { useMenu } from "@/hooks/use-menu";
import { findOwningDepartment } from "@/lib/menu-nav";
import { formatTime } from "@/lib/formatters";
import { resolveRoute } from "@/lib/routes";
import { formatDigits, initials } from "@/lib/utils";
import { userAvatarUrl } from "@/components/employees/use-uploads";
import { useAuth } from "@/store/auth";
import { useLocale } from "@/store/locale";

function getGreetingKey(hour: number) {
  if (hour < 12) return "greeting.morning";
  if (hour < 17) return "greeting.afternoon";
  return "greeting.night";
}

function DateTimePill() {
  const { locale } = useLocale();
  const dateFnsLocale = locale === "ar" ? ar : enUS;
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  let h = now.getHours();
  const period =
    h >= 12 ? (locale === "ar" ? "م" : "PM") : locale === "ar" ? "ص" : "AM";
  h = h % 12 || 12;
  const m = now.getMinutes().toString().padStart(2, "0");
  const s = now.getSeconds().toString().padStart(2, "0");
  const dateLabel = formatDigits(
    format(now, locale === "ar" ? "EEEE d MMM" : "EEE, MMM d", {
      locale: dateFnsLocale,
    }),
    locale,
  );

  return (
    <div className="hidden h-14 items-stretch overflow-hidden rounded-2xl border border-brand-200/80 bg-card shadow-[0_10px_28px_-18px_rgba(237,28,36,.35)] ring-1 ring-brand-100/70 dark:border-brand-500/20 dark:ring-brand-500/10 lg:flex">
      <div className="hidden items-center gap-2.5 border-e border-brand-200/70 bg-gradient-to-br from-brand-50/95 to-card px-4 text-muted-foreground dark:border-brand-500/15 dark:from-brand-500/10 dark:to-transparent 2xl:flex">
        <span className="flex size-8 items-center justify-center rounded-xl bg-brand-100 text-brand-700 ring-1 ring-brand-200/80 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-400/25">
          <CalendarDays className="size-4 shrink-0" />
        </span>
        <span className="max-w-[10rem] truncate text-xs font-bold text-foreground/80">
          {dateLabel}
        </span>
      </div>
      <div className="relative flex min-w-[11.5rem] items-center gap-3 overflow-hidden bg-gradient-to-br from-[#351012] via-[#1D0B0C] to-[#2A1012] px-4 text-white">
        <div className="pointer-events-none absolute -end-6 -top-8 size-24 rounded-full bg-brand-500/25 blur-2xl" />
        <div className="pointer-events-none absolute -start-4 bottom-0 size-16 rounded-full bg-brand-400/15 blur-xl" />
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300 ring-1 ring-brand-400/30">
          <Clock3 className="size-4" />
        </span>
        <div className="relative min-w-0">
          <span className="nums block whitespace-nowrap text-lg font-black leading-none tabular-nums tracking-wider text-white">
            {formatDigits(`${h}:${m}:${s}`, locale)}
            <span className="ms-1.5 text-sm font-black text-brand-300">
              {period}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

interface SearchItem {
  id: string;
  title: string;
  path: string;
  breadcrumb: string;
  searchable: string;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const { locale, t, ui } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: menu } = useMenu();
  const { data: count = 0 } = useNotificationCount();
  const { data: notifications } = useNotifications();
  const scanner = usePersistentScanner();
  const unreadPreview = notifications?.filter((n) => !n.read).slice(0, 5) ?? [];
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const greeting = useMemo(() => t(getGreetingKey(new Date().getHours())), [t]);
  const activeUnit = useMemo(
    () =>
      menu
        ? findOwningDepartment(menu, location.pathname, location.search)
        : null,
    [menu, location.pathname, location.search],
  );
  const roleLabel =
    user?.job_title?.trim() ||
    (user?.level != null ? t(`levels.${user.level}`) : "");
  const avatarSrc = userAvatarUrl(user?.image);
  const hasEmployeeSelfService = user?.emp_code != null && user.level !== 1;

  const searchItems = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];
    const seen = new Set<string>();
    const add = (title: string, path: string, parents: string[] = []) => {
      if (!path || path === "#" || seen.has(path)) return;
      seen.add(path);
      const routeTranslation =
        locale === "en" ? t(`nav.routes.${path.split("?")[0]}`) : title;
      const translatedTitle = routeTranslation.startsWith("nav.routes.")
        ? ui(title)
        : routeTranslation;
      const displayTitle = translatedTitle || title;
      const breadcrumb = parents.map((label) => ui(label)).join(" / ");
      items.push({
        id: path,
        title: displayTitle,
        path,
        breadcrumb,
        searchable: normalizeSearch(
          [
            title,
            ui(title),
            displayTitle,
            breadcrumb,
            path.replace(/[/?=&_-]/g, " "),
          ].join(" "),
        ),
      });
    };
    const walk = (nodes: NonNullable<typeof menu>, parents: string[] = []) => {
      nodes.forEach((node) => {
        const path = resolveRoute(node.link);
        if (path !== "#") add(node.title, path, parents);
        if (node.children.length) walk(node.children, [...parents, node.title]);
      });
    };
    if (menu) walk(menu);
    add(t("nav.dashboard"), "/dashboard");
    add(t("common.profile"), "/profile");
    add(t("common.notifications"), "/notifications");
    return items;
  }, [locale, menu, t, ui]);

  const searchResults = useMemo(() => {
    const query = normalizeSearch(search);
    if (!query) return searchItems.slice(0, 8);
    const terms = query.split(" ");
    return searchItems
      .filter((item) => terms.every((term) => item.searchable.includes(term)))
      .map((item) => {
        const title = normalizeSearch(item.title);
        const score =
          title === query
            ? 0
            : title.startsWith(query)
              ? 1
              : title.includes(query)
                ? 2
                : 3;
        return { item, score };
      })
      .sort(
        (a, b) =>
          a.score - b.score || a.item.title.localeCompare(b.item.title, locale),
      )
      .slice(0, 10)
      .map(({ item }) => item);
  }, [locale, search, searchItems]);

  const goToSearchResult = (item: SearchItem) => {
    navigate(item.path);
    setSearch("");
    setSearchOpen(false);
  };

  useEffect(() => setActiveResult(0), [search]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!searchRootRef.current?.contains(event.target as Node))
        setSearchOpen(false);
    };
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onShortcut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onShortcut);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-30 overflow-hidden border-b border-border/60 bg-card/90 shadow-sm backdrop-blur-xl dark:border-[rgba(255,255,255,.06)] dark:bg-[rgba(16,13,14,.82)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-l from-primary/[0.04] via-transparent to-brand-400/[0.03] dark:from-primary/[0.1] dark:to-brand-400/[0.06]" />
      <div className="pointer-events-none absolute -start-20 top-0 size-40 rounded-full bg-primary/5 blur-3xl" />
      <div className="h-1 bg-brand-gradient" aria-hidden />

      <div className="relative flex h-[5.5rem] items-center gap-3 px-4 md:gap-4 md:px-6 xl:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 lg:hidden"
          onClick={onMenuClick}
          aria-label={t("common.menu")}
        >
          <Menu />
        </Button>

        <div className="hidden min-w-0 max-w-[260px] flex-col justify-center xl:flex">
          <p className="truncate text-base font-bold leading-tight text-foreground dark:text-white">
            {greeting},{" "}
            <span className="text-primary">
              {user?.name ?? t("common.user")}
            </span>
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-xs font-black tracking-[0.14em] text-primary/75">
              Noamany
            </span>
            {activeUnit && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate text-[11px] text-muted-foreground dark:text-white/75">
                  {activeUnit.title}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          ref={searchRootRef}
          className="relative hidden min-w-0 flex-1 md:block md:max-w-xl xl:max-w-3xl 2xl:max-w-4xl"
        >
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-r from-primary/10 via-transparent to-brand-400/10 opacity-60" />
          <Search className="pointer-events-none absolute end-3 top-1/2 z-10 size-4 -translate-y-1/2 text-primary/60" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveResult((value) =>
                  Math.min(value + 1, searchResults.length - 1),
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveResult((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter" && searchResults[activeResult]) {
                event.preventDefault();
                goToSearchResult(searchResults[activeResult]);
              } else if (event.key === "Escape") {
                setSearchOpen(false);
                event.currentTarget.blur();
              }
            }}
            role="combobox"
            aria-expanded={searchOpen}
            aria-controls="global-search-results"
            aria-autocomplete="list"
            className="relative h-[3.25rem] w-full rounded-2xl border border-primary/15 bg-background/80 pe-11 ps-5 text-[15px] text-foreground shadow-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary/40 focus:bg-background focus:ring-2 focus:ring-primary/15 dark:text-white dark:placeholder:text-white/55"
            placeholder={t("common.searchPlaceholder")}
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                searchInputRef.current?.focus();
              }}
              className="absolute end-9 top-1/2 z-20 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("shared.clear")}
            >
              <X className="size-3.5" />
            </button>
          )}
          {searchOpen && (
            <div
              id="global-search-results"
              role="listbox"
              className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(26rem,70vh)] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
            >
              {searchResults.length ? (
                searchResults.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeResult}
                    onMouseEnter={() => setActiveResult(index)}
                    onClick={() => goToSearchResult(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors ${index === activeResult ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
                  >
                    <Search className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {item.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.breadcrumb || item.path}
                      </span>
                    </span>
                    {index === activeResult && (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                ))
              ) : (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {t("shared.noResults")}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-1.5 md:flex-none md:gap-2">
          <DateTimePill />

          {scanner.available ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              permissionAction={null}
              className="relative size-11 rounded-xl border border-transparent bg-muted/40 hover:border-primary/15 hover:bg-primary/5"
              aria-label={ui(scanner.open ? 'إغلاق السكانر المستمر' : 'فتح السكانر المستمر')}
              aria-pressed={scanner.open}
              title={ui(scanner.open ? 'إغلاق السكانر المستمر' : 'فتح السكانر المستمر')}
              onClick={scanner.toggle}
            >
              <ScanBarcode className="size-[18px] text-primary/80" />
              <span
                className={`absolute end-1.5 top-1.5 size-2 rounded-full ring-2 ring-card ${scanner.open ? 'bg-emerald-500' : 'bg-muted-foreground/35'}`}
                aria-hidden
              />
            </Button>
          ) : null}

          <PreferenceToggles />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative size-11 rounded-xl border border-transparent bg-muted/40 hover:border-primary/15 hover:bg-primary/5"
                aria-label={t("common.notifications")}
              >
                <Bell className="size-[18px] text-primary/80" />
                {count > 0 && (
                  <span className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white ring-2 ring-card">
                    {formatDigits(count > 9 ? "9+" : count, locale)}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>{t("common.notifications")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {unreadPreview.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("common.noNotifications")}
                </div>
              ) : (
                unreadPreview.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="font-medium">{n.title}</span>
                    {n.body && (
                      <span className="text-xs text-muted-foreground line-clamp-2">
                        {n.body}
                      </span>
                    )}
                    {(n.date || n.time) && (
                      <span className="nums text-[10px] text-muted-foreground">
                        {n.date ? formatDigits(n.date, locale) : ""}
                        {n.time ? ` ${formatTime(n.time, locale)}` : ""}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link
                  to="/notifications"
                  className="w-full justify-center text-primary"
                >
                  {t("common.viewAllNotifications")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-0.5 hidden h-9 w-px bg-gradient-to-b from-transparent via-border to-transparent sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex h-14 items-center gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] to-transparent p-1.5 ps-3 transition-all hover:border-primary/30 hover:shadow-md">
                <div className="hidden text-end leading-tight sm:block">
                  <div className="max-w-[160px] truncate text-[15px] font-bold">
                    {user?.name ?? t("common.user")}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {roleLabel}
                  </div>
                </div>
                <Avatar className="size-10 ring-2 ring-primary/25">
                  {avatarSrc && <AvatarImage src={avatarSrc} alt="" />}
                  <AvatarFallback className="bg-brand-gradient text-xs font-bold text-white">
                    {initials(user?.name, locale)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                {user?.name ?? t("common.user")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                <User /> {t("common.profile")}
              </DropdownMenuItem>
              {hasEmployeeSelfService && <>
                <DropdownMenuItem onClick={() => navigate("/me/evaluations")}>تقييماتي</DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/me/permissions")}>أذوناتي</DropdownMenuItem>
              </>}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive focus:text-destructive"
              >
                <LogOut /> {t("common.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
