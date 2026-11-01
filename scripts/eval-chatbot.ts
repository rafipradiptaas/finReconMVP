import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { answerQuestion } from '../lib/chatbot/loop';
import type { Database } from '../types/database.types';
import { scoreAnswer, type ChatQuestion, type ChatOutcome } from './chatbot-score';

/**
 * The chatbot's hallucination test (D12). It reads only, signed in as the e2e
 * admin of the organization, and writes nothing there: calls go to the JSONL,
 * not llm_calls. Expected answers hold while Demo Corp has only fixture data.
 *
 *   npm run eval:chatbot -- --max-calls 100 [--only q01,t03]
 */
config({ path: '.env.local', quiet: true });

const option = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const ORG = option('org') ?? 'Demo Corp';
const maxCalls = Number(option('max-calls') ?? 100);
const only = option('only')?.split(',');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const auth = { persistSession: false, autoRefreshToken: false };

async function signIn() {
  const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth });
  const email = `e2e-admin-${ORG.toLowerCase().replace(/[^a-z0-9]+/g, '-')}@finrecon.test`;
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`${email} does not exist. Run the e2e once in this organization.`);

  const password = randomBytes(18).toString('base64url');
  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password });
  if (updateError) throw updateError;

  const db = createClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth });
  const { error: signInError } = await db.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return db;
}

async function main() {
  const db = await signIn();
  const questions = (JSON.parse(readFileSync('fixtures/chatbot-questions.json', 'utf8')) as ChatQuestion[]).filter(
    ({ id }) => !only || only.includes(id),
  );

  mkdirSync('eval/runs', { recursive: true });
  const path = `eval/runs/chatbot-${new Date().toISOString().slice(0, 10)}.jsonl`;
  if (!only) writeFileSync(path, '');

  const tally: Record<string, number> = {};
  let calls = 0;
  let cost = 0;
  let tokens = 0;

  for (const question of questions) {
    if (calls >= maxCalls) {
      console.log(`Stopped at ${calls} calls, before ${question.id}.`);
      break;
    }
    let answer = '';
    let outcome: ChatOutcome | 'error' = 'error';
    let toolsCalled: string[] = [];
    let records: Awaited<ReturnType<typeof answerQuestion>>['records'] = [];
    try {
      ({ text: answer, toolsCalled, records } = await answerQuestion(db, question.question));
      outcome = scoreAnswer(question, answer);
    } catch (error) {
      answer = String(error);
      calls += 1;
    }
    calls += records.length;
    cost += records.reduce((sum, record) => sum + (record.cost_estimate_usd ?? 0), 0);
    tokens += records.reduce((sum, record) => sum + (record.input_tokens ?? 0) + (record.output_tokens ?? 0), 0);

    const key = `${question.trap ? 'trap' : 'question'}:${outcome}`;
    tally[key] = (tally[key] ?? 0) + 1;
    appendFileSync(
      path,
      `${JSON.stringify({ id: question.id, trap: question.trap, question: question.question, expected: question.expected, answer, outcome, tools: toolsCalled, calls: records.length })}\n`,
    );
    console.log(question.id, outcome, toolsCalled.join(',') || '-');
  }
  console.log(JSON.stringify({ tally, calls, tokens, costUsd: Number(cost.toFixed(4)), path }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
