/**
 * The query language's public entry point (spec §7): source text in, `{ predicate, warnings }`
 * out. Never throws — malformed input degrades per spec §6.
 */
import type { Dataset } from '#lib/cards/dataset.js';
import type { Predicate } from '#lib/filters/predicate.js';
import { compileQuery } from './compile.ts';
import { parse } from './parser.ts';
import type { ParseWarning } from './parser.ts';

export type { ParseWarning, ParseWarningReason } from './parser.ts';
export { FIELDS, fieldSpec, type FieldKind, type FieldSpec } from './vocabulary.ts';
export { formatLegendsValue } from './legends-value.ts';

export type ParseQueryResult = { predicate: Predicate; warnings: readonly ParseWarning[] };

export function parseQuery(source: string, dataset: Dataset): ParseQueryResult {
	const { node, warnings: syntaxWarnings } = parse(source);
	const { predicate, warnings: semanticWarnings } = compileQuery(node, { dataset });
	return { predicate, warnings: [...syntaxWarnings, ...semanticWarnings] };
}
