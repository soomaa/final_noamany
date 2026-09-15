import { Card } from '@/components/ui/card';
import type { EventSettings } from './useEventSettings';
import { useLocale } from '@/store/locale';

interface Props {
  settings: EventSettings;
  onEventReset?: (name: string) => void;
  hideList?: boolean;
}

/** Archive feature not ported to club events backend yet — placeholder keeps settings page compiling. */
export const EventArchiveCard = ({ settings }: Props) => {
  const { ui } = useLocale();
  return (
    <Card className="p-6 text-sm text-muted-foreground">
      {ui('أرشفة الفعاليات غير مفعّلة بعد في نظام النادي. اسم الفعالية الحالي:')} <strong>{settings.event_name}</strong>
    </Card>
  );
};
