// Onboarding (MARQUIS_product.md): business type -> stage -> description
// -> the butler's clarifying questions (3-5, specific to what was shared)
// -> the pathway reveal (assessment, phase 1, tools + cost, success, this
// week). Real mode asks the backend (Claude) for steps 4 and 5; DEMO_MODE
// uses the local question bank and a canned reveal.
// The butler never validates without evidence, never gives generic advice,
// never asks what it was already told, and never shows phase 2.

import { qs, qsa, escapeHtml } from '../lib/dom.js';
import { reveal } from '../lib/motion.js';
import { setOnboarded, state } from '../lib/state.js';
import { fetchClarifyingQuestions, fetchPathway, DEMO_MODE } from '../lib/api.js';

// Used in DEMO_MODE, and as a fallback if the butler can't be reached for
// step 4 (questions only; the reveal is never faked in real mode).
const CLARIFY = {
  'SaaS / Software': ['Who specifically is the first person who pays for this?', 'What do they use instead of this today?', 'What is your technical background?'],
  'E-commerce': ['Who is the first customer, specifically?', 'Are you manufacturing, sourcing, or dropshipping?', 'What happens after the first sale? Do they come back?'],
  'Content / Creator': ['Which platform carries this first?', 'What do you make that nobody else in this space makes?', 'How will this earn: advertising, sponsors, or a product?'],
  'Service / Agency': ['Who is your first client, specifically?', 'What have you already delivered, even informally?', 'What do you charge, and why that number?'],
  'Mobile App': ['iOS, Android, or both, and why?', 'Who is the first person who opens this daily?', 'What do you use instead of this today, yourself?'],
  Marketplace: ['Which side are you solving for first, supply or demand?', 'How many suppliers do you need before it works at all?', 'What convinces the first supplier to join with no buyers yet?'],
  Other: ['Who is the first person who pays for this, specifically?', 'What do they do about this problem today?', 'What have you already built or tested?'],
};
// Don't ask what the founder already answered (spec): crude but real.
const ALREADY_ANSWERED = [
  { q: /technical background/i, a: /\b(engineer|developer|i code|programm|cs degree|technical co-?founder|built it myself)\b/i },
  { q: /iOS, Android/i, a: /\b(ios|android|both platforms)\b/i },
  { q: /manufacturing, sourcing, or dropshipping/i, a: /\b(manufactur|sourc|dropship)\w*/i },
  { q: /what do you charge/i, a: /(\$|₹|€|£)\s?\d|\bper (hour|month|project)\b/i },
];

let ob = { type: null, typeLabel: null, stage: null, desc: '', questions: [], answers: [] };
let onFinish = null;

export function initOnboarding({ onFinished }) {
  onFinish = onFinished;
  wire();
}

export function runOnboarding() {
  show(1);
}

function show(step) {
  qsa('.ob-step').forEach((s) => s.classList.toggle('active', s.dataset.step == step));
  qs('#page-onboarding .scroll').scrollTop = 0;
  // Low-frequency moment: steps arrive like pages do (animation #2 incoming).
  reveal(qs(`.ob-step[data-step="${step}"]`), { y: 8, duration: 0.2 });
}

function selectIn(container, btn) {
  qsa('.ob-option', container).forEach((o) => { o.classList.remove('sel'); o.setAttribute('aria-checked', 'false'); });
  btn.classList.add('sel');
  btn.setAttribute('aria-checked', 'true');
}

function profile() {
  return { business_type: ob.typeLabel, stage: ob.stage, description: ob.desc };
}

