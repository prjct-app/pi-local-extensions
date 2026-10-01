import assert from 'node:assert/strict';
import { test } from 'node:test';
import piUnescape, { PROSE_TOOLS, unescapeText, unescapeValue } from '../index.ts';

/** Escapes are built from parts so no editor or tool decodes them in this file. */
const BS = '\\';
const esc = (hex: string): string => `${BS}u${hex}`;
const ESCAPED = `c${esc('00f3')}digo`;
const DECODED = 'c\u{f3}digo';

test('non-ASCII escapes become the characters they name', () => {
  assert.equal(unescapeText(ESCAPED), DECODED);
  assert.equal(unescapeText(`secci${esc('00f3')}n ${esc('2014')} acci${esc('00F3')}n`), 'secci\u{f3}n \u{2014} acci\u{f3}n');
  assert.equal(unescapeText(`ok ${esc('d83d')}${esc('de00')}`), 'ok \u{1f600}', 'a surrogate pair is one emoji');
});

test('what is code stays as written', () => {
  assert.equal(unescapeText(`quote ${esc('0022')} tag ${esc('003C')}`), `quote ${esc('0022')} tag ${esc('003C')}`, 'ASCII escapes');
  assert.equal(unescapeText(`${BS}${esc('00f3')}`), `${BS}${esc('00f3')}`, 'an escaped backslash is a literal backslash');
  assert.equal(unescapeText(`lone ${esc('d83d')} half`), `lone ${esc('d83d')} half`, 'a lone surrogate');
  assert.equal(unescapeText('no escapes here'), 'no escapes here');
});

test('nested arguments are decoded; an untouched value keeps its identity', () => {
  const args = { kind: 'change', files: [{ path: 'a.ts', change: ESCAPED }], pending: [ESCAPED, 'plain'] };
  const fixed = unescapeValue(args);
  assert.notEqual(fixed, args);
  assert.deepEqual(fixed, { kind: 'change', files: [{ path: 'a.ts', change: DECODED }], pending: [DECODED, 'plain'] });
  assert.equal(args.pending[0], ESCAPED, 'the original is not mutated');
  const clean = { kind: 'answer', answer: 'listo', refs: [] };
  assert.equal(unescapeValue(clean), clean);
});

function load() {
  const handlers = new Map<string, (event: any) => any>();
  const calls: string[] = [];
  piUnescape(new Proxy({}, {
    get: (_target, prop: string) => (...args: any[]) => {
      calls.push(prop);
      if (prop === 'on') handlers.set(args[0], args[1]);
    },
  }) as any);
  return { handlers, calls };
}

test('only two hooks, no tools or messages of its own', () => {
  const { handlers, calls } = load();
  assert.deepEqual([...new Set(calls)], ['on']);
  assert.deepEqual([...handlers.keys()].sort(), ['message_end', 'tool_call']);
});

test('a prose tool runs with decoded arguments; a code tool runs as written', () => {
  const { handlers } = load();
  const answer = { type: 'tool_call', toolCallId: '1', toolName: 'answer', input: { kind: 'answer', answer: `Toqu${esc('00e9')} el ${ESCAPED}` } };
  assert.equal(handlers.get('tool_call')!(answer), undefined);
  assert.equal(answer.input.answer, `Toqu\u{e9} el ${DECODED}`);
  const edit = { type: 'tool_call', toolCallId: '2', toolName: 'edit', input: { path: 'a.ts', edits: [{ oldText: 'x', newText: `'${ESCAPED}'` }] } };
  handlers.get('tool_call')!(edit);
  assert.equal(edit.input.edits[0]!.newText, `'${ESCAPED}'`);
  assert.ok(PROSE_TOOLS.has('team_message'));
  assert.ok(!PROSE_TOOLS.has('bash') && !PROSE_TOOLS.has('write') && !PROSE_TOOLS.has('agent_delegate'));
});

test('the stored reply is decoded so the model stops copying the escapes', () => {
  const { handlers } = load();
  const message = {
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: `pensando ${ESCAPED}` },
      { type: 'toolCall', id: 'a', name: 'team_message', arguments: { to: 'qa', kind: 'handoff', body: `act${esc('00fa')}a` } },
      { type: 'toolCall', id: 'b', name: 'write', arguments: { path: 'x.json', content: `"${ESCAPED}"` } },
    ],
  };
  const result = handlers.get('message_end')!({ type: 'message_end', message });
  assert.equal(result.message.content[1].arguments.body, 'act\u{fa}a');
  assert.equal(result.message.content[2], message.content[2], 'code tools are left as written');
  assert.equal(result.message.content[0], message.content[0], 'thinking is not touched');
  assert.equal(handlers.get('message_end')!({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'hola' }] } }), undefined);
  assert.equal(handlers.get('message_end')!({ type: 'message_end', message: { role: 'user', content: ESCAPED } }), undefined);
});
