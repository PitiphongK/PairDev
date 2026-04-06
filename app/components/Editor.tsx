'use client'
import { useEffect } from 'react'

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react'
import Editor from '@monaco-editor/react'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

import { Languages, languageOptions } from '@/interfaces/languages'

type Props = {
  roomId: string
  ydoc: Y.Doc | null
  provider: WebsocketProvider | null
  editorRef: React.MutableRefObject<
    import('monaco-editor').editor.IStandaloneCodeEditor | null
  >
  language: Languages
  setLanguage: (language: Languages) => void
}

export default function EditorComponent({
  roomId,
  ydoc,
  provider,
  editorRef,
  language,
  setLanguage,
}: Props) {
  const tabs = [
    {
      id: 'main',
      title: 'main',
      isActive: true,
    },
  ]

  const handleMount = (
    editor: import('monaco-editor').editor.IStandaloneCodeEditor
  ) => {
    editorRef.current = editor
  }

  useEffect(() => {
    if (editorRef.current && ydoc && provider) {
      const ytext = ydoc.getText('monaco')

      // Dynamically import y-monaco and create the binding
      import('y-monaco').then(({ MonacoBinding }) => {
        const model = editorRef.current?.getModel()
        if (model) {
          new MonacoBinding(
            ytext,
            model,
            new Set([editorRef.current!]),
            provider.awareness
          )
        }
      })
    }
  }, [editorRef, ydoc, provider, roomId])

  return (
    <div className="flex-1 relative h-full flex flex-col">
      <div className="flex items-center gap-2 h-10 px-3 border-b bg-surface-primary">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`px-3 py-1 text-sm rounded-md border transition-colors ${tab.isActive
                ? 'bg-surface-secondary border-border-strong text-text-primary'
                : 'bg-transparent border-transparent text-text-secondary hover:bg-surface-elevated'
              }`}
            aria-current={tab.isActive ? 'page' : undefined}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="flex-1 relative">
        <Editor
          height="100%"
          language={language}
          theme="vs-dark"
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            fontSize: 14,
          }}
          onMount={handleMount}
        />
        {/* overlay drawing component sits on top of the editor area */}
        {/* <EditorOverlayDrawing ydoc={ydoc} /> */}
        <div className="absolute bottom-4 right-4 z-10">
          <Dropdown>
            <DropdownTrigger>
              <Button className="capitalize" variant="bordered">
                {language}
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Language selection"
              selectedKeys={[language]}
              selectionMode="single"
              variant="flat"
              onSelectionChange={(key) => {
                const selected = key.currentKey?.toString() as Languages
                setLanguage(selected)
              }}
            >
              {languageOptions.map((option) => (
                <DropdownItem key={option.value}>{option.label}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        </div>
      </div>
    </div>
  )
}
