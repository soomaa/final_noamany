/** ONE80 member-app management routes under `/app`. */
export const APP_MANAGEMENT_ROUTES = {
  about: '/app/about',
  paymentMethods: '/app/payment-methods',
  branches: '/app/branches',
  invitations: {
    sent: '/app/invitations/sent',
    accepted: '/app/invitations/accepted',
    attended: '/app/invitations/attended',
    rejected: '/app/invitations/rejected',
  },
  offers: '/app/offers',
  trainers: '/app/trainers',
  exerciseCategories: '/app/exercise-categories',
  exercises: '/app/exercises',
  news: '/app/news',
  ads: '/app/ads',
  notifications: '/app/notifications',
} as const;
