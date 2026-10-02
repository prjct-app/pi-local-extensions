import assert from 'node:assert/strict';
import test from 'node:test';
import install from '../index.ts';

test('the packaged Herdr bridge reports tool prompts without duplicate blocked events', () => {
  const original = process.env.HERDR_ENV;
  const handlers = new Map();
  const emitted = [];
  const api = { on: (name, handler) => handlers.set(name, handler), events: { emit: (name, data) => emitted.push({ name, data }) } };
  try {
    process.env.HERDR_ENV = '0';
    install(api);
    assert.equal(handlers.size, 0);
    process.env.HERDR_ENV = '1';
    install(api);
    handlers.get('ui_prompt_start')({ title: 'Command question' });
    assert.equal(emitted.length, 0);
    handlers.get('tool_execution_start')({ toolCallId: 'clarify-1' });
    handlers.get('ui_prompt_start')({ title: 'Choose a target' });
    handlers.get('ui_prompt_start')({ title: 'Same waiting span' });
    handlers.get('ui_prompt_end')();
    handlers.get('ui_prompt_end')();
    assert.deepEqual(emitted, [
      { name: 'herdr:blocked', data: { active: true, label: 'Choose a target' } },
      { name: 'herdr:blocked', data: { active: false } },
    ]);
    handlers.get('tool_execution_end')({ toolCallId: 'clarify-1' });
    handlers.get('ui_prompt_start')({ title: 'Independent widget' });
    assert.equal(emitted.length, 2);
  } finally {
    if (original === undefined) delete process.env.HERDR_ENV;
    else process.env.HERDR_ENV = original;
  }
});
