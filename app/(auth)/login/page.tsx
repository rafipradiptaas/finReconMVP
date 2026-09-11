import Link from 'next/link';
import { signIn } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Masuk ke FinRecon AI</CardTitle>
        <CardDescription>Gunakan email dan kata sandi akun Anda.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signIn} className="flex flex-col gap-4">
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
              autoComplete="current-password"
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit">Masuk</Button>
        </form>
        <p className="text-muted-foreground mt-4 text-sm">
          Belum punya akun?{' '}
          <Link href="/register" className="underline">
            Daftar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
