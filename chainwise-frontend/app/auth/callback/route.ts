import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get('code');
  const next  = searchParams.get('next') ?? '/chat';

  if (code) {
    const supabase = await createClient(); // ← await required in Next.js 15
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Auth failed — redirect with error flag so login page can show a banner
  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}