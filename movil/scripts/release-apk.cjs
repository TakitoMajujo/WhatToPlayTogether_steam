const { execSync } = require('node:child_process')
const { copyFileSync, mkdirSync, existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = pkg.version
const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk')

process.env.ANDROID_HOME = androidHome
process.env.ANDROID_SDK_ROOT = androidHome

const jdk21 = 'C:\\Program Files\\Microsoft\\jdk-21.0.12.101-hotspot'
if (existsSync(join(jdk21, 'bin', 'java.exe'))) {
  process.env.JAVA_HOME = jdk21
}

function run(command, cwd = root) {
  execSync(command, { stdio: 'inherit', cwd, env: process.env, shell: true })
}

run('npm run build')
run('npx cap sync android')

const gradlew = join(root, 'android', 'gradlew.bat')
if (!existsSync(gradlew)) {
  throw new Error('Falta android/gradlew.bat. Ejecuta primero: npx cap add android')
}

run(`${JSON.stringify(gradlew)} assembleRelease`, join(root, 'android'))

const candidates = [
  join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk')
]

const built = candidates.find((file) => existsSync(file))
if (!built) {
  throw new Error('No se encontró el APK de release en android/app/build/outputs/apk/release/')
}

const outDir = join(root, 'Ejecutable')
mkdirSync(outDir, { recursive: true })
const dest = join(outDir, `WhatToPlayTogether-${version}.apk`)
copyFileSync(built, dest)
console.log(`APK listo: ${dest}`)
