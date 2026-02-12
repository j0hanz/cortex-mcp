/* eslint-disable */
import { spawn } from 'node:child_process';
import {
  access,
  chmod,
  cp,
  glob,
  mkdir,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);

// --- Configuration Layer (Constants & Settings) ---
const BIN = {
  tsc: require.resolve('typescript/bin/tsc'),
};

const CONFIG = {
  paths: {
    dist: 'dist',
    assets: 'assets',
    instructions: 'src/instructions.md',
    executable: 'dist/index.js',
    tsBuildInfo: [
      '.tsbuildinfo',
      'tsconfig.tsbuildinfo',
      'tsconfig.build.tsbuildinfo',
    ],
    get distAssets() {
      return join(this.dist, 'assets');
    },
    get distInstructions() {
      return join(this.dist, 'instructions.md');
    },
  },
  commands: {
    tsc: ['node', [BIN.tsc, '-p', 'tsconfig.build.json']],
    tscCheck: ['node', [BIN.tsc, '-p', 'tsconfig.json', '--noEmit']],
  },
  test: {
    patterns: ['src/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  },
};

const DEFAULT_TASK_TIMEOUT_MS = Number.parseInt(
  process.env.TASK_TIMEOUT_MS ?? '',
  10
);
const TASK_TIMEOUT_MS =
  Number.isFinite(DEFAULT_TASK_TIMEOUT_MS) && DEFAULT_TASK_TIMEOUT_MS > 0
    ? DEFAULT_TASK_TIMEOUT_MS
    : undefined;

function getReasonText(reason) {
  if (reason instanceof Error) {
    return reason.message;
  }
  return reason ? String(reason) : undefined;
}

// --- Infrastructure Layer (IO & System) ---
const Logger = {
  startGroup: (name) => process.stdout.write(`> ${name}... `),
  endGroupSuccess: (duration) => console.log(`✅ (${duration}s)`),
  endGroupFail: (err) =>
    console.log(`❌${err?.message ? ` (${err.message})` : ''}`),
  shellSuccess: (name, duration) => console.log(`> ${name} ✅ (${duration}s)`),
  info: (msg) => console.log(msg),
  error: (err) => console.error(err),
  newLine: () => console.log(),
};

const System = {
  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  async isDirectory(path) {
    try {
      const stats = await stat(path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  },

  async remove(paths) {
    const targets = Array.isArray(paths) ? paths : [paths];
    await Promise.all(
      targets.map((p) => rm(p, { recursive: true, force: true }))
    );
  },

  async copy(src, dest, opts = {}) {
    await cp(src, dest, opts);
  },

  async makeDir(path) {
    await mkdir(path, { recursive: true });
  },

  async changeMode(path, mode) {
    await chmod(path, mode);
  },

  exec(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const resolvedCommand = command === 'node' ? process.execPath : command;
      const timeoutMs = options.timeoutMs ?? TASK_TIMEOUT_MS;
      const timeoutSignal =
        typeof timeoutMs === 'number' && timeoutMs > 0
          ? AbortSignal.timeout(timeoutMs)
          : undefined;
      const combinedSignal =
        options.signal && timeoutSignal
          ? AbortSignal.any([options.signal, timeoutSignal])
          : (options.signal ?? timeoutSignal);

      if (combinedSignal?.aborted) {
        const reasonText = getReasonText(combinedSignal.reason);
        reject(
          new Error(
            `${command} aborted before start${reasonText ? `: ${reasonText}` : ''}`
          )
        );
        return;
      }

      const proc = spawn(resolvedCommand, args, {
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
        ...(combinedSignal ? { signal: combinedSignal } : {}),
      });

      let aborted = false;
      let abortReason;
      const abortListener = combinedSignal
        ? () => {
            aborted = true;
            abortReason = combinedSignal.reason;
          }
        : null;

      if (combinedSignal && abortListener) {
        combinedSignal.addEventListener('abort', abortListener, { once: true });
      }

      const cleanup = () => {
        if (combinedSignal && abortListener) {
          try {
            combinedSignal.removeEventListener('abort', abortListener);
          } catch {
            /* ignore */
          }
        }
      };

      proc.on('error', (error) => {
        cleanup();
        if (aborted) {
          const reasonText = getReasonText(abortReason);
          reject(
            new Error(
              `${command} aborted${reasonText ? `: ${reasonText}` : ''}`
            )
          );
          return;
        }
        reject(error);
      });

      proc.on('close', (code, signal) => {
        cleanup();
        if (aborted) {
          const reasonText = getReasonText(abortReason);
          const suffix = signal ? ` (signal ${signal})` : '';
          reject(
            new Error(
              `${command} aborted${suffix}${reasonText ? `: ${reasonText}` : ''}`
            )
          );
          return;
        }
        if (code === 0) return resolve();
        const suffix = signal ? ` (signal ${signal})` : '';
        reject(new Error(`${command} exited with code ${code}${suffix}`));
      });
    });
  },
};

// --- Domain Layer (Build & Test Actions) ---
const BuildTasks = {
  async clean() {
    await System.remove(CONFIG.paths.dist);
    await System.remove(CONFIG.paths.tsBuildInfo);
  },

  async compile() {
    const [cmd, args] = CONFIG.commands.tsc;
    await System.exec(cmd, args);
  },

  async validate() {
    if (!(await System.exists(CONFIG.paths.instructions))) {
      throw new Error(`Missing ${CONFIG.paths.instructions}`);
    }
  },

  async assets() {
    await System.makeDir(CONFIG.paths.dist);
    await System.copy(CONFIG.paths.instructions, CONFIG.paths.distInstructions);

    if (await System.isDirectory(CONFIG.paths.assets)) {
      try {
        const files = await readdir(CONFIG.paths.assets);
        const iconFiles = files.filter((file) =>
          /^logo\.(svg|png|jpe?g)$/i.test(file)
        );
        const sizes = await Promise.all(
          iconFiles.map(async (file) => {
            const stats = await stat(join(CONFIG.paths.assets, file));
            return { file, size: stats.size };
          })
        );
        for (const { file, size } of sizes) {
          if (size >= 2 * 1024 * 1024) {
            Logger.info(
              `[WARNING] Icon ${file} is size ${size} bytes (>= 2MB). Large icons may be rejected by clients.`
            );
          }
        }
      } catch {
        // ignore errors during check
      }

      await System.copy(CONFIG.paths.assets, CONFIG.paths.distAssets, {
        recursive: true,
      });
    }
  },

  async makeExecutable() {
    await System.changeMode(CONFIG.paths.executable, '755');
  },
};

// --- Test Helpers (Pure Functions) ---
async function detectTestLoader() {
  try {
    require.resolve('tsx/esm');
    return ['--import', 'tsx/esm'];
  } catch {
    // continue checking next loader
  }

  try {
    require.resolve('ts-node/esm');
    return ['--loader', 'ts-node/esm'];
  } catch {
    return [];
  }
}

function getCoverageArgs(args) {
  return args.includes('--coverage') ? ['--experimental-test-coverage'] : [];
}

async function findTestPatterns() {
  const matches = await Promise.all(
    CONFIG.test.patterns.map((pattern) => Array.fromAsync(glob(pattern)))
  );
  return [...new Set(matches.flat())].sort();
}

const TestTasks = {
  async typeCheck() {
    await Runner.runShellTask('Type-checking src', async () => {
      const [cmd, args] = CONFIG.commands.tscCheck;
      await System.exec(cmd, args);
    });
  },

  async test(args = []) {
    await Pipeline.testBuild();

    const testFiles = await findTestPatterns();
    if (testFiles.length === 0) {
      throw new Error(
        `No test files found. Expected one of: ${CONFIG.test.patterns.join(
          ', '
        )}`
      );
    }

    const loader = await detectTestLoader();
    const coverage = getCoverageArgs(args);

    await Runner.runShellTask('Running tests', async () => {
      await System.exec('node', [
        '--test',
        ...loader,
        ...coverage,
        ...testFiles,
      ]);
    });
  },
};

// --- Application Layer (Task Running & Orchestration) ---
class Runner {
  static async #run(name, fn, logSuccess) {
    Logger.startGroup(name);
    Logger.newLine();
    const start = performance.now();

    try {
      await fn();
      logSuccess(((performance.now() - start) / 1000).toFixed(2));
    } catch (err) {
      Logger.endGroupFail(err);
      throw err;
    }
  }

  static runTask(name, fn) {
    return this.#run(name, fn, Logger.endGroupSuccess);
  }

  static runShellTask(name, fn) {
    return this.#run(name, fn, (d) => Logger.shellSuccess(name, d));
  }
}

const Pipeline = {
  async fullBuild() {
    Logger.info('🚀 Starting build...');
    const start = performance.now();

    await Runner.runTask('Cleaning dist', BuildTasks.clean);
    await Runner.runShellTask('Compiling TypeScript', BuildTasks.compile);
    await Runner.runTask('Validating instructions', BuildTasks.validate);
    await Runner.runTask('Copying assets', BuildTasks.assets);
    await Runner.runTask('Making executable', BuildTasks.makeExecutable);

    Logger.info(
      `\n✨ Build completed in ${((performance.now() - start) / 1000).toFixed(
        2
      )}s`
    );
  },

  async testBuild() {
    await Runner.runTask('Validating instructions', BuildTasks.validate);
    await Runner.runShellTask('Compiling TypeScript', BuildTasks.compile);
  },
};

// --- Interface Layer (CLI) ---
const CLI = {
  routes: {
    clean: () => Runner.runTask('Cleaning', BuildTasks.clean),
    'copy:assets': () => Runner.runTask('Copying assets', BuildTasks.assets),
    'validate:instructions': () =>
      Runner.runTask('Validating instructions', BuildTasks.validate),
    'make-executable': () =>
      Runner.runTask('Making executable', BuildTasks.makeExecutable),
    build: Pipeline.fullBuild,
    'type-check': () => TestTasks.typeCheck(),
    test: (args) => TestTasks.test(args),
  },

  async main(args) {
    const rawArgs = args.slice(2);
    let parsed;
    try {
      parsed = parseArgs({
        args: rawArgs,
        allowPositionals: true,
        strict: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Logger.error(`Invalid arguments: ${message}`);
      process.exitCode = 1;
      return;
    }

    const positionals = parsed.positionals ?? [];
    const taskName =
      positionals.find((candidate) => candidate in this.routes) ??
      positionals[0] ??
      'build';
    const taskIndex = rawArgs.indexOf(taskName);
    const restArgs = taskIndex >= 0 ? rawArgs.slice(taskIndex + 1) : [];
    const action = this.routes[taskName];

    if (!action) {
      Logger.error(`Unknown task: ${taskName}`);
      Logger.error(`Available tasks: ${Object.keys(this.routes).join(', ')}`);
      process.exitCode = 1;
      return;
    }

    try {
      await action(restArgs);
    } catch {
      process.exitCode = 1;
    }
  },
};

CLI.main(process.argv);
