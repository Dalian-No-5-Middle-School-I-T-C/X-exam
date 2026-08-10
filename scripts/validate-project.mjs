import { readdirSync, readFileSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const ignoredDirectories = new Set(['.git', 'miniprogram_npm', 'node_modules'])
const errors = []

function projectFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name)

    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : projectFiles(absolutePath)
    }

    return [absolutePath]
  })
}

function displayPath(absolutePath) {
  return relative(root, absolutePath).replaceAll('\\', '/')
}

function readJson(absolutePath) {
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'))
  } catch (error) {
    errors.push(`${displayPath(absolutePath)}: invalid JSON (${error.message})`)
    return null
  }
}

function requireFile(relativePath, source) {
  const absolutePath = join(root, relativePath)

  try {
    if (!statSync(absolutePath).isFile()) {
      throw new Error('not a file')
    }
  } catch {
    errors.push(`${source}: missing ${relativePath.replaceAll('\\', '/')}`)
  }
}

const files = projectFiles()
const javascriptFiles = files.filter((file) => extname(file) === '.js')
const jsonFiles = files.filter((file) => extname(file) === '.json')

for (const file of javascriptFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })

  if (result.status !== 0) {
    errors.push(`${displayPath(file)}: JavaScript syntax check failed\n${result.stderr.trim()}`)
  }
}

for (const file of jsonFiles) {
  readJson(file)
}

const appConfigPath = join(root, 'app.json')
const appConfig = readJson(appConfigPath)

if (appConfig) {
  if (!Array.isArray(appConfig.pages) || appConfig.pages.length === 0) {
    errors.push('app.json: pages must be a non-empty array')
  } else {
    const duplicatePages = appConfig.pages.filter((page, index) => appConfig.pages.indexOf(page) !== index)
    if (duplicatePages.length > 0) {
      errors.push(`app.json: duplicate pages: ${[...new Set(duplicatePages)].join(', ')}`)
    }

    for (const page of appConfig.pages) {
      for (const extension of ['.js', '.json', '.wxml', '.wxss']) {
        requireFile(`${page}${extension}`, 'app.json')
      }
    }
  }

  const registeredPages = new Set(appConfig.pages ?? [])
  for (const item of appConfig.tabBar?.list ?? []) {
    if (!registeredPages.has(item.pagePath)) {
      errors.push(`app.json: tabBar page is not registered in pages: ${item.pagePath}`)
    }
  }

  if (appConfig.sitemapLocation) {
    requireFile(appConfig.sitemapLocation, 'app.json')
  }
}

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`)
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Validation passed: ${javascriptFiles.length} JavaScript files, ${jsonFiles.length} JSON files, and all registered pages.`)
