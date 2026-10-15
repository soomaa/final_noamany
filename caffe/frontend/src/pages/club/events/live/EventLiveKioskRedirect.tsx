import { Navigate, useParams } from 'react-router-dom';

/** الكشك مدمج في محطة التسجيل — إعادة توجيه للمسار الصحيح */
export function EventLiveKioskRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/club/events/${id}/live/checkin`} replace />;
}
