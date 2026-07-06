import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <Card className="w-full max-w-md border-emerald-500 border-2">
        <CardHeader>
          <CardTitle className="text-emerald-600">Bootstrapped</CardTitle>
          <CardDescription>
            Issue #2 — stack scaffold. The shell deploys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Vite + React 18 + TypeScript + Tailwind + Firebase emulator suite.
            No auth, no routes — yet. Later slices fill this in.
          </p>
          <div className="mt-4 h-2 w-full rounded bg-emerald-500" />
        </CardContent>
      </Card>
    </main>
  );
}