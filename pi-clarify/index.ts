import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { clarify } from './panel.ts';
import { validateQuestions } from './questions.ts';

const question = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 40 }),
  text: Type.String({ minLength: 1, maxLength: 500 }),
  type: Type.Union([Type.Literal('single'), Type.Literal('multiple'), Type.Literal('text')]),
  options: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 8 })),
  recommended: Type.Optional(Type.String({ minLength: 1, maxLength: 200, description: 'For a choice question, the exact option that is most viable. Omit for text questions.' })),
  required: Type.Boolean(),
}, { additionalProperties: false });

export default function piClarify(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'clarify',
    label: 'Clarify',
    description: 'Ask the person consequential clarification questions in a terminal panel. Use single for one choice, multiple for checkboxes, text for open responses. For every choice question, set recommended to the exact option you judge most viable; the UI marks it “(recomendada)”. Write questions and choices in the person’s language; keep batches short. A cancellation is not an answer: do not assume a default.',
    parameters: Type.Object({ questions: Type.Array(question, { minItems: 1, maxItems: 12 }) }, { additionalProperties: false }),
    execute: async (_id, input, _signal, _onUpdate, ctx) => {
      const error = validateQuestions(input.questions);
      if (error) throw new Error(error);
      const result = await clarify(ctx, input.questions);
      return {
        content: [{ type: 'text', text: result.status === 'cancelled' ? 'Cancelled by the person; no decisions were recorded.' : result.text }],
        details: result,
      };
    },
  });

  pi.registerCommand('clarify', {
    description: 'Open a clarification panel for a free-text question: /clarify <question>',
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) { ctx.ui.notify('Uso: /clarify <pregunta>', 'warning'); return; }
      if (!ctx.hasUI || ctx.mode !== 'tui') { ctx.ui.notify('La clarificación requiere la terminal interactiva de Pi.', 'warning'); return; }
      const result = await clarify(ctx, [{ id: 'Q1', text, type: 'text', required: true }]);
      if (result.status === 'answered') pi.sendUserMessage(result.text, { deliverAs: 'followUp' });
    },
  });
}
