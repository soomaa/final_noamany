import { LogOut, Dumbbell, CalendarDays, Languages } from "lucide-react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { BrandLogo } from "@/components/brand/logo";
import { TrainingPortalContext } from "@/pages/club/fitness/training/access";
import { TrainingJourneyPage } from "@/pages/club/fitness/training/journey";
import { TrainerPortalWorkspace } from "@/components/trainer/trainer-portal-workspace";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth";
import { useLocale } from "@/store/locale";

export function TrainerPortalPage() {
  const { user, logout } = useAuth();
  const { ui, locale, dir, toggleLocale } = useLocale();
  const training = useLocation().pathname === "/trainer/training";
  const tr = (a: string, e: string) => (locale === "ar" ? a : e);
  const navigate = useNavigate();

  if (!user?.is_trainer) return <Navigate to="/" replace />;

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/30" dir={dir}>
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <BrandLogo size="sm" />
          <div className="min-w-0 flex-1">
            <p className="hidden font-bold sm:block">{ui("بوابة المدرب")}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user.name}
            </p>
          </div>
          <Button
            permissionAction={null}
            variant="ghost"
            size="icon"
            className="ms-auto min-h-11 min-w-11 shrink-0"
            aria-label={tr("Switch to English", "التحويل للعربية")}
            onClick={toggleLocale}
          >
            <Languages className="size-4" />
          </Button>
          <Button
            permissionAction={null}
            variant="outline"
            className="min-h-11 min-w-11 shrink-0 px-3"
            aria-label={ui("تسجيل الخروج")}
            onClick={() => void signOut()}
          >
            <LogOut className="size-4" /> <span className="hidden sm:inline">{ui("تسجيل الخروج")}</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <nav
          aria-label={tr("بوابة المدرب", "Trainer portal")}
          className="mx-auto mb-6 flex w-fit max-w-full flex-wrap justify-center gap-1 rounded-xl bg-muted p-1.5"
        >
          {[
            [
              "/trainer",
              tr("الجدول والمتابعة", "Schedule & attendance"),
              CalendarDays,
            ],
            [
              "/trainer/training",
              tr("إدارة التمارين", "Exercise management"),
              Dumbbell,
            ],

          ].map(([to, label, Icon]) => {
            const I = Icon as typeof Dumbbell;
            return (
              <NavLink
                end
                key={String(to)}
                to={String(to)}
                className={({ isActive }) =>
                  `flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`
                }
              >
                <I className="size-4" />
                {String(label)}
              </NavLink>
            );
          })}
        </nav>
        {training ? (
          <TrainingPortalContext.Provider value={true}>
            <TrainingJourneyPage />
          </TrainingPortalContext.Provider>
        ) : (
          <TrainerPortalWorkspace />
        )}
      </main>
    </div>
  );
}
