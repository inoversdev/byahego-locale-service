import knex from 'knex';
import { select } from '@inquirer/prompts';
import config from '../config/knex';
import { countriesAndLanguagesMenu } from './menus/countries';
import { dialectsMenu } from './menus/dialects';
import { historyMenu } from './menus/history';
import { importsMenu } from './menus/imports';
import { GoBack, pause } from './ui';

const isExitPrompt = (error: unknown): boolean =>
  error instanceof Error && error.name === 'ExitPromptError';

const main = async (): Promise<void> => {
  const db = knex(config.development);

  try {
    await db.raw('SELECT 1');
  } catch (error) {
    console.error(
      'Could not connect to the database. Check DB_* values in .env.\n',
      error instanceof Error ? error.message : error
    );
    await db.destroy();
    process.exitCode = 1;
    return;
  }

  console.log('\nByaheGo Locale Service — manager (Esc = back, Ctrl+C = exit)\n');

  try {
    for (;;) {
      const action = await select({
        message: 'What do you want to manage?',
        choices: [
          { name: 'Dialects per country', value: 'dialects' },
          { name: 'Countries & languages', value: 'countries' },
          { name: 'Run imports', value: 'imports' },
          { name: 'Import history & dataset overview', value: 'history' },
          { name: 'Exit', value: 'exit' }
        ]
      });

      try {
        if (action === 'dialects') await dialectsMenu(db);
        else if (action === 'countries') await countriesAndLanguagesMenu(db);
        else if (action === 'imports') await importsMenu(db);
        else if (action === 'history') {
          await historyMenu(db);
          await pause();
        } else break;
      } catch (error) {
        if (isExitPrompt(error)) throw error;

        // Esc inside a menu's first prompt: back to the main menu.
        if (error instanceof GoBack) continue;

        // Keep the manager alive on a failed action.
        console.error('\nAction failed:', error instanceof Error ? error.message : error, '\n');
      }
    }
  } catch (error) {
    if (!isExitPrompt(error)) {
      console.error(error);
      process.exitCode = 1;
    }
  } finally {
    await db.destroy();
    console.log('Bye.');
  }
};

main();
