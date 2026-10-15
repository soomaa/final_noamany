import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const appDir = process.argv[2];
if (!appDir) throw new Error('Usage: node patch-one80-cafe-image-ui.mjs APP_DIR');

const productsPath = join(appDir, 'frontend/src/pages/cafe/products.tsx');
const posPath = join(appDir, 'frontend/src/pages/cafe/pos.tsx');
const validatorPath = join(appDir, 'frontend/src/lib/product-image-input.ts');

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Preflight failed: ${label} was not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Preflight failed: ${label} appeared more than once`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let products = readFileSync(productsPath, 'utf8');
if (!products.includes('id="cafe-product-image-url"')) {
  products = replaceOnce(
    products,
    "import { uploadUrl } from '@/components/employees/use-uploads';\nimport { resolveProductImageUrl } from '@/lib/product-image';",
    "import { DEFAULT_PRODUCT_IMAGE, resolveProductImageUrl } from '@/lib/product-image';\nimport { validateProductImageInput } from '@/lib/product-image-input';",
    'product image imports',
  );
  products = replaceOnce(
    products,
    "  const effectiveProductionBranchId = productionBranchId || String(branches?.[0]?.id ?? '');\n",
    "  const effectiveProductionBranchId = productionBranchId || String(branches?.[0]?.id ?? '');\n  const imageInputValidation = validateProductImageInput(form.imageUrl);\n  const imagePreviewUrl = imageInputValidation.error\n    ? DEFAULT_PRODUCT_IMAGE\n    : resolveProductImageUrl(imageInputValidation.value);\n",
    'image preview state',
  );
  products = replaceOnce(
    products,
    "    if (formTab !== 'review') {\n      goToNextFormTab();\n      return;\n    }\n",
    "    if (formTab !== 'review') {\n      goToNextFormTab();\n      return;\n    }\n    if (imageInputValidation.error) {\n      setFormTab('details');\n      toast.error(ui('أدخل رابط صورة آمن يبدأ بـ https://'));\n      return;\n    }\n",
    'image URL submit validation',
  );
  products = replaceOnce(
    products,
    '      await saveMutation.mutateAsync({ id: editingId ?? undefined, body: form });',
    "      await saveMutation.mutateAsync({\n        id: editingId ?? undefined,\n        body: { ...form, imageUrl: imageInputValidation.value },\n      });",
    'normalized image URL save',
  );
  products = replaceOnce(
    products,
    "                      <img src={uploadUrl(form.imageUrl) ?? resolveProductImageUrl(null)} alt={form.name || ui('صورة المنتج')} className=\"aspect-square w-full rounded-xl border bg-background object-cover\" />",
    "                      <img\n                        src={imagePreviewUrl}\n                        alt={form.name || ui('صورة المنتج')}\n                        className=\"aspect-square w-full rounded-xl border bg-background object-cover\"\n                        onError={(event) => {\n                          event.currentTarget.onerror = null;\n                          event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;\n                        }}\n                      />",
    'product image preview',
  );
  products = replaceOnce(
    products,
    "                      <UploadField category=\"product-image\" value={form.imageUrl} onChange={(path) => setForm((current) => ({ ...current, imageUrl: path ?? '' }))} accept=\"image/*\" label={ui('اختيار صورة المنتج')} />",
    "                      <UploadField category=\"product-image\" value={form.imageUrl} onChange={(path) => setForm((current) => ({ ...current, imageUrl: path ?? '' }))} accept=\"image/*\" label={ui('اختيار صورة المنتج')} />\n                      <div className=\"space-y-1.5 border-t border-border/60 pt-3\">\n                        <Label htmlFor=\"cafe-product-image-url\" className=\"text-xs font-semibold\">\n                          {ui('أو الصق رابط الصورة')}\n                        </Label>\n                        <Input\n                          id=\"cafe-product-image-url\"\n                          dir=\"ltr\"\n                          inputMode=\"url\"\n                          autoComplete=\"url\"\n                          value={form.imageUrl}\n                          aria-invalid={imageInputValidation.error === 'invalid'}\n                          aria-describedby=\"cafe-product-image-url-help\"\n                          className={imageInputValidation.error ? 'border-destructive focus-visible:ring-destructive' : ''}\n                          placeholder=\"https://example.com/product.jpg\"\n                          onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))}\n                          onBlur={() => {\n                            if (!imageInputValidation.error && imageInputValidation.value !== form.imageUrl) {\n                              setForm((current) => ({ ...current, imageUrl: imageInputValidation.value }));\n                            }\n                          }}\n                        />\n                        <p\n                          id=\"cafe-product-image-url-help\"\n                          className={`text-xs ${imageInputValidation.error ? 'text-destructive' : 'text-muted-foreground'}`}\n                        >\n                          {imageInputValidation.error\n                            ? ui('الرابط غير صالح. استخدم رابطًا يبدأ بـ https://')\n                            : ui('يمكنك لصق رابط مباشر للصورة بدل رفع ملف.')}\n                        </p>\n                      </div>",
    'image URL field',
  );
  products = replaceOnce(
    products,
    '                        <img src={uploadUrl(form.imageUrl) ?? resolveProductImageUrl(null)} alt="" className="size-24 rounded-2xl border bg-muted object-cover" />',
    "                        <img\n                          src={imagePreviewUrl}\n                          alt=\"\"\n                          className=\"size-24 rounded-2xl border bg-muted object-cover\"\n                          onError={(event) => {\n                            event.currentTarget.onerror = null;\n                            event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;\n                          }}\n                        />",
    'review image preview',
  );
  writeFileSync(productsPath, products);
  console.log('Patched cafe product form');
} else {
  console.log('Cafe product form already patched');
}

let pos = readFileSync(posPath, 'utf8');
if (!pos.includes('src={resolveProductImageUrl(product.imageUrl)}')) {
  pos = replaceOnce(
    pos,
    "import { formatMoney } from '@/lib/formatters';",
    "import { formatMoney } from '@/lib/formatters';\nimport { DEFAULT_PRODUCT_IMAGE, resolveProductImageUrl } from '@/lib/product-image';",
    'POS image imports',
  );
  pos = replaceOnce(
    pos,
    "                        src={product.imageUrl}\n                        alt={product.name}\n                        className=\"h-full w-full object-cover transition-transform duration-300 group-hover:scale-110\"\n                        loading=\"lazy\"",
    "                        src={resolveProductImageUrl(product.imageUrl)}\n                        alt={product.name}\n                        className=\"h-full w-full object-cover transition-transform duration-300 group-hover:scale-110\"\n                        loading=\"lazy\"\n                        onError={(event) => {\n                          event.currentTarget.onerror = null;\n                          event.currentTarget.src = DEFAULT_PRODUCT_IMAGE;\n                        }}",
    'POS product image',
  );
  writeFileSync(posPath, pos);
  console.log('Patched cafe POS image fallback');
} else {
  console.log('Cafe POS image fallback already patched');
}

const validator = `export type ProductImageInputValidation = {
  value: string;
  error: 'invalid' | null;
};

const SAFE_STORED_UPLOAD = /^(?=.*\\/)[/]?(?:uploads\\/)?[a-zA-Z0-9._/-]+$/;

/** Accept secure remote images and the relative upload paths already stored by ONE80. */
export function validateProductImageInput(input?: string | null): ProductImageInputValidation {
  const value = input?.trim() ?? '';
  if (!value) return { value: '', error: null };

  if (SAFE_STORED_UPLOAD.test(value) && !value.includes('..')) {
    return { value, error: null };
  }

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      ? { value: url.toString(), error: null }
      : { value, error: 'invalid' };
  } catch {
    return { value, error: 'invalid' };
  }
}
`;
writeFileSync(validatorPath, validator);
console.log('Installed product image URL validator');
