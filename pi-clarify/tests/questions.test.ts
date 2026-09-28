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
