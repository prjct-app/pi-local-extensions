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
