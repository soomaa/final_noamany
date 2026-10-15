type AppContentForm = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function optionalText(value: unknown): string | undefined {
  return text(value) || undefined;
}

function requiredText(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`${field} is required`);
  return result;
}

export function buildExerciseCategoryPayload(form: AppContentForm) {
  return {
    name: requiredText(form.name, 'name'),
    description: optionalText(form.description),
    isActive: Boolean(form.isActive),
  };
}

export function buildExercisePayload(form: AppContentForm) {
  const categoryId = Number(form.categoryId);
  if (!Number.isInteger(categoryId) || categoryId <= 0) throw new Error('category is required');
  const duration = optionalText(form.duration);
  return {
    name: requiredText(form.name, 'name'),
    categoryId,
    description: optionalText(form.description),
    instructions: optionalText(form.instructions),
    duration: duration ? Number(duration) : undefined,
    difficulty: optionalText(form.difficulty),
    isActive: Boolean(form.isActive),
    imageUrl: optionalText(form.imageUrl),
  };
}

export function buildNewsPayload(form: AppContentForm) {
  return {
    title: requiredText(form.title, 'title'),
    content: requiredText(form.content, 'content'),
    publishDate: optionalText(form.publishDate),
    isPublished: Boolean(form.isPublished),
    imageUrl: optionalText(form.imageUrl),
  };
}

export function buildAdPayload(form: AppContentForm) {
  return {
    title: requiredText(form.title, 'title'),
    description: optionalText(form.description),
    linkUrl: optionalText(form.linkUrl),
    startDate: optionalText(form.startDate),
    endDate: optionalText(form.endDate),
    isActive: Boolean(form.isActive),
    imageUrl: optionalText(form.imageUrl),
  };
}