function wire() {
  qsa('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));

  // Step 1: type (+ "Something else")
  const other = qs('#obOther');
  const next1 = qs('#obNext1');
  const valid1 = () => { next1.disabled = !ob.type || (ob.type === 'Other' && other.value.trim().length < 3); };
  qsa('#obTypeGrid .ob-option').forEach((b) => b.addEventListener('click', () => {
    selectIn(qs('#obTypeGrid'), b);
    ob.type = b.dataset.val;
    other.hidden = ob.type !== 'Other';
    if (!other.hidden) other.focus();
    valid1();
  }));
  other.addEventListener('input', valid1);
  next1.addEventListener('click', () => {
    ob.typeLabel = ob.type === 'Other' ? other.value.trim() : ob.type;
    show(2);
  });

  // Step 2: stage
  const next2 = qs('#obNext2');
  qsa('#obStageList .ob-option').forEach((b) => b.addEventListener('click', () => {
    selectIn(qs('#obStageList'), b);
    ob.stage = b.dataset.val;
    next2.disabled = false;
  }));
  next2.addEventListener('click', () => show(3));

  // Step 3: description (no character limit; just not empty)
  const desc = qs('#obDesc');
  const toClarify = qs('#obToClarify');
  desc.addEventListener('input', () => { toClarify.disabled = desc.value.trim().length < 12; });
  toClarify.addEventListener('click', async () => {
    ob.desc = desc.value.trim();
    show(4);
    await loadQuestions();
  });

  // Step 4 -> 5
  qs('#obToReveal').addEventListener('click', async () => {
    ob.answers = qsa('#obQuestions input').map((i, n) => ({ question: ob.questions[n], answer: i.value.trim() }));
    show(5);
    await loadPathway();
  });

  qs('#obEnter').addEventListener('click', () => {
    const p = { type: ob.typeLabel, stage: ob.stage, desc: ob.desc, answers: ob.answers, created: Date.now() };
    setOnboarded(p);
    qs('#page-onboarding').classList.remove('active');
    onFinish(p);
  });
}

async function loadQuestions() {
  const box = qs('#obQuestions');
  const thinking = qs('#obThinking4');
  const cont = qs('#obToReveal');
  box.innerHTML = '';
  cont.disabled = true;
  let questions = null;
  if (!DEMO_MODE) {
    thinking.hidden = false;
    try { questions = await fetchClarifyingQuestions(state.token, profile()); } catch (_) { questions = null; }
    thinking.hidden = true;
  }
  if (!questions) {
    questions = (CLARIFY[ob.type] || CLARIFY.Other).filter((q) => !ALREADY_ANSWERED.some((r) => r.q.test(q) && r.a.test(ob.desc)));
  }
  ob.questions = questions;
  box.innerHTML = questions.map((q, i) => `<div class="ob-q"><div class="ob-q-text">${escapeHtml(q)}</div><input type="text" data-qi="${i}" placeholder="Your answer" aria-label="${escapeHtml(q)}"></div>`).join('');
  cont.disabled = false;
  reveal(box.querySelectorAll('.ob-q'), { y: 6, duration: 0.2, stagger: 0.08 });
}

function demoPathway() {
  const isNew = ob.stage === 'Idea only' || ob.stage === 'Validated';
  return isNew ? {
    assessment: 'Before anything is built, one thing needs to be true: a specific person has said, in their own words, that this problem costs them something. Not a survey. A conversation.',
    phase: { name: 'Foundation', estimated_days: 14, actions: ['Talk to five people who fit your first customer, to listen rather than pitch', 'Write down what each one currently does about the problem', 'Note the exact words they use; your landing page will need them'], tools: [{ name: 'Notion', cost: '$0' }, { name: 'Calendly', cost: '$0' }], success: 'Five real conversations, written down.' },
    this_week: "Write the exact sentence you'll say to a stranger about what you're building. Say it to five people. Change nothing until you've said it five times.",
  } : {
    assessment: "Given where you already are, the product isn't the open question any more. Distribution is.",
    phase: { name: 'Distribution', estimated_days: 10, actions: ['Find where your first ten customers already gather', 'Show up in three of those places with something useful, not a pitch', 'Measure how many who land on the page reach checkout'], tools: [{ name: 'Plausible', cost: '$9/mo' }, { name: 'Sentry', cost: '$0' }], success: 'Ten conversations with people who could buy.' },
    this_week: 'List every place your ideal customer already spends time, not where you would like them to be. Show up in three of them this week.',
  };
}

async function loadPathway() {
  const box = qs('#obReveal');
  const thinking = qs('#obThinking5');
  const enter = qs('#obEnter');
  box.innerHTML = '';
  enter.hidden = true;
  let pathway;
  if (DEMO_MODE) {
    pathway = demoPathway();
  } else {
    thinking.hidden = false;
    try { pathway = await fetchPathway(state.token, profile(), ob.answers); } catch (_) { pathway = null; }
    thinking.hidden = true;
    if (!pathway) {
      // Never a generic stand-in for the real thing: say so, keep answers.
      box.innerHTML = `<p class="ob-error">I can't draw up your pathway at the moment. Your answers are kept.</p><button type="button" class="btn" id="obRetry">Try again</button>`;
      qs('#obRetry').addEventListener('click', loadPathway);
      return;
    }
  }
  const p = pathway.phase;
  box.innerHTML = `
    <p class="ob-assessment">${escapeHtml(pathway.assessment)}</p>
    <div class="card ob-phase">
      <div class="label">Phase 1 · estimated ${escapeHtml(String(p.estimated_days))} days</div>
      <div class="ob-phase-name">${escapeHtml(p.name)}</div>
      ${p.actions?.length ? `<ul class="ob-actions">${p.actions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>` : ''}
      ${p.tools?.length ? `<div class="ob-tools">${p.tools.map((t) => `<span class="ob-tool">${escapeHtml(t.name)} · ${escapeHtml(t.cost)}</span>`).join('')}</div>` : ''}
      ${p.success ? `<p class="ob-success"><b>What success looks like:</b> ${escapeHtml(p.success)}</p>` : ''}
    </div>
    <div class="card ob-week"><div class="label" style="margin-bottom:8px">This week</div>${escapeHtml(pathway.this_week)}</div>`;
  enter.hidden = false;
  reveal(box.children, { y: 8, duration: 0.2, stagger: 0.08 });
}
