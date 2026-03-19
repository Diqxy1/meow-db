import process from 'node:process';
import os from 'node:os';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {CliError} from '@/errors';

export type ConnectionConfig = {
	url: string;
	createdAt: string;
	readonly?: boolean;
	description?: string;
};

export type CliConfig = {
	version: 1;
	activeDb: string | null;
	connections: Record<string, ConnectionConfig>;
};

export const defaultConfig: CliConfig = {
	version: 1,
	activeDb: null,
	connections: {},
};

const CONFIG_FILE_MODE = 0o600;

export function getConfigPath(
	environment: NodeJS.ProcessEnv = process.env,
): string {
	const root =
		environment['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
	return path.join(root, 'meow-db', 'config.json');
}

function isValidPostgresUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return ['postgres:', 'postgresql:'].includes(parsed.protocol);
	} catch {
		return false;
	}
}

export function sanitizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
	} catch {
		return '[invalid-url]';
	}
}

export async function readConfig(configPath: string): Promise<CliConfig> {
	let raw: string;
	try {
		raw = await fs.readFile(configPath, 'utf8');

		const stats = await fs.stat(configPath);
		const mode = stats.mode & 0o777;
		if (mode !== CONFIG_FILE_MODE) {
			console.warn(
				`Warning: Config file has insecure permissions (${mode.toString(8)}). ` +
				`Run: chmod 600 ${configPath}`
			);
		}
	} catch (error: unknown) {
		if (isMissingFileError(error)) {
			throw new CliError('CONFIG_NOT_FOUND', 'Configuration file not found.', {
				hint: 'Run `meow db add <name> <url>` to create your first connection.',
				cause: error,
			});
		}
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error: unknown) {
		throw new CliError('INVALID_ARGUMENT', 'Configuration file contains invalid JSON.', {
			hint: 'Check the file syntax or delete it to start fresh.',
			cause: error,
		});
	}

	return validateConfig(parsed);
}

export async function writeConfig(
	configPath: string,
	config: CliConfig,
): Promise<void> {
	await fs.mkdir(path.dirname(configPath), {recursive: true, mode: 0o700});

	await fs.writeFile(
		configPath,
		JSON.stringify(config, null, 2),
		{encoding: 'utf8', mode: CONFIG_FILE_MODE}
	);
}

export async function loadOrCreateConfig(
	configPath: string,
): Promise<CliConfig> {
	try {
		return await readConfig(configPath);
	} catch (error: unknown) {
		if (error instanceof CliError && error.code === 'CONFIG_NOT_FOUND') {
			await writeConfig(configPath, defaultConfig);
			return structuredClone(defaultConfig);
		}
		throw error;
	}
}

function validateConfig(value: unknown): CliConfig {
	if (!value || typeof value !== 'object') {
		throw invalidConfigError();
	}

	const config = value as Partial<CliConfig>;

	if (config.version !== 1) {
		throw invalidConfigError('Unsupported config version');
	}

	if (config.activeDb !== null && typeof config.activeDb !== 'string') {
		throw invalidConfigError('Invalid activeDb field');
	}

	if (!config.connections || typeof config.connections !== 'object') {
		throw invalidConfigError('Invalid connections field');
	}

	for (const [name, connection] of Object.entries(config.connections)) {
		if (!connection || typeof connection !== 'object') {
			throw invalidConfigError(`Invalid connection: ${name}`);
		}

		if (typeof connection.url !== 'string') {
			throw invalidConfigError(`Missing URL for connection: ${name}`);
		}

		if (!isValidPostgresUrl(connection.url)) {
			throw invalidConfigError(
				`Invalid PostgreSQL URL for connection: ${name}`
			);
		}

		if (typeof connection.createdAt !== 'string') {
			throw invalidConfigError(`Missing createdAt for connection: ${name}`);
		}

		if (isNaN(Date.parse(connection.createdAt))) {
			throw invalidConfigError(`Invalid date format for connection: ${name}`);
		}

		if ('readonly' in connection && typeof connection.readonly !== 'boolean') {
			throw invalidConfigError(`Invalid readonly field for connection: ${name}`);
		}

		if ('description' in connection && typeof connection.description !== 'string') {
			throw invalidConfigError(`Invalid description field for connection: ${name}`);
		}
	}

	return {
		version: 1,
		activeDb: config.activeDb ?? null,
		connections: config.connections,
	};
}

function invalidConfigError(details?: string) {
	const message = details
		? `Configuration file is invalid: ${details}`
		: 'Configuration file is invalid.';

	return new CliError('INVALID_ARGUMENT', message, {
		hint: 'Delete the config file and run `meow db add <name> <url>` again.',
	});
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return Boolean(
		error &&
			typeof error === 'object' &&
			'code' in error &&
			(error as NodeJS.ErrnoException).code === 'ENOENT',
	);
}
