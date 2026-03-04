/**
 * Constants for the collaborative editor
 */

// ============================================================================
// WebSocket Configuration
// ============================================================================

/** Yjs WebSocket server URL */
export const YJS_WEBSOCKET_URL = 
  process.env.NEXT_PUBLIC_YJS_WEBSOCKET_URL || 'wss://pairdev-yjs.onrender.com'

// ============================================================================
// Storage Keys
// ============================================================================

/** Keys for localStorage/sessionStorage */
export const STORAGE_KEYS = {
  /** Whether to hide the role notice modal */
  HIDE_ROLE_NOTICE: 'codelink:hideRoleNotice',
  /** User's display name */
  USER_NAME: 'userName',
} as const

// ============================================================================
// Timing Configuration
// ============================================================================

/** Interval (ms) for publishing analytics to other clients */
export const ANALYTICS_PUBLISH_INTERVAL_MS = 5000

/** Debounce delay (ms) for syncing layout changes */
export const LAYOUT_SYNC_DEBOUNCE_MS = 300

// ============================================================================
// Panel Layouts
// ============================================================================

/** Default horizontal panel sizes [left, right] as percentages */
export const DEFAULT_HORIZONTAL_LAYOUT = [50, 50] as const

/** Default vertical panel sizes [top, bottom] as percentages */
export const DEFAULT_VERTICAL_LAYOUT = [60, 40] as const

// ============================================================================
// Yjs Shared Document Keys
// ============================================================================

/** Keys for Yjs shared maps and text */
export const YJS_KEYS = {
  /** Monaco editor text content */
  MONACO_TEXT: 'monaco',
  /** User roles map */
  ROLES: 'roles',
  /** Room metadata map */
  ROOM: 'room',
  /** Panel layout map */
  PANELS: 'panels',
  /** Analytics data map */
  ANALYTICS: 'analytics',
} as const

/** Keys within the room map */
export const ROOM_MAP_KEYS = {
  OWNER: 'owner',
  OWNER_TOKEN: 'ownerToken',
  LANGUAGE: 'language',
  DESTROYED: 'destroyed',
  DESTROYED_AT: 'destroyedAt',
} as const

/** Keys within the panels map */
export const PANELS_MAP_KEYS = {
  HORIZONTAL: 'h',
  VERTICAL: 'v',
} as const

// ============================================================================
// Editor Defaults
// ============================================================================

/** Per-language hello world starter code */
export const LANGUAGE_STARTER_CODE: Record<string, string> = {
  javascript: `console.log('Hello world')\n`,
  typescript: `console.log('Hello world')\n`,
  python: `print("Hello world")\n`,
  java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello world");\n    }\n}\n`,
  c: `#include <stdio.h>\n\nint main() {\n    printf("Hello world\\n");\n    return 0;\n}\n`,
  cpp: `#include <iostream>\n\nint main() {\n    std::cout << "Hello world" << std::endl;\n    return 0;\n}\n`,
  csharp: `using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello world");\n    }\n}\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello world")\n}\n`,
  rust: `fn main() {\n    println!("Hello world");\n}\n`,
  ruby: `puts "Hello world"\n`,
  php: `<?php\necho "Hello world\\n";\n`,
  bash: `echo "Hello world"\n`,
}

/** Default code template — falls back to language starter or generic template */
export const getDefaultEditorContent = (roomId: string, language = 'javascript'): string =>
  LANGUAGE_STARTER_CODE[language] ?? `// Room: ${roomId}\nfunction add(a, b) { return a + b }\n`

/** Monaco editor options */
export const MONACO_EDITOR_OPTIONS = {
  automaticLayout: true,
  minimap: { enabled: false },
  wordWrap: 'on' as const,
  scrollBeyondLastLine: false,
  fontSize: 14,
} as const
