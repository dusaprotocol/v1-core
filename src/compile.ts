#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import asc from 'assemblyscript/dist/asc.js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

async function compile(argv: string[], options: object = {}): Promise<boolean> {
  const { error, stdout, stderr } = await asc.main(argv, options);
  console.info('contract to compile ' + argv[argv.length - 1]);
  if (error) {
    console.log('Compilation failed: ' + error.message);
    console.log('stderr ' + stderr.toString());
    return Promise.resolve(false);
  } else {
    console.log(stdout.toString());
    return Promise.resolve(true);
  }
}

/**
 * sort the file: compile deployer contract after
 *
 * @param files - files to sort
 */
function sortFiles(files: Array<string>): Array<string> {
  return files.sort((contract) => {
    return readFileSync(contract, 'utf-8').includes('fileToByteArray(')
      ? 1
      : -1;
  });
}

async function compileAll(): Promise<boolean> {
  const files: string[] = sortFiles([
    'assembly/contracts/ERC20.ts',
    'assembly/contracts/Pair.ts',
    'assembly/contracts/Quoter.ts',
    'assembly/contracts/Router.ts',
    'assembly/contracts/WMAS.ts',
  ]);

  const res = await Promise.all(
    files.map((file) =>
      compile([
        '--runtime',
        'stub',
        '-o',
        join('build', basename(file.replace('.ts', '.wasm'))),
        file,
      ]),
    ),
  );

  const factoryFile = 'assembly/contracts/Factory.ts';
  const res2 = await compile([
    '--runtime',
    'stub',
    '-o',
    join('build', basename(factoryFile.replace('.ts', '.wasm'))),
    factoryFile,
  ]);

  const mainFile = 'assembly/contracts/main.ts';
  const res3 = await compile([
    '--runtime',
    'stub',
    '-o',
    join('build', basename(mainFile.replace('.ts', '.wasm'))),
    mainFile,
  ]);

  res.concat(res2, res3);

  return res.every((isOk) => isOk);
}

(async () => {
  await yargs(hideBin(process.argv))
    .command(
      '*',
      'Compile files in assembly/contracts',
      {},
      async (argv: any) => {
        const result = await compileAll();
        process.exit(result ? 0 : 1);
      },
    )
    .parseAsync();
})();
