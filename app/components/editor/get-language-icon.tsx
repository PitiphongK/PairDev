'use client'

import { Languages } from '@/app/interfaces/languages'

export function getLanguageIcon(value: Languages) {
  switch (value) {
    case Languages.JAVASCRIPT:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg"
          width={14}
          height={14}
          alt="JavaScript"
        />
      )
    case Languages.TYPESCRIPT:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg"
          width={14}
          height={14}
          alt="TypeScript"
        />
      )
    case Languages.PYTHON:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg"
          width={14}
          height={14}
          alt="Python"
        />
      )
    case Languages.JAVA:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/java/java-original.svg"
          width={14}
          height={14}
          alt="Java"
        />
      )
    case Languages.C:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/c/c-original.svg"
          width={14}
          height={14}
          alt="C"
        />
      )
    case Languages.CPP:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/cplusplus/cplusplus-original.svg"
          width={14}
          height={14}
          alt="C++"
        />
      )
    case Languages.CSHARP:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/csharp/csharp-original.svg"
          width={14}
          height={14}
          alt="C#"
        />
      )
    case Languages.GO:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/go/go-original-wordmark.svg"
          width={14}
          height={14}
          alt="Go"
        />
      )
    case Languages.RUST:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/rust/rust-original.svg"
          width={14}
          height={14}
          alt="Rust"
        />
      )
    case Languages.RUBY:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/ruby/ruby-original.svg"
          width={14}
          height={14}
          alt="Ruby"
        />
      )
    case Languages.PHP:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/php/php-original.svg"
          width={14}
          height={14}
          alt="PHP"
        />
      )
    case Languages.BASH:
      return (
        <img
          src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/bash/bash-original.svg"
          width={14}
          height={14}
          alt="Bash"
        />
      )
    default:
      return null
  }
}
