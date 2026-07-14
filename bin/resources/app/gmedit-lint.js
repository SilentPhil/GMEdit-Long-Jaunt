const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

const appDir = __dirname
const executableName = process.platform === 'win32' ? 'GMEdit.exe' : 'gmedit'
const packagedExecutable = path.resolve(appDir, '..', '..', executableName)
const developmentExecutable = path.join(
	appDir,
	'node_modules',
	'electron',
	'dist',
	process.platform === 'win32' ? 'electron.exe' : 'electron',
)
const isPackaged = fs.existsSync(packagedExecutable)
const executable = isPackaged ? packagedExecutable : developmentExecutable
const executableArgs = isPackaged ? [] : [appDir]

function getSourceUserDataDir() {
	if (process.env.GMEDIT_USER_DATA) return path.resolve(process.env.GMEDIT_USER_DATA)
	const appName = require(path.join(appDir, 'package.json')).name
	if (process.platform === 'win32') return path.join(process.env.APPDATA, appName)
	if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', appName)
	return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), appName)
}

function copyUserConfiguration(userDataDir) {
	const source = path.join(getSourceUserDataDir(), 'GMEdit', 'config')
	if (!fs.existsSync(source)) return
	const target = path.join(userDataDir, 'GMEdit', 'config')
	fs.mkdirSync(path.dirname(target), { recursive: true })
	fs.cpSync(source, target, { recursive: true })
}

function findProjectFiles(directory, depth = 0) {
	const projects = []
	const entries = fs.readdirSync(directory, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.isFile() && entry.name.toLowerCase().endsWith('.yyp')) {
			projects.push(path.join(directory, entry.name))
		}
	}
	if (projects.length > 0 || depth >= 3) return projects
	const skippedDirectories = new Set(['.git', '.svn', 'node_modules', 'build', 'dist', 'cache'])
	for (const entry of entries) {
		if (!entry.isDirectory() || entry.name.startsWith('.') || skippedDirectories.has(entry.name.toLowerCase())) continue
		projects.push(...findProjectFiles(path.join(directory, entry.name), depth + 1))
		if (projects.length > 20) break
	}
	return projects
}

function resolveProject(projectPath) {
	projectPath = path.resolve(projectPath)
	if (!fs.existsSync(projectPath)) throw new Error(`Project does not exist: ${projectPath}`)
	if (!fs.statSync(projectPath).isDirectory()) return projectPath

	const projects = findProjectFiles(projectPath)
	if (projects.length === 0) {
		throw new Error(`No .yyp project found in directory: ${projectPath}`)
	}
	if (projects.length > 1) {
		throw new Error(`Multiple .yyp projects found; specify one explicitly:\n${projects.map(file => `  ${file}`).join('\n')}`)
	}
	return projects[0]
}

function parseArgs(args) {
	const options = { project: null, format: 'text', files: [], errorsOnly: false, warningsAsErrors: false }
	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (arg === '--json') options.format = 'json'
		else if (arg === '--errors-only') options.errorsOnly = true
		else if (arg === '--warnings-as-errors') options.warningsAsErrors = true
		else if (arg === '--format' && i + 1 < args.length) options.format = args[++i]
		else if (arg.startsWith('--format=')) options.format = arg.substring(9)
		else if (arg === '--file' && i + 1 < args.length) options.files.push(args[++i])
		else if (arg.startsWith('--file=')) options.files.push(arg.substring(7))
		else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`)
		else if (options.project == null) options.project = arg
		else options.files.push(arg)
	}
	if (options.project == null) throw new Error('Usage: gmedit-lint <project.yyp> [files...] [--json]')
	if (!['text', 'json'].includes(options.format)) throw new Error(`Unsupported format: ${options.format}`)
	options.project = resolveProject(options.project)
	return options
}

let options
try {
	options = parseArgs(process.argv.slice(2))
} catch (error) {
	console.error(error.message)
	process.exit(2)
}

const stamp = `${process.pid}-${Date.now()}`
const outputFile = path.join(os.tmpdir(), `gmedit-lint-${stamp}.txt`)
const errorFile = outputFile + '.err'
const userDataDir = path.join(os.tmpdir(), `gmedit-lint-profile-${stamp}`)
fs.mkdirSync(userDataDir, { recursive: true })
copyUserConfiguration(userDataDir)

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.GMEDIT_LINT_OPTIONS = JSON.stringify({ ...options, outputFile, errorFile, userDataDir })

function cleanup() {
	try { fs.unlinkSync(outputFile) } catch (_) {}
	try { fs.unlinkSync(errorFile) } catch (_) {}
	try { fs.rmSync(userDataDir, { recursive: true, force: true }) } catch (_) {}
}

function start(attempt = 0) {
	const child = spawn(executable, executableArgs, {
		stdio: 'inherit',
		windowsHide: true,
		env,
	})

	child.on('error', error => {
		console.error(`Could not start GMEdit lint: ${error.message}`)
		cleanup()
		process.exitCode = 2
	})

	child.on('exit', (code, signal) => {
		const hasOutput = fs.existsSync(outputFile)
		const hasError = fs.existsSync(errorFile)
		if (signal == null && !hasOutput && !hasError && attempt < 2) {
			setTimeout(() => start(attempt + 1), 100)
			return
		}
		try {
			if (hasOutput) process.stdout.write(fs.readFileSync(outputFile, 'utf8'))
			if (hasError) process.stderr.write(fs.readFileSync(errorFile, 'utf8'))
		} finally {
			cleanup()
		}
		if (signal != null) {
			console.error(`GMEdit lint was terminated by ${signal}`)
			process.exitCode = 2
		} else if (!hasOutput && !hasError) {
			console.error('GMEdit lint exited without producing a result')
			process.exitCode = 2
		} else {
			process.exitCode = code ?? 2
		}
	})
}

start()
