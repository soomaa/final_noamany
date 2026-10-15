import { uploadUrl } from '@/components/employees/use-uploads';
export function catalogImageUrl(value?:string|null) { return uploadUrl(value) ?? (value?.startsWith('https://') ? value : null); }
