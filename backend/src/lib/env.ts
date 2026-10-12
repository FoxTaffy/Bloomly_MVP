// Единственное место, где решается, можно ли использовать dev-заглушки (секреты-фолбэки,
// фейковое пополнение баланса, подписки без оплаты, вывод кодов в лог).
// Правило «fail closed»: разрешено ТОЛЬКО при явном development/test. Отсутствующий или
// опечатанный NODE_ENV считается production. Раньше проверка была `!== 'production'` и при
// забытой переменной всё открывалось.
export function isDevEnv(): boolean {
  const env = process.env.NODE_ENV;
  return env === 'development' || env === 'test';
}
