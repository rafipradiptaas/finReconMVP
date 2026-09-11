import Link from 'next/link';
import { signUp } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  const { error, ok } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daftar</CardTitle>
        <CardDescription>
          Akun baru harus ditautkan ke organisasi oleh admin sebelum bisa dipakai.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signUp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Kata sandi
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {ok ? (
            <p role="status" className="text-sm">
              Akun dibuat. Cek email untuk konfirmasi, lalu minta admin menautkan akun Anda ke
              organisasi.
            </p>
          ) : null}
          <Button type="submit">Daftar</Button>
        </form>
        <p className="text-muted-foreground mt-4 text-sm">
          Sudah punya akun?{' '}
          <Link href="/login" className="underline">
            Masuk
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
