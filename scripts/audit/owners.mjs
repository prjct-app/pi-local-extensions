/**
 * Which extension owns each tool and each custom message type. The audit
 * attributes every token, failure and millisecond through this map, so a new
 * tool or message type belongs here the day it ships.
 */
export const CORE_TOOLS = new Set(['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls', 'powershell']);

export const TOOL_OWNERS = {
  mcp: 'pi-mcp',
  agent_delegate: 'pi-subagents', agent_jobs: 'pi-subagents', agent_reply: 'pi-subagents', ask_jev: 'pi-subagents',
  subagent_ask: 'pi-subagents', subagent_delegate: 'pi-subagents', subagent_inbox: 'pi-subagents',
  subagent_memory: 'pi-subagents', subagent_model: 'pi-subagents', subagent_report: 'pi-subagents', subagent_send: 'pi-subagents',
  memory_context: 'pi-memory', memory_record: 'pi-memory',
  team_message: 'pi-team', team_peers: 'pi-team', team_send: 'pi-team',
  pi_qa_contract: 'pi-qa', pi_qa_reviewer_report: 'pi-qa', pi_qa_tester_report: 'pi-qa', qa_browser: 'pi-qa',
  context_usage: 'pi-self-compact', self_compact: 'pi-self-compact',
  answer: 'pi-answer',
  secret_list: 'pi-secrets', secret_request: 'pi-secrets',
  clarify: 'pi-clarify',
  job_start: 'pi-jobs', job_status: 'pi-jobs', job_stop: 'pi-jobs', job_restart: 'pi-jobs',
};

/** Only custom_message entries enter the model's context; plain custom entries are extension state. */
export const MESSAGE_OWNERS = {
  'plan-execution-context': 'pi-plan', 'plan-mode-context': 'pi-plan', 'plan-mode-execute': 'pi-plan',
  'mcp-auth': 'pi-mcp', 'mcp-auth-link': 'pi-mcp',
  'agent-job-result': 'pi-subagents', 'agents-ask': 'pi-subagents', 'agents-auto': 'pi-subagents',
  'pi-memory-history': 'pi-memory', 'pi-memory-recall': 'pi-memory',
  'team-identity': 'pi-team', 'team-message': 'pi-team', 'team-status': 'pi-team',
  'self-compact-guidance': 'pi-self-compact', 'self-compact-handoff': 'pi-self-compact',
  'pi-answer-nudge': 'pi-answer',
  'proto-context': 'pi-proto', 'proto-designer': 'pi-proto',
  'job-wake': 'pi-jobs',
  'proto-ask': 'pi-proto',
};

export function toolOwner(name) {
  if (!name) return 'unknown';
  if (CORE_TOOLS.has(name)) return 'core';
  if (TOOL_OWNERS[name]) return TOOL_OWNERS[name];
  if (name.startsWith('mcp__')) return 'pi-mcp';
  if (name.startsWith('proto_')) return 'pi-proto';
  if (name.startsWith('subagent_') || name.startsWith('agent_')) return 'pi-subagents';
  if (name.startsWith('pi_qa_')) return 'pi-qa';
  return 'unknown';
}

export const messageOwner = type => MESSAGE_OWNERS[type] ?? (type ? `unknown:${type}` : 'unknown');

/** Extensions installed today, from ~/.pi/agent/settings.json packages (builds/<name>). */
export const EXTENSIONS = [
  'pi-ui', 'pi-markdown', 'pi-clipboard', 'pi-plan', 'pi-mcp', 'pi-subagents', 'pi-memory', 'pi-fast-mode',
  'pi-prompt-state', 'pi-team', 'pi-qa', 'pi-palettes', 'pi-context-prune', 'pi-self-compact', 'pi-clarify',
  'pi-answer', 'pi-secrets', 'pi-jobs', 'pi-usage', 'pi-unescape',
];
