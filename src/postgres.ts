import {Client, ClientConfig} from 'pg';
import {CliError} from '@/errors';

const CONNECTION_TIMEOUT_MS = 10_000;
const QUERY_TIMEOUT_MS = 30_000;
const MAX_ROWS_LIMIT = 10_000;

function createSecureClientConfig(url: string): ClientConfig {
	return {
		connectionString: url,
		connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
		query_timeout: QUERY_TIMEOUT_MS,
		application_name: 'meow-db-cli',
	};
}

function escapeIdentifier(identifier: string): string {
	if (!identifier || typeof identifier !== 'string') {
		throw new CliError('INVALID_ARGUMENT', 'Identifier cannot be empty');
	}

	if (identifier.length > 63) {
		throw new CliError(
			'INVALID_ARGUMENT',
			`Identifier too long: ${identifier.substring(0, 20)}...`,
		);
	}

	return `"${identifier.replace(/"/g, '""')}"`;
}

function validateLimit(limit: number): void {
	if (!Number.isInteger(limit) || limit < 1) {
		throw new CliError(
			'INVALID_ARGUMENT',
			'Limit must be a positive integer',
		);
	}

	if (limit > MAX_ROWS_LIMIT) {
		throw new CliError(
			'INVALID_ARGUMENT',
			`Limit cannot exceed ${MAX_ROWS_LIMIT} rows`,
			{hint: 'Use pagination for large datasets.'},
		);
	}
}

async function withDatabaseClient<T>(
	url: string,
	operationName: string,
	operation: (client: Client) => Promise<T>,
): Promise<T> {
	const client = new Client(createSecureClientConfig(url));

	try {
		await client.connect();
		return await operation(client);
	} catch (error: unknown) {
		if (isConnectionError(error)) {
			throw new CliError(
				'DB_CONNECTION_FAILED',
				'Could not connect to PostgreSQL.',
				{
					hint: 'Check the active database URL with `meow db info`.',
					cause: error,
				},
			);
		}

		if (isTimeoutError(error)) {
			throw new CliError(
				'DB_TIMEOUT',
				`Database operation timed out while trying to ${operationName}.`,
				{
					hint: 'The database might be overloaded or unreachable.',
					cause: error,
				},
			);
		}

		throw new CliError('DB_QUERY_FAILED', `Could not ${operationName}.`, {
			hint: 'Verify schema permissions, table existence, and try again.',
			cause: error,
		});
	} finally {
		await client.end().catch(() => undefined);
	}
}

export async function listTables(
	url: string,
	schema: string,
): Promise<string[]> {
	return withDatabaseClient(url, 'list tables', async (client) => {
		const result = await client.query<{table_name: string}>(
			`SELECT table_name
			 FROM information_schema.tables
			 WHERE table_schema = $1
			   AND table_type = 'BASE TABLE'
			 ORDER BY table_name ASC`,
			[schema],
		);

		return result.rows.map((row) => row.table_name);
	});
}

export async function getRows(
	url: string,
	schema: string,
	table: string,
	limit: number,
): Promise<Array<Record<string, unknown>>> {
	validateLimit(limit);

	return withDatabaseClient(url, 'fetch rows', async (client) => {
		const safeSchema = escapeIdentifier(schema);
		const safeTable = escapeIdentifier(table);

		const statement = `SELECT * FROM ${safeSchema}.${safeTable} LIMIT $1`;
		const result = await client.query<Record<string, unknown>>(statement, [
			limit,
		]);

		return result.rows;
	});
}

function isConnectionError(error: unknown): error is {code: string} {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		typeof (error as Record<string, unknown>).code === 'string' &&
		['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(
			(error as {code: string}).code,
		)
	);
}

function isTimeoutError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const err = error as Record<string, unknown>;
	return (
		err.code === 'ETIMEDOUT' ||
		err.code === '57014' ||
		(typeof err.message === 'string' && err.message.includes('timeout'))
	);
}
