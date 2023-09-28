import { EditorState } from '@codemirror/state'
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { lintGutter, lintKeymap } from '@codemirror/lint'
import {
  bracketMatching,
  defaultHighlightStyle,
  foldKeymap,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting
} from '@codemirror/language'

import { mathjsLang } from './mathjs-lang.js'

import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import { all, create } from 'mathjs'
import { mathjsResultsDecorator } from './widgets/mathjsResultsDecorator.js'

const initialText = `1.2 * (2 + 4.5)

12.7 cm to inch

sin(45 deg) ^ 2

9 / 3 + 2i

det([-1, 2; 3, 1])
`

function createCodeMirrorView(editorDiv: HTMLElement) {
  const math = create(all)

  const state = EditorState.create({
    doc: initialText,
    extensions: [
      StreamLanguage.define(mathjsLang(math)),
      keymap.of([indentWithTab]),
      lintGutter(),
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      mathjsResultsDecorator(math),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap
      ]),
      search({
        top: true
      })
    ]
  })

  return new EditorView({
    state,
    parent: editorDiv
  })
}

function init() {
  const editorDiv = document.getElementById('editor')

  createCodeMirrorView(editorDiv)
}

init()
