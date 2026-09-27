import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const apply = process.argv.includes('--apply');

async function loadEnv(path) {
  const text = await readFile(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const split = line.indexOf('=');
    if (split < 1) continue;
    const key = line.slice(0, split).trim();
    let value = line.slice(split + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

await loadEnv(new URL('../.env.local', import.meta.url));

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const db = createClient(url, key, { auth: { persistSession: false } });

const sources = [
  {
    externalId: '6aa489e1-6810-83e8-a450-c75e53d937f1',
    title: 'Imported: Entrepreneurship Priorities Hub',
    summary: `Curated import of explicit user statements from ChatGPT conversation 6aa489e1-6810-83e8-a450-c75e53d937f1 (Entrepreneurship Priorities Hub).

Authoritative latest state:
- Workforce Control is the primary entrepreneurial priority and Founder OS infrastructure.
- Investment School is an active venture and dogfooding environment for Workforce Control.
- Soup Booth, Smart Calendar, and Engineering Simulator are validation projects.
- Affordable Micro-Housing, Joan of Arc, Meme Coin Intelligence Bot, and Alternative-Bean Tofu are preserved without current execution allocation.
- Sustainable Textile/Cotton Technology, Personal Mini-Copter, Teen Graphic Novel, and Clothing Brand are long-term ambitions.
- MarketMind AI is discontinued/graveyard.
- New ideas should be captured and evaluated before becoming active projects.
- The portfolio should normally have one primary startup, with only tightly bounded validation work alongside it.

This digest records user-approved outcomes. Assistant analysis from the source chat is context, not an explicit user fact.`,
  },
  {
    externalId: '6ab2a088-eccc-83e8-8269-7c0bb658dee1',
    title: 'Imported: Creating Your Own AI',
    summary: `Curated import of explicit user statements from ChatGPT conversation 6ab2a088-eccc-83e8-8269-7c0bb658dee1 (Creating Your Own AI).

Authoritative intent:
- Build a personal assistant called JARVIS that knows the user's life and helps with decisions and routine processes.
- JARVIS should act as a second brain with persistent memory and a compatible communication style.
- The first milestone is the memory foundation: structured storage, source tracking, reconciliation, retrieval, and chat.
- Automation, voice, computer control, and broad integrations come only after memory works reliably.

This digest records user-approved project direction. Detailed architecture proposed by the assistant is retained as project context, not as a personal fact.`,
  },
];

const projects = [
  { name: 'Workforce Control', status: 'active', priority: 1, description: 'AI employee command center and core Founder OS infrastructure.', current_objective: 'Build a genuinely usable product, dogfood it, then validate it with external users.', current_state: 'Primary entrepreneurial priority.' },
  { name: 'Investment School', status: 'active', priority: 2, description: 'Investing and trading education platform.', current_objective: 'Develop the venture while using it as a real dogfooding environment for Workforce Control.', current_state: 'Active venture; strategically linked to Workforce Control.' },
  { name: 'Soup Booth', status: 'validation', priority: 2, description: 'Pay-it-forward soup distribution or vending concept with social-impact and entrepreneurial value.', current_objective: 'Validate economics, operations, partnerships, food safety, and demand before custom hardware.', current_state: 'Validation project; early sustained impact matters.' },
  { name: 'Smart Calendar', status: 'validation', priority: 3, description: 'Adaptive scheduling and goal-execution software intended first as an internal tool.', current_objective: 'Test the smallest personal version that materially improves execution.', current_state: 'Founder OS validation project, not a primary startup.' },
  { name: 'Engineering Simulator', status: 'validation', priority: 4, description: 'A realistic design and simulation environment that could turn invention ideas into testable designs, blueprints, and build lists.', current_objective: 'Research the technical and market gap before attempting development.', current_state: 'Validation and long-horizon Founder OS opportunity.' },
  { name: 'Affordable Micro-Housing', status: 'paused', priority: 5, description: 'A model for producing large quantities of small homes at an affordable price.', current_state: 'Vault: preserved with no current execution allocation.' },
  { name: 'Joan of Arc', status: 'paused', priority: 5, description: 'Menswear aesthetics and silhouettes designed and constructed specifically for women.', current_state: 'Vault: preserved with no current execution allocation.' },
  { name: 'Meme Coin Intelligence Bot', status: 'paused', priority: 5, description: 'Solana meme-coin opportunity detection using momentum, wallet behavior, risk analysis, and outcome data.', current_state: 'Vault: functional work preserved with no current execution allocation.' },
  { name: 'Alternative-Bean Tofu', status: 'paused', priority: 5, description: 'Tofu or tofu-like products made from beans or legumes other than traditional soybeans.', current_state: 'Vault: preserved for later evaluation.' },
  { name: 'Sustainable Textile/Cotton Technology', status: 'paused', priority: 5, description: 'Reduce harmful pesticide dependence through alternative fibers, safer crop protection, or pest-resistant cotton.', current_state: 'Long-term deep-tech ambition.' },
  { name: 'Personal Mini-Copter', status: 'paused', priority: 5, description: 'A practical personal flying device.', current_state: 'Long-term aerospace and hardware ambition.' },
  { name: 'Teen Graphic Novel', status: 'paused', priority: 5, description: 'An original illustrated comedy or graphic-book series for teens.', current_state: 'Long-term creative and IP ambition.' },
  { name: 'Clothing Brand', status: 'paused', priority: 5, description: 'A long-term ambition to build a serious fashion and clothing company.', current_state: 'Long-term ambition.' },
  { name: 'MarketMind AI', status: 'graveyard', priority: 5, description: 'AI news and alerting intelligence for traders.', current_state: 'Discontinued unless something fundamentally changes.' },
  { name: 'JARVIS', status: 'active', priority: 1, description: 'Persistent personal chief of staff and second brain.', current_objective: 'Accurately remember, organize, retrieve, and reason over the user’s life context.', current_state: 'Alpha memory foundation is operational and entering real-world use.' },
];

const decisions = [
  { title: 'Primary entrepreneurial priority', decision: 'Workforce Control is the primary entrepreneurial priority.', reasoning: 'It is the most developed opportunity and core infrastructure for the broader Founder OS.', project: 'Workforce Control', source: 0 },
  { title: 'Investment School portfolio status', decision: 'Investment School is an active venture.', reasoning: 'It can become a valuable business while providing real tasks, constraints, failures, and feedback for Workforce Control.', project: 'Investment School', source: 0 },
  { title: 'Founder OS dogfooding rule', decision: 'When Investment School needs operational work, first ask whether Workforce Control can do it.', reasoning: 'Real venture work creates better dogfooding than artificial test tasks.', project: 'Workforce Control', source: 0 },
  { title: 'New idea activation rule', decision: 'A new idea does not automatically become a new active project; it must be captured, evaluated, compared, and deliberately promoted.', reasoning: 'The scarce resource is focus, not ideas.', source: 0 },
  { title: 'Entrepreneurial concurrency limit', decision: 'Normally keep one primary startup and only tightly bounded validation work alongside it.', reasoning: 'Protect execution from idea overload and constant priority switching.', source: 0 },
  { title: 'MarketMind status', decision: 'MarketMind AI is discontinued and belongs in the graveyard unless something fundamentally changes.', project: 'MarketMind AI', source: 0 },
  { title: 'JARVIS first milestone', decision: 'Build reliable persistent memory before adding broad automation, voice, computer control, or many integrations.', reasoning: 'The assistant must first remember and retrieve the user’s context accurately.', project: 'JARVIS', source: 1 },
];

const memories = [
  { content: 'The Founder OS strategy is to build software the user genuinely needs, use it internally, improve it through real work, and only then determine whether it should become a company.', type: 'strategy', importance: 5, project: 'Workforce Control', source: 0 },
  { content: 'Workforce Control supplies AI labor, research, coordination, and workflows; Investment School provides a real operating environment that improves Workforce Control through dogfooding.', type: 'relationship', importance: 5, project: 'Workforce Control', source: 0 },
  { content: 'Portfolio progress is measured by capability, evidence, impact, and value created—not by the number of projects started.', type: 'strategy', importance: 5, source: 0 },
  { content: 'Vault projects are deliberately preserved without scheduled execution time; long-term ambitions matter but are not current obligations.', type: 'strategy', importance: 4, source: 0 },
  { content: 'JARVIS should operate as a persistent personal chief of staff and second brain that helps the user make better decisions while leaving major decisions under user control.', type: 'identity', importance: 5, project: 'JARVIS', source: 1 },
  { content: 'JARVIS memory should distinguish explicit user statements from inferred patterns and retain source provenance so beliefs can be inspected and corrected.', type: 'strategy', importance: 5, project: 'JARVIS', source: 1 },
];

const profileFacts = [
  { category: 'working_style', content: 'The user generates many entrepreneurial ideas and wants help protecting focus and prioritizing execution.', importance: 5, source: 0 },
  { category: 'assistant_preference', content: 'The user wants a personal assistant that knows their life, remembers important context, helps make decisions, and automates routine processes over time.', importance: 5, source: 1 },
];

function printPlan() {
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Sources: ${sources.length}`);
  console.log(`Projects: ${projects.length}`);
  console.log(`Decisions: ${decisions.length}`);
  console.log(`Memories: ${memories.length}`);
  console.log(`Profile facts: ${profileFacts.length}`);
}

printPlan();
if (!apply) {
  console.log('No database changes made. Run npm run bootstrap:chats:apply to apply this reviewed seed.');
  process.exit(0);
}

async function one(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (!data) throw new Error(`${label}: no row returned`);
  return data;
}

async function maybe(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? null;
}

let user = await maybe(db.from('users').select('*').order('created_at').limit(1).maybeSingle(), 'load user');
if (!user) {
  user = await one(db.from('users').insert({ name: process.env.JARVIS_USER_NAME ?? 'Cash', timezone: process.env.JARVIS_TIMEZONE ?? 'America/Los_Angeles' }).select().single(), 'create user');
}

const sourceMessages = [];
for (const source of sources) {
  let conversation = await maybe(db.from('conversations').select('*').eq('user_id', user.id).eq('title', source.title).limit(1).maybeSingle(), `find ${source.title}`);
  if (!conversation) {
    conversation = await one(db.from('conversations').insert({ user_id: user.id, title: source.title }).select().single(), `create ${source.title}`);
  }
  let message = await maybe(db.from('messages').select('*').eq('conversation_id', conversation.id).eq('role', 'user').limit(1).maybeSingle(), `find source message ${source.externalId}`);
  if (!message) {
    message = await one(db.from('messages').insert({ conversation_id: conversation.id, user_id: user.id, role: 'user', content: source.summary }).select().single(), `create source message ${source.externalId}`);
  }
  sourceMessages.push(message);
}

const projectIds = new Map();
for (const project of projects) {
  let row = await maybe(db.from('projects').select('*').eq('user_id', user.id).ilike('name', project.name).limit(1).maybeSingle(), `find project ${project.name}`);
  const payload = { ...project, user_id: user.id };
  delete payload.name;
  if (row) {
    row = await one(db.from('projects').update(payload).eq('id', row.id).select().single(), `update project ${project.name}`);
  } else {
    row = await one(db.from('projects').insert({ name: project.name, ...payload }).select().single(), `create project ${project.name}`);
  }
  projectIds.set(project.name, row.id);
}

for (const item of decisions) {
  const sourceId = sourceMessages[item.source].id;
  const existing = await maybe(db.from('decisions').select('*').eq('user_id', user.id).eq('title', item.title).eq('status', 'active').limit(1).maybeSingle(), `find decision ${item.title}`);
  const payload = { user_id: user.id, project_id: item.project ? projectIds.get(item.project) : null, title: item.title, decision: item.decision, reasoning: item.reasoning ?? null, alternatives: null, status: 'active', source_type: 'conversation', source_id: sourceId };
  if (!existing) await one(db.from('decisions').insert(payload).select().single(), `create decision ${item.title}`);
  else await one(db.from('decisions').update(payload).eq('id', existing.id).select().single(), `update decision ${item.title}`);
}

for (const item of memories) {
  const sourceId = sourceMessages[item.source].id;
  const existing = await maybe(db.from('memories').select('*').eq('user_id', user.id).eq('content', item.content).limit(1).maybeSingle(), 'find memory');
  if (!existing) {
    await one(db.from('memories').insert({ user_id: user.id, project_id: item.project ? projectIds.get(item.project) : null, content: item.content, memory_type: item.type, importance: item.importance, confidence: 1, source_type: 'imported', source_id: sourceId, status: 'active', embedding: null }).select().single(), 'create memory');
  }
}

for (const item of profileFacts) {
  const sourceId = sourceMessages[item.source].id;
  const existing = await maybe(db.from('profile_facts').select('*').eq('user_id', user.id).eq('category', item.category).eq('content', item.content).limit(1).maybeSingle(), 'find profile fact');
  if (!existing) {
    await one(db.from('profile_facts').insert({ user_id: user.id, category: item.category, content: item.content, confidence: 1, source_type: 'imported', source_id: sourceId, importance: item.importance, status: 'active', embedding: null }).select().single(), 'create profile fact');
  }
}

for (let index = 0; index < sourceMessages.length; index += 1) {
  const message = sourceMessages[index];
  const existing = await maybe(db.from('extraction_runs').select('*').eq('message_id', message.id).eq('model', 'curated-bootstrap-v1').limit(1).maybeSingle(), 'find bootstrap audit');
  if (!existing) {
    await one(db.from('extraction_runs').insert({ user_id: user.id, message_id: message.id, status: 'succeeded', model: 'curated-bootstrap-v1', raw_output: { external_conversation_id: sources[index].externalId, review_policy: 'explicit user statements authoritative; assistant analysis contextual only' }, candidate_count: projects.length + decisions.filter((d) => d.source === index).length + memories.filter((m) => m.source === index).length + profileFacts.filter((f) => f.source === index).length, written_count: 0, rejected: [], finished_at: new Date().toISOString() }).select().single(), 'create bootstrap audit');
  }
}

const sourceIds = sourceMessages.map((message) => message.id);
const [projectCheck, decisionCheck, memoryCheck, factCheck, auditCheck] = await Promise.all([
  db.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('name', projects.map((project) => project.name)),
  db.from('decisions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('source_id', sourceIds),
  db.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('source_id', sourceIds),
  db.from('profile_facts').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('source_id', sourceIds),
  db.from('extraction_runs').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('model', 'curated-bootstrap-v1'),
]);
for (const [label, result] of [['projects', projectCheck], ['decisions', decisionCheck], ['memories', memoryCheck], ['profile facts', factCheck], ['audit records', auditCheck]]) {
  if (result.error) throw new Error(`verify ${label}: ${result.error.message}`);
}
console.log(`Verified: ${projectCheck.count} projects, ${decisionCheck.count} decisions, ${memoryCheck.count} memories, ${factCheck.count} profile facts, ${auditCheck.count} source audits.`);
console.log('Bootstrap import complete. Re-running is safe and updates the curated project snapshot without duplicating records.');
