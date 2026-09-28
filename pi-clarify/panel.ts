import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createPanel, type PanelSpec } from '@prjct.app/pi-tui-kit';
import { displayOption, missingRequired, optionFromDisplay, responseText, type Answers, type Question } from './questions.ts';

type Intent = { readonly action: 'edit'; readonly id: string } | { readonly action: 'submit' } | { readonly action: 'cancel' };
export type ClarificationResult = { readonly status: 'answered'; readonly answers: Answers; readonly text: string } | { readonly status: 'cancelled' };

type UI = ExtensionContext['ui'];

async function choose(question: Question, current: string | readonly string[] | undefined, ui: UI): Promise<string | readonly string[] | undefined> {
  if (question.type === 'text') return ui.editor(question.text, typeof current === 'string' ? current : '');
  const options = [...(question.options ?? [])];
  const displayedOptions = options.map(option => displayOption(question, option));
  if (question.type === 'single') {
    const selected = await ui.select(question.text, [...displayedOptions, 'Otro…']);
    if (selected === 'Otro…') return ui.input(question.text);
    if (selected === undefined) return undefined;
    return optionFromDisplay(question, selected);
  }
  const selected = new Set(Array.isArray(current) ? current : []);
  while (true) {
    const choices = options.map((option, index) => `${selected.has(option) ? '[x]' : '[ ]'} ${displayedOptions[index]}`);
    const choice = await ui.select(question.text, [...choices, 'Otro…', 'Confirmar selección']);
    if (choice === undefined) return undefined;
    if (choice === 'Confirmar selección') return options.filter(option => selected.has(option)).concat([...selected].filter(option => !options.includes(option)));
    if (choice === 'Otro…') {
      const other = (await ui.input('Otra respuesta'))?.trim();
      if (other) selected.add(other);
      continue;
    }
    const option = optionFromDisplay(question, choice.slice(4));
    if (selected.has(option)) selected.delete(option);
    else selected.add(option);
  }
}

/** A docked, keyboard-driven panel: inspect questions, answer them, then submit together. */
export async function clarify(ctx: ExtensionContext, questions: readonly Question[]): Promise<ClarificationResult> {
  if (!ctx.hasUI || ctx.mode !== 'tui') throw new Error('Clarification requires an interactive Pi terminal.');
  const answers: Record<string, string | readonly string[]> = {};
  let focus = questions[0]?.id;
  while (true) {
    let intent: Intent | undefined;
    const request = (action: Intent, close: () => void): void => { intent = action; close(); };
    const spec: PanelSpec = {
      title: 'Clarificación',
      summary: () => `${Object.keys(answers).length}/${questions.length} respondidas`,
      items: () => questions.map((question, index) => ({
        id: question.id,
        label: `${index + 1}. ${question.text}`,
        symbol: Object.hasOwn(answers, question.id) ? '✓' : '○',
        meta: question.required ? 'obligatoria' : 'opcional',
      })),
      detail: item => {
        const question = questions.find(entry => entry.id === item.id)!;
        const answer = answers[item.id];
        return {
          title: question.text,
          subtitle: question.type === 'multiple' ? 'Selecciona varias opciones' : question.type === 'single' ? 'Elige una opción' : 'Escribe tu respuesta',
          fields: [{ label: 'Respuesta', value: answer === undefined ? 'Sin respuesta' : Array.isArray(answer) ? answer.join(', ') : String(answer) }],
          sections: question.options?.length ? [{ title: 'Opciones', lines: question.options.map(option => displayOption(question, option)) }] : [],
        };
      },
      initial: focus,
      actions: [
        { key: 'a', label: 'Responder', run: (item, panel) => { if (item) request({ action: 'edit', id: item.id }, panel.close); } },
        { key: 's', label: 'Enviar respuestas', run: (_item, panel) => {
          const missing = missingRequired(questions, answers);
          if (missing.length) panel.notice(`Faltan ${missing.length} respuestas obligatorias`, 'warning');
          else request({ action: 'submit' }, panel.close);
        } },
      ],
      activate: { label: 'Responder', run: (item, panel) => { if (item) request({ action: 'edit', id: item.id }, panel.close); } },
    };
    await ctx.ui.custom<null>((tui, theme, _keys, done) => createPanel(spec, tui, theme, () => done(null)));
    if (!intent || intent.action === 'cancel') return { status: 'cancelled' };
    if (intent.action === 'submit') return { status: 'answered', answers: { ...answers }, text: responseText(questions, answers) };
    const editId = intent.id;
    focus = editId;
    const question = questions.find(entry => entry.id === editId)!;
    const answer = await choose(question, answers[question.id], ctx.ui);
    if (answer !== undefined) {
      if (Array.isArray(answer) && !answer.length) delete answers[question.id];
      else if (typeof answer === 'string' && !answer.trim()) delete answers[question.id];
      else answers[question.id] = answer;
    }
  }
}
