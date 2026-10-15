import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClubT } from '@/hooks/use-club-t';
import { useLocale } from '@/store/locale';

interface OutstandingReportFiltersProps {
  branches: { value: string; label: string }[];
}

export function OutstandingReportFilters({ branches }: OutstandingReportFiltersProps) {
  const ct = useClubT();
  const { locale } = useLocale();
  const id = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const branch = searchParams.get('branch') ?? '';
  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => setSearchInput(search), [search]);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        const value = searchInput.trim();
        if (value) next.set('search', value);
        else next.delete('search');
        next.set('page', '1');
        return next;
      }, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, setSearchParams]);

  const changeBranch = (value: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === 'all') next.delete('branch');
      else next.set('branch', value);
      next.set('page', '1');
      return next;
    }, { replace: true });
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('search');
      next.delete('branch');
      next.set('page', '1');
      return next;
    }, { replace: true });
  };

  return (
    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor={`${id}-search`}>{ct('common.search')}</Label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${id}-search`}
            type="search"
            className="min-h-11 ps-9"
            placeholder={ct('subscriptions.outstandingSearchPlaceholder')}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
      </div>
      {branches.length > 0 && (
        <div className="w-full space-y-1.5 sm:w-56">
          <Label htmlFor={`${id}-branch`}>{ct('common.branch')}</Label>
          <Select dir={locale === 'ar' ? 'rtl' : 'ltr'} value={branch || 'all'} onValueChange={changeBranch}>
            <SelectTrigger id={`${id}-branch`} className="min-h-11" aria-label={ct('common.branch')}>
              <SelectValue placeholder={ct('subscriptions.outstandingAllBranches')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="min-h-11">{ct('subscriptions.outstandingAllBranches')}</SelectItem>
              {branches.map((option) => (
                <SelectItem key={option.value} value={option.value} className="min-h-11">{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {(searchInput || search || branch) && (
        <Button type="button" permissionAction={null} variant="ghost" className="min-h-11" onClick={clearFilters}>
          {ct('subscriptions.outstandingClearFilters')}
        </Button>
      )}
    </div>
  );
}
