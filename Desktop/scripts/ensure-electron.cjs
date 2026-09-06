const { execSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron')
const distDir = path.join(electronDir, 'dist')
const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron'
const distExe = path.join(distDir, exeName)
const pathTxt = path.join(electronDir, 'path.txt')

function ready() {
  return fs.existsSync(distExe) && fs.existsSync(pathTxt)
}

if (ready()) process.exit(0)

try {
  execSync(`node "${path.join(electronDir, 'install.js')}"`, { stdio: 'inherit' })
} catch {
  // Se intenta un fallback más abajo
}

if (ready()) process.exit(0)

const cacheRoot = path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache')
if (!fs.existsSync(cacheRoot)) {
  console.warn('No se pudo instalar el binario de Electron. Vuelve a ejecutar npm install.')
  process.exit(0)
}

const zip = findZip(cacheRoot)
if (!zip) {
  console.warn('No se encontró el zip de Electron en caché.')
  process.exit(0)
}

const tmp = path.join(os.tmpdir(), 'whattoplaytogether-electron-dist')
fs.rmSync(tmp, { recursive: true, force: true })
fs.mkdirSync(tmp, { recursive: true })
execSync(`tar -xf "${zip}" -C "${tmp}"`)
fs.rmSync(distDir, { recursive: true, force: true })
fs.cpSync(tmp, distDir, { recursive: true })
fs.writeFileSync(pathTxt, exeName)
console.log('Electron instalado con el extractor de respaldo.')

function findZip(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = findZip(full)
      if (nested) return nested
    } else if (entry.name.endsWith('.zip') && entry.name.includes('electron')) {
      return full
    }
  }
  return null
}
