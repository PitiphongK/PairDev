import { NextRequest, NextResponse } from 'next/server'

const GLOT_LANGUAGE_MAP: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  csharp: 'csharp',
  go: 'go',
  rust: 'rust',
  ruby: 'ruby',
  php: 'php',
  bash: 'bash',
}

// Glot requires the filename to match the class name for Java
const GLOT_FILE_NAMES: Record<string, string> = {
  python: 'main.py',
  javascript: 'main.js',
  typescript: 'main.ts',
  java: 'Main.java',
  c: 'main.c',
  cpp: 'main.cpp',
  csharp: 'main.cs',
  go: 'main.go',
  rust: 'main.rs',
  ruby: 'main.rb',
  php: 'main.php',
  bash: 'main.sh',
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { language?: string; code?: string }
  const { language, code } = body

  const glotLang = GLOT_LANGUAGE_MAP[language ?? '']
  if (!glotLang) {
    return NextResponse.json({ error: `Unsupported language: ${language}` }, { status: 400 })
  }
  if (!code?.trim()) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 })
  }
  if (code.length > 200_000) {
    return NextResponse.json({ error: 'Code too large' }, { status: 400 })
  }

  const token = process.env.GLOT_API_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GLOT_API_TOKEN not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://glot.io/api/run/${glotLang}/latest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
      },
      body: JSON.stringify({
        files: [{ name: GLOT_FILE_NAMES[language ?? ''] ?? 'main', content: code }],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Glot API error: ${res.status} ${res.statusText}` },
        { status: 502 }
      )
    }

    const data = await res.json() as { stdout: string; stderr: string; error: string }
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
