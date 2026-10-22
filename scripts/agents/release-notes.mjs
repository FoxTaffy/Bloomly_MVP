#!/usr/bin/env node
// Release Notes agent. Печатает JSON {scale, version, title, body, post}.
//   release-notes.mjs A..B [--version X.Y.Z] [--no-llm]
// post=true — повод для поста в Discussions (крупная фича или major), для мелких правок поста нет.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { measure, compose, titleFor, assertPublicSafe, polish } from './lib/release.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const noLlm = args.includes('--no-llm') && !!args.splice(args.indexOf('--no-llm'), 1);
const versionArg = flag('--version');
const range = args[0];
if (!range) { console.error('usage: release-notes.mjs A..B [--version X.Y.Z] [--no-llm]'); process.exit(2); }

const git = (a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 26 });
const commits = git(['log', '--reverse', '--no-merges', '--format=%H%x00%B%x01', range])
  .split('\x01').map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, message] = r.split('\0');
    return { sha, message: message.trim(), paths: git(['show', '--name-only', '--format=', sha]).split('\n').filter(Boolean) };
  });

const version = versionArg ?? JSON.parse(readFileSync('frontend/package.json', 'utf8')).version;
const m = measure(commits);
let body = compose({ commits, version, scale: m.scale });
assertPublicSafe(body);
if (!noLlm) body = await polish(body, { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.RELEASE_NOTES_MODEL || undefined });

console.log(JSON.stringify({ ...m, version, title: titleFor({ commits, version, scale: m.scale }), body, post: m.scale !== 'patch' && commits.length > 0 }));
