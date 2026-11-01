'use client';

import { useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Turn = { question: string; answer: string; tools: string[] };

export function ChatBox() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const result = await response.json();
      if (result.ok) {
        setTurns((all) => [...all, { question: message, answer: result.data.text, tools: result.data.toolsCalled }]);
        setMessage('');
      } else {
        setError(result.error.message);
      }
    } catch {
      setError('Gagal menghubungi server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      {turns.map((turn, index) => (
        <div key={index} className="space-y-2 rounded-lg border p-3 text-sm">
          <p className="font-medium">{turn.question}</p>
          <p className="whitespace-pre-wrap">{turn.answer}</p>
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant="secondary">Dibuat AI</Badge>
            {turn.tools.map((tool, toolIndex) => (
              <Badge key={toolIndex} variant="outline">
                {tool}
              </Badge>
            ))}
          </div>
        </div>
      ))}
      <form onSubmit={ask} className="flex gap-2">
        <Input
          aria-label="Pertanyaan"
          placeholder="Tanya soal invoice dan pembayaran"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <Button type="submit" disabled={busy || message.trim() === ''}>
          {busy ? 'Mencari…' : 'Tanya'}
        </Button>
      </form>
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
