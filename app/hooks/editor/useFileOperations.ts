/**
 * Hook for file import/export operations
 */

import { useCallback } from 'react'
import { addToast } from '@heroui/toast'

import { Languages, languageExtensions} from '@/interfaces/languages'

interface UseFileOperationsOptions {
  /** Reference to the Monaco editor instance */
  editorRef: React.RefObject<import('monaco-editor').editor.IStandaloneCodeEditor | null>
  /** Reference to the Yjs document for synced content writes */
  ydocRef: React.RefObject<import('yjs').Doc | null>
  /** Key used to get the shared Y.Text from the Yjs doc */
  ytextKey: string
  /** Current language for file extension */
  language: Languages
  /** Room ID for file naming */
  roomId: string
  /** Optional callback to update language when importing a file.
   *  Receives (language, skipContentReset) — pass true to avoid
   *  overwriting the just-imported content with starter code. */
  onLanguageChange?: (language: Languages, skipContentReset: boolean) => void
}

interface UseFileOperationsReturn {
  /** Export editor content to a file */
  handleExport: () => void
  /** Import content from a local file */
  handleFileImport: (event: React.ChangeEvent<HTMLInputElement>) => void
  /** Import content from a GitHub repository */
  handleGitHubImport: (repoUrl: string, filePath?: string) => Promise<void>
}

/**
 * Manages file import and export operations for the editor
 */
export function useFileOperations({
  editorRef,
  ydocRef,
  ytextKey,
  language,
  roomId,
  onLanguageChange,
}: UseFileOperationsOptions): UseFileOperationsReturn {
  const getLanguageFromFilename = (filename?: string | null): Languages | null => {
    if (!filename) return null
    const ext = filename.split('.').pop()?.toLowerCase()
    if (!ext) return null

    switch (ext) {
      case 'js':
        return Languages.JAVASCRIPT
      case 'ts':
        return Languages.TYPESCRIPT
      case 'py':
        return Languages.PYTHON
      default:
        return null
    }
  }
  // Export editor content to file
  const handleExport = useCallback(() => {
    if (!editorRef.current) return

    const fileExtension = languageExtensions[language] || '.txt'
    const content = editorRef.current.getValue()
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `codelink-room-${roomId}${fileExtension}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [editorRef, language, roomId])

  // Import content from local file
  const handleFileImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const raw = e.target?.result as string
        // Normalise line endings to LF before writing into Y.Text
        const content = raw.replace(/\r\n/g, '\n')
        const ydoc = ydocRef.current
        if (ydoc) {
          const ytext = ydoc.getText(ytextKey)
          ydoc.transact(() => {
            ytext.delete(0, ytext.length)
            ytext.insert(0, content)
          })
        } else {
          // Fallback if Yjs isn't ready yet
          editorRef.current?.setValue(content)
        }
        // Switch language metadata AFTER writing content, with skipContentReset=true
        // so handleLanguageChange doesn't overwrite the imported content with starter code
        const detected = getLanguageFromFilename(file.name)
        if (detected && detected !== language) {
          onLanguageChange?.(detected, true)
        }
      }
      reader.readAsText(file)
    },
    [editorRef, ydocRef, ytextKey, language, onLanguageChange]
  )

  // Import content from GitHub
  const handleGitHubImport = useCallback(
    async (repoUrl: string, filePath?: string) => {
      try {
        const response = await fetch('/api/github/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl, filePath }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to import from GitHub')
        }

        const data = await response.json()

        if (data.type === 'file') {
          // Normalise line endings then write directly into Y.Text so all
          // peers receive the imported content rather than just the local editor.
          const content = (data.content as string).replace(/\r\n/g, '\n')
          const ydoc = ydocRef.current
          if (ydoc) {
            const ytext = ydoc.getText(ytextKey)
            ydoc.transact(() => {
              ytext.delete(0, ytext.length)
              ytext.insert(0, content)
            })
          } else {
            editorRef.current?.setValue(content)
          }

          // Switch language metadata AFTER writing content, with skipContentReset=true
          // so handleLanguageChange doesn't overwrite the imported content with starter code
          const detected = getLanguageFromFilename(data.filename || filePath)
          if (detected && detected !== language) {
            onLanguageChange?.(detected, true)
          }

          addToast({
            title: 'Import successful',
            description: `Imported ${data.filename} from GitHub`,
            color: 'success',
            variant: 'solid',
            timeout: 3000,
          })
        } else if (data.type === 'list') {
          addToast({
            title: 'Choose a file',
            description: 'Please specify a file path in the repository',
            color: 'warning',
            variant: 'solid',
            timeout: 4000,
          })
        }
      } catch (error) {
        console.error('GitHub import error:', error)
        throw error
      }
    },
    [editorRef, ydocRef, ytextKey, language, onLanguageChange]
  )

  return {
    handleExport,
    handleFileImport,
    handleGitHubImport,
  }
}
