// node --test scripts/agents/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanText } from '../lib/secrets.mjs';
import { formatMessage, parseHeader } from '../lib/commit.mjs';
import { bump, parseVersion, withVersion, formatVersion } from '../lib/version.mjs';
import { classify, groupByBranch } from '../lib/branches.mjs';
import { measure, compose, assertPublicSafe, titleFor } from '../lib/release.mjs';

// Образцы собираются из частей, чтобы сам тест не срабатывал на сканер.
const fake = (...p) => p.join('');

test('secrets: находит токены по формату и не печатает значение', () => {
  const ghp = fake('ghp_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8');
  const hits = scanText('src/a.ts', `const t = '${ghp}'`);
  assert.equal(hits[0].rule, 'github-token');
  assert.ok(!JSON.stringify(hits).includes(ghp));
  assert.equal(scanText('a.ts', `k = "${fake('sk-', 'ant-api03-', 'A'.repeat(30))}"`)[0].rule, 'anthropic-key');
  assert.equal(scanText('a.pem', fake('-----BEGIN RSA ', 'PRIVATE KEY-----'))[0].rule, 'private-key');
});

test('secrets: .env запрещён, .env.example — нет', () => {
  assert.equal(scanText('backend/.env', 'A=1')[0].rule, 'env-file');
  assert.equal(scanText('backend/.env.example', 'A=1').length, 0);
});

test('secrets: плейсхолдеры, ссылки на env и тестовые файлы не шумят', () => {
  assert.equal(scanText('a.ts', 'const password = process.env.DB_PASSWORD_VALUE').length, 0);
  assert.equal(scanText('a.ts', 'JWT_SECRET=your-secret-here-change-me').length, 0);
  assert.equal(scanText('a.ts', 'tokenUrl = "https://oauth.example.com/token"').length, 0);
  assert.equal(scanText('backend/test/a.test.ts', 'const password = "Xk9mQ2vLp7Zr4Tw"').length, 0);
});

test('secrets: присваивание с реальным значением ловится, ignore-комментарий снимает', () => {
  const line = `const apiKey = "${fake('q8Zk3', 'Lm9Xv2', 'Bn7Rt4Wy')}"`;
  assert.match(scanText('src/a.ts', line)[0].rule, /^assignment:/);
  assert.equal(scanText('src/a.ts', `${line} // secret-scan:ignore`).length, 0);
});

test('secrets: пароль в URL подключения', () => {
  const url = `DATABASE_URL=postgresql://app:${fake('Zx8Vb2', 'Nm4Qw9')}@db:5432/app`;
  assert.equal(scanText('src/a.ts', url)[0].rule, 'url-credentials');
  assert.equal(scanText('src/a.ts', 'DATABASE_URL=postgresql://app:${PASSWORD}@db:5432/app').length, 0);
});

test('commit: уже правильный заголовок сохраняется, тема — со строчной буквы без точки', () => {
  const r = formatMessage({ message: 'feat(Orders): Счёт при принятии заявки.\n' });
  assert.equal(r.message, 'feat(orders): счёт при принятии заявки\n');
});

test('commit: тип берётся из ветки, затем из слов, область — из путей', () => {
  const paths = ['backend/src/modules/groups/service.ts', 'backend/src/modules/groups/routes.ts'];
  assert.equal(formatMessage({ message: 'Правка очереди', branch: 'fix/support-tickets', stagedPaths: paths }).message, 'fix(groups): правка очереди\n');
  assert.equal(formatMessage({ message: 'Добавил экспорт', branch: 'main', stagedPaths: paths }).message, 'feat(groups): добавил экспорт\n');
  assert.equal(formatMessage({ message: 'обновил', branch: 'main', stagedPaths: [] }).message, 'chore: обновил\n');
});

test('commit: аббревиатуры не ломаются, тело нормализуется, служебные сообщения не трогаем', () => {
  assert.equal(formatMessage({ message: 'fix: API возвращал 500' }).message, 'fix: API возвращал 500\n');
  assert.equal(formatMessage({ message: 'fix: a\nbody  \n\n\n\nmore\n\n# комментарий git' }).message, 'fix: a\n\nbody\n\nmore\n');
  assert.equal(formatMessage({ message: 'Merge branch main' }).changed, false);
});

test('commit: ! и BREAKING CHANGE распознаются', () => {
  assert.equal(parseHeader('feat(api)!: новый формат').breaking, true);
  assert.equal(parseHeader('feat: x\n\nBREAKING CHANGE: убрали поле').breaking, true);
  assert.equal(parseHeader('feat: x').breaking, false);
});

test('version: patch/minor/major считаются от базы и пишутся в package.json точечно', () => {
  const v = parseVersion('{\n  "name": "x",\n  "version": "5.2.256",\n  "dep": {"version": "1.0.0"}\n}');
  assert.equal(formatVersion(bump(v)), '5.2.257');
  assert.equal(formatVersion(bump(v, 'minor')), '5.3.0');
  assert.equal(formatVersion(bump(v, 'major')), '6.0.0');
  const out = withVersion('{"version": "5.2.256", "d": {"version": "1.0.0"}}', bump(v));
  assert.equal(out, '{"version": "5.2.257", "d": {"version": "1.0.0"}}');
});

test('branches: тип и область → ветка', () => {
  assert.equal(classify({ message: 'feat(orders): счёт' }).branch, 'feat/orders');
  assert.equal(classify({ message: 'security(auth): x' }).branch, 'fix/auth');
  assert.equal(classify({ message: 'правка', paths: ['backend/src/modules/wallet/a.ts', 'backend/src/modules/wallet/b.ts'] }).branch, 'chore/wallet');
  assert.equal(classify({ title: 'Не открывается чат', labels: ['bug'] }).branch, 'fix/misc');
  const g = groupByBranch([{ message: 'feat(a): 1' }, { message: 'fix(b): 2' }, { message: 'feat(a): 3' }]);
  assert.deepEqual([...g.keys()], ['feat/a', 'fix/b']);
  assert.equal(g.get('feat/a').length, 2);
});

test('release: масштаб — patch для правок, feature для крупных feat, major для breaking', () => {
  const files = (n) => Array.from({ length: n }, (_, i) => `f${i}.ts`);
  assert.equal(measure([{ message: 'fix: a', paths: files(20) }]).scale, 'patch');
  assert.equal(measure([{ message: 'feat: a', paths: files(2) }]).scale, 'patch');
  assert.equal(measure([{ message: 'feat(orders): a', paths: files(8) }]).scale, 'feature');
  assert.equal(measure([{ message: 'fix!: a', paths: [] }]).scale, 'major');
});

test('release: текст группирует по разделам, прячет детали security, проходит проверку', () => {
  const commits = [
    { message: 'feat(orders): счёт при принятии', paths: [] },
    { message: 'fix(chat): сообщения не терялись', paths: [] },
    { message: 'security(auth): закрыт обход 2FA через X', paths: [] },
  ];
  const body = compose({ commits, version: '5.3.0', scale: 'feature', date: '2026-10-22' });
  assert.match(body, /### ✨ Новое[\s\S]*\*\*Заказы:\*\* счёт при принятии/);
  assert.match(body, /### 🛠 Исправлено/);
  assert.ok(!body.includes('2FA'), 'детали уязвимости не публикуются');
  assert.match(body, /Усилили защиту/);
  assert.doesNotThrow(() => assertPublicSafe(body));
  assert.throws(() => assertPublicSafe('смотри backend/src/modules/x'), /пути/);
  assert.ok(titleFor({ commits, version: '5.3.0', scale: 'feature' }).startsWith('Bloomly 5.3.0: Счёт'));
});
