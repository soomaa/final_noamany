import type { TemplateField } from './wa-campaigns.utils';

/** The templates the WhatsApp page starts with, as fields (one line each, several wordings). */
export const BIRTHDAY_FIELDS: TemplateField[] = [
  { label: 'التحية', options: ['كل سنة وانت طيب يا {first_name} 🎂🎉', 'كل سنة وانت بخير يا {first_name} 🎉', 'سنة حلوة عليك يا {first_name} 🎈', 'عيد ميلاد سعيد يا {first_name} 🎂'] },
  { label: 'التهنئة', options: ['كل فريق {branch} بيتمنالك سنة جديدة مليانة صحة وفرحة 💪', 'أسرة {branch} بتبعتلك أحلى أمنيات بسنة كلها إنجازات ✨', 'نتمنالك سنة كلها صحة وسعادة ونجاح 💪✨'] },
  { label: 'الهدية', options: ['وعلشان نحتفل بيك، ليك أسبوع فري هدية مننا 🎁', 'احتفالًا بعيد ميلادك ليك أسبوع فري في الجيم 🎁💪', 'وهديتنا ليك: أسبوع فري معانا في {branch} 🎁'] },
  { label: 'الختام', options: ['عدّي على الريسبشن وفعّل أسبوعك ❤️', 'مستنيينك في الريسبشن علشان نفعّلهولك ✨', 'بس كلّم الريسبشن وهنفعّلهولك على طول 🙌'] },
];

export const EXPIRING_TODAY_FIELDS: TemplateField[] = [
  { label: 'التحية', options: ['أهلًا يا {first_name} 👋', 'إزيك يا {first_name}؟ 😊', 'مساء الخير يا {first_name} 👋'] },
  { label: 'التنبيه', options: ['حابين نفكرك إن اشتراك {package} بينتهي النهاردة ⏰', 'اشتراكك ({package}) في {branch} آخر يوم فيه النهاردة ⏰', 'بنفكرك إن اشتراكك بينتهي النهاردة {end_date} 📅'] },
  { label: 'الدعوة', options: ['جدّد دلوقتي علشان تفضل مكمّل من غير ما توقف 💪', 'ماتوقفش تمرينك، جدّد واستمر معانا 🔥', 'خلّينا نكمّل المشوار سوا 💪'] },
  { label: 'الختام', options: ['رد بـ «1» وهنجهزلك التجديد ✅', 'ابعتلنا «1» ونظبطلك كل حاجة ✅', 'أو عدّي على الريسبشن في {branch} 🙌'] },
];

export const EXPIRED_FIELDS: TemplateField[] = [
  { label: 'التحية', options: ['{first_name} وحشتنا في {branch} 🙌', 'أهلًا يا {first_name}، افتقدناك 👋', 'إزيك يا {first_name}؟ بقالنا فترة ماشفناكش 😊'] },
  { label: 'الرسالة', options: ['اشتراك {package} خلص يوم {end_date}', 'اشتراكك انتهى من {days} يوم', 'اشتراكك في {branch} خلص يوم {end_date}'] },
  { label: 'الدعوة', options: ['تحب ترجع تتمرن معانا؟ 💪', 'مستنيينك ترجع أقوى من الأول 🔥', 'مكانك لسه محجوز في الجيم 💪'] },
  { label: 'الختام', options: ['رد بـ «1» وهنكلمك نظبطلك التجديد ✅', 'ابعت «1» ونجهزلك كل حاجة ✅'] },
];

/** Sent by hand from the attendance list to a member who came back after a long absence. */
export const ABSENCE_FIELDS: TemplateField[] = [
  { label: 'التحية', options: ['منوّر يا {first_name} 💪', 'أهلًا بيك تاني يا {first_name} 👋', 'نوّرت {branch} يا {first_name} 🙌'] },
  { label: 'الحضور', options: ['جامد إنك حضرت النهاردة 🔥', 'فرحنا إنك رجعت تتمرن النهاردة 💪', 'حلو أوي إنك جيت النهاردة 👏'] },
  { label: 'الغياب', options: ['بس بقالك {days} يوم ماجيتش', 'بس بنفكرك إنك غبت عننا {days} يوم 😅', 'آخر حضور ليك كان من {days} يوم'] },
  { label: 'الختام', options: ['طمّنا عليك، كله تمام؟ ❤️', 'لو في حاجة نقدر نساعدك فيها قولنا 🙏', 'مستنيينك بانتظام علشان نوصل لهدفك سوا 💪'] },
];

/**
 * Sent by hand from the member commitment report («التزام الأعضاء») to a member who attends
 * little of the subscription they paid for.
 */
export const COMMITMENT_FIELDS: TemplateField[] = [
  { label: 'التحية', options: ['أهلًا يا {first_name} 👋', 'إزيك يا {first_name}؟ 😊', '{first_name} وحشتنا في {branch} 🙌'] },
  { label: 'الحضور', options: ['من أول اشتراك {package} حضرت {visits} يوم من {period_days} يوم ({rate})', 'لاحظنا إن حضورك في اشتراك {package} {rate} بس ({visits} من {period_days} يوم)', 'بقالك {days} يوم ماجيتش، وحضورك في الاشتراك ده {visits} يوم بس'] },
  { label: 'الدعوة', options: ['اشتراكك لسه شغال لحد {end_date}، استغله وخلّينا نوصل لهدفك سوا 💪', 'عايزينك تستفيد من كل يوم في اشتراكك لحد {end_date} 🔥', 'لو في حاجة مضايقاك أو محتاج برنامج يناسب وقتك قولنا 🙏'] },
  { label: 'الختام', options: ['مستنيينك في {branch} ❤️', 'طمّنا عليك، كله تمام؟ ❤️', 'نشوفك قريب في الجيم 💪'] },
];

/** The «الغياب» line before 25 Nov showed the date too; a template still on it is moved to days only. */
export const ABSENCE_LINE_WITH_DATE = ['بس بقالك {days} يوم ماجيتش، آخر مرة كانت {last_visit}', 'بس بنفكرك إنك غبت عننا {days} يوم 😅', 'آخر حضور ليك كان من {days} يوم ({last_visit})'];

/** Created once each (in this order); a default staff later delete is not recreated. */
export const DEFAULT_TEMPLATES: { key: string; name: string; fields: TemplateField[] }[] = [
  { key: 'expiring_today', name: 'اشتراكك بينتهي النهاردة ⏰', fields: EXPIRING_TODAY_FIELDS },
  { key: 'expired', name: 'اشتراكك منتهي من فترة', fields: EXPIRED_FIELDS },
  { key: 'absence', name: 'لم يحضر منذ مدة', fields: ABSENCE_FIELDS },
  { key: 'commitment', name: 'عدم الالتزام بالحضور', fields: COMMITMENT_FIELDS },
];
