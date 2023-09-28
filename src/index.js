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
  syntaxHighlighting,
  StreamLanguage
} from '@codemirror/language'

import { mathjsLang } from './mathjs-lang.js'

import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  CompletionContext
} from '@codemirror/autocomplete'
import debounce from 'lodash-es/debounce.js'
import { create, all } from 'mathjs'

const debounceDelayMs = 300

const initialText = `1.2 * (2 + 4.5)

12.7 cm to inch

sin(45 deg) ^ 2

9 / 3 + 2i

det([-1, 2; 3, 1])
`

function createCodeMirrorView(editorDiv, resultsDiv) {
  const math = create(all)

  function calc(state) {
    const expressions = state.doc.toString()

    const scope = {}
    const results = expressions.split('\n').map((expression) => {
      try {
        const result = math.evaluate(expression, scope)
        return { expression, result, error: undefined }
      } catch (error) {
        return { expression, result: undefined, error }
      }
    })

    console.log('evaluate expressions', { expressions, results })

    // TODO: show the results/error inline in the editor
    resultsDiv.innerText = results
      .map(({ expression, result, error }) => {
        return expression.trim() === '' ? '' : error ? String(error) : math.format(result)
      })
      .join('\n')
  }

  const calcDebounced = debounce(calc, debounceDelayMs)

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
      // highlighter, // TODO
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          calcDebounced(update.state)
        }
      }),
      // TODO: set mathjs language or mode in CodeMirror,
      search({
        top: true
      })
    ]
  })

  calc(state)

  return new EditorView({
    state,
    parent: editorDiv
  })
}

function init() {
  const editorDiv = document.getElementById('editor')
  const resultsDiv = document.getElementById('results')

  createCodeMirrorView(editorDiv, resultsDiv)
}

init()
