import { config } from 'dotenv';
import { CRITICAL_EXTRACTION_FIELDS } from '../types/domain';
import { fieldCorrect } from './compare';
import { extractDocument, loadTruths } from './extract-batch';

/** Run on every PROMPT_VERSION change. Keep these ten documents stable (D11). */
const SMOKE_DOCS = ['ev01', 'ev02', 'ev03', 'ev04', 'ev05', 'ev06', 'ev07', 'ev08', 'ev09', 'ev10'];
const MIN_CRITICAL_ACCURACY = 0.95;

async function main() {
  config({ path: '.env.local', quiet: true });
  const truths = [...loadTruths().values()].filter((truth) => SMOKE_DOCS.includes(truth.doc_id));
  if (truths.length !== SMOKE_DOCS.length) throw new Error('run eval/generate.py first');

  let checked = 0;
  let correct = 0;
  const wrongButVerified: string[] = [];

  for (const truth of truths) {
    const { fields, status } = await extractDocument(truth.file, {});
    for (const name of CRITICAL_EXTRACTION_FIELDS) {
      const isCorrect = fields !== null && fieldCorrect(name, fields[name].value, truth.fields[name]);
      checked++;
      if (isCorrect) correct++;
      else if (fields?.[name].verification === 'verified') {
        wrongButVerified.push(`${truth.doc_id}.${name}: ${fields[name].value}`);
      }
    }
    console.log(`${truth.doc_id}: ${status}`);
  }

  const accuracy = correct / checked;
  console.log(`critical-field accuracy: ${correct}/${checked} = ${accuracy.toFixed(3)}`);
  console.log(`wrong while verified: ${wrongButVerified.length}`);
  wrongButVerified.forEach((item) => console.log(`  ${item}`));

  if (accuracy < MIN_CRITICAL_ACCURACY || wrongButVerified.length > 0) {
    console.error('eval:smoke FAILED');
    process.exit(1);
  }
  console.log('eval:smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
