'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Inscription publique désactivée — redirection login. */
export default function AuthPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return null;
}
