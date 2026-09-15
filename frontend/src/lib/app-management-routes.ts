/** App management module routes — mirrors SwatGym sidebar under `/app`. */
export const APP_MANAGEMENT_ROUTES = {
  about: '/app/about',
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
  community: '/app/community',
  ads: '/app/ads',
} as const;
