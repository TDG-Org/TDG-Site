import fs from 'node:fs'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import ts from 'typescript'

export function source(file) {
  return process.env.TDG_TEST_SOURCE_REF
    ? execFileSync('git', ['show', `${process.env.TDG_TEST_SOURCE_REF}:${file}`], { encoding: 'utf8' })
    : fs.readFileSync(file, 'utf8')
}

export function compile(file) {
  return ts.transpileModule(source(file), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText.replace(/import\.meta\.env\.[A-Z_]+/g, '"https://fixture.invalid"')
}

export function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

export const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

// Deterministic effect scheduling for account-response races. Browser replays
// cover React's real commit/effect cycle and the modal's scroll/focus lifecycle.
export function hooks() {
  const slots = []
  let cursor = 0
  let effects = []
  const React = {
    createContext: () => ({ Provider: 'Provider' }),
    useContext: () => null,
    useState(initial) {
      const i = cursor++
      slots[i] ??= { value: typeof initial === 'function' ? initial() : initial }
      return [slots[i].value, (v) => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useEffect(fn, deps) {
      const i = cursor++, prev = slots[i]
      if (!prev || deps.some((d, j) => !Object.is(d, prev.deps[j]))) {
        effects.push(() => { prev?.cleanup?.(); slots[i] = { deps, cleanup: fn() } })
      }
    },
    useMemo(fn, deps) {
      const i = cursor++, prev = slots[i]
      if (!prev || deps.some((d, j) => !Object.is(d, prev.deps[j]))) slots[i] = { deps, value: fn() }
      return slots[i].value
    },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps) },
  }
  return { React, render(fn) { cursor = 0; const value = fn(); const pending = effects; effects = []; pending.forEach((f) => f()); return value } }
}

export function component(file, react, stubs) {
  const module = { exports: {} }
  vm.runInNewContext(compile(file), {
    module, exports: module.exports, URLSearchParams, console,
    window: { location: { search: '', pathname: '/', hash: '' }, addEventListener() {}, removeEventListener() {}, setInterval: () => 1, clearInterval() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    require(id) {
      if (id === 'react') return react
      if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
      if (id.endsWith('.css')) return {}
      if (id in stubs) return stubs[id]
      throw new Error(`Unexpected dependency ${id}`)
    },
  })
  return module.exports
}
