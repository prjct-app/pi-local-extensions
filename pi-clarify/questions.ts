export type Question = {
  readonly id: string;
  readonly text: string;
  readonly type: 'single' | 'multiple' | 'text';
  readonly options?: readonly string[];
  readonly recommended?: string;
  readonly required: boolean;
};

export type Answers = Readonly<Record<string, string | readonly string[]>>;

/** Validate runtime input even when the TypeBox boundary was bypassed by a command. */
export function validateQuestions(questions: readonly Question[]): string | undefined {
  if (questions.length < 1 || questions.length > 12) return 'Provide between 1 and 12 questions.';
  const ids = new Set<string>();
  for (const question of questions) {
    if (!question.id.trim() || ids.has(question.id)) return 'Question IDs must be unique and nonempty.';
    ids.add(question.id);
    if (!question.text.trim()) return `Question ${question.id} has no text.`;
    if (question.type === 'text') {
      if (question.options?.length) return `Text question ${question.id} cannot have options.`;
      if (question.recommended !== undefined) return `Text question ${question.id} cannot have a recommended option.`;
    } else if (!question.options?.length || question.options.length > 8 || new Set(question.options).size !== question.options.length || question.options.some(option => !option.trim())) {
      return `Question ${question.id} needs 1–8 distinct, nonempty options.`;
    } else if (question.recommended === undefined) {
      return `Choice question ${question.id} needs a recommended option.`;
    } else if (!question.options.includes(question.recommended)) {
      return `Recommended option for question ${question.id} must match one of its options.`;
    } else if (new Set(question.options.map(option => displayOption(question, option))).size !== question.options.length) {
      return `Option labels for question ${question.id} must remain distinct when the recommendation is shown.`;
    }
  }
  return undefined;
}

export function displayOption(question: Question, option: string): string {
  return option === question.recommended ? `${option} (recomendada)` : option;
}

export function optionFromDisplay(question: Question, displayed: string): string {
  return question.options?.find(option => displayOption(question, option) === displayed) ?? displayed;
}

export function missingRequired(questions: readonly Question[], answers: Answers): readonly string[] {
  return questions.filter(question => question.required && (
    !Object.hasOwn(answers, question.id) ||
    (typeof answers[question.id] === 'string' && !(answers[question.id] as string).trim()) ||
    (Array.isArray(answers[question.id]) && answers[question.id].length === 0)
  )).map(question => question.id);
}

export function responseText(questions: readonly Question[], answers: Answers): string {
  return questions.filter(question => Object.hasOwn(answers, question.id))
    .map(question => `${question.id}. ${question.text}\nRespuesta: ${Array.isArray(answers[question.id]) ? (answers[question.id] as readonly string[]).join(', ') : answers[question.id]}`)
    .join('\n\n');
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
const clip = (value: string, max: number): string => (value.length > max ? value.slice(0, max) : value);
/** What models send as an option: a string, or an object carrying it under one of these keys. */
const optionText = (value: unknown): string | undefined => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of ['label', 'text', 'value', 'option', 'item', 'name', 'title']) {
      const found = text(record[key]);
      if (found) return found;
    }
    return undefined;
  }
  return text(value);
};
const TYPES: Readonly<Record<string, Question['type']>> = {
  single: 'single', choice: 'single', select: 'single', radio: 'single', one: 'single',
  multiple: 'multiple', multi: 'multiple', checkbox: 'multiple', checkboxes: 'multiple', multiselect: 'multiple', many: 'multiple',
  text: 'text', open: 'text', free: 'text', input: 'text', string: 'text', freeform: 'text',
};

/**
 * Turns the shapes models actually send into the schema's, before Pi validates
 * it: options as `{ label }` / `{ text, value }` objects, a missing or
 * unmatched `recommended`, type aliases, numbers as ids, extra fields. A model
 * that keeps resending the same near-miss loops on the validation error instead.
 */
export function repairQuestions(raw: unknown): unknown {
  const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : raw;
  const list: unknown = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return raw;
  const questions = (list as unknown[]).slice(0, 12).map((item, index) => {
    const record: Record<string, unknown> = item && typeof item === 'object' ? item as Record<string, unknown> : { text: item };
    const options: string[] = Array.isArray(record.options) ? [...new Set((record.options as unknown[]).map(optionText).filter((value): value is string => !!value).map(value => clip(value, 200)))].slice(0, 8) : [];
    const flagged = Array.isArray(record.options)
      ? (record.options as unknown[]).find(option => !!option && typeof option === 'object' && (option as Record<string, unknown>).recommended === true) : undefined;
    const declared = text(record.type)?.toLowerCase();
    const type: Question['type'] = (declared ? TYPES[declared] : undefined) ?? (options.length ? 'single' : 'text');
    const wanted = optionText(record.recommended) ?? optionText(flagged);
    const recommended = type === 'text' ? undefined
      : options.find(option => option === wanted) ?? options.find(option => option.toLowerCase() === wanted?.toLowerCase()) ?? options[0];
    const required = typeof record.required === 'boolean' ? record.required : text(record.required) !== 'false';
    return {
      id: clip(text(record.id) || `Q${index + 1}`, 40),
      text: clip(text(record.text) ?? text(record.question) ?? text(record.prompt) ?? text(record.label) ?? text(record.title) ?? '', 500),
      type,
      ...(type !== 'text' ? { options, ...(recommended ? { recommended } : {}) } : {}),
      required,
    };
  });
  return { questions };
}
