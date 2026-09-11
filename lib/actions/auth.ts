'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const credentials = z.object({
  email: z.email('Format email tidak valid'),
  // Length policy lives in Supabase (Authentication settings), not here.
  password: z.string().min(1, 'Kata sandi wajib diisi'),
});

function parse(formData: FormData) {
  return credentials.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
}

export async function signIn(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    redirect(`/login?error=${encodeURIComponent('Email atau kata sandi salah')}`);
  }

  revalidatePath('/', 'layout');
  redirect('/');
}

export async function signUp(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) {
    redirect(`/register?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }

  // No profile is created here: an admin links the account to an organization
  // (supabase/seed.sql). Until then the user sees the "belum ditautkan" page.
  redirect('/register?ok=1');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
