export const bodyFields = [
  {
    key: "height",
    ar: "الطول",
    en: "Height",
    unit: "cm",
    min: 80,
    max: 250,
    hintAr: "بدون حذاء",
    hintEn: "Without shoes",
  },
  {
    key: "weight",
    ar: "الوزن",
    en: "Weight",
    unit: "kg",
    min: 20,
    max: 400,
    hintAr: "نفس الميزان ووقت القياس",
    hintEn: "Same scale and time of day",
  },
  {
    key: "chest",
    ar: "محيط الصدر",
    en: "Chest",
    unit: "cm",
    min: 30,
    max: 250,
    hintAr: "الشريط أفقي في نفس موضع الصدر",
    hintEn: "Tape level at the same chest landmark",
  },
  {
    key: "waist",
    ar: "محيط الوسط",
    en: "Waist",
    unit: "cm",
    min: 20,
    max: 250,
    hintAr: "نفس موضع الشريط، دون شفط البطن",
    hintEn: "Same tape landmark, without drawing in your abdomen",
  },
  {
    key: "hips",
    ar: "محيط الأرداف",
    en: "Hips",
    unit: "cm",
    min: 30,
    max: 250,
    hintAr: "أوسع محيط، والشريط أفقي",
    hintEn: "Widest circumference, tape level",
  },
  {
    key: "arm",
    ar: "محيط الذراع",
    en: "Upper arm",
    unit: "cm",
    min: 10,
    max: 100,
    hintAr: "نفس الذراع والموضع، والذراع مرتخية",
    hintEn: "Same arm and landmark, arm relaxed",
  },
  {
    key: "thigh",
    ar: "محيط الفخذ",
    en: "Thigh",
    unit: "cm",
    min: 15,
    max: 150,
    hintAr: "نفس الفخذ وموضع الشريط",
    hintEn: "Same thigh and tape landmark",
  },
  {
    key: "calf",
    ar: "محيط السمانة",
    en: "Calf",
    unit: "cm",
    min: 10,
    max: 100,
    hintAr: "نفس الساق عند أوسع محيط",
    hintEn: "Same lower leg at its widest circumference",
  },
] as const;
export type BodyKey = (typeof bodyFields)[number]["key"];
export type BodyMeasurements = Partial<Record<BodyKey, number>>;
export interface BodyCheckin {
  id: string;
  date: string;
  measurements: BodyMeasurements;
  note: string;
}
export interface BodyTarget {
  revision: number;
  measurements: BodyMeasurements;
  target_date: string | null;
  note: string;
}
export interface BodyJourney {
  checkins: BodyCheckin[];
  baseline: BodyCheckin | null;
  target: BodyTarget | null;
}
export const shapeKeys = [
  "height",
  "chest",
  "waist",
  "hips",
  "arm",
  "thigh",
  "calf",
] as const;
export const hasBodyShape = (v: BodyMeasurements) =>
  shapeKeys.every(
    (k) => typeof v[k] === "number" && Number.isFinite(v[k]) && v[k]! > 0,
  );
export function normalizeBodyNumber(value: string) {
  return value
    .trim()
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replace(/[٫,]/g, ".");
}
