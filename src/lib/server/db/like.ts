import { sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

/** `column LIKE %text%`, where `%` and `_` in what a person typed are text, not wildcards. */
export const contains = (column: SQLiteColumn, text: string): SQL =>
	sql`${column} like ${`%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`} escape '\\'`;
