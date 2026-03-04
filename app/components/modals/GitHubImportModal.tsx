'use client'

import React from 'react'
import { useCallback, useState } from 'react'

import {
  Button,
  Divider,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@heroui/react'
import {
  ChevronLeft,
  Code2,
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderGit2,
  Github,
} from 'lucide-react'

interface GitHubFile {
  name: string
  path: string
  type: 'file' | 'dir'
  download_url?: string
  size?: number
}

interface Props {
  isOpen: boolean
  onClose: () => void
  onImport: (repoUrl: string, path?: string) => Promise<void>
}

function getFileIcon(filename: string, isDir: boolean) {
  if (isDir) return <Folder size={16} className="text-blue-500" />

  const ext = filename.split('.').pop()?.toLowerCase() || ''

  const iconMap: Record<string, React.ReactElement> = {
    js: <Code2 size={16} className="text-yellow-500" />,
    jsx: <Code2 size={16} className="text-yellow-500" />,
    ts: <Code2 size={16} className="text-blue-500" />,
    tsx: <Code2 size={16} className="text-blue-500" />,
    py: <Code2 size={16} className="text-blue-600" />,
    json: <FileJson size={16} className="text-amber-500" />,
    css: <FileCode size={16} className="text-pink-500" />,
    html: <FileCode size={16} className="text-red-500" />,
    md: <FileText size={16} className="text-gray-500" />,
    txt: <FileText size={16} className="text-gray-500" />,
  }

  return iconMap[ext] || <File size={16} className="text-gray-400" />
}

export default function GitHubImportModal({
  isOpen,
  onClose,
  onImport,
}: Props) {
  const [repoUrl, setRepoUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [files, setFiles] = useState<GitHubFile[]>([])
  const [currentPath, setCurrentPath] = useState('')
  const [browsing, setBrowsing] = useState(false)

  const handleBrowse = useCallback(async () => {
    if (!repoUrl.trim()) {
      setError('Please enter a GitHub repository URL')
      return
    }

    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim(), action: 'list' }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to browse repository')
      }

      const data = await response.json()
      setFiles(data.files || [])
      setCurrentPath(data.currentPath || '')
      setBrowsing(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to browse repository'
      )
    } finally {
      setLoading(false)
    }
  }, [repoUrl])

  const handleNavigateToFolder = useCallback(
    async (folderPath: string) => {
      setLoading(true)
      setError('')

      try {
        const response = await fetch('/api/github/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repoUrl: repoUrl.trim(),
            filePath: folderPath,
            action: 'list',
          }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to load folder')
        }

        const data = await response.json()
        setFiles(data.files || [])
        setCurrentPath(data.currentPath || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load folder')
      } finally {
        setLoading(false)
      }
    },
    [repoUrl]
  )

  const handleSelectFile = useCallback(
    async (filePath: string) => {
      setLoading(true)
      setError('')

      try {
        await onImport(repoUrl.trim(), filePath)
        // Reset form
        setRepoUrl('')
        setFiles([])
        setCurrentPath('')
        setBrowsing(false)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import file')
      } finally {
        setLoading(false)
      }
    },
    [repoUrl, onImport, onClose]
  )

  const handleGoBack = useCallback(() => {
    if (currentPath) {
      const parts = currentPath.split('/').filter(Boolean)
      parts.pop()
      const parentPath = parts.join('/')
      handleNavigateToFolder(parentPath)
    }
  }, [currentPath, handleNavigateToFolder])

  const handleClose = useCallback(() => {
    if (!loading) {
      setRepoUrl('')
      setFiles([])
      setCurrentPath('')
      setBrowsing(false)
      setError('')
      onClose()
    }
  }, [loading, onClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        <ModalHeader className="flex gap-2 items-center">
          <Github size={20} />
          <span>Import from GitHub</span>
        </ModalHeader>
        <ModalBody>
          <div className="flex flex-col gap-4">
            {!browsing ? (
              <>
                <Input
                  label="GitHub Repository URL"
                  placeholder="https://github.com/username/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  startContent={<FolderGit2 size={16} />}
                  isDisabled={loading}
                  description="Enter repository URL or full link (e.g., with /tree/main/folder)"
                />
                {error && (
                  <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    {error}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {currentPath ? `📁 ${currentPath}` : '📁 Repository Root'}
                  </div>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onPress={() => {
                      setBrowsing(false)
                      setFiles([])
                      setCurrentPath('')
                    }}
                  >
                    ✕
                  </Button>
                </div>
                <Divider />
                {files.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    No files found
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 max-h-96 overflow-y-auto">
                    {currentPath && (
                      <Button
                        fullWidth
                        variant="light"
                        className="justify-start"
                        onPress={handleGoBack}
                        isDisabled={loading}
                        startContent={<ChevronLeft size={16} />}
                      >
                        ..
                      </Button>
                    )}
                    {files.map((file) => (
                      <Button
                        key={file.path}
                        fullWidth
                        variant="light"
                        className="justify-start"
                        onPress={() => {
                          if (file.type === 'dir') {
                            handleNavigateToFolder(file.path)
                          } else {
                            handleSelectFile(file.path)
                          }
                        }}
                        isDisabled={loading}
                        startContent={getFileIcon(
                          file.name,
                          file.type === 'dir'
                        )}
                      >
                        {file.name}
                        {file.type === 'file' && file.size && (
                          <span className="text-xs text-gray-500 ml-auto">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </Button>
                    ))}
                  </div>
                )}
                {error && (
                  <div className="text-red-500 text-sm bg-red-50 dark:bg-red-900/20 p-2 rounded">
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={handleClose} isDisabled={loading}>
            Cancel
          </Button>
          {!browsing && (
            <Button
              color="primary"
              onPress={handleBrowse}
              isDisabled={loading || !repoUrl.trim()}
              startContent={
                loading ? <Spinner size="sm" /> : <Github size={16} />
              }
            >
              {loading ? 'Loading...' : 'Browse'}
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
