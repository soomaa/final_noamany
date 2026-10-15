import { EventLiveProvider } from './event-live-context';
import EventLiveDisplayPage from './EventLiveDisplay';
import EventLiveCheckInPage from './EventLiveCheckIn';
import EventLiveGuestPage from './EventLiveGuest';
import EventLiveKioskPage from './EventLiveKiosk';
import EventLiveProgramPage from './EventLiveProgram';
import EventLiveSettingsPage from './EventLiveSettings';

function wrap(Page: () => JSX.Element) {
  return function Wrapped() {
    return (
      <EventLiveProvider>
        <Page />
      </EventLiveProvider>
    );
  };
}

export const EventLiveDisplay = wrap(EventLiveDisplayPage);
export const EventLiveCheckIn = wrap(EventLiveCheckInPage);
export const EventLiveGuest = wrap(EventLiveGuestPage);
export const EventLiveKiosk = wrap(EventLiveKioskPage);
export const EventLiveProgram = wrap(EventLiveProgramPage);
export const EventLiveSettings = wrap(EventLiveSettingsPage);
