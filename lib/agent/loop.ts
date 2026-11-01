import { runToolLoop, type LlmCallSink } from '@/lib/llm';
import { MAX_AGENT_ITERATIONS } from './config';
import {
  DRAFT_PROMPT_VERSION,
  DRAFT_SYSTEM,
  REPLY_PROMPT_VERSION,
  REPLY_SYSTEM,
  wrapVendorReply,
} from './prompts';
import { draftTools, replyTools, type AgentScope, type ReplyFindings } from './tools';

/** Ends after save_draft or at the cap. Throws LlmError when the provider fails. */
export async function runDraftAgent(
  scope: AgentScope,
  saveDraft: Parameters<typeof draftTools>[1],
  log?: LlmCallSink,
) {
  return runToolLoop({
    purpose: 'agent_followup',
    promptVersion: DRAFT_PROMPT_VERSION,
    system: DRAFT_SYSTEM,
    messages: [{ role: 'user', content: 'Tulis draft follow-up untuk invoice ini.' }],
    tools: draftTools(scope, saveDraft),
    maxIterations: MAX_AGENT_ITERATIONS,
    stopAfterTools: ['save_draft'],
    log,
  });
}

/** The findings are suggestions and warnings. Nothing here acts on them. */
export async function runReplyAgent(scope: AgentScope, replyText: string, log?: LlmCallSink) {
  const findings: ReplyFindings = { proposedPoNumber: null, proposedPoValid: null, suspicions: [] };
  await runToolLoop({
    purpose: 'agent_reply',
    promptVersion: REPLY_PROMPT_VERSION,
    system: REPLY_SYSTEM,
    messages: [{ role: 'user', content: wrapVendorReply(replyText) }],
    tools: replyTools(scope, replyText, findings),
    maxIterations: MAX_AGENT_ITERATIONS,
    log,
  });
  return findings;
}
