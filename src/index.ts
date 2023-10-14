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
  rectangularSelection,
  ViewUpdate
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
import {
  Line,
  mathjsResultsPlugin,
  recalculateEffect,
  Result
} from './widgets/mathjsResultsPlugin.js'
import { debounce, isEqual, last } from 'lodash-es'

const recalculateDelay = 500 // ms

const localStorageKey = 'mathjs-codemirror-expressions'

const defaultExpressions = `1.2 * (2 + 4.5)

12.7 cm to inch

sin(45 deg) ^ 2

9 / 3 + 2i

det([-1, 2; 3, 1])

simplify('5x + 2x + 240/2.5')
`

function init() {
  const math = create(all)

  let scope = new Map()

  function splitLines(expressions: string): Line[] {
    return expressions.split('\n').reduce((all, text, index) => {
      const prevLine = last(all)
      const pos = (prevLine ? prevLine.pos + 1 : 0) + text.length
      const line = { pos, index, text }
      return [...all, line]
    }, [])
  }

  let prevResults: Result[] = []

  function recalculate() {
    console.time('recalculate')
    const expressions = editor.state.doc.toString()
    localStorage[localStorageKey] = expressions

    const lines = splitLines(expressions)

    const results = lines
      .filter((line) => line.text.trim() !== '')
      .map((line, index) => {
        const scopeBefore = scope
        scope = cloneScope(scope)
        const prevResult: Result | undefined = prevResults[index]

        // TODO: we can make checking for changes smarter by collecting the used
        //  symbols from the expression and filtering the scope on the used symbols
        if (
          prevResult &&
          isEqual(prevResult.line.text, line.text) &&
          isEqual(prevResult.scopeBefore, scopeBefore)
        ) {
          // no changes, use previous result
          scope = prevResult.scopeAfter

          return { ...prevResult, line }
        } else {
          // evaluate
          const { answer, error } = tryEvaluate(line, scope)
          const scopeAfter = scope

          return { line, scopeBefore, scopeAfter, answer, error }
        }
      })

    prevResults = results

    editor.dispatch({
      effects: recalculateEffect.of(results)
    })

    console.timeEnd('recalculate')
  }

  function tryEvaluate(line: Line, scope: Map<string, unknown>) {
    try {
      console.log('evaluate', line)
      return {
        answer: line.text.trim() !== '' ? math.evaluate(line.text, scope) : undefined,
        error: undefined
      }
    } catch (error) {
      return {
        answer: undefined,
        error
      }
    }
  }

  function cloneScope(scope: Map<string, unknown>): Map<string, unknown> {
    const clone = new Map<string, unknown>()

    scope.forEach((value, key) => {
      clone.set(key, math.clone(value))
    })

    return clone
  }

  const recalculateDebounced = debounce(recalculate, recalculateDelay)

  const state = EditorState.create({
    doc:
      localStorage[localStorageKey] !== undefined
        ? localStorage[localStorageKey]
        : defaultExpressions,
    extensions: [
      StreamLanguage.define(mathjsLang(math, Array.from(scope.keys()))),
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
      mathjsResultsPlugin({ format: math.format }),
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
      }),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          console.log('docChanged')
          recalculateDebounced()
        }
      })
    ]
  })

  const editorDiv = document.getElementById('editor')
  const editor = new EditorView({
    state,
    parent: editorDiv
  })

  const resetLink = document.getElementById('reset')
  resetLink.addEventListener('click', () => {
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: defaultExpressions
      }
    })
    recalculate()
  })

  recalculate()
}

init()
