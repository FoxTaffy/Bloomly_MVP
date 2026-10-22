#!/usr/bin/env node
// Публикует пост в GitHub Discussions (GraphQL). Нужны GITHUB_TOKEN (discussions: write) и GITHUB_REPOSITORY.
//   post-discussion.mjs --title T --body-file F [--category 'update|announce|новост|обнов'] [--label updates] [--dry-run]
// Повторный запуск с тем же маркером <!-- bloomly-release:X --> новый пост не создаёт.
import { readFileSync } from 'node:fs';
import { assertPublicSafe } from './lib/release.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const title = flag('--title');
const body = readFileSync(flag('--body-file'), 'utf8');
const categoryRe = new RegExp(flag('--category', 'update|announce|новост|обнов'), 'i');
const labelName = flag('--label', 'updates');
const dry = args.includes('--dry-run');
if (!title || !body) { console.error('usage: --title T --body-file F'); process.exit(2); }
assertPublicSafe(`${title}\n${body}`);

if (dry) { console.log(`# ${title}\n\n${body}`); process.exit(0); }
const token = process.env.GITHUB_TOKEN;
const [owner, name] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
if (!token || !owner || !name) { console.error('нужны GITHUB_TOKEN и GITHUB_REPOSITORY'); process.exit(2); }

async function gql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '));
  return json.data;
}

const repo = (await gql(`query($o:String!,$n:String!){repository(owner:$o,name:$n){
  id hasDiscussionsEnabled
  discussionCategories(first:25){nodes{id name}}
  labels(first:100){nodes{id name}}
  discussions(first:30,orderBy:{field:CREATED_AT,direction:DESC}){nodes{body}}
}}`, { o: owner, n: name })).repository;

if (!repo.hasDiscussionsEnabled) { console.error('В репозитории выключены Discussions'); process.exit(1); }
const marker = /<!-- bloomly-release:[^>]+ -->/.exec(body)?.[0];
if (marker && repo.discussions.nodes.some((d) => d.body.includes(marker))) { console.log('Пост для этой версии уже есть — пропуск'); process.exit(0); }
const category = repo.discussionCategories.nodes.find((c) => categoryRe.test(c.name));
if (!category) { console.error(`Нет категории по шаблону ${categoryRe}; есть: ${repo.discussionCategories.nodes.map((c) => c.name).join(', ')}`); process.exit(1); }

const created = (await gql(`mutation($r:ID!,$c:ID!,$t:String!,$b:String!){createDiscussion(input:{repositoryId:$r,categoryId:$c,title:$t,body:$b}){discussion{id url}}}`,
  { r: repo.id, c: category.id, t: title, b: body })).createDiscussion.discussion;
const label = repo.labels.nodes.find((l) => l.name.toLowerCase() === labelName.toLowerCase());
if (label) await gql(`mutation($i:ID!,$l:[ID!]!){addLabelsToLabelable(input:{labelableId:$i,labelIds:$l}){clientMutationId}}`, { i: created.id, l: [label.id] });
console.log(`Опубликовано: ${created.url}`);
