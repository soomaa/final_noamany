import { Navigate } from 'react-router-dom';

/** Kept for old bookmarks/navigation; special-class attendance is recorded from reception. */
export function FitnessClassBookingPage() {
  return <Navigate to="/club/fitness/scheduling" replace />;
}
