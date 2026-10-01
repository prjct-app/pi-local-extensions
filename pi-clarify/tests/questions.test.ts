import assert from 'node:assert/strict';
import test from 'node:test';
import { displayOption, missingRequired, optionFromDisplay, responseText, validateQuestions } from '../questions.ts';

const questions = [
  { id: 'Q1', text: '¿Primero Consumer o Viago?', type: 'single' as const, options: ['Consumer', 'Viago'], recommended: 'Consumer', required: true },
  { id: 'Q2', text: '¿Qué temas?', type: 'multiple' as const, options: ['IA', 'Turismo'], recommended: 'IA', required: false },
];

test('validates option and ID boundaries', () => {
  assert.equal(validateQuestions(questions), undefined);
  assert.match(validateQuestions([questions[0], questions[0]]) ?? '', /unique/);
  assert.match(validateQuestions([{ ...questions[0], options: [] }]) ?? '', /options/);
  assert.match(validateQuestions([{ ...questions[0], recommended: undefined }]) ?? '', /recommended option/);
  assert.match(validateQuestions([{ ...questions[0], recommended: 'Enterprise' }]) ?? '', /must match/);
  assert.match(validateQuestions([{ ...questions[0], options: ['Consumer', 'Consumer (recomendada)'] }]) ?? '', /remain distinct/);
  assert.match(validateQuestions([{ ...questions[1], type: 'text' }]) ?? '', /cannot have options/);
  assert.match(validateQuestions([{ id: 'Q3', text: '¿Por qué?', type: 'text', recommended: 'Algo', required: true }]) ?? '', /cannot have a recommended option/);
});

test('marks only the recommended option for display', () => {
  assert.equal(displayOption(questions[0], 'Consumer'), 'Consumer (recomendada)');
  assert.equal(displayOption(questions[0], 'Viago'), 'Viago');
  assert.equal(optionFromDisplay(questions[0], 'Consumer (recomendada)'), 'Consumer');
  assert.equal(optionFromDisplay(questions[0], 'Viago'), 'Viago');
});

test('requires explicit answers and preserves multiple selections', () => {
  assert.deepEqual(missingRequired(questions, {}), ['Q1']);
  assert.deepEqual(missingRequired(questions, { Q1: '' }), ['Q1']);
  assert.deepEqual(missingRequired(questions, { Q1: 'Viago' }), []);
  assert.equal(responseText(questions, { Q1: 'Viago', Q2: ['IA', 'Turismo'] }),
    'Q1. ¿Primero Consumer o Viago?\nRespuesta: Viago\n\nQ2. ¿Qué temas?\nRespuesta: IA, Turismo');
});

test('options sent as objects become the strings the schema wants, and recommended always matches one', async () => {
  const { repairQuestions } = await import('../questions.ts');
  const repaired = repairQuestions({ questions: [
    { id: 'commit-admin-backend', text: '¿Commit ahora?', type: 'single', options: [{ label: 'Sí' }, { text: 'No', value: 'no' }, { description: 'x', label: 'Después' }], required: true },
    { id: 2, question: '¿Qué módulos?', type: 'checkbox', options: [{ item: 'a', label: 'API' }, 'Web', 'Web'], recommended: { label: 'web' } },
    { id: 'Q3', text: '¿Por qué?', type: 'open', options: ['x'], recommended: 'x', required: 'false', extra: 1 },
  ] }) as { questions: any[] };
  assert.deepEqual(repaired.questions[0], { id: 'commit-admin-backend', text: '¿Commit ahora?', type: 'single', options: ['Sí', 'No', 'Después'], recommended: 'Sí', required: true });
  assert.deepEqual(repaired.questions[1], { id: '2', text: '¿Qué módulos?', type: 'multiple', options: ['API', 'Web'], recommended: 'Web', required: true });
  assert.deepEqual(repaired.questions[2], { id: 'Q3', text: '¿Por qué?', type: 'text', required: false });
  assert.equal(validateQuestions(repaired.questions), undefined, 'the repaired batch passes validation');
  assert.equal(repairQuestions('not json'), 'not json', 'what cannot be read is left for Pi to reject');
});
