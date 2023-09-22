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
  syntaxHighlighting
} from '@codemirror/language'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap
} from '@codemirror/autocomplete'
import debounce from 'lodash-es/debounce.js'

const debounceDelayMs = 300

const initialText = `1.2 * (2 + 4.5)
12.7 cm to inch
sin(45 deg) ^ 2
9 / 3 + 2i
det([-1, 2; 3, 1])
`

function createCodeMirrorView(target) {
  function calc(state) {
    const expressions = state.doc.toString()

    console.log('evaluate expressions', { expressions })

    try {
      const results = window.math.evaluate(expressions)
      console.log('results', results)
    } catch (err) {
      console.error(err)
    }
    // TODO: show the results/error on screen
  }

  const calcDebounced = debounce(calc, debounceDelayMs)

  const state = EditorState.create({
    doc: initialText,
    extensions: [
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
    parent: target
  })
}

function init() {
  const target = document.getElementById('editor')

  createCodeMirrorView(target)
}

init()
