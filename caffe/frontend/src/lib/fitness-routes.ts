/** Training & fitness module routes — mirrors SwatGym sidebar under `/club/fitness`. */
export const FITNESS_ROUTES = {
  programs: '/club/fitness/programs',
  templates: '/club/fitness/templates',
  strength: '/club/fitness/strength',
  progress: '/club/fitness/progress',
  inbody: '/club/fitness/inbody',
  assessments: '/club/fitness/assessments',
  scheduling: {
    schedule: '/club/fitness/scheduling',
    classes: '/club/fitness/classes',
    classBooking: '/club/fitness/class-booking',
    roomBookings: '/club/fitness/room-bookings',
    personalSessions: '/club/fitness/personal-sessions',
  },
  trainers: {
    list: '/club/fitness/trainers',
    payments: '/club/fitness/trainer-payments',
    search: '/club/fitness/trainer-search',
    ratings: '/club/fitness/trainer-ratings',
    settings: '/club/fitness/trainer-settings',
  },
  facilities: {
    list: '/club/fitness/facilities',
    equipment: '/club/fitness/equipment',
    maintenance: '/club/fitness/equipment-maintenance',
    spaServices: '/club/fitness/spa-services',
    spaBookings: '/club/fitness/spa-bookings',
    spaInvoices: '/club/fitness/spa-invoices',
    inbodyInvoices: '/club/fitness/inbody-invoices',
    settings: '/club/fitness/facility-settings',
  },
} as const;
