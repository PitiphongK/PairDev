'use client'

import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
} from '@heroui/react'

import { Languages, languageOptions } from '@/interfaces/languages'
import { getLanguageIcon } from '@/components/editor/get-language-icon'

interface LanguageSelectorProps {
  /** Currently selected language */
  language: Languages
  /** Callback when language changes */
  onLanguageChange: (language: Languages) => void
  /** Whether the selector is disabled */
  disabled?: boolean
  /** Additional class names */
  className?: string
}

/**
 * Dropdown component for selecting the editor language
 */
export default function LanguageSelector({
  language,
  onLanguageChange,
  disabled = false,
  className = '',
}: LanguageSelectorProps) {
  return (
    <div
      className={`absolute bottom-4 right-4 z-10 ${className} ${disabled ? 'opacity-60 pointer-events-none' : ''
        }`}
      aria-disabled={disabled}
    >
      <Dropdown placement="bottom-end" className='rounded-xl border-1 border-neutral-700'>
        <DropdownTrigger>
          <Button
            className="capitalize bg-surface-secondary hover:bg-surface-elevated text-text-primary"
            variant="bordered"
            isDisabled={disabled}
            startContent={getLanguageIcon(language)}
          >
            {language}
          </Button>
        </DropdownTrigger>
        <DropdownMenu
          disallowEmptySelection
          aria-label="Language selection"
          selectedKeys={[language]}
          selectionMode="single"
          variant="flat"
          items={languageOptions}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] as Languages
            onLanguageChange(selected)
          }}
        >
          {(option) => (
            <DropdownItem key={option.value} startContent={getLanguageIcon(option.value)}>
              {option.label}
            </DropdownItem>
          )}
        </DropdownMenu>
      </Dropdown>
    </div>
  )
}
