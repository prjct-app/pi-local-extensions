/**
 * pi-unescape: some models write accents in tool arguments as literal escapes,
 * "c\u00f3digo" instead of "código" (MiniMax-M3 in a team session, grok and
 * gpt-5.6 now and then). Once one lands in the transcript the model copies it,
 * so every later reply and team message shows them.
 *
 * This decodes them in prose tools only (replies, team messages, reports),
 * before the tool runs and in the stored message, so the person reads accents
 * and the model stops seeing escapes to copy. Code tools (edit, write, bash,
 * delegations) are never touched: there an escape can be the point. Only
 * non-ASCII escapes are decoded; `"` and friends stay as written.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Tools whose string arguments are prose the person or another agent reads. */
export const PROSE_TOOLS: ReadonlySet<string> = new Set([
  'answer',
  'team_message', 'team_send',
  'agent_reply',
  'subagent_report', 'subagent_ask', 'subagent_send',
  'ask_jev',
  'self_compact',
  'memory_record',
  'proto_reply',
  'pi_qa_tester_report', 'pi_qa_reviewer_report',
]);

/** A run of \uXXXX escapes not itself escaped (`\\u00f3` is a literal backslash and stays). */
const RUN = /(?<!\\)(?:\\u[0-9a-fA-F]{4})+/g;

/** "c\u00f3digo" → "código". ASCII escapes and lone surrogates keep their written form. */
export function unescapeText(text: string): string {
  if (!text.includes('\\u')) return text;
  return text.replace(RUN, run => {
    const escapes = run.match(/\\u[0-9a-fA-F]{4}/g)!;
    const units = escapes.map(escape => Number.parseInt(escape.slice(2), 16));
    let out = '';
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!;
      const next = units[i + 1];
      if (unit >= 0xd800 && unit <= 0xdbff && next !== undefined && next >= 0xdc00 && next <= 0xdfff) {
        out += String.fromCharCode(unit, next);
        i += 1;
      } else if (unit < 0x80 || (unit >= 0xd800 && unit <= 0xdfff)) {
        out += escapes[i];
      } else {
        out += String.fromCharCode(unit);
      }
    }
    return out;
  });
}

/** The value with every string decoded; the same object when nothing changed. */
export function unescapeValue<T>(value: T): T {
  if (typeof value === 'string') return unescapeText(value) as T;
  if (Array.isArray(value)) {
    const items = value.map(unescapeValue);
    return (items.some((item, index) => item !== value[index]) ? items : value) as T;
  }
  if (value && typeof value === 'object') {
    let copy: Record<string, unknown> | undefined;
    for (const [key, item] of Object.entries(value)) {
      const fixed = unescapeValue(item);
      if (fixed !== item) (copy ??= { ...(value as Record<string, unknown>) })[key] = fixed;
    }
    return (copy ?? value) as T;
  }
  return value;
}

export default function piUnescape(pi: ExtensionAPI): void {
  // Before the tool runs: what it delivers, renders and sends on is clean.
  pi.on('tool_call', event => {
    if (!PROSE_TOOLS.has(event.toolName)) return;
    const input = event.input as Record<string, unknown>;
    const fixed = unescapeValue(input);
    if (fixed !== input) Object.assign(input, fixed);
  });

  // The stored reply: the model reads its own arguments back on every later turn.
  pi.on('message_end', event => {
    const message = event.message as { role?: string; content?: unknown };
    if (message.role !== 'assistant' || !Array.isArray(message.content)) return;
    let changed = false;
    const content = message.content.map(part => {
      if (part?.type !== 'toolCall' || !PROSE_TOOLS.has(part.name)) return part;
      const args = unescapeValue(part.arguments);
      if (args === part.arguments) return part;
      changed = true;
      return { ...part, arguments: args };
    });
    if (changed) return { message: { ...event.message, content } as typeof event.message };
  });
}
