'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn } from './lib/api';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn()) {
      router.push('/feed');
    } else {
      router.push('/auth/login');
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-zinc-400 text-sm">Загрузка...</div>
    </div>
  );
}
