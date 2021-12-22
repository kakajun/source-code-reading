/* 插件主函数,引用@vue/compiler-sfc */
try {
  require.resolve('@vue/compiler-sfc')
} catch (e) {
  throw new Error(
    'rollup-plugin-vue requires @vue/compiler-sfc to be present in the dependency ' +
      'tree.'
  )
}

import {
  SFCTemplateCompileOptions,
  SFCAsyncStyleCompileOptions,
} from '@vue/compiler-sfc'
import fs from 'fs'
// 这个研究一下
import createDebugger from 'debug'
// 打包的
import { Plugin } from 'rollup'
// 汇总插件通常需要的功能
import { createFilter } from 'rollup-pluginutils'
// 单文件组件（SFC）解析入口点
import { transformSFCEntry } from './sfc'
// 翻译template, 这个重点研究
import { transformTemplate } from './template'
// 打包css
import { transformStyle } from './style'
// 自定义模块过滤出来
import { createCustomBlockFilter } from './utils/customBlockFilter'
// 设置和得到描叙信息
import { getDescriptor, setDescriptor } from './utils/descriptorCache'
// 解析请求方面的
import { parseVuePartRequest } from './utils/query'
// sourceMap
import { normalizeSourceMap } from './utils/sourceMap'
// 打包js
import { getResolvedScript } from './script'

const debug = createDebugger('rollup-plugin-vue')

export interface Options {
  include: string | RegExp | (string | RegExp)[]
  exclude: string | RegExp | (string | RegExp)[]
  target: 'node' | 'browser'
  exposeFilename: boolean

  customBlocks?: string[]

  // if true, handle preprocessors directly instead of delegating to other
  // rollup plugins
  preprocessStyles?: boolean

  // sfc template options
  templatePreprocessOptions?: Record<
    string,
    SFCTemplateCompileOptions['preprocessOptions']
  >
  compiler?: SFCTemplateCompileOptions['compiler']
  compilerOptions?: SFCTemplateCompileOptions['compilerOptions']
  transformAssetUrls?: SFCTemplateCompileOptions['transformAssetUrls']

  // sfc style options
  postcssOptions?: SFCAsyncStyleCompileOptions['postcssOptions']
  postcssPlugins?: SFCAsyncStyleCompileOptions['postcssPlugins']
  cssModulesOptions?: SFCAsyncStyleCompileOptions['modulesOptions']
  preprocessCustomRequire?: SFCAsyncStyleCompileOptions['preprocessCustomRequire']
  preprocessOptions?: SFCAsyncStyleCompileOptions['preprocessOptions']
}

const defaultOptions: Options = {
  include: /\.vue$/,
  exclude: [],
  target: 'browser',
  exposeFilename: false,
  customBlocks: [],
}

export default function PluginVue(userOptions: Partial<Options> = {}): Plugin {
  const options: Options = {
    ...defaultOptions,
    ...userOptions,
  }

  const isServer = options.target === 'node'
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.BUILD === 'production'
  const rootContext = process.cwd()

  const filter = createFilter(options.include, options.exclude)
  const filterCustomBlock = createCustomBlockFilter(options.customBlocks)

  return {
    name: 'vue',
    async resolveId(id, importer) {
      const query = parseVuePartRequest(id)

      if (query.vue) {
        if (query.src) {
          const resolved = await this.resolve(query.filename, importer, {
            skipSelf: true,
          })
          if (resolved) {
            setDescriptor(resolved.id, getDescriptor(importer!))
            const [, originalQuery] = id.split('?', 2)
            resolved.id += `?${originalQuery}`
            return resolved
          }
        } else if (!filter(query.filename)) {
          return null
        }
        debug(`resolveId(${id})`)
        return id
      }
      return null
    },

    load(id) {
      const query = parseVuePartRequest(id)
      if (query.vue) {
        if (query.src) {
          return fs.readFileSync(query.filename, 'utf-8')
        }
        const descriptor = getDescriptor(query.filename)
        if (descriptor) {
          const block =
            query.type === 'template'
              ? descriptor.template!
              : query.type === 'script'
              ? getResolvedScript(descriptor, isServer)
              : query.type === 'style'
              ? descriptor.styles[query.index]
              : typeof query.index === 'number'
              ? descriptor.customBlocks[query.index]
              : null

          if (block) {
            return {
              code: block.content,
              map: normalizeSourceMap(block.map, id),
            }
          }
        }
      }
      return null
    },

    async transform(code, id) {
      const query = parseVuePartRequest(id)

      // *.vue file
      // generate an entry module that imports the actual blocks of the SFC
      if (!query.vue && filter(id)) {
        debug(`transform SFC entry (${id})`)
        const output = transformSFCEntry(
          code,
          id,
          options,
          rootContext,
          isProduction,
          isServer,
          filterCustomBlock,
          this
        )
        if (output) {
          debug('SFC entry code:', '\n' + output.code + '\n')
        }
        return output
      }

      // sub request for blocks
      if (query.vue) {
        if (!query.src && !filter(query.filename)) {
          return null
        }
        if (query.src) {
          this.addWatchFile(query.filename)
        }
        if (query.type === 'template') {
          debug(`transform template (${id})`)
          return transformTemplate(code, id, options, query, this)
        } else if (query.type === 'style') {
          debug(`transform style (${id})`)
          return transformStyle(code, id, options, query, isProduction, this)
        }
      }
      return null
    },
  }
}

// overwrite for cjs require('rollup-plugin-vue')() usage
module.exports = PluginVue
