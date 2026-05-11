import path from 'path';
import fs from 'fs';
import {exec} from '@actions/exec';
import axios, {isAxiosError} from 'axios';
import * as config from './config';
import * as core from './core';
import * as coverage from './coverage';
import * as extensions from './extensions';
import * as tools from './tools';
import * as utils from './utils';

async function validateSubscription(): Promise<void> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let repoPrivate: boolean | undefined;

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    repoPrivate = eventData?.repository?.private;
  }

  const upstream = 'shivammathur/setup-php';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl =
    'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';

  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false)
    core.info('\u001b[32m✓ Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body: Record<string, string> = {action: action || ''};
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body,
      {timeout: 3000}
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(
        `\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`
      );
      core.error(
        `\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`
      );
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

/**
 * Build the script
 *
 * @param os
 */
export async function getScript(os: string): Promise<string> {
  const url = 'https://setup-php.com/sponsor';
  const filename = os + (await utils.scriptExtension(os));
  const script_path = path.join(__dirname, '../src/scripts', filename);
  const run_path = script_path.replace(os, 'run');
  const extension_csv: string = await utils.getInput('extensions', false);
  const ini_values_csv: string = await utils.getInput('ini-values', false);
  const coverage_driver: string = await utils.getInput('coverage', false);
  const tools_csv: string = await utils.getInput('tools', false);
  const version: string = await utils.parseVersion(
    await utils.readPHPVersion()
  );
  const ini_file: string = await utils.parseIniFile(
    await utils.getInput('ini-file', false)
  );
  let script = await utils.joins('.', script_path, version, ini_file);
  if (extension_csv) {
    script += await extensions.addExtension(extension_csv, version, os);
  }
  script += await tools.addTools(tools_csv, version, os);
  if (coverage_driver) {
    script += await coverage.addCoverage(coverage_driver, version, os);
  }
  if (ini_values_csv) {
    script += await config.addINIValues(ini_values_csv, os);
  }
  script += '\n' + (await utils.stepLog(`Sponsor setup-php`, os));
  script += '\n' + (await utils.addLog('$tick', 'setup-php', url, os));

  fs.writeFileSync(run_path, script, {mode: 0o755});

  return run_path;
}

/**
 * Function to set environment variables based on inputs.
 */
export async function setEnv(): Promise<void> {
  process.env['fail_fast'] = await utils.getInput('fail-fast', false);
  process.env['GITHUB_TOKEN'] ??= await utils.getInput('github-token', false);
}

/**
 * Run the script
 */
export async function run(): Promise<void> {
  await validateSubscription();
  await setEnv();
  const os: string = process.platform;
  const tool = await utils.scriptTool(os);
  const run_path = await getScript(os);
  await exec(tool + run_path);
}

// call the run function
(async () => {
  await run();
})().catch(error => {
  core.setFailed(error.message);
});
